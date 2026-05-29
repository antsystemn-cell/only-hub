import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkQpayPayment } from "@/lib/qpay.server";
import { createDeliveryRequest } from "@/lib/delivery/delivery.service";

export const Route = createFileRoute("/api/public/qpay/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id");
  if (!orderId) return new Response("missing order_id", { status: 400 });

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,merchant_id,qpay_invoice_id,payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return new Response("not found", { status: 404 });
  if (order.payment_status === "confirmed") {
    await createDeliveryRequest({ orderId: order.id }).catch(() => null);
    return new Response("ok");
  }
  if (!order.qpay_invoice_id) return new Response("no invoice", { status: 400 });

  try {
    const paid = await checkQpayPayment(order.merchant_id, order.qpay_invoice_id);
    if (paid) {
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("orders")
        .update({ payment_status: "confirmed", delivery_status: "paid", updated_at: nowIso })
        .eq("id", order.id);
      // payment_requests sync (post-delivery collection)
      await supabaseAdmin
        .from("payment_requests")
        .update({ status: "paid", paid_at: nowIso })
        .eq("order_id", order.id)
        .neq("status", "paid");
      // Auto-create delivery request on confirmation
      await createDeliveryRequest({ orderId: order.id }).catch((e) =>
        console.error("auto delivery create failed", e),
      );
    }
    return new Response(JSON.stringify({ paid }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("webhook check failed:", e?.message);
    return new Response("error", { status: 500 });
  }
}
