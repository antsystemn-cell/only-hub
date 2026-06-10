// Webhook idempotency ledger. Server-only.
// Every external webhook (QPay, Swift, ON Shop, future) should run inside
// withWebhookIdempotency(...) so duplicates are no-ops.
//
// Contract:
//   * provider + event_key must uniquely identify the external event.
//   * If event_key is missing/unstable, the caller MUST derive a stable hash
//     from the payload (see hashPayload()).
//   * The handler runs ONLY for first-time event_keys. Duplicates return the
//     stored result without side effects.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface WebhookIdempotencyArgs<T> {
  provider: string;
  eventKey: string;
  orderId?: string | null;
  payload?: any;
  handler: () => Promise<T>;
}

export interface WebhookIdempotencyResult<T> {
  duplicate: boolean;
  result: T | null;
  storedResult?: any;
}

export async function withWebhookIdempotency<T>(
  args: WebhookIdempotencyArgs<T>,
): Promise<WebhookIdempotencyResult<T>> {
  const { provider, eventKey, orderId, payload, handler } = args;

  // Try to claim the event by inserting a placeholder row. Unique
  // (provider, event_key) guarantees only one caller wins.
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("webhook_events")
    .insert({
      provider,
      event_key: eventKey,
      order_id: orderId ?? null,
      payload: payload ?? null,
      result: null,
    })
    .select("id")
    .single();

  if (insErr) {
    // Duplicate — load and return stored result.
    const { data: existing } = await supabaseAdmin
      .from("webhook_events")
      .select("result")
      .eq("provider", provider)
      .eq("event_key", eventKey)
      .maybeSingle();
    console.log("[webhook-idempotency] duplicate ignored", { provider, eventKey });
    return { duplicate: true, result: null, storedResult: existing?.result ?? null };
  }

  // First-time event — run handler and persist result.
  try {
    const result = await handler();
    await supabaseAdmin
      .from("webhook_events")
      .update({ result: result as any })
      .eq("id", inserted!.id);
    return { duplicate: false, result };
  } catch (e: any) {
    await supabaseAdmin
      .from("webhook_events")
      .update({ result: { error: e?.message ?? String(e) } as any })
      .eq("id", inserted!.id);
    throw e;
  }
}

// Stable hash for payloads lacking an explicit event id.
export async function hashPayload(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
