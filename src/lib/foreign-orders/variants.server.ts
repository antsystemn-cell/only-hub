import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { calculateVariantPricing, type ForeignPricingSettings } from "./pricing";
import { FOREIGN_SOURCES, type ForeignSource } from "./sources";

type AuthContext = { supabase: any; userId: string };

type VariantUpsertInput = {
  productId: string;
  variantId?: string | null;
  sizeLabel?: string | null;
  colorLabel?: string | null;
  sourcePrice?: number | null;
  manualPriceOverride: boolean;
  manualCustomerPriceMnt?: number | null;
  isPurchasable: boolean;
  isVisible: boolean;
};

async function assertProductAccess(context: AuthContext, productId: string) {
  const { data: product, error } = await context.supabase
    .from("products")
    .select("id, merchant_id, foreign_source, product_type")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) throw new Error("Бараа олдсонгүй");

  const { data: ok } = await context.supabase.rpc("has_merchant_access", {
    _user_id: context.userId,
    _merchant_id: product.merchant_id,
  });
  if (!ok) throw new Error("Forbidden");

  return product as {
    id: string;
    merchant_id: string;
    foreign_source: ForeignSource | null;
    product_type: string | null;
  };
}

async function loadPricingSettings(
  merchantId: string,
  source: ForeignSource | null,
): Promise<ForeignPricingSettings> {
  const { data } = source
    ? await supabaseAdmin
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

export async function listProductVariantsService(context: AuthContext, productId: string) {
  await assertProductAccess(context, productId);
  const { data: rows, error } = await supabaseAdmin
    .from("product_variants")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return rows ?? [];
}

export async function upsertProductVariantService(context: AuthContext, data: VariantUpsertInput) {
  const product = await assertProductAccess(context, data.productId);
  const settings = await loadPricingSettings(product.merchant_id, product.foreign_source);
  const label = [data.sizeLabel, data.colorLabel].filter(Boolean).join(" / ") || null;
  const sourcePrice = data.sourcePrice ?? null;
  const pricing =
    sourcePrice != null && sourcePrice > 0 && settings.exchangeRate > 0
      ? calculateVariantPricing({ sourcePrice }, settings)
      : null;
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
      ? (FOREIGN_SOURCES as any)[product.foreign_source]?.currency ?? "KRW"
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
    manual_customer_price_mnt: data.manualPriceOverride ? (data.manualCustomerPriceMnt ?? null) : null,
    manual_price_at: data.manualPriceOverride ? nowIso : null,
    manual_price_by: data.manualPriceOverride ? context.userId : null,
    last_price_sync_at: nowIso,
  };

  if (data.variantId) {
    const { error } = await supabaseAdmin
      .from("product_variants")
      .update(payload)
      .eq("id", data.variantId)
      .eq("product_id", data.productId);
    if (error) throw new Error(error.message);
  } else {
    payload.availability_status = "AVAILABLE";
    payload.source_availability_status = "UNKNOWN";
    const { error } = await supabaseAdmin.from("product_variants").insert(payload);
    if (error) throw new Error(error.message);
  }

  return { ok: true };
}

export async function revertVariantToSourcePriceService(context: AuthContext, variantId: string) {
  const { data: variant, error: vErr } = await supabaseAdmin
    .from("product_variants")
    .select("id, product_id, source_price")
    .eq("id", variantId)
    .maybeSingle();
  if (vErr) throw new Error(vErr.message);
  if (!variant) throw new Error("Хувилбар олдсонгүй");

  const product = await assertProductAccess(context, variant.product_id);
  const settings = await loadPricingSettings(product.merchant_id, product.foreign_source);
  const sourcePrice = variant.source_price ?? null;
  const pricing =
    sourcePrice != null && sourcePrice > 0 && settings.exchangeRate > 0
      ? calculateVariantPricing({ sourcePrice }, settings)
      : null;

  const { error } = await supabaseAdmin
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
    .eq("id", variantId);
  if (error) throw new Error(error.message);

  return { ok: true };
}

export async function deleteProductVariantService(context: AuthContext, variantId: string) {
  const { data: variant, error } = await supabaseAdmin
    .from("product_variants")
    .select("id, product_id")
    .eq("id", variantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!variant) throw new Error("Хувилбар олдсонгүй");

  await assertProductAccess(context, variant.product_id);
  const { error: dErr } = await supabaseAdmin
    .from("product_variants")
    .delete()
    .eq("id", variantId);
  if (dErr) throw new Error(dErr.message);

  return { ok: true };
}