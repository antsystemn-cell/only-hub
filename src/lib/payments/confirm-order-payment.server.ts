// Centralized payment confirmation service.
// THIS IS THE ONLY PLACE allowed to set orders.payment_status = "confirmed".
// Every payment success path (QPay webhook, manual admin mark, QPay polling,
// bulk mark-paid, post-delivery cash collection, future providers) MUST
// flow through confirmOrderPayment().
//
// Properties:
//   * Idempotent — concurrent / duplicate calls produce at most one
//     "confirmation" side-effect. Uses a conditional UPDATE
//     (WHERE payment_status <> 'confirmed') and inspects the returned row.
//   * Atomic-ish — we cannot run a real transaction across PostgREST calls,
//     but the conditional UPDATE acts as a single-shot guard.
//   * Side-effects (delivery request, payment_requests sync) only fire on
//     the FIRST successful transition, never on duplicates.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ConfirmSource =
  | "qpay_webhook"
  | "qpay_polling"
  | "admin_manual"
  | "merchant_manual"
  | "bulk_import"
  | "bulk_mark_paid"
  | "post_delivery_cash"
  | "post_delivery_collection";

export type ConfirmResult =
  | {
      ok: true;
      orderId: string;
      alreadyPaid: boolean;
      paidAt: string;
      deliveryRequestCreated: boolean;
      deliveryError?: string | null;
    }
  | { ok: false; orderId: string; error: string };

export interface ConfirmOptions {
  orderId: string;
  source: ConfirmSource;
  /** Free-form note recorded into orders.payment_error (cleared on success). */
  note?: string | null;
  /** When true, skip auto delivery creation (e.g. bulk import historical data). */
  skipDelivery?: boolean;
}

/**
 * Confirm payment for an order. Idempotent, safe to call from any source.
 */
export async function confirmOrderPayment(opts: ConfirmOptions): Promise<ConfirmResult> {
  const { orderId, source, skipDelivery } = opts;

  // 1. Load order
  const { data: order, error: loadErr } = await supabaseAdmin
    .from("orders")
    .select("id,merchant_id,payment_status,paid_at,delivery_status,items,has_foreign_order_items,has_ready_stock_items")
    .eq("id", orderId)
    .maybeSingle();
  if (loadErr || !order) {
    return { ok: false, orderId, error: loadErr?.message ?? "Order not found" };
  }
  if (order.payment_status === "confirmed") {
    return {
      ok: true,
      orderId,
      alreadyPaid: true,
      paidAt: order.paid_at ?? new Date().toISOString(),
      deliveryRequestCreated: false,
    };
  }

  // 2. Conditional UPDATE — only commits when row is still un-confirmed.
  //    If two concurrent callers race, only one will get rows back; the other
  //    will fall through to the alreadyPaid branch on the next attempt.
  const nowIso = new Date().toISOString();
  const { data: updatedRows, error: updErr } = await supabaseAdmin
    .from("orders")
    .update({
      payment_status: "confirmed",
      paid_at: nowIso,
      payment_error: null,
      updated_at: nowIso,
    })
    .eq("id", orderId)
    .neq("payment_status", "confirmed")
    .select("id");
  if (updErr) {
    return { ok: false, orderId, error: updErr.message };
  }
  if (!updatedRows || updatedRows.length === 0) {
    // Lost the race — another caller confirmed first. Treat as already paid.
    return {
      ok: true,
      orderId,
      alreadyPaid: true,
      paidAt: nowIso,
      deliveryRequestCreated: false,
    };
  }

  // 3. Sync payment_requests (post-delivery collection / SMS invoice).
  await supabaseAdmin
    .from("payment_requests")
    .update({ status: "paid", paid_at: nowIso })
    .eq("order_id", orderId)
    .neq("status", "paid");

  // 4. Foreign-order items → enqueue source purchase rows (one per item).
  try {
    const items = Array.isArray((order as any).items) ? ((order as any).items as any[]) : [];
    const queueRows = items
      .map((it: any, idx: number) => {
        if (!it?.foreign) return null;
        const f = it.foreign;
        return {
          order_id: orderId,
          order_item_index: idx,
          merchant_id: order.merchant_id,
          source: f.foreign_source,
          source_url: f.source_url ?? null,
          source_product_id: f.source_product_id ?? null,
          source_variant_id: f.source_variant_id ?? null,
          selected_size_label: it.size ?? null,
          source_price: f.source_price ?? null,
          source_currency: f.source_currency ?? null,
          source_price_mnt: f.source_price_mnt ?? null,
          customer_paid_price_mnt: f.customer_paid_price_mnt ?? it.price ?? null,
          status: "WAITING_SOURCE_PURCHASE" as const,
        };
      })
      .filter(Boolean) as any[];
    if (queueRows.length) {
      const { error: qErr } = await supabaseAdmin
        .from("source_purchase_queue")
        .insert(queueRows);
      if (qErr) console.error("[confirmOrderPayment] queue insert failed", orderId, qErr);
    }
  } catch (e) {
    console.error("[confirmOrderPayment] queue snapshot failed", orderId, e);
  }

  // 5. Auto-create delivery request (idempotent inside delivery.service).
  //    Skip for orders that contain ONLY foreign items — those need source
  //    purchase + Korea warehouse + international transit before delivery.
  const foreignOnly =
    !!(order as any).has_foreign_order_items && !(order as any).has_ready_stock_items;
  let deliveryRequestCreated = false;
  let deliveryError: string | null = null;
  if (!skipDelivery && !foreignOnly) {
    try {
      const { createDeliveryRequest } = await import("@/lib/delivery/delivery.service");
      const res = await createDeliveryRequest({ orderId });
      deliveryRequestCreated = !!(res?.ok && !(res as any).alreadyExists);
      if (!res?.ok) deliveryError = (res as any)?.error ?? null;
    } catch (e: any) {
      deliveryError = e?.message ?? String(e);
      console.error("[confirmOrderPayment] delivery creation failed", orderId, e);
    }
  }

  console.log("[confirmOrderPayment] confirmed", {
    orderId,
    source,
    deliveryRequestCreated,
    deliveryError,
  });

  try {
    const { logNotification } = await import("@/lib/notifications/log.server");
    await logNotification({
      orderId,
      merchantId: order.merchant_id,
      eventType: "paid",
      channel: "system",
      status: deliveryError ? "failed" : "sent",
      provider: source,
      message: `Order confirmed via ${source}`,
      error: deliveryError,
      payload: { deliveryRequestCreated },
    });
  } catch {}

  return {
    ok: true,
    orderId,
    alreadyPaid: false,
    paidAt: nowIso,
    deliveryRequestCreated,
    deliveryError,
  };
}
