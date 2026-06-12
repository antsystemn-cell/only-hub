// Storepay callback handler. Storepay calls this URL after the buyer confirms
// the loan in their app. We always re-verify with checkStatus rather than
// trusting the body — that's the same pattern the reference uses, and it makes
// the webhook safe even if Storepay's callback shape changes.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payments/storepay/webhook")({
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
  const loanId =
    url.searchParams.get("id") ||
    url.searchParams.get("loanId") ||
    body.id || body.loanId || null;
  const requestId =
    url.searchParams.get("requestId") || body.requestId || null;
  if (!loanId && !requestId) {
    return new Response(JSON.stringify({ error: "missing id/requestId" }), { status: 400 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("payment_intents")
    .select("id")
    .eq("provider_type", "storepay")
    .in("status", ["initiated", "waiting"])
    .limit(1);
  if (loanId) q = q.eq("invoice_id", String(loanId));
  else if (requestId) q = q.eq("request_id", String(requestId));
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
