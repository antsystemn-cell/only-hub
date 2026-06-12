// Omniway callback. Omniway sends the invoiceNumber once the buyer pays.
// We re-verify via checkPaymentIntent (statusId 302 = paid in their API).

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payments/omniway/webhook")({
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
  const invoiceNumber =
    url.searchParams.get("invoiceNumber") ||
    url.searchParams.get("id") ||
    body.invoiceNumber || body.id || null;
  if (!invoiceNumber) {
    return new Response(JSON.stringify({ error: "missing invoiceNumber" }), { status: 400 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("payment_intents")
    .select("id")
    .eq("provider_type", "omniway")
    .eq("invoice_id", String(invoiceNumber))
    .in("status", ["initiated", "waiting"])
    .limit(1);
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
