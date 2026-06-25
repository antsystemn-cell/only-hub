import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * OnlyCargo webhook receiver.
 *
 * Public URL (production):
 *   https://only.mn/api/public/hooks/onlycargo
 *   https://only-hub.lovable.app/api/public/hooks/onlycargo
 *
 * Signature formats accepted (any of):
 *   1. X-OnlyCargo-Signature / X-Webhook-Signature:  "sha256=<hex>"
 *   2. Same header but plain "<hex>" (hex of HMAC-SHA256 of raw body)
 *   3. Stripe-style:  "t=<unix_ts>,v1=<hex>"   (signed payload = "<ts>.<rawBody>")
 *
 * Idempotency: `webhook_events.event_key` uniquely identifies an event using
 * (event_id || track:status:occurred_at). A repeated event is acknowledged
 * with 200 but skipped — preventing duplicate notifications.
 *
 * Side effects on successful processing:
 *   - webhook_events row stored (payload + result)
 *   - notifications_log entry created for actionable statuses
 *     (arrived / ready_for_pickup) so merchant badges update
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-OnlyCargo-Signature, X-Webhook-Signature",
  "Access-Control-Max-Age": "86400",
};

const ACTIONABLE_STATUSES = new Set(["arrived", "ready_for_pickup", "completed"]);
// Reject signatures older than 5 minutes when timestamp is present.
const TIMESTAMP_TOLERANCE_SEC = 60 * 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function safeHexEq(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length === 0 || ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Multi-format signature verification.
 * Accepts: "sha256=<hex>", "<hex>", "t=<ts>,v1=<hex>".
 */
function verifySignature(rawBody: string, header: string, secret: string): {
  ok: boolean;
  reason?: string;
} {
  if (!header) return { ok: false, reason: "missing" };
  const trimmed = header.trim();

  // Format 3: Stripe-style "t=...,v1=..."
  if (trimmed.includes("t=") && trimmed.includes("v1=")) {
    const parts = trimmed.split(",").map((p) => p.trim());
    const ts = parts.find((p) => p.startsWith("t="))?.slice(2) ?? "";
    const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3) ?? "";
    if (!ts || !v1) return { ok: false, reason: "malformed" };
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_ts" };
    const drift = Math.abs(Date.now() / 1000 - tsNum);
    if (drift > TIMESTAMP_TOLERANCE_SEC) return { ok: false, reason: "stale" };
    const expected = hmacHex(secret, `${ts}.${rawBody}`);
    return { ok: safeHexEq(v1, expected) };
  }

  // Format 1: "sha256=<hex>", or Format 2: plain "<hex>"
  const hex = trimmed.startsWith("sha256=") ? trimmed.slice("sha256=".length).trim() : trimmed;
  const expected = hmacHex(secret, rawBody);
  return { ok: safeHexEq(hex, expected) };
}

function eventKeyFor(payload: Record<string, unknown>): string {
  // Prefer caller-provided id, fall back to a content hash so repeats are detected.
  const explicit = (payload.event_id ?? payload.eventId ?? payload.id) as string | undefined;
  if (explicit && typeof explicit === "string") return `id:${explicit}`;
  const track =
    (payload.track_number as string | undefined) ??
    (payload.trackNumber as string | undefined) ??
    ((payload.data as Record<string, unknown> | undefined)?.track_number as string | undefined) ??
    "unknown";
  const status =
    (payload.status as string | undefined) ??
    ((payload.data as Record<string, unknown> | undefined)?.status as string | undefined) ??
    "unknown";
  const occurredAt =
    (payload.occurred_at as string | undefined) ??
    (payload.occurredAt as string | undefined) ??
    (payload.timestamp as string | undefined) ??
    "";
  return `evt:${track}:${status}:${occurredAt}`;
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
          request.headers.get("stripe-signature") ?? // some senders mimic Stripe headers
          "";

        const verdict = verifySignature(rawBody, signature, secret);
        if (!verdict.ok) {
          console.warn("[onlycargo-webhook] Invalid signature", { reason: verdict.reason });
          return json({ error: "Invalid signature", reason: verdict.reason }, 401);
        }

        let payload: Record<string, unknown> = {};
        try {
          payload = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const event = String(payload.event ?? payload.type ?? "unknown");
        const data = (payload.data ?? {}) as Record<string, unknown>;
        const trackNumber =
          (payload.track_number as string | undefined) ??
          (payload.trackNumber as string | undefined) ??
          (data.track_number as string | undefined) ??
          (data.trackNumber as string | undefined) ??
          null;
        const status =
          (payload.status as string | undefined) ??
          (data.status as string | undefined) ??
          null;
        const customerCode =
          (payload.customer_code as string | undefined) ??
          (payload.customerCode as string | undefined) ??
          (data.customer_code as string | undefined) ??
          (data.customerCode as string | undefined) ??
          null;

        const eventKey = eventKeyFor(payload);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // --- Idempotency check ---
          const { data: existing } = await supabaseAdmin
            .from("webhook_events")
            .select("id")
            .eq("provider", "onlycargo")
            .eq("event_key", eventKey)
            .maybeSingle();

          if (existing) {
            console.log("[onlycargo-webhook] duplicate", { eventKey });
            return json({ ok: true, duplicate: true });
          }

          // --- Persist webhook event ---
          const insertedEvent = await supabaseAdmin
            .from("webhook_events")
            .insert({
              provider: "onlycargo",
              event_key: eventKey,
              payload: payload as never,
              result: { event, trackNumber, status, customerCode } as never,
            })
            .select("id")
            .maybeSingle();

          // --- Real sync: notify the owning merchant on actionable events ---
          if (customerCode && trackNumber && status && ACTIONABLE_STATUSES.has(status)) {
            const { data: merchant } = await supabaseAdmin
              .from("merchants")
              .select("id")
              .eq("onlycargo_customer_code", customerCode)
              .maybeSingle();

            if (merchant?.id) {
              await supabaseAdmin.from("notifications_log").insert({
                merchant_id: merchant.id,
                event_type: `cargo.${status}`,
                channel: "in_app",
                status: "pending",
                provider: "onlycargo",
                message: `Карго ${trackNumber} — ${status}`,
                payload: { trackNumber, status, customerCode, event } as never,
                attempt: 0,
              });
            } else {
              console.warn("[onlycargo-webhook] customer_code not linked", { customerCode });
            }
          }

          console.log("[onlycargo-webhook] processed", {
            event,
            trackNumber,
            status,
            customerCode,
            eventId: insertedEvent.data?.id ?? null,
          });
        } catch (err) {
          // Persist the failure for ops visibility but ack 200 so the sender
          // doesn't retry-storm against a deterministic application error.
          console.error("[onlycargo-webhook] persist failed", err);
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("webhook_events").insert({
              provider: "onlycargo",
              event_key: `error:${eventKey}:${Date.now()}`,
              payload: payload as never,
              result: { error: String((err as Error)?.message ?? err) } as never,
            });
          } catch {
            // swallow — already logged
          }
        }

        return json({ ok: true });
      },
    },
  },
});
