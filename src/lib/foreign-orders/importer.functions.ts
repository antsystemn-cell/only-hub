// Foreign-order importer: preview (fetch + parse) and create (persist).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { FOREIGN_SOURCES } from "./sources";
import { calculateVariantPricing, type ForeignPricingSettings } from "./pricing";
import { slugify } from "@/lib/format";

const sourceEnum = z.enum([
  "POIZON_KR", "DEWU_CN", "TAOBAO", "TMALL", "ALIBABA_1688", "AMAZON", "MANUAL_EXTERNAL",
]);

async function assertPermission(
  context: { supabase: any; userId: string },
  merchantId: string,
  source: string,
) {
  const { supabase } = context;
  const { data: hasAccess } = await supabase.rpc("has_merchant_access", {
    _user_id: context.userId,
    _merchant_id: merchantId,
  });
  if (!hasAccess) throw new Error("Forbidden: no merchant access");

  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("can_create_foreign_order_products, allowed_foreign_sources")
    .eq("id", merchantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!merchant) throw new Error("Merchant not found");
  if (!merchant.can_create_foreign_order_products) {
    throw new Error("Энэ дэлгүүрт гадаадаас захиалах бараа оруулах эрх олгогдоогүй.");
  }
  const allowed: string[] = (merchant.allowed_foreign_sources as string[]) ?? [];
  if (!allowed.includes(source)) {
    throw new Error("Энэ эх сурвалж тухайн дэлгүүрт идэвхгүй байна.");
  }
}

async function loadOrDefaultSettings(
  supabase: any,
  merchantId: string,
  source: string,
): Promise<ForeignPricingSettings & { roundingRule: number; profitBase: "TOTAL_COST" | "SOURCE_ONLY"; deliveryMin: number; deliveryMax: number }> {
  const { data } = await supabase
    .from("merchant_foreign_source_settings")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("source", source)
    .maybeSingle();

  const src = FOREIGN_SOURCES[source as keyof typeof FOREIGN_SOURCES];

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
    profitBase: (data?.profit_base as "TOTAL_COST" | "SOURCE_ONLY") ?? "TOTAL_COST",
    exchangeRate: Number(data?.exchange_rate ?? 0),
    deliveryMin: Number(data?.default_delivery_min_days ?? src?.defaultDeliveryMinDays ?? 10),
    deliveryMax: Number(data?.default_delivery_max_days ?? src?.defaultDeliveryMaxDays ?? 14),
  };
}

// ============================================================
// DUPLICATE CHECK: look up an existing foreign product for this merchant
// by (source, source_product_id) or matching source_url. Used by the
// importer UI to warn merchants before they re-create the same product.
// ============================================================
const duplicateSchema = z.object({
  merchantId: z.string().uuid(),
  source: sourceEnum,
  sourceProductId: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
});

export const findExistingForeignProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => duplicateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: hasAccess } = await supabase.rpc("has_merchant_access", {
      _user_id: context.userId,
      _merchant_id: data.merchantId,
    });
    if (!hasAccess) throw new Error("Forbidden: no merchant access");

    const pid = (data.sourceProductId ?? "").trim();
    const url = (data.sourceUrl ?? "").trim();
    if (!pid && !url) return { items: [] as any[] };

    const filters: string[] = [];
    if (pid) filters.push(`source_product_id.eq.${pid}`);
    if (url) filters.push(`source_url.eq.${url}`);

    const { data: rows, error } = await supabase
      .from("products")
      .select("id, name, slug, image_url, thumbnail_url, is_active, created_at, source_url, source_product_id, foreign_source, product_type")
      .eq("merchant_id", data.merchantId)
      .eq("foreign_source", data.source)
      .or(filters.join(","))
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });


// ============================================================
// PREVIEW: resolve URL → fetch → parse → compute prices.
// ============================================================
const previewSchema = z.object({
  merchantId: z.string().uuid(),
  source: sourceEnum,
  url: z.string().url(),
});

export const previewForeignImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPermission(context, data.merchantId, data.source);
    const { getProvider } = await import("./providers/index.server");
    const provider = getProvider(data.source);
    const resolved = provider.resolveLink(data.url);
    if (!resolved.ok || !resolved.productId) {
      return {
        status: "IMPORT_FAILED" as const,
        warnings: [resolved.reason ?? "Линк буруу байна."],
        parsed: null,
        settings: null,
      };
    }
    const parsed = await provider.getProduct({ url: data.url, productId: resolved.productId });
    const settings = await loadOrDefaultSettings(context.supabase, data.merchantId, data.source);

    const variantsWithPricing = parsed.variants.map((v) => {
      const sourcePrice = v.sourcePrice ?? 0;
      const pricing =
        settings.exchangeRate > 0 && sourcePrice > 0
          ? calculateVariantPricing({ sourcePrice }, settings)
          : null;
      return { ...v, pricing };
    });

    return {
      status: parsed.status,
      warnings: parsed.warnings,
      parsed: { ...parsed, variants: variantsWithPricing },
      settings,
    };
  });

// ============================================================
// CREATE: persist product + variants.
// ============================================================
const variantInputSchema = z.object({
  sourceVariantId: z.string().nullable().optional(),
  sizeLabel: z.string().nullable().optional(),
  colorLabel: z.string().nullable().optional(),
  sourcePrice: z.number().nonnegative().nullable().optional(),
  isPurchasable: z.boolean().default(true),
  availabilityStatus: z
    .enum(["AVAILABLE", "LOW_STOCK", "UNAVAILABLE", "UNKNOWN", "NEEDS_REVIEW"])
    .optional(),
  unavailableReason: z.string().nullable().optional(),
  sourceAvailabilityRawText: z.string().nullable().optional(),
  optionSignature: z.string().nullable().optional(),
});

const createSchema = z.object({
  merchantId: z.string().uuid(),
  source: sourceEnum,
  sourceUrl: z.string().url(),
  sourceProductId: z.string().min(1),
  title: z.string().min(1).max(300),
  brand: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  coverImage: z.string().url().nullable().optional(),
  gallery: z.array(z.string().url()).default([]),
  category: z.string().nullable().optional(),
  productInfo: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .default([]),
  productIntroSections: z
    .array(z.object({ title: z.string(), content: z.string() }))
    .default([]),
  variants: z.array(variantInputSchema).min(1, "Хамгийн багадаа 1 хувилбар оруулна."),
  allowDuplicate: z.boolean().optional().default(false),
});


export const createForeignProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPermission(context, data.merchantId, data.source);
    const { supabase } = context;
    const settings = await loadOrDefaultSettings(supabase, data.merchantId, data.source);
    const src = FOREIGN_SOURCES[data.source as keyof typeof FOREIGN_SOURCES];
    if (settings.exchangeRate <= 0) {
      throw new Error(`Валютын ханш тохируулагдаагүй байна. Тохиргоо хэсгээс ${src.currency}→MNT ханш оруулна уу.`);
    }

    // Compute final prices first; need product.price (lowest variant) for listing.
    const priced = data.variants.map((v) => {
      const sourcePrice = v.sourcePrice ?? 0;
      const pricing =
        sourcePrice > 0 ? calculateVariantPricing({ sourcePrice }, settings) : null;
      return { input: v, pricing };
    });

    const priceableVariants = priced.filter((x) => x.pricing != null);
    if (priceableVariants.length === 0) {
      throw new Error("Хамгийн багадаа нэг хувилбарт хүчинтэй KRW үнэ оруулна уу.");
    }
    const minPrice = Math.min(
      ...priceableVariants.map((x) => x.pricing!.roundedCustomerPriceMnt),
    );

    const slug = `${slugify(data.title)}-${data.sourceProductId.slice(-6)}`;

    // Build a rich HTML description that includes intro sections (size table,
    // care, story, etc.) so the customer PDP can render the full Poizon content.
    const stripScripts = (h: string) =>
      String(h ?? "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/ on\w+="[^"]*"/gi, "");
    const introHtml = (data.productIntroSections ?? [])
      .map((s) => {
        const title = s.title?.trim();
        const body = stripScripts(s.content ?? "").trim();
        if (!title && !body) return "";
        return `<section class="foreign-intro-section">${
          title ? `<h3>${title}</h3>` : ""
        }${body}</section>`;
      })
      .filter(Boolean)
      .join("\n");
    const baseDesc = (data.description ?? "").trim();
    const richDescription =
      [baseDesc, introHtml].filter(Boolean).join("\n\n") || null;

    // Gallery → detail_media so the PDP carousel renders ALL images.
    const detailMedia = (data.gallery ?? []).map((url) => ({
      url,
      type: "image" as const,
    }));

    const productPayload: any = {
      merchant_id: data.merchantId,
      name: data.title,
      slug,
      description: richDescription,
      price: minPrice,
      original_price: null,
      discount: 0,
      image_url: data.coverImage ?? null,
      thumbnail_url: data.coverImage ?? null,
      product_code: `${data.source}-${data.sourceProductId}`,
      category: data.category ?? null,
      is_new: true,
      is_on_sale: false,
      is_bogo: false,
      is_active: true,
      stock_quantity: 0,
      gallery_images: data.gallery,
      colors: [],
      sizes: data.variants.map((v) => v.sizeLabel ?? "").filter(Boolean),
      specifications: data.productInfo ?? [],
      detail_media: detailMedia,
      variant_stock: {},
      // Foreign-order specific columns
      product_type: "FOREIGN_ORDER",
      foreign_source: data.source,
      source_url: data.sourceUrl,
      source_product_id: data.sourceProductId,
      source_country: src.country,
      source_currency: src.currency,
      source_name: src.name,
      default_delivery_min_days: settings.deliveryMin,
      default_delivery_max_days: settings.deliveryMax,
      last_source_sync_at: new Date().toISOString(),
      source_sync_status: "OK",
    };

    const { data: created, error: pErr } = await supabase
      .from("products")
      .insert(productPayload)
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);
    const productId = created!.id as string;

    // Insert variants
    const variantRows = priced.map((x) => {
      const v = x.input;
      const p = x.pricing;
      const avail =
        v.availabilityStatus ??
        (p ? "AVAILABLE" : "UNKNOWN");
      return {
        product_id: productId,
        label: [v.sizeLabel, v.colorLabel].filter(Boolean).join(" / ") || null,
        size_label: v.sizeLabel ?? null,
        color_label: v.colorLabel ?? null,
        source_variant_id: v.sourceVariantId ?? null,
        source_price: v.sourcePrice ?? null,
        source_currency: src.currency,
        exchange_rate: p?.exchangeRate ?? settings.exchangeRate,
        source_price_mnt: p?.sourcePriceMnt ?? null,
        korea_domestic_shipping_mnt: p?.koreaDomesticShippingMnt ?? 0,
        cargo_cost_mnt: p?.cargoCostMnt ?? 0,
        local_delivery_cost_mnt: p?.localDeliveryCostMnt ?? 0,
        payment_fee_reserve_mnt: p?.paymentFeeReserveMnt ?? 0,
        risk_buffer_mnt: p?.riskBufferMnt ?? 0,
        profit_percent: p?.profitPercent ?? settings.defaultProfitPercent,
        minimum_profit_mnt: p?.minimumProfitMnt ?? settings.minimumProfitMnt,
        profit_amount_mnt: p?.profitAmountMnt ?? 0,
        final_customer_price_mnt: p?.finalCustomerPriceMnt ?? null,
        rounded_customer_price_mnt: p?.roundedCustomerPriceMnt ?? null,
        availability_status: avail,
        source_availability_status: avail,
        unavailable_reason: v.unavailableReason ?? null,
        source_availability_raw_text: v.sourceAvailabilityRawText ?? null,
        option_signature: v.optionSignature ?? null,
        is_visible: true,
        is_purchasable: !!p && v.isPurchasable !== false && avail !== "UNAVAILABLE",
        last_price_sync_at: new Date().toISOString(),
        last_availability_sync_at: new Date().toISOString(),
      };
    });

    const { error: vErr } = await supabase.from("product_variants").insert(variantRows);
    if (vErr) {
      // Rollback the product to avoid orphans
      await supabase.from("products").delete().eq("id", productId);
      throw new Error(`Хувилбар үүсгэхэд алдаа: ${vErr.message}`);
    }

    return { productId, slug };
  });
