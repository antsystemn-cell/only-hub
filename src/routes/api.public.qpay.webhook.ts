import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkQpayPayment } from "@/lib/qpay.server";
import { confirmOrderPayment } from "@/lib/payments/confirm-order-payment.server";

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
    // Idempotent: ensures delivery request still gets created if missing.
    await confirmOrderPayment({ orderId: order.id, source: "qpay_webhook" });
    return new Response("ok");
  }
  if (!order.qpay_invoice_id) return new Response("no invoice", { status: 400 });

  try {
    const paid = await checkQpayPayment(order.merchant_id, order.qpay_invoice_id);
    if (paid) {
      await confirmOrderPayment({ orderId: order.id, source: "qpay_webhook" });
    }
    return new Response(JSON.stringify({ paid }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("webhook check failed:", e?.message);
    return new Response("error", { status: 500 });
  }
}
