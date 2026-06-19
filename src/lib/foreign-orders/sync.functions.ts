// Foreign-source sync engine.
//
// Runs the same parser used by the importer, then reconciles results back to
// product_variants rows by optionSignature. Updates availability, source
// prices, and recomputed customer prices (per merchant price_sync_mode).
//
// Callable from:
//   - merchant/admin "Re-check now" buttons (createServerFn handler)
//   - the cron route (which invokes runForeignSourceSync directly via dynamic import)
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { calculateVariantPricing, type ForeignPricingSettings } from "./pricing";
import { FOREIGN_SOURCES } from "./sources";
import { buildOptionSignature } from "./providers/types";

type SyncOutcome = {
  productId: string;
  status: "SUCCESS" | "FAILED" | "NEEDS_REVIEW";
  variantsChecked: number;
  variantsAvailable: number;
  variantsUnavailable: number;
  variantsUnknown: number;
  priceChangesCount: number;
  availabilityChangesCount: number;
  error?: string;
};

function pickFrequencyHours(p: any): number {
  // featured / orders-last-7d-active → 6h; archived → null
  const base = Number(p?.sync_frequency_hours ?? 24);
  return Math.max(1, base);
}

function nextSyncAt(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

/**
 * Core sync — runs against any client (admin or user). Returns the outcome
 * and writes one row to foreign_source_sync_jobs. Does NOT enforce caller
 * permission; the calling server fn handles auth.
 */
export async function runForeignSourceSync(
  supabaseAdminClient: any,
  productId: string,
): Promise<SyncOutcome> {
  const startedAt = new Date().toISOString();

  // 1) Load product + variants + merchant settings
  const { data: product, error: pErr } = await supabaseAdminClient
    .from("products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();
  if (pErr || !product) {
    return failedOutcome(productId, pErr?.message ?? "Бараа олдсонгүй");
  }
  if (product.product_type !== "FOREIGN_ORDER" || !product.source_url || !product.foreign_source) {
    return failedOutcome(productId, "Foreign-order бус бараа.");
  }

  const { data: settingsRow } = await supabaseAdminClient
    .from("merchant_foreign_source_settings")
    .select("*")
    .eq("merchant_id", product.merchant_id)
    .eq("source", product.foreign_source)
    .maybeSingle();

  const priceSyncMode: string = settingsRow?.price_sync_mode ?? "REVIEW_BEFORE_UPDATE";

  const settings: ForeignPricingSettings = {
    defaultProfitPercent: Number(settingsRow?.default_profit_percent ?? 25),
    minimumProfitMnt: Number(settingsRow?.minimum_profit_mnt ?? 0),
    defaultCargoCostMnt: Number(settingsRow?.default_cargo_cost_mnt ?? 0),
    defaultLocalDeliveryCostMnt: Number(settingsRow?.default_local_delivery_cost_mnt ?? 0),
    defaultKoreaDomesticShippingKrw: Number(settingsRow?.default_korea_domestic_shipping_krw ?? 0),
    defaultKoreaDomesticShippingMnt: Number(settingsRow?.default_korea_domestic_shipping_mnt ?? 0),
    paymentFeeReservePercent: Number(settingsRow?.payment_fee_reserve_percent ?? 0),
    paymentFeeReserveFixedMnt: Number(settingsRow?.payment_fee_reserve_fixed_mnt ?? 0),
    riskBufferPercent: Number(settingsRow?.risk_buffer_percent ?? 0),
    riskBufferFixedMnt: Number(settingsRow?.risk_buffer_fixed_mnt ?? 0),
    roundingRule: Number(settingsRow?.rounding_rule ?? 1000),
    profitBase: (settingsRow?.profit_base as any) ?? "TOTAL_COST",
    exchangeRate: Number(settingsRow?.exchange_rate ?? 0),
  };

  const { data: variantRows } = await supabaseAdminClient
    .from("product_variants")
    .select("*")
    .eq("product_id", productId);
  const existingVariants = (variantRows ?? []) as any[];

  // 2) Fetch + parse via provider
  let parsed: any;
  try {
    const { getProvider } = await import("./providers/index.server");
    const provider = getProvider(product.foreign_source);
    const resolved = provider.resolveLink(product.source_url);
    if (!resolved.ok || !resolved.productId)
      throw new Error(resolved.reason ?? "Линк буруу");
    parsed = await provider.getProduct({
      url: product.source_url,
      productId: resolved.productId,
    });
  } catch (e: any) {
    return await finishWithError(
      supabaseAdminClient,
      product,
      startedAt,
      e?.message ?? String(e),
    );
  }

  // 3) Reconcile variants by optionSignature
  const bySig = new Map<string, any>();
  for (const v of existingVariants) if (v.option_signature) bySig.set(v.option_signature, v);

  let priceChanges = 0;
  let availChanges = 0;
  const notifications: Array<{ type: string; variantLabel: string }> = [];
  const seenSigs = new Set<string>();
  const updates: any[] = [];
  const inserts: any[] = [];

  for (const pv of parsed.variants ?? []) {
    const sig = pv.optionSignature ?? buildOptionSignature(pv.options);
    if (!sig) continue;
    seenSigs.add(sig);
    const existing = bySig.get(sig);

    const sourcePrice = pv.sourcePrice ?? null;
    const pricing =
      sourcePrice != null && sourcePrice > 0 && settings.exchangeRate > 0
        ? calculateVariantPricing({ sourcePrice }, settings)
        : null;

    if (existing) {
      const availabilityChanged = existing.availability_status !== pv.availabilityStatus;
      const priceChanged = (existing.source_price ?? null) !== (sourcePrice ?? null);
      if (availabilityChanged) {
        availChanges++;
        if (existing.availability_status === "AVAILABLE" && pv.availabilityStatus === "UNAVAILABLE") {
          notifications.push({ type: "UNAVAILABLE", variantLabel: existing.label ?? sig });
        } else if (existing.availability_status === "UNAVAILABLE" && pv.availabilityStatus === "AVAILABLE") {
          notifications.push({ type: "AVAILABLE", variantLabel: existing.label ?? sig });
        } else if (pv.availabilityStatus === "LOW_STOCK") {
          notifications.push({ type: "LOW_STOCK", variantLabel: existing.label ?? sig });
        }
      }
      if (priceChanged) priceChanges++;

      const patch: any = {
        availability_status: pv.availabilityStatus,
        source_availability_status: pv.availabilityStatus,
        unavailable_reason: pv.unavailableReason ?? null,
        source_availability_raw_text: pv.sourceAvailabilityRawText ?? null,
        last_availability_sync_at: startedAt,
      };

      // Honor merchant manual override
      if (existing.manual_availability_override) {
        patch.availability_status = existing.manual_availability_status ?? existing.availability_status;
      } else {
        patch.is_purchasable = pv.isPurchasable && pv.availabilityStatus !== "UNAVAILABLE";
      }

      if (priceChanged) {
        patch.previous_source_price = existing.source_price ?? null;
        patch.source_price = sourcePrice;
        patch.last_price_sync_at = startedAt;

        if (pricing) {
          if (priceSyncMode === "AUTO_UPDATE_CUSTOMER_PRICE") {
            patch.source_price_mnt = pricing.sourcePriceMnt;
            patch.exchange_rate = pricing.exchangeRate;
            patch.final_customer_price_mnt = pricing.finalCustomerPriceMnt;
            patch.rounded_customer_price_mnt = pricing.roundedCustomerPriceMnt;
            patch.price_review_required = false;
          } else if (priceSyncMode === "REVIEW_BEFORE_UPDATE") {
            patch.price_review_required = true;
          }
        }
      }

      updates.push({ id: existing.id, patch });
    } else if (sourcePrice != null) {
      // New row from source — insert hidden, flag for review.
      inserts.push({
        product_id: productId,
        label: pv.sizeLabel ?? sig,
        size_label: pv.sizeLabel ?? null,
        color_label: pv.colorLabel ?? null,
        source_variant_id: pv.sourceVariantId ?? null,
        source_price: sourcePrice,
        source_currency: FOREIGN_SOURCES[product.foreign_source as keyof typeof FOREIGN_SOURCES]?.currency ?? "KRW",
        availability_status: "NEEDS_REVIEW",
        source_availability_status: pv.availabilityStatus,
        source_availability_raw_text: pv.sourceAvailabilityRawText ?? null,
        unavailable_reason: pv.unavailableReason ?? null,
        option_signature: sig,
        is_visible: false,
        is_purchasable: false,
        last_availability_sync_at: startedAt,
        last_price_sync_at: startedAt,
        ...(pricing
          ? {
              exchange_rate: pricing.exchangeRate,
              source_price_mnt: pricing.sourcePriceMnt,
              final_customer_price_mnt: pricing.finalCustomerPriceMnt,
              rounded_customer_price_mnt: pricing.roundedCustomerPriceMnt,
            }
          : {}),
      });
      availChanges++;
    }
  }

  // Variants that disappeared from source -> UNKNOWN (not deleted)
  for (const v of existingVariants) {
    if (v.option_signature && !seenSigs.has(v.option_signature)) {
      updates.push({
        id: v.id,
        patch: {
          availability_status: v.manual_availability_override ? v.availability_status : "UNKNOWN",
          last_availability_sync_at: startedAt,
          is_purchasable: false,
        },
      });
      if (v.availability_status !== "UNKNOWN") availChanges++;
    }
  }

  // 4) Apply updates
  for (const u of updates) {
    await supabaseAdminClient.from("product_variants").update(u.patch).eq("id", u.id);
  }
  if (inserts.length) {
    await supabaseAdminClient.from("product_variants").insert(inserts);
  }

  // 5) Update product-level sync state
  const freqHours = pickFrequencyHours(product);
  await supabaseAdminClient
    .from("products")
    .update({
      low_stock_warning: !!parsed.lowStockWarning,
      last_source_sync_at: startedAt,
      next_sync_at: nextSyncAt(freqHours),
      source_sync_status: "OK",
      source_sync_error: null,
      sync_failure_count: 0,
    })
    .eq("id", productId);

  // 6) Counts
  let nAvail = 0, nUnav = 0, nUnk = 0;
  for (const v of parsed.variants ?? []) {
    if (v.availabilityStatus === "AVAILABLE" || v.availabilityStatus === "LOW_STOCK") nAvail++;
    else if (v.availabilityStatus === "UNAVAILABLE") nUnav++;
    else nUnk++;
  }

  // 7) Log job
  await supabaseAdminClient.from("foreign_source_sync_jobs").insert({
    product_id: productId,
    merchant_id: product.merchant_id,
    source: product.foreign_source,
    sync_type: "PRICE_AND_AVAILABILITY",
    status: "SUCCESS",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    variants_checked: parsed.variants?.length ?? 0,
    variants_available: nAvail,
    variants_unavailable: nUnav,
    variants_unknown: nUnk,
    price_changes_count: priceChanges,
    availability_changes_count: availChanges,
    diagnostics: parsed.diagnostics ?? null,
  });

  // 8) Notifications
  for (const n of notifications) {
    const title =
      n.type === "UNAVAILABLE"
        ? `${product.name} - ${n.variantLabel} Poizon Korea дээр түр дууссан байна.`
        : n.type === "AVAILABLE"
        ? `${product.name} - ${n.variantLabel} дахин боломжтой боллоо.`
        : `${product.name} - ${n.variantLabel} үлдэгдэл бага байж болзошгүй.`;
    await supabaseAdminClient.from("notifications_log").insert({
      merchant_id: product.merchant_id,
      title,
      body: title,
      channel: "in_app",
      status: "queued",
      kind: "foreign_source_sync",
    });
  }

  return {
    productId,
    status: "SUCCESS",
    variantsChecked: parsed.variants?.length ?? 0,
    variantsAvailable: nAvail,
    variantsUnavailable: nUnav,
    variantsUnknown: nUnk,
    priceChangesCount: priceChanges,
    availabilityChangesCount: availChanges,
  };
}

async function finishWithError(
  supabaseAdminClient: any,
  product: any,
  startedAt: string,
  errorMessage: string,
): Promise<SyncOutcome> {
  const failureCount = Number(product.sync_failure_count ?? 0) + 1;
  const pauseAfter = 5;
  await supabaseAdminClient
    .from("products")
    .update({
      source_sync_status: failureCount >= pauseAfter ? "NEEDS_REVIEW" : "FAILED",
      source_sync_error: errorMessage.slice(0, 500),
      sync_failure_count: failureCount,
      next_sync_at: nextSyncAt(failureCount >= pauseAfter ? 24 * 30 : 6),
      sync_enabled: failureCount >= pauseAfter ? false : product.sync_enabled,
    })
    .eq("id", product.id);

  await supabaseAdminClient.from("foreign_source_sync_jobs").insert({
    product_id: product.id,
    merchant_id: product.merchant_id,
    source: product.foreign_source,
    sync_type: "PRICE_AND_AVAILABILITY",
    status: failureCount >= pauseAfter ? "NEEDS_REVIEW" : "FAILED",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    error_message: errorMessage,
  });

  if (failureCount >= pauseAfter) {
    await supabaseAdminClient.from("notifications_log").insert({
      merchant_id: product.merchant_id,
      title: `Poizon Korea sync амжилтгүй давтагдлаа. Барааг шалгана уу.`,
      body: `${product.name}: ${errorMessage}`,
      channel: "in_app",
      status: "queued",
      kind: "foreign_source_sync_failed",
    });
  }

  return {
    productId: product.id,
    status: failureCount >= pauseAfter ? "NEEDS_REVIEW" : "FAILED",
    variantsChecked: 0,
    variantsAvailable: 0,
    variantsUnavailable: 0,
    variantsUnknown: 0,
    priceChangesCount: 0,
    availabilityChangesCount: 0,
    error: errorMessage,
  };
}

function failedOutcome(productId: string, error: string): SyncOutcome {
  return {
    productId,
    status: "FAILED",
    variantsChecked: 0,
    variantsAvailable: 0,
    variantsUnavailable: 0,
    variantsUnknown: 0,
    priceChangesCount: 0,
    availabilityChangesCount: 0,
    error,
  };
}

// ============================================================
// Server fn: merchant/admin manual "Re-check now"
// ============================================================
const triggerSchema = z.object({ productId: z.string().uuid() });

export const triggerForeignSourceSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => triggerSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: product, error } = await supabase
      .from("products")
      .select("id, merchant_id")
      .eq("id", data.productId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!product) throw new Error("Бараа олдсонгүй");

    const { data: ok } = await supabase.rpc("has_merchant_access", {
      _user_id: userId,
      _merchant_id: product.merchant_id,
    });
    if (!ok) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return runForeignSourceSync(supabaseAdmin, data.productId);
  });

// ============================================================
// Server fn: list recent sync jobs for a product or merchant
// ============================================================
const listSchema = z.object({
  merchantId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).default(20),
});

export const listForeignSyncJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("foreign_source_sync_jobs")
      .select("*, products(name, source_url)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.merchantId) q = q.eq("merchant_id", data.merchantId);
    if (data.productId) q = q.eq("product_id", data.productId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
