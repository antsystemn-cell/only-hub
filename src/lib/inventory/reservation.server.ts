// Server-only helpers for inventory reservation.
// All write paths go through SQL RPCs (atomic + idempotent).
//
// Used by:
//   * createOrder (orders.functions.ts)      → reserveForOrder
//   * confirmOrderPayment (payments)         → confirmForOrder
//   * order cancel / payment fail / expire   → releaseForOrder
//
// We never mutate inventory_items / inventory_reservations directly outside
// the RPCs to keep counts atomic under concurrency.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface CartItemForReservation {
  productId: string;
  variantKey: string | null;
  quantity: number;
  orderItemIndex: number;
}

export interface ResolvedLink {
  inventoryItemId: string;
  productId: string;
  variantId: string | null;
  linkId: string;
  quantity: number;
  orderItemIndex: number;
}

/**
 * Resolve cart items → active inventory_product_links. Items with no active
 * link are simply omitted (existing variant_stock logic continues to handle
 * them upstream).
 */
export async function resolveLinksForCart(
  merchantId: string,
  items: CartItemForReservation[],
): Promise<ResolvedLink[]> {
  if (!items.length) return [];

  const productIds = Array.from(new Set(items.map((i) => i.productId)));

  // 1. Pull variant rows for these products so we can map variantKey → variantId.
  const { data: variants } = await supabaseAdmin
    .from("product_variants")
    .select("id,product_id,option_signature,size_label,color_label,label")
    .in("product_id", productIds);

  function buildVariantKeys(v: any): string[] {
    const keys = new Set<string>();
    if (v.option_signature) keys.add(String(v.option_signature));
    const color = v.color_label ?? null;
    const size = v.size_label ?? null;
    if (color && size) keys.add(`${color}|${size}`);
    if (color) keys.add(color);
    if (size) keys.add(size);
    if (v.label) keys.add(String(v.label));
    return Array.from(keys);
  }

  // Map (productId, variantKey) → variantId
  const variantByKey = new Map<string, string>();
  (variants ?? []).forEach((v: any) => {
    for (const k of buildVariantKeys(v)) {
      variantByKey.set(`${v.product_id}::${k}`, v.id);
    }
  });

  // 2. Pull all active links for these products.
  const { data: links } = await supabaseAdmin
    .from("inventory_product_links")
    .select("id,product_id,variant_id,inventory_item_id,quantity_multiplier,is_active,merchant_id")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .in("product_id", productIds);

  // Index links by (productId, variantId ?? "*")
  const linkByKey = new Map<string, any>();
  (links ?? []).forEach((l: any) => {
    linkByKey.set(`${l.product_id}::${l.variant_id ?? "*"}`, l);
  });

  const resolved: ResolvedLink[] = [];
  for (const item of items) {
    let variantId: string | null = null;
    if (item.variantKey) {
      variantId = variantByKey.get(`${item.productId}::${item.variantKey}`) ?? null;
    }
    // Prefer variant-scoped link, fallback to product-scoped link.
    let link =
      (variantId && linkByKey.get(`${item.productId}::${variantId}`)) ||
      linkByKey.get(`${item.productId}::*`);
    if (!link) continue;

    const mult = Number(link.quantity_multiplier ?? 1);
    if (!Number.isFinite(mult) || mult <= 0) continue;
    const qty = item.quantity * mult;

    resolved.push({
      inventoryItemId: link.inventory_item_id,
      productId: item.productId,
      variantId: variantId ?? null,
      linkId: link.id,
      quantity: qty,
      orderItemIndex: item.orderItemIndex,
    });
  }
  return resolved;
}

/**
 * Reserve inventory for an order. Skips silently when there are no resolved
 * links. Returns { ok, error?, insufficient? }.
 */
export async function reserveForOrder(opts: {
  orderId: string;
  merchantId: string;
  resolved: ResolvedLink[];
  expiresMinutes?: number;
}): Promise<
  | { ok: true; reserved: number }
  | { ok: false; error: string; insufficient?: any[] }
> {
  if (!opts.resolved.length) return { ok: true, reserved: 0 };

  const payload = opts.resolved.map((r) => ({
    inventory_item_id: r.inventoryItemId,
    product_id: r.productId,
    variant_id: r.variantId,
    link_id: r.linkId,
    quantity: r.quantity,
    order_item_index: r.orderItemIndex,
  }));

  const { data, error } = await supabaseAdmin.rpc("reserve_inventory_for_order", {
    _order_id: opts.orderId,
    _merchant_id: opts.merchantId,
    _items: payload as any,
    _expires_minutes: opts.expiresMinutes ?? 30,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as any;
  if (!r?.ok) {
    if (r?.insufficient?.length) {
      const lines = (r.insufficient as any[])
        .map(
          (i) =>
            `"${i.inventory_name ?? "Нөөц"}" — боломжит ${i.available}, шаардсан ${i.requested}`,
        )
        .join("\n");
      return { ok: false, error: lines || "Нөөц хүрэлцэхгүй байна.", insufficient: r.insufficient };
    }
    return { ok: false, error: r?.error ?? "Нөөц захиалахад алдаа гарлаа." };
  }
  return { ok: true, reserved: opts.resolved.length };
}

/** Confirm reservations for an order — idempotent. */
export async function confirmForOrder(orderId: string): Promise<{ ok: boolean; confirmed: number; error?: string }> {
  const { data, error } = await supabaseAdmin.rpc("confirm_inventory_reservations", {
    _order_id: orderId,
  });
  if (error) return { ok: false, confirmed: 0, error: error.message };
  return { ok: true, confirmed: Number((data as any)?.confirmed ?? 0) };
}

/** Release reservations for an order — idempotent. */
export async function releaseForOrder(
  orderId: string,
  reason: "released" | "cancelled" | "expired" = "released",
): Promise<{ ok: boolean; released: number; error?: string }> {
  const { data, error } = await supabaseAdmin.rpc("release_inventory_reservations", {
    _order_id: orderId,
    _reason: reason,
  });
  if (error) return { ok: false, released: 0, error: error.message };
  return { ok: true, released: Number((data as any)?.released ?? 0) };
}

/** Sweep expired reservations across the whole platform — for cron. */
export async function expireAll(): Promise<{ ok: boolean; expired: number; error?: string }> {
  const { data, error } = await supabaseAdmin.rpc("expire_inventory_reservations");
  if (error) return { ok: false, expired: 0, error: error.message };
  return { ok: true, expired: Number((data as any)?.expired ?? 0) };
}
