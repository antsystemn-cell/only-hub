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

const TAOBAO_H5_APP_KEY = "12574478";

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

function isGenericTaobaoIntlPage(html: string): boolean {
  const title = extractTitleTag(html) ?? "";
  const desc = extractMeta(html, "description") ?? extractMeta(html, "page-desc") ?? "";
  return /天貓淘寶海外|淘宝全球|花更少|買到寶|跨境电商平台|跨境電商平台/i.test(
    `${title} ${desc}`,
  );
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
  const apiStackValue = config?.data?.apiStackValue ?? config?.apiStackValue ?? null;
  const item = config?.data?.item ?? config?.item ?? config?.props?.item ?? apiStackValue?.item ?? null;
  const images: any[] =
    item?.images ?? item?.imgs ?? config?.data?.images ?? config?.images ?? apiStackValue?.images ?? [];
  for (const im of images) {
    if (typeof im === "string") push(im);
    else if (im?.url) push(im.url);
    else if (im?.src) push(im.src);
  }
  const skuBase = config?.data?.skuBase ?? config?.skuBase ?? apiStackValue?.skuBase ?? null;
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
  const apiStackValue = config?.data?.apiStackValue ?? config?.apiStackValue ?? null;
  const item = config?.data?.item ?? config?.item ?? apiStackValue?.item ?? null;
  const props: any[] = item?.props ?? item?.attributes ?? [];
  for (const p of props) {
    if (p?.name && p?.value) push(String(p.name), String(p.value));
    else if (typeof p === "string" && p.includes(":")) {
      const [a, b] = p.split(":");
      if (a && b) push(a, b);
    }
  }
  const groupProps: any[] =
    config?.data?.props?.groupProps ??
    config?.props?.groupProps ??
    apiStackValue?.props?.groupProps ??
    [];
  for (const group of groupProps) {
    if (!group || typeof group !== "object") continue;
    for (const entries of Object.values(group)) {
      const list = Array.isArray(entries) ? entries : [entries];
      for (const entry of list) {
        if (!entry || typeof entry !== "object") continue;
        for (const [label, value] of Object.entries(entry)) {
          if (value == null) continue;
          if (typeof value === "string" || typeof value === "number") {
            push(label, String(value));
          }
        }
      }
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
  const apiStackValue = config?.data?.apiStackValue ?? config?.apiStackValue ?? null;
  const skuBase = config?.data?.skuBase ?? config?.skuBase ?? apiStackValue?.skuBase ?? null;
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

  const sku2info = config?.data?.skuCore?.sku2info ?? apiStackValue?.skuCore?.sku2info ?? null;
  const rawSkus: any[] = Array.isArray(skuBase.skus) ? skuBase.skus : [];
  const skus: any[] =
    sku2info && Object.keys(sku2info).length > 0
      ? Object.entries(sku2info).map(([id, info]: any) => {
          const fromBase = rawSkus.find((s) => String(s?.skuId ?? s?.sku_id ?? "") === String(id));
          return {
            skuId: id,
            propPath: info?.propPath ?? fromBase?.propPath ?? fromBase?.properties,
            price: info?.price?.priceText ?? info?.price?.priceMoney ?? info?.price,
          };
        })
      : rawSkus;

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
  const apiStackValue = config?.data?.apiStackValue ?? config?.apiStackValue ?? null;
  const item = config?.data?.item ?? config?.item ?? apiStackValue?.item ?? null;
  const candidates: any[] = [
    config?.data?.price?.price?.priceText,
    config?.data?.price?.price?.priceMoney,
    config?.data?.price?.extraPrices?.[0]?.priceText,
    apiStackValue?.price?.price?.priceText,
    apiStackValue?.price?.price?.priceMoney,
    apiStackValue?.price?.extraPrices?.[0]?.priceText,
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
  const apiStackValue = config?.data?.apiStackValue ?? config?.apiStackValue ?? null;
  const item = config?.data?.item ?? config?.item ?? apiStackValue?.item ?? null;
  const delivery =
    config?.data?.delivery ??
    config?.data?.deliveryVO ??
    apiStackValue?.delivery ??
    apiStackValue?.deliveryVO ??
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
  const apiStackValue = config?.data?.apiStackValue ?? config?.apiStackValue ?? null;
  const item = config?.data?.item ?? config?.item ?? apiStackValue?.item ?? null;
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

async function md5Hex(value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("md5").update(value).digest("hex");
}

function parseSetCookie(headers: Headers): string {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = anyHeaders.getSetCookie?.() ?? [];
  const single = headers.get("set-cookie");
  if (single) cookies.push(single);
  return cookies
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function extractMtopToken(cookieHeader: string): string {
  const m = cookieHeader.match(/(?:^|;\s*)_m_h5_tk=([^_;]+)/);
  return m?.[1] ?? "";
}

function parseMtopResponse(text: string): any | null {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : trimmed.replace(/^[^(]*\(/, "").replace(/\);?\s*$/, "");
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function isMtopBlocked(payload: any): boolean {
  const ret = Array.isArray(payload?.ret) ? payload.ret.join(" ") : String(payload?.ret ?? "");
  const url = String(payload?.data?.url ?? payload?.data?.h5url ?? "");
  return /RGV587|USER_VALIDATE|被挤爆|login\.taobao|_____tmd_____|punish|captcha|验证/i.test(`${ret} ${url}`);
}

function buildMtopConfig(data: any): any | null {
  if (!data || typeof data !== "object") return null;
  let apiStackValue: any = null;
  const apiStackRaw = data?.apiStack?.[0]?.value;
  if (typeof apiStackRaw === "string") {
    try {
      const parsed = JSON.parse(apiStackRaw);
      apiStackValue = parsed?.global?.data ?? parsed;
    } catch {
      apiStackValue = null;
    }
  }
  return {
    data: {
      ...data,
      apiStackValue,
      item: data.item ?? apiStackValue?.item,
      skuBase: data.skuBase ?? apiStackValue?.skuBase,
      skuCore: data.skuCore ?? apiStackValue?.skuCore,
      props: data.props ?? apiStackValue?.props,
      price: data.price ?? apiStackValue?.price,
      delivery: data.delivery ?? apiStackValue?.delivery,
      deliveryVO: data.deliveryVO ?? apiStackValue?.deliveryVO,
    },
  };
}

async function fetchMtop(
  host: string,
  api: string,
  version: string,
  data: Record<string, unknown>,
  cookieHeader = "",
): Promise<{ payload: any | null; cookieHeader: string; status: number; bodyLength: number }> {
  const dataText = JSON.stringify(data);
  const token = extractMtopToken(cookieHeader);
  const t = String(Date.now());
  const sign = await md5Hex(`${token}&${t}&${TAOBAO_H5_APP_KEY}&${dataText}`);
  const params = new URLSearchParams({
    jsv: "2.7.2",
    appKey: TAOBAO_H5_APP_KEY,
    t,
    sign,
    api,
    v: version,
    type: "json",
    dataType: "json",
    data: dataText,
  });
  const res = await fetch(`${host}/h5/${api.toLowerCase()}/${version}/?${params.toString()}`, {
    headers: {
      ...MOBILE_HEADERS,
      Accept: "application/json,text/javascript,*/*;q=0.8",
      Referer: "https://m.intl.taobao.com/",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    redirect: "follow",
  });
  const body = await res.text();
  const newCookies = parseSetCookie(res.headers);
  const mergedCookie = [cookieHeader, newCookies].filter(Boolean).join("; ");
  return {
    payload: parseMtopResponse(body),
    cookieHeader: mergedCookie,
    status: res.status,
    bodyLength: body.length,
  };
}

async function fetchMtopDetailConfig(productId: string): Promise<{
  config: any | null;
  blocked: boolean;
}> {
  const detailData = {
    exParams: JSON.stringify({
      countryCode: "US",
      channel: "oversea_seo",
      ultron2: "true",
      _ultron2_: "true",
      pageCode: "miniAppDetail",
      _from_: "miniapp",
      openFrom: "pagedetail",
      pageSource: "1",
      supportV7: "true",
    }),
    detail_v: "3.5.0",
    channel: "oversea_seo",
    id: productId,
  };
  const legacyData = {
    exParams: JSON.stringify({ countryCode: "US", channel: "oversea_seo" }),
    channel: "oversea_seo",
    itemNumId: productId,
  };
  const attempts = [
    { host: "https://h5api-intl.m.taobao.com", api: "mtop.taobao.detail.data.get", version: "1.0", data: detailData },
    { host: "https://h5api.m.taobao.com", api: "mtop.taobao.detail.data.get", version: "1.0", data: detailData },
    { host: "https://acs.m.taobao.com", api: "mtop.taobao.detail.data.get", version: "1.0", data: detailData },
    { host: "https://h5api.m.taobao.com", api: "mtop.taobao.detail.getdetail", version: "6.0", data: legacyData },
  ];
  let cookieHeader = "";
  let blocked = false;
  for (const attempt of attempts) {
    try {
      let result = await fetchMtop(attempt.host, attempt.api, attempt.version, attempt.data, cookieHeader);
      cookieHeader = result.cookieHeader;
      const ret = Array.isArray(result.payload?.ret) ? result.payload.ret.join(" ") : "";
      if (/TOKEN_EMPTY|TOKEN_EXOIRED|ILLEGAL_ACCESS/i.test(ret) && cookieHeader) {
        result = await fetchMtop(attempt.host, attempt.api, attempt.version, attempt.data, cookieHeader);
        cookieHeader = result.cookieHeader;
      }
      if (isMtopBlocked(result.payload)) {
        blocked = true;
        continue;
      }
      if (result.payload?.data && !/FAIL|ERROR/i.test(ret)) {
        const config = buildMtopConfig(result.payload.data);
        if (config?.data?.item || config?.data?.skuBase || config?.data?.apiStackValue) {
          return { config, blocked };
        }
      }
    } catch {
      continue;
    }
  }
  return { config: null, blocked };
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
        reason: "Taobao эсвэл Tmall линкнээс барааны ID (id=…) олдсонгүй. Зөв линк оруулна уу.",
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

    const blockedHtml =
      /login\.taobao\.com|nc_iconfont|滑动验证|verify\.taobao|请输入验证|slide-verify/i.test(html) ||
      html.length < 800;
    const genericIntlHtml = isGenericTaobaoIntlPage(html);
    if (blockedHtml || genericIntlHtml) {
      warnings.push(
        "Taobao үндсэн хуудасны өгөгдлийг хаасан тул MTop/SEO өгөгдлийн сувгаар дахин татаж байна…",
      );
    }

    // Meta baseline
    if (!genericIntlHtml) {
      base.title = extractMeta(html, "og:title") || extractTitleTag(html);
      base.description = extractMeta(html, "og:description") || extractMeta(html, "description");
    }
    const ogImage = normalizeImage(extractMeta(html, "og:image"));
    if (ogImage) base.coverImage = ogImage;

    // Structured JSON, if we can find it.
    let config = extractPageConfig(html);
    if (config) extractionMethod = "EMBEDDED_JSON";

    // Fallback: try Taobao's cached mobile detail JSON API when the mobile
    // HTML shell did not embed a config blob.
    if (!config) {
      const apiRes = await tryFetch(
        `https://hws.m.taobao.com/cache/wdetail/5.0/?id=${productId}`,
        MOBILE_HEADERS,
      );
      if (apiRes && apiRes.status < 400) {
        // Endpoint returns either raw JSON or JSONP-wrapped JSON.
        const jsonText = apiRes.body.replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        try {
          const parsed = JSON.parse(jsonText);
          config = parsed?.data ? { data: parsed.data } : parsed;
          extractionMethod = "EMBEDDED_JSON";
        } catch {
          /* keep null */
        }
      }
    }

    // Fallback: the actual Taobao mobile app uses MTop JSON endpoints. These
    // often carry the full image / SKU / price matrix even when the public HTML
    // is only the generic international landing shell.
    if (!config || genericIntlHtml) {
      const mtop = await fetchMtopDetailConfig(productId);
      if (mtop.config) {
        config = mtop.config;
        extractionMethod = "EMBEDDED_JSON";
      } else if (mtop.blocked) {
        warnings.push(
          "Taobao MTop өгөгдлийн суваг баталгаажуулалт шаардсан тул бүх сонголт, үнэ, зураг бүрэн татагдсангүй.",
        );
      }
    }

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

      const apiStackValue = config?.data?.apiStackValue ?? config?.apiStackValue ?? null;
      const item = config?.data?.item ?? config?.item ?? apiStackValue?.item ?? null;
      if (item?.title && !base.title) base.title = String(item.title);
      if (item?.categoryName && !base.category) base.category = String(item.categoryName);

      const basePrice = extractBasePrice(config, base.variants);
      if (basePrice != null) base.baseSourcePrice = basePrice;

      const delivery = extractDeliveryOptions(config);
      if (delivery.length) base.deliveryOptions = delivery;

      const intro = extractIntroSections(html, config);
      if (intro.length) base.productIntroSections = intro;
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
    base.diagnostics.foundDeliveryOptionsCount = base.deliveryOptions.length;
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
