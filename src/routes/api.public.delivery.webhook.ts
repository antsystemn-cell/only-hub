import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OMH_PREFIX, verifySwiftApiKey } from "@/lib/delivery/delivery.swift";

// Swift fulfillment_status → Only Hub order.status
const STATUS_MAP: Record<string, string> = {
  new: "pending",
  confirmed: "confirmed",
  phone_confirmed: "phone_confirmed",
  assigned: "preparing",
  preparing: "preparing",
  picked_up: "delivering",
  out_for_delivery: "delivering",
  in_transit: "delivering",
  delivering: "delivering",
  delivered: "completed",
  completed: "completed",
  cancelled: "cancelled",
  failed: "cancelled",
};

const PayloadSchema = z.object({
  event: z.string().max(100).optional(),
  external_order_id: z.string().max(200).optional().nullable(),
  internal_order_number: z.string().max(200).optional().nullable(),
  delivery_order_id: z.string().max(200).optional().nullable(),
  tracking_code: z.string().max(200).optional().nullable(),
  status: z.string().max(50).optional().nullable(),
  fulfillment_status: z.string().max(50).optional().nullable(),
  payment_status: z.string().max(50).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  delivery_note: z.string().max(1000).optional().nullable(),
  updated_at: z.string().max(50).optional().nullable(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-webhook-secret, x-api-key",
};

export const Route = createFileRoute("/api/public/delivery/webhook")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const bodyText = await request.text();
        let raw: any;
        try {
          raw = JSON.parse(bodyText);
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const parsed = PayloadSchema.safeParse(raw);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "Invalid payload" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }
        const payload = parsed.data;

        const ext = payload.external_order_id ?? null;
        const intl = payload.internal_order_number ?? payload.delivery_order_id ?? payload.tracking_code ?? null;
        if (!ext && !intl) {
          return new Response(
            JSON.stringify({ error: "Missing order identifier" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }

        // Find order — OMH- prefix → direct id lookup, else by external_ref / delivery_order_id
        let order: any = null;
        if (ext && ext.startsWith(OMH_PREFIX)) {
          const orderId = ext.slice(OMH_PREFIX.length);
          const { data } = await supabaseAdmin
            .from("orders")
            .select("id,merchant_id,status,delivery_status")
            .eq("id", orderId)
            .maybeSingle();
          order = data;
        }
        if (!order && ext) {
          const { data } = await supabaseAdmin
            .from("orders")
            .select("id,merchant_id,status,delivery_status")
            .eq("external_ref", ext)
            .maybeSingle();
          order = data;
        }
        if (!order && intl) {
          const { data } = await supabaseAdmin
            .from("orders")
            .select("id,merchant_id,status,delivery_status")
            .eq("delivery_order_id", intl)
            .maybeSingle();
          order = data;
        }
        if (!order) {
          return new Response(
            JSON.stringify({ ok: true, ignored: "order_not_found" }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }

        // AuthN: Swift Delivery Hub-аас ирэх x-api-key, эсвэл legacy per-merchant secret
        const incomingApiKey = request.headers.get("x-api-key");
        const incomingSecret = request.headers.get("x-webhook-secret") ?? "";
        const apiKeyOk = verifySwiftApiKey(incomingApiKey);
        let secretOk = false;
        if (!apiKeyOk) {
          const { data: merchant } = await supabaseAdmin
            .from("merchants")
            .select("delivery_webhook_secret")
            .eq("id", order.merchant_id)
            .maybeSingle();
          const expected = (merchant as any)?.delivery_webhook_secret ?? null;
          secretOk = !!expected && expected === incomingSecret;
        }
        if (!apiKeyOk && !secretOk) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }

        const ff = (payload.fulfillment_status ?? payload.status ?? "").toLowerCase();
        const newStatus = STATUS_MAP[ff] ?? order.status;

        const patch: any = {
          delivery_status: ff || order.delivery_status,
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
        if (intl) patch.delivery_order_id = intl;

        await supabaseAdmin.from("orders").update(patch).eq("id", order.id);

        // Хэрэв delivery_request бүртгэлтэй бол түүнийг sync хийнэ.
        // Sync доторх syncDeliveryStatusFromExternal нь delivered үед onDeliveryCompleted-г дуудна.
        let drId: string | null = null;
        let syncTriggeredCollection = false;
        {
          const { data: dr } = await supabaseAdmin
            .from("delivery_requests")
            .select("id,status")
            .eq("order_id", order.id)
            .maybeSingle();
          if (dr) {
            drId = dr.id;
            const prev = dr.status;
            try {
              const { syncDeliveryStatusFromExternal } = await import(
                "@/lib/delivery/delivery.service"
              );
              await syncDeliveryStatusFromExternal({
                deliveryRequestId: dr.id,
                fulfillmentStatus: ff,
                externalRef: intl,
              });
              // syncDeliveryStatusFromExternal calls onDeliveryCompleted only when
              // prev !== "delivered" AND next === "delivered". Track that.
              const { SWIFT_STATUS_MAP } = await import("@/lib/delivery/delivery.swift");
              const nextMapped = SWIFT_STATUS_MAP[ff] ?? prev;
              syncTriggeredCollection = nextMapped === "delivered" && prev !== "delivered";
            } catch (e) {
              console.error("[delivery-webhook] sync failed", e);
            }
          }
        }

        // Хэрэв delivery_request байхгүй ч хүргэлт амжилттай төгссөн бол шууд автомат
        // төлбөр цуглуулалт асаана. Үүнгүй бол ON Shop портал-аас ирэх хүргэлтүүдэд
        // SMS автоматаар явахгүй байсан.
        const deliveredLike = ff === "delivered" || ff === "completed";
        if (deliveredLike && !syncTriggeredCollection) {
          try {
            const { onDeliveryCompleted } = await import(
              "@/lib/payment-collection/collection.service"
            );
            const res = await onDeliveryCompleted({ orderId: order.id });
            console.log("[delivery-webhook] onDeliveryCompleted", order.id, res);
          } catch (e) {
            console.error("[delivery-webhook] onDeliveryCompleted failed", order.id, e);
          }
        }

        await supabaseAdmin.from("delivery_webhooks").insert({
          order_id: order.id,
          merchant_id: order.merchant_id,
          delivery_request_id: drId,
          event: payload.event ?? "order.status_changed",
          fulfillment_status: ff || null,
          payload: raw,
        });




        return new Response(
          JSON.stringify({ ok: true, order_id: order.id, status: newStatus }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      },
    },
  },
});
