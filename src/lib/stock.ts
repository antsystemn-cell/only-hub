// Easyshop-style stock check.
// Rule: We only enforce stock when an explicit variant entry exists in variant_stock
// for the selected variant key. If variant_stock has no entry for the chosen variant
// (or the product has no variants at all), treat the item as unlimited — matching
// the Easyshop / Homestore Mongolia behavior where stock_quantity=0 does not block
// ordering.
export function stockFor(
  product: { stock_quantity?: number | null; variant_stock?: any } | null | undefined,
  variantKey: string | null | undefined,
): { unlimited: boolean; remaining: number } {
  const vs = (product?.variant_stock ?? {}) as Record<string, number>;
  if (variantKey && vs && typeof vs[variantKey] === "number") {
    return { unlimited: false, remaining: Number(vs[variantKey] ?? 0) };
  }
  return { unlimited: true, remaining: Number.MAX_SAFE_INTEGER };
}

export function isInsufficient(
  product: { stock_quantity?: number | null; variant_stock?: any } | null | undefined,
  variantKey: string | null | undefined,
  qty: number,
): { ok: true } | { ok: false; remaining: number } {
  const s = stockFor(product, variantKey);
  if (s.unlimited) return { ok: true };
  if (s.remaining >= qty) return { ok: true };
  return { ok: false, remaining: s.remaining };
}
