import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * OnlyCargo webhook receiver.
 *
 * Public URL (production):
 *   https://only.mn/api/public/hooks/onlycargo
 *   https://www.only.mn/api/public/hooks/onlycargo
 *   https://only-hub.lovable.app/api/public/hooks/onlycargo
 *
 * Preview (testing):
 *   https://project--b0060558-3286-4777-b48f-d58c209f045f-dev.lovable.app/api/public/hooks/onlycargo
 *
 * Signature verification:
 *   OnlyCargo should send an HMAC-SHA256 signature of the raw request body
 *   using the shared secret (ONLYCARGO_WEBHOOK_SECRET) in one of these headers:
 *     - X-OnlyCargo-Signature: <hex>
 *     - X-Webhook-Signature: <hex>
 *   Optional `sha256=` prefix is accepted.
 *
 * Expected payload (flexible — we tolerate small variations):
 * {
 *   "event": "shipment.status_changed" | "shipment.created" | "shipment.arrived" | ...,
 *   "track_number": "ABC123",
 *   "status": "in_transit",            // standard status from API docs
 *   "customer_code": "ONLY-001",       // merchant code
 *   "occurred_at": "2026-06-22T10:00:00Z",
 *   "data": { ... }                    // optional full shipment payload
 * }
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-OnlyCargo-Signature, X-Webhook-Signature",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function stripPrefix(sig: string) {
  return sig.startsWith("sha256=") ? sig.slice("sha256=".length) : sig;
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(stripPrefix(signature).trim(), "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/hooks/onlycargo")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      GET: async () =>
        json({ ok: true, service: "onlycargo-webhook", message: "Endpoint ready" }),

      POST: async ({ request }) => {
        const secret = process.env.ONLYCARGO_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[onlycargo-webhook] Missing ONLYCARGO_WEBHOOK_SECRET");
          return json({ error: "Webhook not configured" }, 500);
        }

        const rawBody = await request.text();
        const signature =
          request.headers.get("x-onlycargo-signature") ??
          request.headers.get("x-webhook-signature") ??
          "";

        if (!signature || !verifySignature(rawBody, signature, secret)) {
          console.warn("[onlycargo-webhook] Invalid signature");
          return json({ error: "Invalid signature" }, 401);
        }

        let payload: Record<string, unknown> = {};
        try {
          payload = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const event = String(payload.event ?? payload.type ?? "unknown");
        const trackNumber =
          (payload.track_number as string | undefined) ??
          (payload.trackNumber as string | undefined) ??
          ((payload.data as Record<string, unknown> | undefined)?.track_number as
            | string
            | undefined) ??
          null;
        const status =
          (payload.status as string | undefined) ??
          ((payload.data as Record<string, unknown> | undefined)?.status as
            | string
            | undefined) ??
          null;
        const customerCode =
          (payload.customer_code as string | undefined) ??
          (payload.customerCode as string | undefined) ??
          ((payload.data as Record<string, unknown> | undefined)?.customer_code as
            | string
            | undefined) ??
          null;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("webhook_events").insert({
            provider: "onlycargo",
            event_key: `${event}:${trackNumber ?? "unknown"}:${Date.now()}`,
            payload: payload as never,
          });
          // TODO: invalidate any cargo cache, push realtime notification to merchant,
          // and insert into notifications_log once merchant linkage by customer_code is wired.
          console.log("[onlycargo-webhook] received", {
            event,
            trackNumber,
            status,
            customerCode,
          });
        } catch (err) {
          console.error("[onlycargo-webhook] persist failed", err);
          // Still return 200 so OnlyCargo doesn't retry-storm; we logged for ops.
        }

        return json({ ok: true });
      },
    },
  },
});
