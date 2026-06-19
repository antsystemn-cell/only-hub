// Poizon Korea (kr.poizon.com) catalog provider.
//
// Strategy:
// 1. Read `__NEXT_DATA__` JSON for structured data (titles, gallery, options,
//    SKU prices/status).
// 2. Cross-check availability against the visible HTML option block, which
//    contains per-option price labels including "--원" for unavailable rows
//    and "품절 임박" for low-stock products.
// 3. Fall back to meta tags when JSON is unavailable.
//
// Availability rule (option-price based, per spec):
//   valid KRW price (e.g. "122,100원") -> AVAILABLE, isPurchasable=true
//   "--원"                              -> UNAVAILABLE, reason=POIZON_OPTION_PRICE_MISSING
//   missing/unmatched                  -> UNKNOWN, isPurchasable=false
//   "품절 임박" near product area      -> product-level lowStockWarning=true
//                                          (does NOT flip variants to UNAVAILABLE)

import type {
  AvailabilityStatus,
  DeliveryOption,
  ExternalCatalogProvider,
  ExtractionMethod,
  OptionGroup,
  ParsedProduct,
  ParsedVariant,
  ProductInfoRow,
  ProductIntroSection,
} from "./types";
import { buildOptionSignature } from "./types";
import { FOREIGN_SOURCES } from "../sources";

const SRC = FOREIGN_SOURCES.POIZON_KR;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
};

// ---------- helpers ----------
const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

function extractMeta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]*content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]*content=["']([^"']+)["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return null;
}

function extractNextData(html: string): any | null {
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

const IMAGE_BLOCKLIST_HOSTS = ["node-common"];
const IMAGE_BLOCKLIST_ALT = [
  /poizon$/i, /app\s*store/i, /google\s*play/i, /qr\s*code/i,
  /favorite/i, /star/i, /delivery/i, /security/i, /subscribe/i,
];

function looksLikeProductImage(url: string, alt?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url)) return false;
  const allowProductPath =
    /\/(pro-img|stark|cut-img|temai|du-img)\//i.test(url) ||
    /\/spu_image\//i.test(url);
  if (!allowProductPath && IMAGE_BLOCKLIST_HOSTS.some((h) => url.includes(`/${h}/`))) {
    return false;
  }
  if (alt && IMAGE_BLOCKLIST_ALT.some((re) => re.test(alt))) return false;
  return true;
}

function moneyOf(node: any): number | null {
  if (!node) return null;
  const m = node?.money ?? node;
  const v = m?.minUnitVal ?? m?.amount ?? m?.value;
  if (v == null) return null;
  const n = Number(typeof v === "string" ? v.replace(/[^\d.]/g, "") : v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function parseFeeFromDeliveryDesc(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*원/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ---- option block extraction (text-only fallback) ----
const OPTION_GROUP_LABELS = [
  "에디션", "사이즈: KR", "사이즈", "용량", "스타일", "박스", "색상", "컬러", "옵션", "구성",
];
const STOP_MARKERS = [
  "배송 선택", "구매", "DELIVERY", "EASY RETURN", "SecurityShopping", "관련 브랜드",
];

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Slice the option block out of the rendered text so we can confidently scan
 * for option-price tokens without picking up "구매 …원" or coupon prices.
 */
function extractOptionBlockText(plain: string): {
  text: string | null;
  found: boolean;
} {
  let startIdx = -1;
  for (const label of OPTION_GROUP_LABELS) {
    const idx = plain.indexOf(label);
    if (idx >= 0 && (startIdx === -1 || idx < startIdx)) startIdx = idx;
  }
  if (startIdx < 0) return { text: null, found: false };

  let endIdx = plain.length;
  for (const stop of STOP_MARKERS) {
    const idx = plain.indexOf(stop, startIdx + 1);
    if (idx > startIdx && idx < endIdx) endIdx = idx;
  }
  return { text: plain.slice(startIdx, endIdx), found: true };
}

const VALID_KRW_RE = /\b\d{1,3}(?:,\d{3})+원\b/g;
const UNAVAILABLE_MARKER_RE = /--\s*원/g;
const LOW_STOCK_RE = /품절\s*임박/;

function parsePriceKrw(s: string): number | null {
  const m = s.match(/(\d{1,3}(?:,\d{3})+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------- main parser ----------
function emptyDiagnostics(htmlLength: number, fetchedAt: string, httpStatus: number | null) {
  return {
    httpStatus,
    htmlLength,
    fetchedAt,
    foundImagesCount: 0,
    foundProductInfoCount: 0,
    foundOptionGroupsCount: 0,
    foundVariantsCount: 0,
    foundDeliveryOptionsCount: 0,
    optionBlockFound: false,
    unavailableMarkersFound: 0,
    lowStockMarkerFound: false,
    variantsAvailable: 0,
    variantsUnavailable: 0,
    variantsUnknown: 0,
  };
}

function failedShell(
  url: string,
  productId: string,
  warnings: string[],
  status: number | null,
  htmlLength = 0,
): ParsedProduct {
  const now = new Date().toISOString();
  return {
    status: "IMPORT_FAILED",
    source: "POIZON_KR",
    sourceUrl: url,
    sourceProductId: productId,
    sourceCurrency: SRC.currency,
    sourceCountry: SRC.country,
    sourceName: SRC.name,
    title: null,
    brand: null,
    category: null,
    categoryBreadcrumbs: [],
    description: null,
    baseSourcePrice: null,
    coverImage: null,
    gallery: [],
    productInfo: [],
    productIntroSections: [],
    optionGroups: [],
    variants: [],
    deliveryOptions: [],
    lowStockWarning: false,
    warnings,
    extractionMethod: "META_FALLBACK",
    diagnostics: emptyDiagnostics(htmlLength, now, status),
  };
}

function parsePoizonKoreaProductPage(
  html: string,
  url: string,
  productId: string,
): ParsedProduct {
  const warnings: string[] = [];
  const now = new Date().toISOString();
  let extractionMethod: ExtractionMethod = "META_FALLBACK";

  const base: ParsedProduct = {
    status: "MANUAL_REVIEW_REQUIRED",
    source: "POIZON_KR",
    sourceUrl: url,
    sourceProductId: productId,
    sourceCurrency: SRC.currency,
    sourceCountry: SRC.country,
    sourceName: SRC.name,
    title: null,
    brand: null,
    category: null,
    categoryBreadcrumbs: [],
    description: null,
    baseSourcePrice: null,
    coverImage: null,
    gallery: [],
    productInfo: [],
    productIntroSections: [],
    optionGroups: [],
    variants: [],
    deliveryOptions: [],
    lowStockWarning: false,
    warnings,
    extractionMethod,
    diagnostics: emptyDiagnostics(html.length, now, 200),
  };

  // ---- Layer 1: meta baseline ----
  base.title =
    extractMeta(html, "og:title")?.replace(/\s*-\s*POIZON.*$/i, "").trim() || null;
  base.coverImage = extractMeta(html, "og:image") || null;
  base.description =
    extractMeta(html, "og:description") || extractMeta(html, "description") || null;

  // ---- Layer 2: __NEXT_DATA__ structured ----
  const next = extractNextData(html);
  const pp = next?.props?.pageProps;
  const gd = pp?.goodsDetail;
  const pi = pp?.priceInfo;

  // ---- Layer 3 (text scan): always compute to detect lowStock + option block ----
  const plain = stripHtml(html);
  const { text: optionText, found: optionBlockFound } = extractOptionBlockText(plain);
  base.diagnostics.optionBlockFound = optionBlockFound;
  if (LOW_STOCK_RE.test(plain)) {
    base.lowStockWarning = true;
    base.diagnostics.lowStockMarkerFound = true;
  }
  if (optionText) {
    const unavail = optionText.match(UNAVAILABLE_MARKER_RE);
    base.diagnostics.unavailableMarkersFound = unavail ? unavail.length : 0;
  }

  if (!gd) {
    warnings.push("Эх сурвалжаас бүтэцлэгдсэн өгөгдөл олдсонгүй. Үндсэн нэр/зураг л татагдлаа.");
    if (base.title || base.coverImage) base.status = "PARTIAL_IMPORT";
    finalizeStatus(base, warnings);
    return base;
  }

  extractionMethod = "EMBEDDED_JSON";

  // Title / brand / category
  const detail = gd.detail ?? {};
  base.title = detail.title || base.title;
  base.brand = detail.brandName || null;
  base.category = detail.frontCategoryName || null;
  if (base.category)
    base.categoryBreadcrumbs = ["메인 페이지", base.category, base.brand].filter(Boolean) as string[];

  base.baseSourcePrice = moneyOf(gd.price);

  // ---- Images ----
  const imageUrls: Array<{ url: string; sort: number }> = [];
  for (const im of gd.imageModels ?? []) {
    if (im?.url && looksLikeProductImage(im.url)) imageUrls.push({ url: im.url, sort: Number(im.sort ?? 0) });
  }
  for (const im of gd.imageModelList ?? []) {
    if (im?.url && looksLikeProductImage(im.url)) imageUrls.push({ url: im.url, sort: 100 + Number(im.sort ?? 0) });
  }
  for (const im of gd.detailImageList ?? []) {
    if (im?.url && looksLikeProductImage(im.url)) imageUrls.push({ url: im.url, sort: 1000 + Number(im.sort ?? 0) });
  }
  const seenImg = new Set<string>();
  const gallery: string[] = [];
  for (const { url: u } of imageUrls.sort((a, b) => a.sort - b.sort)) {
    if (seenImg.has(u)) continue;
    seenImg.add(u);
    gallery.push(u);
  }
  if (gallery.length) {
    base.coverImage = gallery[0];
    base.gallery = gallery.slice(0, 20);
  } else if (base.coverImage && looksLikeProductImage(base.coverImage)) {
    base.gallery = [base.coverImage];
    warnings.push("Зөвхөн нэг бүтээгдэхүүний зураг таниглаа. Галерейг гараар нэмэх боломжтой.");
  }

  // ---- Product info ----
  const infoRows: ProductInfoRow[] = [];
  const seenInfo = new Set<string>();
  const pushInfo = (label?: string | null, value?: string | null) => {
    const l = (label ?? "").trim();
    const v = (value ?? "").trim();
    if (!l || !v || /더\s*보기/.test(v)) return;
    const k = `${l}::${v}`;
    if (seenInfo.has(k)) return;
    seenInfo.add(k);
    infoRows.push({ label: l, value: v });
  };
  for (const block of gd.propertyModule?.propertyBlocks ?? []) {
    for (const row of block?.propertyList ?? []) pushInfo(row?.name, row?.value);
  }
  for (const row of gd.baseProperties ?? []) pushInfo(row?.key, row?.value);
  base.productInfo = infoRows;

  // ---- Intro sections ----
  const intro: ProductIntroSection[] = [];
  for (const t of gd.detailTextModule?.detailTextList ?? []) {
    const title = (t?.subTitle ?? "").trim();
    const content = (t?.content ?? "").trim();
    if (title && content) intro.push({ title, content });
  }
  base.productIntroSections = intro;

  // ---- Option groups ----
  type PvIndex = Map<string, { groupName: string; value: string; prefix: string | null }>;
  const pvIndex: PvIndex = new Map();
  const optionGroups: OptionGroup[] = [];
  for (const sp of gd.saleProperties ?? []) {
    const groupName: string = sp?.name ?? "옵션";
    const level: number = Number(sp?.level ?? optionGroups.length + 1);
    const propertyMap: Record<string, any[]> = sp?.propertyMap ?? {};
    const propertyKeys: string[] = sp?.propertyKeys ?? Object.keys(propertyMap ?? {});
    const primaryKey =
      propertyKeys.find((k) => k && k !== "DEFAULT") ?? propertyKeys[0] ?? "DEFAULT";
    const items: any[] = propertyMap[primaryKey] ?? [];
    const values = items.map((it) => {
      const pvId = String(it?.propertyValueId ?? "");
      const value = String(it?.value ?? "");
      const prefix =
        primaryKey && primaryKey !== "DEFAULT" ? primaryKey : (it?.prefix ?? null);
      pvIndex.set(pvId, { groupName, value, prefix: prefix || null });
      const sizeHint =
        Array.isArray(it?.sizeParameterList) && it.sizeParameterList.length
          ? it.sizeParameterList
              .map((p: any) => `${p?.sizeKey ?? ""}${p?.sizeValue ?? ""}`)
              .join(" ")
              .trim()
          : null;
      return { propertyValueId: pvId, value, sizeHint };
    });
    optionGroups.push({
      name: groupName,
      level,
      prefix: primaryKey && primaryKey !== "DEFAULT" ? primaryKey : null,
      values,
    });
  }
  base.optionGroups = optionGroups;

  // ---- Variants from SKU list (primary path) ----
  const skuList: any[] = pi?.skuInfoList ?? pi?.skus ?? gd?.skus ?? [];
  const variants: ParsedVariant[] = [];
  for (const sku of skuList) {
    const props = Array.isArray(sku?.properties) ? sku.properties : [];
    const decoded = props
      .map((p: any) => pvIndex.get(String(p?.propertyValueId)))
      .filter(Boolean) as Array<{ groupName: string; value: string; prefix: string | null }>;
    const sizeLabel =
      decoded.map((d) => (d.prefix ? `${d.prefix} ${d.value}` : d.value)).join(" / ") ||
      sku?.skuTitle || null;
    const colorLabel =
      decoded.find((d) => /색상|컬러|color/i.test(d.groupName))?.value ?? null;
    const sourcePrice = moneyOf(sku?.minPrice ?? sku?.price);
    const status = Number(sku?.status ?? 1);

    const decision = decideAvailability({
      sourcePrice,
      statusCode: status,
      rawText: sourcePrice != null ? `${sourcePrice.toLocaleString()}원` : "--원",
      lowStockProduct: base.lowStockWarning,
    });

    const optionsForSig = decoded.map((d) => ({
      groupName: d.groupName,
      value: d.value,
      prefix: d.prefix,
    }));

    variants.push({
      sourceVariantId: String(sku?.skuId ?? sku?.sourceSkuId ?? "") || null,
      sizeLabel,
      colorLabel,
      options: optionsForSig,
      sourcePrice,
      sourceAvailabilityStatus: decision.legacy,
      availabilityStatus: decision.status,
      isPurchasable: decision.purchasable,
      unavailableReason: decision.reason,
      sourceAvailabilityRawText: decision.rawText,
      lastAvailabilitySyncAt: now,
      optionSignature: buildOptionSignature(optionsForSig),
      available: decision.purchasable,
    });
  }
  base.variants = variants;

  // ---- Layer 4: HTML option-block reconciliation ----
  // When the SKU list is missing some option rows (common for sunglasses/perfume
  // where the public page exposes only one option group's prices), reconcile by
  // mapping the per-option price tokens onto known optionGroup values.
  if (optionText && optionGroups.length > 0) {
    reconcileWithOptionBlock(base, optionText, now);
  }

  // ---- Delivery options ----
  const deliveryOptions: DeliveryOption[] = [];
  const seenDel = new Set<string>();
  for (const sku of skuList) {
    for (const sp of sku?.skuSpeedInfo ?? sku?.speedList ?? []) {
      const type = sp?.labelInfo?.name ?? sp?.tradeLabel ?? null;
      if (!type) continue;
      const k = `${type}::${sp?.speedInfoTip ?? ""}`;
      if (seenDel.has(k)) continue;
      seenDel.add(k);
      deliveryOptions.push({
        type,
        estimatedDays: sp?.speedInfoTip ?? null,
        displayedPrice: moneyOf(sp?.speedPrice),
        domesticDeliveryFee: parseFeeFromDeliveryDesc(sp?.skuDeliveryDesc),
      });
    }
  }
  base.deliveryOptions = deliveryOptions;

  base.extractionMethod = extractionMethod;
  finalizeStatus(base, warnings);
  return base;
}

type Decision = {
  status: AvailabilityStatus;
  purchasable: boolean;
  reason: ParsedVariant["unavailableReason"];
  rawText: string | null;
  legacy: string;
};

function decideAvailability(input: {
  sourcePrice: number | null;
  statusCode: number;
  rawText: string | null;
  lowStockProduct: boolean;
}): Decision {
  const { sourcePrice, statusCode, rawText, lowStockProduct } = input;
  if (sourcePrice != null && sourcePrice > 0 && statusCode === 1) {
    if (lowStockProduct) {
      return {
        status: "LOW_STOCK",
        purchasable: true,
        reason: null,
        rawText,
        legacy: "available",
      };
    }
    return { status: "AVAILABLE", purchasable: true, reason: null, rawText, legacy: "available" };
  }
  if (rawText && /--\s*원/.test(rawText)) {
    return {
      status: "UNAVAILABLE",
      purchasable: false,
      reason: "POIZON_OPTION_PRICE_MISSING",
      rawText,
      legacy: "unavailable",
    };
  }
  if (sourcePrice == null) {
    return { status: "UNKNOWN", purchasable: false, reason: null, rawText, legacy: "unknown" };
  }
  return {
    status: "UNAVAILABLE",
    purchasable: false,
    reason: "POIZON_OPTION_PRICE_MISSING",
    rawText,
    legacy: "unavailable",
  };
}

/**
 * Cross-check JSON variants against per-option price tokens in the visible
 * option block. Walks each option-group value, finds the surrounding token
 * ("122,100원" or "--원"), and flips availability accordingly.
 *
 * If a JSON variant for that value exists, override it. Otherwise synthesize
 * a stub variant so the merchant sees the row in the preview.
 */
function reconcileWithOptionBlock(p: ParsedProduct, optionText: string, now: string) {
  const variantBySig = new Map<string, ParsedVariant>();
  for (const v of p.variants) {
    if (v.optionSignature) variantBySig.set(v.optionSignature, v);
  }

  let availCount = 0;
  let unavailCount = 0;
  let unknownCount = 0;
  let reconciled = false;

  for (const group of p.optionGroups) {
    for (const val of group.values) {
      const tokenIdx = locateValueIndex(optionText, val.value, group.prefix ?? undefined);
      if (tokenIdx < 0) continue;
      // Look ahead at most ~80 chars for either a valid price or "--원"
      const window = optionText.slice(tokenIdx, tokenIdx + 120);
      const unavail = /--\s*원/.test(window);
      const priceMatch = window.match(/\b\d{1,3}(?:,\d{3})+원/);
      if (!unavail && !priceMatch) continue;
      reconciled = true;

      const sourcePrice = unavail ? null : (priceMatch ? parsePriceKrw(priceMatch[0]) : null);
      const rawText = unavail ? "--원" : (priceMatch?.[0] ?? null);
      const decision = decideAvailability({
        sourcePrice,
        statusCode: unavail ? 0 : 1,
        rawText,
        lowStockProduct: p.lowStockWarning,
      });

      const options = [{ groupName: group.name, value: val.value, prefix: group.prefix ?? null }];
      const sig = buildOptionSignature(options) ?? "";
      const existing = variantBySig.get(sig);
      if (existing) {
        existing.availabilityStatus = decision.status;
        existing.isPurchasable = decision.purchasable;
        existing.unavailableReason = decision.reason;
        existing.sourceAvailabilityRawText = rawText ?? existing.sourceAvailabilityRawText;
        existing.sourceAvailabilityStatus = decision.legacy;
        existing.available = decision.purchasable;
        if (sourcePrice != null) existing.sourcePrice = sourcePrice;
        existing.lastAvailabilitySyncAt = now;
      } else {
        // Synthesize a row when the JSON SKU list didn't include this option.
        const label = group.prefix ? `${group.prefix} ${val.value}` : val.value;
        const newVar: ParsedVariant = {
          sourceVariantId: null,
          sizeLabel: label,
          colorLabel: /색상|컬러|color/i.test(group.name) ? val.value : null,
          options,
          sourcePrice,
          sourceAvailabilityStatus: decision.legacy,
          availabilityStatus: decision.status,
          isPurchasable: decision.purchasable,
          unavailableReason: decision.reason,
          sourceAvailabilityRawText: rawText,
          lastAvailabilitySyncAt: now,
          optionSignature: sig,
          available: decision.purchasable,
        };
        p.variants.push(newVar);
        variantBySig.set(sig, newVar);
      }
    }
  }

  // If we reconciled some but not all expected combinations, leave warning.
  if (reconciled && p.optionGroups.length > 1) {
    p.warnings.push(
      "Full option combination matrix could not be fully reconstructed from public page.",
    );
  }

  for (const v of p.variants) {
    if (v.availabilityStatus === "AVAILABLE" || v.availabilityStatus === "LOW_STOCK") availCount++;
    else if (v.availabilityStatus === "UNAVAILABLE") unavailCount++;
    else unknownCount++;
  }
  p.diagnostics.variantsAvailable = availCount;
  p.diagnostics.variantsUnavailable = unavailCount;
  p.diagnostics.variantsUnknown = unknownCount;
}

function locateValueIndex(text: string, value: string, prefix?: string): number {
  if (!value) return -1;
  // Try "prefix value" first (e.g. "KR 295"), then bare value.
  if (prefix) {
    const i = text.indexOf(`${prefix} ${value}`);
    if (i >= 0) return i;
  }
  const i = text.indexOf(value);
  return i;
}

function finalizeStatus(base: ParsedProduct, warnings: string[]) {
  base.diagnostics.foundImagesCount = base.gallery.length;
  base.diagnostics.foundProductInfoCount = base.productInfo.length;
  base.diagnostics.foundOptionGroupsCount = base.optionGroups.length;
  base.diagnostics.foundVariantsCount = base.variants.length;
  base.diagnostics.foundDeliveryOptionsCount = base.deliveryOptions.length;

  // Recompute availability counts if reconciliation didn't run.
  if (
    base.diagnostics.variantsAvailable === 0 &&
    base.diagnostics.variantsUnavailable === 0 &&
    base.diagnostics.variantsUnknown === 0 &&
    base.variants.length > 0
  ) {
    let a = 0, u = 0, k = 0;
    for (const v of base.variants) {
      if (v.availabilityStatus === "AVAILABLE" || v.availabilityStatus === "LOW_STOCK") a++;
      else if (v.availabilityStatus === "UNAVAILABLE") u++;
      else k++;
    }
    base.diagnostics.variantsAvailable = a;
    base.diagnostics.variantsUnavailable = u;
    base.diagnostics.variantsUnknown = k;
  }

  const hasTitle = !!base.title;
  const hasImage = base.gallery.length > 0;
  const hasPurchasable = base.variants.some((v) => v.isPurchasable);
  if (hasTitle && hasImage && hasPurchasable) base.status = "SUCCESS";
  else if (hasTitle && hasImage) {
    base.status = "PARTIAL_IMPORT";
    if (base.variants.length === 0)
      warnings.push("Хувилбарын үнэ татагдсангүй. Гараар бөглөнө үү.");
  } else if (hasTitle || hasImage) {
    base.status = "PARTIAL_IMPORT";
  } else {
    base.status = "MANUAL_REVIEW_REQUIRED";
    warnings.push("Эх сурвалжаас мэдээлэл татаж чадсангүй. Гараар оруулна уу.");
  }
}

export { parsePoizonKoreaProductPage };

// ---------- provider ----------
export const poizonKoreaProvider: ExternalCatalogProvider = {
  source: "POIZON_KR",

  resolveLink(url) {
    const trimmed = url.trim();
    if (!SRC.urlPattern?.test(trimmed)) {
      return {
        ok: false,
        productId: null,
        reason: "Зөвхөн kr.poizon.com/product/... линк дэмжинэ.",
      };
    }
    const productId = SRC.extractProductId?.(trimmed) ?? null;
    if (!productId) {
      return { ok: false, productId: null, reason: "Бүтээгдэхүүний ID олдсонгүй." };
    }
    return { ok: true, productId };
  },

  async getProduct({ url, productId }) {
    let html = "";
    let status = 0;
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
      status = res.status;
      if (!res.ok) {
        return failedShell(url, productId, [`Эх сурвалж ${status} буцаалаа.`], status);
      }
      html = await res.text();
    } catch (e: any) {
      return failedShell(url, productId, [`Татаж чадсангүй: ${e?.message ?? e}`], null);
    }

    const parsed = parsePoizonKoreaProductPage(html, url, productId);
    parsed.diagnostics.httpStatus = status;
    return parsed;
  },
};
