import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * OnlyCargo webhook receiver — Phase 1 production.
 *
 * Public URL:
 *   https://only.mn/api/public/hooks/onlycargo
 *   https://only-hub.lovable.app/api/public/hooks/onlycargo
 *
 * Responsibilities:
 *   1. Verify signature (3 formats, 3 header names)
 *   2. Parse + normalize field names (snake/camel, nested under data)
 *   3. Idempotent persistence (unique provider+event_key index)
 *   4. Update merchant.onlycargo_last_synced_at on success
 *   5. Emit in-app notification rows for relevant cargo events
 *   6. Record processing_status / error_message for ops visibility
 *
 * Response policy:
 *   - 401 only for invalid signature
 *   - 400 only for invalid JSON
 *   - 200 for everything else (including processing failures) so the
 *     sender doesn't retry-storm against a deterministic error
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-OnlyCargo-Signature, X-Webhook-Signature, OnlyCargo-Signature",
  "Access-Control-Max-Age": "86400",
};

// Events that should produce a merchant in-app notification.
const NOTIFY_EVENTS = new Set([
  "shipment.created",
  "shipment.status_changed",
  "shipment.arrived",
  "shipment.ready_for_pickup",
  "shipment.completed",
]);

// Statuses that, regardless of event name, should produce a notification.
const NOTIFY_STATUSES = new Set([
  "created",
  "arrived",
  "ready_for_pickup",
  "completed",
]);

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

/** Accept "sha256=<hex>", "<hex>", or "t=<ts>,v1=<hex>". */
function verifySignature(
  rawBody: string,
  header: string,
  secret: string,
): { ok: boolean; reason?: string } {
  if (!header) return { ok: false, reason: "missing" };
  const trimmed = header.trim();

  if (trimmed.includes("t=") && trimmed.includes("v1=")) {
    const parts = trimmed.split(",").map((p) => p.trim());
    const ts = parts.find((p) => p.startsWith("t="))?.slice(2) ?? "";
    const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3) ?? "";
    if (!ts || !v1) return { ok: false, reason: "malformed" };
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_ts" };
    if (Math.abs(Date.now() / 1000 - tsNum) > TIMESTAMP_TOLERANCE_SEC) {
      return { ok: false, reason: "stale" };
    }
    const expected = hmacHex(secret, `${ts}.${rawBody}`);
    return { ok: safeHexEq(v1, expected) };
  }

  const hex = trimmed.startsWith("sha256=")
    ? trimmed.slice("sha256=".length).trim()
    : trimmed;
  const expected = hmacHex(secret, rawBody);
  return { ok: safeHexEq(hex, expected) };
}

// ---- Field extraction helpers ----------------------------------------------

function pick<T = string>(
  obj: Record<string, unknown>,
  keys: string[],
): T | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return null;
}

interface NormalizedEvent {
  event: string;
  trackNumber: string | null;
  status: string | null;
  customerCode: string | null;
  occurredAt: string | null;
}

function normalizeEvent(payload: Record<string, unknown>): NormalizedEvent {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  return {
    event: String(payload.event ?? payload.type ?? "unknown"),
    trackNumber:
      pick<string>(payload, ["track_number", "trackNumber", "tracking_number", "trackingNumber"]) ??
      pick<string>(data, ["track_number", "trackNumber", "tracking_number", "trackingNumber"]),
    status:
      pick<string>(payload, ["status"]) ??
      pick<string>(data, ["status"]),
    customerCode:
      pick<string>(payload, ["customer_code", "customerCode"]) ??
      pick<string>(data, ["customer_code", "customerCode"]),
    occurredAt:
      pick<string>(payload, ["occurred_at", "occurredAt", "updated_at", "updatedAt", "timestamp"]) ??
      pick<string>(data, ["occurred_at", "occurredAt", "updated_at", "updatedAt"]),
  };
}

function buildEventKey(payload: Record<string, unknown>, n: NormalizedEvent): string {
  const explicit = pick<string>(payload, ["event_id", "eventId", "id"]);
  if (explicit) return `id:${explicit}`;
  // Deterministic — no Date.now().
  return `evt:onlycargo:${n.event}:${n.trackNumber ?? "?"}:${n.status ?? "?"}:${n.occurredAt ?? ""}`;
}

function shouldNotify(n: NormalizedEvent): boolean {
  if (NOTIFY_EVENTS.has(n.event)) return true;
  if (n.status && NOTIFY_STATUSES.has(n.status)) return true;
  return false;
}

// ---- Route -----------------------------------------------------------------

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
          request.headers.get("onlycargo-signature") ??
          request.headers.get("x-webhook-signature") ??
          request.headers.get("stripe-signature") ??
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

        const n = normalizeEvent(payload);

        // Required: at minimum we need a trackNumber OR a recognisable event.
        if (!n.trackNumber && (n.event === "unknown" || !n.event)) {
          return json(
            { error: "Invalid payload: track_number or event required" },
            400,
          );
        }

        const eventKey = buildEventKey(payload, n);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Resolve merchant up-front so the webhook_events row carries the link.
          let merchantId: string | null = null;
          if (n.customerCode) {
            const { data: merchant } = await supabaseAdmin
              .from("merchants")
              .select("id")
              .eq("onlycargo_customer_code", n.customerCode)
              .maybeSingle();
            merchantId = merchant?.id ?? null;
          }

          // --- Atomic idempotency via unique (provider, event_key) index.
          const insertedEvent = await supabaseAdmin
            .from("webhook_events")
            .insert({
              provider: "onlycargo",
              event_key: eventKey,
              merchant_id: merchantId,
              payload: payload as never,
              result: {
                event: n.event,
                trackNumber: n.trackNumber,
                status: n.status,
                customerCode: n.customerCode,
                occurredAt: n.occurredAt,
              } as never,
              processing_status: "ok",
            } as never)
            .select("id")
            .maybeSingle();

          if (insertedEvent.error) {
            if ((insertedEvent.error as any)?.code === "23505") {
              console.log("[onlycargo-webhook] duplicate (race)", { eventKey });
              return json({ ok: true, duplicate: true });
            }
            throw insertedEvent.error;
          }

          const warnings: string[] = [];

          // --- Notify merchant (best effort).
          if (n.trackNumber && shouldNotify(n)) {
            if (merchantId) {
              const { error: notifErr } = await supabaseAdmin
                .from("notifications_log")
                .insert({
                  merchant_id: merchantId,
                  event_type: `cargo.${n.status ?? n.event.replace(/^shipment\./, "")}`,
                  channel: "in_app",
                  status: "pending",
                  provider: "onlycargo",
                  message: `Карго ${n.trackNumber} — ${n.status ?? n.event}`,
                  payload: {
                    trackNumber: n.trackNumber,
                    status: n.status,
                    customerCode: n.customerCode,
                    event: n.event,
                    occurredAt: n.occurredAt,
                  } as never,
                  attempt: 0,
                });
              if (notifErr) {
                console.warn("[onlycargo-webhook] notification insert failed", notifErr);
                warnings.push(`notification_failed:${notifErr.message}`);
              }
            } else if (n.customerCode) {
              warnings.push(`merchant_unresolved:${n.customerCode}`);
              console.warn("[onlycargo-webhook] customer_code not linked", {
                customerCode: n.customerCode,
              });
            }
          }

          // --- Merchant sync bookkeeping (best effort).
          if (merchantId) {
            await supabaseAdmin
              .from("merchants")
              .update({
                onlycargo_last_synced_at: new Date().toISOString(),
                onlycargo_sync_error: null,
              })
              .eq("id", merchantId);
          }

          // Upgrade processing_status if there were non-fatal warnings.
          if (warnings.length > 0 && insertedEvent.data?.id) {
            await supabaseAdmin
              .from("webhook_events")
              .update({
                processing_status: "processed_with_warning",
                error_message: warnings.join("; "),
              } as never)
              .eq("id", insertedEvent.data.id);
          }

          console.log("[onlycargo-webhook] processed", {
            event: n.event,
            trackNumber: n.trackNumber,
            status: n.status,
            customerCode: n.customerCode,
            merchantId,
            warnings,
            eventId: insertedEvent.data?.id ?? null,
          });
        } catch (err) {
          // Persist the failure (best effort) but ack 200 — invalid-sig/JSON
          // are the only non-200 cases, per spec.
          const msg = String((err as Error)?.message ?? err);
          console.error("[onlycargo-webhook] processing failed", err);
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("webhook_events").insert({
              provider: "onlycargo",
              // Distinct key so the failure row doesn't collide with a future retry.
              event_key: `error:${eventKey}:${n.occurredAt ?? "noocc"}`,
              payload: payload as never,
              result: { event: n.event } as never,
              processing_status: "failed",
              error_message: msg,
            } as never);
            if (n.customerCode) {
              await supabaseAdmin
                .from("merchants")
                .update({ onlycargo_sync_error: msg })
                .eq("onlycargo_customer_code", n.customerCode);
            }
          } catch {
            // already logged
          }
          return json({ ok: true, processed: false, error: msg });
        }

        return json({ ok: true });
      },
    },
  },
});
