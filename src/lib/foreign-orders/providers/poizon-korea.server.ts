// Poizon Korea (kr.poizon.com) catalog provider.
//
// Strategy: the page is a Next.js app whose full product payload lives in the
// embedded `__NEXT_DATA__` <script>. That JSON contains title/brand/category,
// pricing per SKU, every sale-property group, structured product info, intro
// sections, image gallery, and per-SKU delivery info — far richer than meta
// tags. We parse it as the primary source and fall back to meta only when the
// JSON is missing.
//
// No rendered/Playwright fallback — Cloudflare Workers cannot host Chromium.
// If the embedded JSON is absent, we still return partial meta data + warning
// so the merchant can edit manually.

import type {
  DeliveryOption,
  ExternalCatalogProvider,
  ExtractionMethod,
  OptionGroup,
  ParsedProduct,
  ParsedVariant,
  ProductInfoRow,
  ProductIntroSection,
} from "./types";
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

const IMAGE_BLOCKLIST_HOSTS = [
  "node-common", // Poizon UI icons live under cdn.poizon.com/node-common/*
];
const IMAGE_BLOCKLIST_ALT = [
  /poizon$/i, /app\s*store/i, /google\s*play/i, /qr\s*code/i,
  /favorite/i, /star/i, /delivery/i, /security/i, /subscribe/i,
];

function looksLikeProductImage(url: string, alt?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url)) return false;
  // Allow common Poizon product CDN paths
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
  // e.g. "...일반배송 2,500 원" or "...배송비 3,000원"
  const m = s.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*원/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ---------- main parser ----------
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
    warnings,
    extractionMethod,
    diagnostics: {
      httpStatus: 200,
      htmlLength: html.length,
      fetchedAt: now,
      foundImagesCount: 0,
      foundProductInfoCount: 0,
      foundOptionGroupsCount: 0,
      foundVariantsCount: 0,
      foundDeliveryOptionsCount: 0,
    },
  };

  // ---- Layer 1: meta baseline (always set) ----
  base.title =
    extractMeta(html, "og:title")?.replace(/\s*-\s*POIZON.*$/i, "").trim() || null;
  base.coverImage = extractMeta(html, "og:image") || null;
  base.description =
    extractMeta(html, "og:description") || extractMeta(html, "description") || null;

  // ---- Layer 2/3: __NEXT_DATA__ structured extraction ----
  const next = extractNextData(html);
  const pp = next?.props?.pageProps;
  const gd = pp?.goodsDetail;
  const pi = pp?.priceInfo;

  if (!gd) {
    warnings.push(
      "Эх сурвалжаас бүтэцлэгдсэн өгөгдөл олдсонгүй. Үндсэн нэр/зураг л татагдлаа.",
    );
    if (base.title || base.coverImage) base.status = "PARTIAL_IMPORT";
    return base;
  }

  extractionMethod = "EMBEDDED_JSON";

  // Title / brand / category
  const detail = gd.detail ?? {};
  base.title = detail.title || base.title;
  base.brand = detail.brandName || null;
  base.category = detail.frontCategoryName || null;
  if (base.category) base.categoryBreadcrumbs = ["메인 페이지", base.category, base.brand].filter(Boolean) as string[];

  // Base price
  base.baseSourcePrice = moneyOf(gd.price);

  // ---- Images ----
  const imageUrls: Array<{ url: string; sort: number }> = [];
  for (const im of gd.imageModels ?? []) {
    if (im?.url && looksLikeProductImage(im.url)) {
      imageUrls.push({ url: im.url, sort: Number(im.sort ?? 0) });
    }
  }
  for (const im of gd.imageModelList ?? []) {
    if (im?.url && looksLikeProductImage(im.url)) {
      imageUrls.push({ url: im.url, sort: 100 + Number(im.sort ?? 0) });
    }
  }
  for (const im of gd.detailImageList ?? []) {
    if (im?.url && looksLikeProductImage(im.url)) {
      imageUrls.push({ url: im.url, sort: 1000 + Number(im.sort ?? 0) });
    }
  }
  // dedupe and order
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
    warnings.push(
      "Зөвхөн нэг бүтээгдэхүүний зураг таниглаа. Галерейг гараар нэмэх боломжтой.",
    );
  }

  // ---- Product info (specifications) ----
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

  // ---- Product intro sections ----
  const intro: ProductIntroSection[] = [];
  for (const t of gd.detailTextModule?.detailTextList ?? []) {
    const title = (t?.subTitle ?? "").trim();
    const content = (t?.content ?? "").trim();
    if (title && content) intro.push({ title, content });
  }
  base.productIntroSections = intro;

  // ---- Option groups (saleProperties) ----
  type PvIndex = Map<string, { groupName: string; value: string; prefix: string | null }>;
  const pvIndex: PvIndex = new Map();
  const optionGroups: OptionGroup[] = [];
  for (const sp of gd.saleProperties ?? []) {
    const groupName: string = sp?.name ?? "옵션";
    const level: number = Number(sp?.level ?? optionGroups.length + 1);
    const propertyMap: Record<string, any[]> = sp?.propertyMap ?? {};
    const propertyKeys: string[] =
      sp?.propertyKeys ?? Object.keys(propertyMap ?? {});
    // Pick a primary key. Prefer non-DEFAULT (e.g. "KR") when present.
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

  // ---- Variants (priceInfo.skuInfoList) ----
  const skuList: any[] = pi?.skuInfoList ?? pi?.skus ?? gd?.skus ?? [];
  const variants: ParsedVariant[] = [];
  for (const sku of skuList) {
    const props = Array.isArray(sku?.properties) ? sku.properties : [];
    const decoded = props
      .map((p: any) => pvIndex.get(String(p?.propertyValueId)))
      .filter(Boolean) as Array<{ groupName: string; value: string; prefix: string | null }>;
    const sizeLabel = decoded
      .map((d) => (d.prefix ? `${d.prefix} ${d.value}` : d.value))
      .join(" / ") || sku?.skuTitle || null;
    const colorLabel =
      decoded.find((d) => /색상|컬러|color/i.test(d.groupName))?.value ?? null;
    const sourcePrice = moneyOf(sku?.minPrice ?? sku?.price);
    const status = Number(sku?.status ?? 1);
    const available = sourcePrice != null && status === 1;
    variants.push({
      sourceVariantId: String(sku?.skuId ?? sku?.sourceSkuId ?? "") || null,
      sizeLabel,
      colorLabel,
      options: decoded.map((d) => ({
        groupName: d.groupName,
        value: d.value,
        prefix: d.prefix,
      })),
      sourcePrice,
      sourceAvailabilityStatus: available
        ? "available"
        : sourcePrice == null
        ? "unknown"
        : "unavailable",
      available,
    });
  }
  base.variants = variants;

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

  // ---- Status + diagnostics ----
  base.extractionMethod = extractionMethod;
  base.diagnostics.foundImagesCount = base.gallery.length;
  base.diagnostics.foundProductInfoCount = base.productInfo.length;
  base.diagnostics.foundOptionGroupsCount = base.optionGroups.length;
  base.diagnostics.foundVariantsCount = base.variants.length;
  base.diagnostics.foundDeliveryOptionsCount = base.deliveryOptions.length;

  const hasTitle = !!base.title;
  const hasImage = base.gallery.length > 0;
  const hasVariantPrice = base.variants.some((v) => (v.sourcePrice ?? 0) > 0);
  if (hasTitle && hasImage && hasVariantPrice) base.status = "SUCCESS";
  else if (hasTitle && hasImage) {
    base.status = "PARTIAL_IMPORT";
    warnings.push("Хувилбарын үнэ татагдсангүй. Гараар бөглөнө үү.");
  } else if (hasTitle || hasImage) {
    base.status = "PARTIAL_IMPORT";
  } else {
    base.status = "MANUAL_REVIEW_REQUIRED";
    warnings.push("Эх сурвалжаас мэдээлэл татаж чадсангүй. Гараар оруулна уу.");
  }

  return base;
}

// Exported for sync/refresh flows that re-use the same parser.
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
    const now = new Date().toISOString();
    let html = "";
    let status = 0;
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
      status = res.status;
      if (!res.ok) {
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
          warnings: [`Эх сурвалж ${status} буцаалаа.`],
          extractionMethod: "META_FALLBACK",
          diagnostics: {
            httpStatus: status,
            htmlLength: 0,
            fetchedAt: now,
            foundImagesCount: 0,
            foundProductInfoCount: 0,
            foundOptionGroupsCount: 0,
            foundVariantsCount: 0,
            foundDeliveryOptionsCount: 0,
          },
        };
      }
      html = await res.text();
    } catch (e: any) {
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
        warnings: [`Татаж чадсангүй: ${e?.message ?? e}`],
        extractionMethod: "META_FALLBACK",
        diagnostics: {
          httpStatus: null,
          htmlLength: 0,
          fetchedAt: now,
          foundImagesCount: 0,
          foundProductInfoCount: 0,
          foundOptionGroupsCount: 0,
          foundVariantsCount: 0,
          foundDeliveryOptionsCount: 0,
        },
      };
    }

    const parsed = parsePoizonKoreaProductPage(html, url, productId);
    parsed.diagnostics.httpStatus = status;
    return parsed;
  },
};
