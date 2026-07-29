// Server functions for merchant-managed foreign-product variants.
// - list variants for a foreign-order product
// - upsert (create/edit) a variant, with optional manual price override
// - toggle manual override (revert to source-computed pricing)
// - delete a variant
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { calculateVariantPricing, type ForeignPricingSettings } from "./pricing";

async function assertProductAccess(
  context: { supabase: any; userId: string },
  productId: string,
) {
  const { supabase } = context;
  const { data: product, error } = await supabase
    .from("products")
    .select("id, merchant_id, foreign_source, product_type")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) throw new Error("Бараа олдсонгүй");
  const { data: ok } = await supabase.rpc("has_merchant_access", {
    _user_id: context.userId,
    _merchant_id: product.merchant_id,
  });
  if (!ok) throw new Error("Forbidden");
  return product as { id: string; merchant_id: string; foreign_source: string | null; product_type: string | null };
}

async function loadPricingSettings(
  supabase: any,
  merchantId: string,
  source: string | null,
): Promise<ForeignPricingSettings> {
  const { data } = source
    ? await supabase
        .from("merchant_foreign_source_settings")
        .select("*")
        .eq("merchant_id", merchantId)
        .eq("source", source)
        .maybeSingle()
    : { data: null };
  return {
    defaultProfitPercent: Number(data?.default_profit_percent ?? 25),
    minimumProfitMnt: Number(data?.minimum_profit_mnt ?? 0),
    defaultCargoCostMnt: Number(data?.default_cargo_cost_mnt ?? 0),
    defaultLocalDeliveryCostMnt: Number(data?.default_local_delivery_cost_mnt ?? 0),
    defaultKoreaDomesticShippingKrw: Number(data?.default_korea_domestic_shipping_krw ?? 0),
    defaultKoreaDomesticShippingMnt: Number(data?.default_korea_domestic_shipping_mnt ?? 0),
    paymentFeeReservePercent: Number(data?.payment_fee_reserve_percent ?? 0),
    paymentFeeReserveFixedMnt: Number(data?.payment_fee_reserve_fixed_mnt ?? 0),
    riskBufferPercent: Number(data?.risk_buffer_percent ?? 0),
    riskBufferFixedMnt: Number(data?.risk_buffer_fixed_mnt ?? 0),
    roundingRule: Number(data?.rounding_rule ?? 1000),
    profitBase: (data?.profit_base as any) ?? "TOTAL_COST",
    exchangeRate: Number(data?.exchange_rate ?? 0),
  };
}

// Recompute product.price (min purchasable variant) and derive color/size arrays
// from visible variants so the PDP selectors reflect merchant edits immediately.
async function recomputeProductPrice(supabase: any, productId: string) {
  const { data: vs } = await supabase
    .from("product_variants")
    .select("rounded_customer_price_mnt, is_purchasable, is_visible, size_label, color_label")
    .eq("product_id", productId);
  const rows = (vs ?? []) as any[];

  const colors = Array.from(
    new Set(
      rows
        .filter((v) => v.is_visible !== false && v.color_label)
        .map((v) => String(v.color_label)),
    ),
  );
  const sizes = Array.from(
    new Set(
      rows
        .filter((v) => v.is_visible !== false && v.size_label)
        .map((v) => String(v.size_label)),
    ),
  );

  const prices = rows
    .filter((v) => v.is_purchasable && v.rounded_customer_price_mnt != null)
    .map((v) => Number(v.rounded_customer_price_mnt));

  const update: any = { colors, sizes };
  if (prices.length > 0) update.price = Math.min(...prices);
  await supabase.from("products").update(update).eq("id", productId);
}

// ============================================================
// LIST
// ============================================================
export const listProductVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProductAccess(context, data.productId);
    const { data: rows, error } = await context.supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", data.productId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============================================================
// UPSERT (create or update) — supports manual price override
// ============================================================
const upsertSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  sizeLabel: z.string().max(200).nullable().optional(),
  colorLabel: z.string().max(200).nullable().optional(),
  sourcePrice: z.number().nonnegative().nullable().optional(),
  manualPriceOverride: z.boolean().default(false),
  manualCustomerPriceMnt: z.number().nonnegative().nullable().optional(),
  isPurchasable: z.boolean().default(true),
  isVisible: z.boolean().default(true),
});

export const upsertProductVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const product = await assertProductAccess(context, data.productId);
    const { supabase } = context;
    const settings = await loadPricingSettings(supabase, product.merchant_id, product.foreign_source);

    const label = [data.sizeLabel, data.colorLabel].filter(Boolean).join(" / ") || null;
    const sourcePrice = data.sourcePrice ?? null;

    // Compute source-derived pricing when possible.
    const pricing =
      sourcePrice != null && sourcePrice > 0 && settings.exchangeRate > 0
        ? calculateVariantPricing({ sourcePrice }, settings)
        : null;

    // Final customer price:
    //  - manual override on → use manualCustomerPriceMnt
    //  - otherwise → use source-computed rounded price (if any)
    const finalPriceMnt = data.manualPriceOverride
      ? (data.manualCustomerPriceMnt ?? null)
      : (pricing?.roundedCustomerPriceMnt ?? null);

    const nowIso = new Date().toISOString();

    const payload: any = {
      product_id: data.productId,
      label,
      size_label: data.sizeLabel ?? null,
      color_label: data.colorLabel ?? null,
      source_price: sourcePrice,
      source_currency: product.foreign_source
        ? ((await import("./sources")).FOREIGN_SOURCES as any)[product.foreign_source]?.currency ?? "KRW"
        : null,
      exchange_rate: pricing?.exchangeRate ?? settings.exchangeRate ?? null,
      source_price_mnt: pricing?.sourcePriceMnt ?? null,
      korea_domestic_shipping_mnt: pricing?.koreaDomesticShippingMnt ?? 0,
      cargo_cost_mnt: pricing?.cargoCostMnt ?? 0,
      local_delivery_cost_mnt: pricing?.localDeliveryCostMnt ?? 0,
      payment_fee_reserve_mnt: pricing?.paymentFeeReserveMnt ?? 0,
      risk_buffer_mnt: pricing?.riskBufferMnt ?? 0,
      profit_percent: pricing?.profitPercent ?? settings.defaultProfitPercent,
      minimum_profit_mnt: pricing?.minimumProfitMnt ?? settings.minimumProfitMnt,
      profit_amount_mnt: pricing?.profitAmountMnt ?? 0,
      final_customer_price_mnt: data.manualPriceOverride
        ? (data.manualCustomerPriceMnt ?? null)
        : (pricing?.finalCustomerPriceMnt ?? null),
      rounded_customer_price_mnt: finalPriceMnt,
      is_visible: data.isVisible,
      is_purchasable: data.isPurchasable && finalPriceMnt != null,
      manual_price_override: data.manualPriceOverride,
      manual_customer_price_mnt: data.manualPriceOverride
        ? (data.manualCustomerPriceMnt ?? null)
        : null,
      manual_price_at: data.manualPriceOverride ? nowIso : null,
      manual_price_by: data.manualPriceOverride ? context.userId : null,
      last_price_sync_at: nowIso,
    };

    if (data.variantId) {
      const { error } = await supabase
        .from("product_variants")
        .update(payload)
        .eq("id", data.variantId);
      if (error) throw new Error(error.message);
    } else {
      payload.availability_status = "AVAILABLE";
      payload.source_availability_status = "UNKNOWN";
      const { error } = await supabase.from("product_variants").insert(payload);
      if (error) throw new Error(error.message);
    }

    await recomputeProductPrice(supabase, data.productId);
    return { ok: true };
  });

// ============================================================
// REVERT MANUAL → SOURCE (turn off override, recompute)
// ============================================================
export const revertVariantToSourcePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ variantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: variant, error: vErr } = await supabase
      .from("product_variants")
      .select("id, product_id, source_price")
      .eq("id", data.variantId)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!variant) throw new Error("Хувилбар олдсонгүй");
    const product = await assertProductAccess(context, variant.product_id);
    const settings = await loadPricingSettings(supabase, product.merchant_id, product.foreign_source);

    const sourcePrice = variant.source_price ?? null;
    const pricing =
      sourcePrice != null && sourcePrice > 0 && settings.exchangeRate > 0
        ? calculateVariantPricing({ sourcePrice }, settings)
        : null;

    await supabase
      .from("product_variants")
      .update({
        manual_price_override: false,
        manual_customer_price_mnt: null,
        manual_price_at: null,
        manual_price_by: null,
        exchange_rate: pricing?.exchangeRate ?? settings.exchangeRate ?? null,
        source_price_mnt: pricing?.sourcePriceMnt ?? null,
        korea_domestic_shipping_mnt: pricing?.koreaDomesticShippingMnt ?? 0,
        cargo_cost_mnt: pricing?.cargoCostMnt ?? 0,
        local_delivery_cost_mnt: pricing?.localDeliveryCostMnt ?? 0,
        payment_fee_reserve_mnt: pricing?.paymentFeeReserveMnt ?? 0,
        risk_buffer_mnt: pricing?.riskBufferMnt ?? 0,
        profit_percent: pricing?.profitPercent ?? settings.defaultProfitPercent,
        minimum_profit_mnt: pricing?.minimumProfitMnt ?? settings.minimumProfitMnt,
        profit_amount_mnt: pricing?.profitAmountMnt ?? 0,
        final_customer_price_mnt: pricing?.finalCustomerPriceMnt ?? null,
        rounded_customer_price_mnt: pricing?.roundedCustomerPriceMnt ?? null,
        last_price_sync_at: new Date().toISOString(),
      } as any)
      .eq("id", data.variantId);

    await recomputeProductPrice(supabase, variant.product_id);
    return { ok: true };
  });

// ============================================================
// DELETE
// ============================================================
export const deleteProductVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ variantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: variant, error } = await supabase
      .from("product_variants")
      .select("id, product_id")
      .eq("id", data.variantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!variant) throw new Error("Хувилбар олдсонгүй");
    await assertProductAccess(context, variant.product_id);
    const { error: dErr } = await supabase
      .from("product_variants")
      .delete()
      .eq("id", data.variantId);
    if (dErr) throw new Error(dErr.message);
    await recomputeProductPrice(supabase, variant.product_id);
    return { ok: true };
  });
