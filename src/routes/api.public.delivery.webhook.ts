import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Map external delivery system fulfillment_status → Only.mn order.status
const STATUS_MAP: Record<string, string> = {
  confirmed: "confirmed",
  phone_confirmed: "phone_confirmed",
  preparing: "preparing",
  out_for_delivery: "delivering",
  delivering: "delivering",
  delivered: "completed",
  completed: "completed",
  cancelled: "cancelled",
};

const PayloadSchema = z.object({
  event: z.string().optional(),
  external_order_id: z.string().optional().nullable(),
  internal_order_number: z.string().optional().nullable(),
  fulfillment_status: z.string().optional().nullable(),
  delivery_note: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-webhook-secret",
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
        const intl = payload.internal_order_number ?? null;
        if (!ext && !intl) {
          return new Response(
            JSON.stringify({ error: "Missing order identifier" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }

        // Find order
        let order: any = null;
        if (ext) {
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

        // Verify webhook secret (per-merchant)
        const incomingSecret = request.headers.get("x-webhook-secret") ?? "";
        const { data: merchant } = await supabaseAdmin
          .from("merchants")
          .select("delivery_webhook_secret")
          .eq("id", order.merchant_id)
          .maybeSingle();
        const expected = (merchant as any)?.delivery_webhook_secret ?? null;
        if (expected && expected !== incomingSecret) {
          return new Response(
            JSON.stringify({ error: "Invalid webhook secret" }),
            { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }

        const ff = (payload.fulfillment_status ?? "").toLowerCase();
        const newStatus = STATUS_MAP[ff] ?? order.status;

        const patch: any = {
          delivery_status: ff || order.delivery_status,
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
        if (intl) patch.delivery_order_id = intl;

        await supabaseAdmin.from("orders").update(patch).eq("id", order.id);

        // Хэрэв delivery_request бүртгэлтэй бол түүнийг ч мөн sync хийнэ
        let drId: string | null = null;
        {
          const { data: dr } = await supabaseAdmin
            .from("delivery_requests")
            .select("id,status")
            .eq("order_id", order.id)
            .maybeSingle();
          if (dr) {
            drId = dr.id;
            const { syncDeliveryStatusFromExternal } = await import(
              "@/lib/delivery/delivery.service"
            );
            await syncDeliveryStatusFromExternal({
              deliveryRequestId: dr.id,
              fulfillmentStatus: ff,
              externalRef: intl,
            });
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
