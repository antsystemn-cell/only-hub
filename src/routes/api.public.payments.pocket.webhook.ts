// Pocket fallback webhook. Pocket POSTs the invoice id after the buyer scans
// the QR. We re-verify via checkPaymentIntent rather than trusting the body.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payments/pocket/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let body: any = {};
  try { body = await request.clone().json(); } catch {}
  const invoiceId =
    url.searchParams.get("id") || url.searchParams.get("invoiceId") || body.id || body.invoiceId || null;
  const orderNumber =
    url.searchParams.get("orderNumber") || body.orderNumber || null;
  if (!invoiceId && !orderNumber) {
    return new Response(JSON.stringify({ error: "missing id/orderNumber" }), { status: 400 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("payment_intents")
    .select("id")
    .eq("provider_type", "pocket")
    .in("status", ["initiated", "waiting"])
    .limit(1);
  if (invoiceId) q = q.eq("invoice_id", String(invoiceId));
  else if (orderNumber) q = q.eq("request_id", String(orderNumber));
  const { data: rows } = await q;
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ status: "no_intent" }), { status: 200 });
  }
  const { checkPaymentIntent } = await import("@/lib/payments/payment-intents.functions");
  const r = await checkPaymentIntent({ data: { intentId: rows[0].id as string } });
  return new Response(JSON.stringify(r), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
