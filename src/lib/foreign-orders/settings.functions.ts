// Server functions for foreign-order merchant settings + permission checks.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const upsertSchema = z.object({
  merchantId: z.string().uuid(),
  source: z.enum([
    "POIZON_KR",
    "DEWU_CN",
    "TAOBAO",
    "TMALL",
    "ALIBABA_1688",
    "AMAZON",
    "MANUAL_EXTERNAL",
  ]),
  defaultProfitPercent: z.number().min(0).max(500).default(25),
  minimumProfitMnt: z.number().min(0).default(0),
  defaultCargoCostMnt: z.number().min(0).default(0),
  defaultLocalDeliveryCostMnt: z.number().min(0).default(0),
  defaultKoreaDomesticShippingKrw: z.number().min(0).default(0),
  defaultKoreaDomesticShippingMnt: z.number().min(0).default(0),
  paymentFeeReservePercent: z.number().min(0).max(100).default(0),
  paymentFeeReserveFixedMnt: z.number().min(0).default(0),
  riskBufferPercent: z.number().min(0).max(100).default(0),
  riskBufferFixedMnt: z.number().min(0).default(0),
  roundingRule: z.number().int().positive().default(1000),
  profitBase: z.enum(["SOURCE_ONLY", "TOTAL_COST"]).default("TOTAL_COST"),
  priceSyncMode: z
    .enum(["AUTO_UPDATE_CUSTOMER_PRICE", "REVIEW_BEFORE_UPDATE", "AVAILABILITY_ONLY"])
    .default("REVIEW_BEFORE_UPDATE"),
  priceChangeThresholdPercent: z.number().min(0).max(100).default(5),
  priceChangeThresholdMnt: z.number().min(0).default(5000),
  exchangeRate: z.number().min(0).default(0),
  defaultDeliveryMinDays: z.number().int().min(1).default(10),
  defaultDeliveryMaxDays: z.number().int().min(1).default(14),
  enabled: z.boolean().default(true),
});

async function assertMerchantAccessAndPermission(
  context: { supabase: any; userId: string },
  merchantId: string,
  source: string,
) {
  const { supabase } = context;

  // 1. Verify merchant access (RLS will also enforce on write, but fail-fast).
  const { data: hasAccess, error: accessErr } = await supabase.rpc("has_merchant_access", {
    _user_id: context.userId,
    _merchant_id: merchantId,
  });
  if (accessErr) throw new Error(accessErr.message);
  if (!hasAccess) throw new Error("Forbidden: no merchant access");

  // 2. Verify the merchant has foreign-order permission + allowed source.
  const { data: merchant, error: mErr } = await supabase
    .from("merchants")
    .select("can_create_foreign_order_products, allowed_foreign_sources")
    .eq("id", merchantId)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  if (!merchant) throw new Error("Merchant not found");
  if (!merchant.can_create_foreign_order_products) {
    throw new Error("Энэ дэлгүүрт гадаадаас захиалах бараа оруулах эрх олгогдоогүй байна.");
  }
  const allowed: string[] = merchant.allowed_foreign_sources ?? [];
  if (!allowed.includes(source)) {
    throw new Error("Энэ эх сурвалж тухайн дэлгүүрт идэвхжээгүй байна.");
  }
}

export const getMerchantForeignSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { merchantId: string; source?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("merchant_foreign_source_settings")
      .select("*")
      .eq("merchant_id", data.merchantId);
    if (data.source) q = q.eq("source", data.source);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertMerchantForeignSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMerchantAccessAndPermission(context, data.merchantId, data.source);
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("merchant_foreign_source_settings")
      .upsert(
        {
          merchant_id: data.merchantId,
          source: data.source as any,
          enabled: data.enabled,
          default_profit_percent: data.defaultProfitPercent,
          minimum_profit_mnt: data.minimumProfitMnt,
          default_cargo_cost_mnt: data.defaultCargoCostMnt,
          default_local_delivery_cost_mnt: data.defaultLocalDeliveryCostMnt,
          default_korea_domestic_shipping_krw: data.defaultKoreaDomesticShippingKrw,
          default_korea_domestic_shipping_mnt: data.defaultKoreaDomesticShippingMnt,
          payment_fee_reserve_percent: data.paymentFeeReservePercent,
          payment_fee_reserve_fixed_mnt: data.paymentFeeReserveFixedMnt,
          risk_buffer_percent: data.riskBufferPercent,
          risk_buffer_fixed_mnt: data.riskBufferFixedMnt,
          rounding_rule: data.roundingRule,
          profit_base: data.profitBase,
          price_sync_mode: data.priceSyncMode,
          price_change_threshold_percent: data.priceChangeThresholdPercent,
          price_change_threshold_mnt: data.priceChangeThresholdMnt,
          exchange_rate: data.exchangeRate,
          default_delivery_min_days: data.defaultDeliveryMinDays,
          default_delivery_max_days: data.defaultDeliveryMaxDays,
        },
        { onConflict: "merchant_id,source" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// Admin-only: grant or revoke a merchant's foreign-order capability.
export const adminSetMerchantForeignPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { merchantId: string; canCreate: boolean; allowedSources: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: isAdmin, error: rErr } = await supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "platform_admin",
    });
    if (rErr) throw new Error(rErr.message);
    if (!isAdmin) throw new Error("Forbidden: platform admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("merchants")
      .update({
        can_create_foreign_order_products: data.canCreate,
        allowed_foreign_sources: data.allowedSources as any,
      })
      .eq("id", data.merchantId)
      .select("id, name, can_create_foreign_order_products, allowed_foreign_sources")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
