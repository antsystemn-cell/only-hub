// Taobao / Tmall / 1688 catalog provider.
//
// Taobao's desktop item.taobao.com page is heavily anti-bot protected when
// fetched from a data-center IP (Cloudflare Worker) and typically returns a
// login/verify shell without product data.
//
// The mobile share page (h5.m.taobao.com/awp/core/detail.htm?id=...) is much
// more permissive and usually returns a page with:
//   - <title> containing the product name
//   - <meta property="og:image"> / og:title
//   - an embedded JSON blob "g_page_config = {...};" that contains the sku
//     map (skuBase, prop_list, price, images)
//
// We fetch that mobile page first, then fall back to item.taobao.com. Anything
// we can't extract is left blank so the merchant can fill it in on the same
// preview screen (identical UX to the Poizon Korea importer).
//
// This is a best-effort adapter — Taobao actively changes their markup and
// signs some responses. When extraction fails we still return a valid
// ParsedProduct shell with warnings so the shared ForeignProductImporter UI
// can render the manual edit form.
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
import { buildOptionSignature } from "./types";
import { FOREIGN_SOURCES } from "../sources";

const SRC = FOREIGN_SOURCES.TAOBAO;

const MOBILE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: "https://h5.m.taobao.com/",
  "Cache-Control": "no-cache",
};

const DESKTOP_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: "https://www.taobao.com/",
  "Cache-Control": "no-cache",
};

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

function extractTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return null;
  return decodeEntities(m[1])
    .replace(/[-_|]+\s*(淘宝|天猫|taobao|tmall|1688).*$/i, "")
    .trim() || null;
}

/**
 * Extract the "g_page_config = {...};" (or similar) JSON blob embedded in
 * many Taobao mobile pages.
 */
function extractPageConfig(html: string): any | null {
  const patterns = [
    /window\.g_config\s*=\s*(\{[\s\S]*?\});/,
    /g_page_config\s*=\s*(\{[\s\S]*?\});/,
    /window\.__INIT_DATA__\s*=\s*(\{[\s\S]*?\})\s*;/,
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      try {
        return JSON.parse(m[1]);
      } catch {
        /* keep trying */
      }
    }
  }
  return null;
}

function normalizeImage(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = url.trim();
  if (u.startsWith("//")) u = "https:" + u;
  // strip Taobao thumbnail suffixes like _430x430q90.jpg → prefer full-size
  u = u.replace(/_\d+x\d+(q\d+)?\.(jpe?g|png|webp)$/i, ".$2");
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

function collectImages(html: string, config: any): string[] {
  const found = new Set<string>();

  const push = (v: string | null | undefined) => {
    const u = normalizeImage(v ?? undefined);
    if (u) found.add(u);
  };

  push(extractMeta(html, "og:image"));

  // Common structured locations across Taobao pages.
  const item = config?.data?.item ?? config?.item ?? config?.props?.item ?? null;
  const images: any[] =
    item?.images ?? item?.imgs ?? config?.data?.images ?? config?.images ?? [];
  for (const im of images) {
    if (typeof im === "string") push(im);
    else if (im?.url) push(im.url);
    else if (im?.src) push(im.src);
  }
  const skuBase = config?.data?.skuBase ?? config?.skuBase ?? null;
  for (const p of skuBase?.props ?? []) {
    for (const v of p?.values ?? []) push(v?.image);
  }

  // Grab any <img> inside the DOM that points to Taobao's CDN.
  const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = imgRe.exec(html)) !== null && n < 200) {
    const u = normalizeImage(m[1]);
    if (u && /(alicdn|taobaocdn)\.com/i.test(u)) push(u);
    n++;
  }

  return Array.from(found).slice(0, 25);
}

function extractPropsAsInfo(config: any): ProductInfoRow[] {
  const rows: ProductInfoRow[] = [];
  const seen = new Set<string>();
  const push = (label: string, value: string) => {
    const l = label.trim();
    const v = value.trim();
    if (!l || !v) return;
    const k = `${l}::${v}`;
    if (seen.has(k)) return;
    seen.add(k);
    rows.push({ label: l, value: v });
  };
  const item = config?.data?.item ?? config?.item ?? null;
  const props: any[] = item?.props ?? item?.attributes ?? [];
  for (const p of props) {
    if (p?.name && p?.value) push(String(p.name), String(p.value));
    else if (typeof p === "string" && p.includes(":")) {
      const [a, b] = p.split(":");
      if (a && b) push(a, b);
    }
  }
  return rows;
}

function extractOptionGroupsAndVariants(config: any): {
  optionGroups: OptionGroup[];
  variants: ParsedVariant[];
} {
  const groups: OptionGroup[] = [];
  const variants: ParsedVariant[] = [];
  const skuBase = config?.data?.skuBase ?? config?.skuBase ?? null;
  if (!skuBase) return { optionGroups: groups, variants: variants };

  const props: any[] = skuBase.props ?? [];
  const pvMap = new Map<string, { groupName: string; value: string }>();

  props.forEach((p, i) => {
    const groupName = String(p?.name ?? `옵션${i + 1}`);
    const values: OptionGroup["values"] = [];
    for (const v of p?.values ?? []) {
      const pvId = String(v?.vid ?? v?.pvId ?? "");
      const value = String(v?.name ?? v?.value ?? "");
      if (!pvId || !value) continue;
      pvMap.set(pvId, { groupName, value });
      values.push({ propertyValueId: pvId, value });
    }
    groups.push({ name: groupName, level: i + 1, prefix: null, values });
  });

  const skus: any[] = skuBase.skus ?? config?.data?.skuCore?.sku2info
    ? Object.entries(config?.data?.skuCore?.sku2info ?? {}).map(([id, info]: any) => ({
        skuId: id,
        propPath: info?.propPath,
        price: info?.price?.priceText ?? info?.price,
      }))
    : skuBase.skus ?? [];

  for (const sku of skus) {
    const propPath: string = String(sku?.propPath ?? sku?.props ?? "");
    const pairs = propPath.split(";").filter(Boolean);
    const decoded = pairs
      .map((pair) => {
        const pv = pair.split(":")[1];
        return pvMap.get(pv);
      })
      .filter(Boolean) as Array<{ groupName: string; value: string }>;

    const sizeLabel = decoded.map((d) => d.value).join(" / ") || null;
    const colorLabel =
      decoded.find((d) => /颜色|color|色/i.test(d.groupName))?.value ?? null;

    let priceNum: number | null = null;
    const raw = sku?.price;
    if (typeof raw === "number") priceNum = Math.round(raw);
    else if (typeof raw === "string") {
      const m = raw.match(/(\d+(?:\.\d+)?)/);
      if (m) priceNum = Math.round(Number(m[1]) * 100) / 100;
    }

    const optionsForSig = decoded.map((d) => ({
      groupName: d.groupName,
      value: d.value,
      prefix: null,
    }));

    variants.push({
      sourceVariantId: String(sku?.skuId ?? "") || null,
      sizeLabel,
      colorLabel,
      options: optionsForSig,
      sourcePrice: priceNum,
      sourceAvailabilityStatus: priceNum ? "available" : "unknown",
      availabilityStatus: priceNum ? "AVAILABLE" : "UNKNOWN",
      isPurchasable: !!priceNum,
      unavailableReason: null,
      sourceAvailabilityRawText: raw != null ? String(raw) : null,
      lastAvailabilitySyncAt: new Date().toISOString(),
      optionSignature: buildOptionSignature(optionsForSig),
      available: !!priceNum,
    });
  }
  return { optionGroups: groups, variants };
}

function extractBasePrice(config: any, variants: ParsedVariant[]): number | null {
  const item = config?.data?.item ?? config?.item ?? null;
  const candidates: any[] = [
    config?.data?.price?.price?.priceText,
    config?.data?.price?.price?.priceMoney,
    config?.data?.price?.extraPrices?.[0]?.priceText,
    item?.price,
    item?.priceInfo?.price,
    item?.priceInfo?.finalPrice,
    config?.price,
    config?.skuBase?.price,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "number" && c > 0) return Math.round(c * 100) / 100;
    if (typeof c === "string") {
      const m = c.match(/(\d+(?:\.\d+)?)/);
      if (m) return Math.round(Number(m[1]) * 100) / 100;
    }
  }
  // Derive from variants: minimum available price.
  const prices = variants
    .map((v) => v.sourcePrice)
    .filter((p): p is number => typeof p === "number" && p > 0);
  if (prices.length) return Math.min(...prices);
  return null;
}

function extractDeliveryOptions(config: any): DeliveryOption[] {
  const out: DeliveryOption[] = [];
  const item = config?.data?.item ?? config?.item ?? null;
  const delivery =
    config?.data?.delivery ??
    config?.data?.deliveryVO ??
    item?.delivery ??
    item?.deliveryInfo ??
    null;
  if (!delivery) return out;

  const fromCity: string | null =
    delivery?.from ?? delivery?.fromCity ?? delivery?.location ?? null;
  const toCity: string | null = delivery?.to ?? delivery?.toCity ?? null;
  const feeRaw =
    delivery?.postage ??
    delivery?.expressFee ??
    delivery?.freight ??
    delivery?.fee ??
    null;

  let fee: number | null = null;
  if (typeof feeRaw === "number") fee = feeRaw;
  else if (typeof feeRaw === "string") {
    const m = feeRaw.match(/(\d+(?:\.\d+)?)/);
    if (m) fee = Number(m[1]);
    if (/免运费|包邮|free/i.test(feeRaw)) fee = 0;
  }

  const label = [fromCity, toCity].filter(Boolean).join(" → ") || "Taobao хүргэлт";
  out.push({
    type: label,
    estimatedDays: null,
    displayedPrice: fee,
    domesticDeliveryFee: fee,
  });

  const services: any[] = delivery?.services ?? delivery?.serviceList ?? [];
  for (const s of services) {
    if (!s) continue;
    const t = String(s?.title ?? s?.name ?? "").trim();
    if (!t) continue;
    out.push({
      type: t,
      estimatedDays: s?.days ? String(s.days) : null,
      displayedPrice: typeof s?.fee === "number" ? s.fee : null,
      domesticDeliveryFee: null,
    });
  }
  return out;
}

function extractIntroSections(html: string, config: any): ProductIntroSection[] {
  const sections: ProductIntroSection[] = [];
  const item = config?.data?.item ?? config?.item ?? null;
  const desc =
    item?.description ?? item?.desc ?? item?.detailDesc ?? config?.description ?? null;
  if (typeof desc === "string" && desc.trim().length > 0) {
    const clean = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (clean.length > 10) {
      sections.push({ title: "Барааны танилцуулга", content: clean.slice(0, 4000) });
    }
  }

  // Extract description-detail images/text block from mobile HTML.
  const descBlock = html.match(
    /<div[^>]+(?:id|class)=["'][^"']*(?:desc|detail)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  );
  if (descBlock?.[1] && sections.length === 0) {
    const clean = descBlock[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (clean.length > 20) {
      sections.push({ title: "Дэлгэрэнгүй", content: clean.slice(0, 4000) });
    }
  }
  return sections;
}

function emptyDiagnostics(htmlLength: number, fetchedAt: string, status: number | null) {
  return {
    httpStatus: status,
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

function shell(
  url: string,
  productId: string,
  extraWarnings: string[],
  status: number | null,
  htmlLength = 0,
): ParsedProduct {
  const now = new Date().toISOString();
  return {
    status: "MANUAL_REVIEW_REQUIRED",
    source: "TAOBAO",
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
    warnings: extraWarnings,
    extractionMethod: "META_FALLBACK",
    diagnostics: emptyDiagnostics(htmlLength, now, status),
  };
}

async function tryFetch(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string } | null> {
  try {
    const res = await fetch(url, { headers, redirect: "follow" });
    const body = await res.text();
    return { status: res.status, body };
  } catch {
    return null;
  }
}

export const taobaoProvider: ExternalCatalogProvider = {
  source: "TAOBAO",
  resolveLink(url: string) {
    const pid = SRC.extractProductId?.(url) ?? null;
    if (!pid) {
      return {
        ok: false,
        productId: null,
        reason: "Taobao линкнээс барааны ID (id=…) олдсонгүй.",
      };
    }
    return { ok: true, productId: pid };
  },

  async getProduct({ url, productId }) {
    const warnings: string[] = [];
    const mobileUrl = `https://h5.m.taobao.com/awp/core/detail.htm?id=${productId}`;

    // 1) mobile page first — most likely to succeed from serverless.
    let res = await tryFetch(mobileUrl, MOBILE_HEADERS);
    if (!res || res.status >= 400 || res.body.length < 400) {
      warnings.push("Мобайл хуудсаас татах боломжгүй байлаа. Desktop хувилбарыг оролдож байна…");
      res = (await tryFetch(url, DESKTOP_HEADERS)) ?? res;
    }
    if (!res) {
      return shell(url, productId, [
        "Taobao хуудас руу холбогдож чадсангүй. Мэдээллийг доор гараар оруулна уу.",
      ], null);
    }

    const html = res.body;
    const now = new Date().toISOString();
    let extractionMethod: ExtractionMethod = "META_FALLBACK";

    const base: ParsedProduct = shell(url, productId, warnings, res.status, html.length);

    // Detect obvious anti-bot blocks and short-circuit to manual editing.
    if (
      /login\.taobao\.com|nc_iconfont|滑动验证|verify\.taobao|请输入验证|slide-verify/i.test(
        html,
      ) ||
      html.length < 800
    ) {
      warnings.push(
        "Taobao автомат татахаас сэргийлж байна. Мэдээллийг гараар оруулна уу — үлдсэн үнэ/зургийг доор шууд засах боломжтой.",
      );
      return base;
    }

    // Meta baseline
    base.title = extractMeta(html, "og:title") || extractTitleTag(html);
    base.description = extractMeta(html, "og:description") || extractMeta(html, "description");
    const ogImage = normalizeImage(extractMeta(html, "og:image"));
    if (ogImage) base.coverImage = ogImage;

    // Structured JSON, if we can find it.
    const config = extractPageConfig(html);
    if (config) extractionMethod = "EMBEDDED_JSON";

    const gallery = collectImages(html, config ?? {});
    if (gallery.length > 0) {
      base.gallery = gallery;
      if (!base.coverImage) base.coverImage = gallery[0];
    }

    if (config) {
      const info = extractPropsAsInfo(config);
      if (info.length) base.productInfo = info;

      const { optionGroups, variants } = extractOptionGroupsAndVariants(config);
      if (optionGroups.length) base.optionGroups = optionGroups;
      if (variants.length) base.variants = variants;

      const item = config?.data?.item ?? config?.item ?? null;
      if (item?.title && !base.title) base.title = String(item.title);
      if (item?.categoryName && !base.category) base.category = String(item.categoryName);
    }

    // Decide overall status.
    const hasCore = !!base.title && (base.gallery.length > 0 || !!base.coverImage);
    if (hasCore && base.variants.length > 0) base.status = "SUCCESS";
    else if (hasCore) {
      base.status = "PARTIAL_IMPORT";
      warnings.push(
        "Хувилбар / үнэ Taobao-оос уншигдсангүй. Хэмжээ, өнгө, CNY үнийг доор гараар нэмнэ үү.",
      );
    } else {
      base.status = "MANUAL_REVIEW_REQUIRED";
      warnings.push(
        "Taobao автомат татахад хязгаарлагдмал өгөгдөл ирсэн. Барааны нэр, зураг, үнийг гараар оруулна уу.",
      );
    }

    base.extractionMethod = extractionMethod;
    base.diagnostics.foundImagesCount = base.gallery.length;
    base.diagnostics.foundProductInfoCount = base.productInfo.length;
    base.diagnostics.foundOptionGroupsCount = base.optionGroups.length;
    base.diagnostics.foundVariantsCount = base.variants.length;
    base.diagnostics.variantsAvailable = base.variants.filter(
      (v) => v.availabilityStatus === "AVAILABLE",
    ).length;
    base.diagnostics.variantsUnknown = base.variants.filter(
      (v) => v.availabilityStatus === "UNKNOWN",
    ).length;
    base.warnings = warnings;
    return base;
  },
};
