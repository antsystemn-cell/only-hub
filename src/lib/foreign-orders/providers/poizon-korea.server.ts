// Poizon Korea (kr.poizon.com) catalog provider.
// Strategy: fetch with browser UA, parse __NEXT_DATA__ JSON first, fall back to og: meta tags.
// Defensive — partial data is acceptable; merchant can edit before saving.

import type {
  ExternalCatalogProvider,
  ParsedProduct,
  ParsedVariant,
} from "./types";
import { FOREIGN_SOURCES } from "../sources";

const SRC = FOREIGN_SOURCES.POIZON_KR;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
  "Cache-Control": "no-cache",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractMeta(html: string, key: string): string | null {
  // property="og:..." | name="..."
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
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? decodeEntities(m[1]).trim() : null;
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

function extractJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // ignore
    }
  }
  return out;
}

/**
 * Walk an arbitrary object tree looking for a product-like node.
 * Poizon embeds product detail under varying keys; we probe defensively.
 */
function findProductNode(root: any): any | null {
  if (!root || typeof root !== "object") return null;
  const candidates: any[] = [];
  const stack: any[] = [root];
  const seen = new WeakSet<object>();
  let steps = 0;
  while (stack.length && steps < 50000) {
    steps++;
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);
    // Looks like a product if it has a title/spuTitle + image fields
    const hasTitle =
      typeof node.title === "string" ||
      typeof node.spuTitle === "string" ||
      typeof node.name === "string" ||
      typeof node.productName === "string";
    const hasImages =
      Array.isArray(node.images) ||
      Array.isArray(node.imageList) ||
      Array.isArray(node.picList) ||
      typeof node.logoUrl === "string" ||
      typeof node.coverImage === "string";
    if (hasTitle && hasImages) candidates.push(node);
    if (Array.isArray(node)) {
      for (const v of node) stack.push(v);
    } else {
      for (const k in node) stack.push(node[k]);
    }
  }
  // Return the largest candidate (most fields).
  candidates.sort((a, b) => Object.keys(b).length - Object.keys(a).length);
  return candidates[0] ?? null;
}

function findSkuList(root: any): any[] {
  if (!root || typeof root !== "object") return [];
  const keys = ["skuList", "skus", "skuInfoList", "saleProperties", "propertyList"];
  const stack: any[] = [root];
  const seen = new WeakSet<object>();
  let steps = 0;
  while (stack.length && steps < 50000) {
    steps++;
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const k of keys) {
      const v = (node as any)[k];
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
        // Heuristic: skuList items usually have price-ish or size-ish keys
        const sample = v[0];
        if (
          "price" in sample ||
          "skuId" in sample ||
          "sku_id" in sample ||
          "size" in sample ||
          "sizeName" in sample ||
          "propertyValue" in sample
        ) {
          return v;
        }
      }
    }
    if (Array.isArray(node)) {
      for (const v of node) stack.push(v);
    } else {
      for (const k in node) stack.push(node[k]);
    }
  }
  return [];
}

function normalizePrice(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!isFinite(n) || n <= 0) return null;
    // Poizon often stores price in "cents" / minor units. Heuristic:
    // KRW retail rarely below 1000. If sub-1000, assume it's "*100" units.
    return n;
  }
  return null;
}

function parseVariants(skuList: any[]): ParsedVariant[] {
  return skuList.map((sku) => {
    const sizeLabel =
      sku.size ??
      sku.sizeName ??
      sku.propertyValue ??
      sku.propValue ??
      sku.skuName ??
      sku.label ??
      null;
    const colorLabel = sku.color ?? sku.colorName ?? null;
    const rawPrice =
      sku.price?.value ??
      sku.price ??
      sku.salePrice ??
      sku.minPrice ??
      sku.discountPrice ??
      sku.referencePrice ??
      null;
    const sourcePrice = normalizePrice(rawPrice);
    const sourceVariantId =
      sku.skuId?.toString() ??
      sku.sku_id?.toString() ??
      sku.id?.toString() ??
      sku.propertyValueId?.toString() ??
      null;
    return {
      sourceVariantId,
      sizeLabel: sizeLabel != null ? String(sizeLabel).trim() : null,
      colorLabel: colorLabel != null ? String(colorLabel).trim() : null,
      sourcePrice,
      sourceAvailabilityStatus: sourcePrice ? "available" : "unknown",
      available: !!sourcePrice,
    };
  });
}

export const poizonKoreaProvider: ExternalCatalogProvider = {
  source: "POIZON_KR",

  resolveLink(url) {
    const trimmed = url.trim();
    if (!SRC.urlPattern?.test(trimmed)) {
      return { ok: false, productId: null, reason: "Зөвхөн kr.poizon.com/product/... линк дэмжинэ." };
    }
    const productId = SRC.extractProductId?.(trimmed) ?? null;
    if (!productId) return { ok: false, productId: null, reason: "Бүтээгдэхүүний ID олдсонгүй." };
    return { ok: true, productId };
  },

  async getProduct({ url, productId }) {
    const warnings: string[] = [];
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
      description: null,
      coverImage: null,
      gallery: [],
      variants: [],
      warnings,
    };

    let html: string;
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
      if (!res.ok) {
        warnings.push(`Эх сурвалж ${res.status} буцаалаа. Гараар бөглөнө үү.`);
        return { ...base, status: "IMPORT_FAILED" };
      }
      html = await res.text();
    } catch (e: any) {
      warnings.push(`Татаж чадсангүй: ${e?.message ?? e}. Гараар бөглөнө үү.`);
      return { ...base, status: "IMPORT_FAILED" };
    }

    // 1) Meta tags — always-on baseline.
    const ogTitle = extractMeta(html, "og:title") ?? extractTitleTag(html);
    const ogImage = extractMeta(html, "og:image");
    const ogDesc = extractMeta(html, "og:description") ?? extractMeta(html, "description");

    base.title = ogTitle ? ogTitle.replace(/\s*-\s*Poizon.*$/i, "").trim() : null;
    base.coverImage = ogImage;
    base.description = ogDesc;

    // 2) JSON-LD (Product schema) — fills brand/price reliably when present.
    const jsonLd = extractJsonLd(html);
    for (const node of jsonLd) {
      if (node?.["@type"] === "Product" || (Array.isArray(node?.["@type"]) && node["@type"].includes("Product"))) {
        base.title = base.title ?? (typeof node.name === "string" ? node.name : null);
        if (typeof node.brand === "string") base.brand = node.brand;
        else if (node.brand?.name) base.brand = String(node.brand.name);
        if (typeof node.image === "string") base.coverImage = base.coverImage ?? node.image;
        else if (Array.isArray(node.image) && node.image.length) {
          base.coverImage = base.coverImage ?? String(node.image[0]);
          base.gallery = node.image.slice(0, 12).map(String);
        }
      }
    }

    // 3) __NEXT_DATA__ — best source for variants/gallery.
    const next = extractNextData(html);
    if (next) {
      const productNode = findProductNode(next);
      if (productNode) {
        base.title = base.title ?? productNode.title ?? productNode.spuTitle ?? productNode.name ?? null;
        base.brand = base.brand ?? productNode.brandName ?? productNode.brand ?? null;
        const imgArr =
          productNode.images ??
          productNode.imageList ??
          productNode.picList ??
          (productNode.logoUrl ? [productNode.logoUrl] : null) ??
          (productNode.coverImage ? [productNode.coverImage] : null);
        if (Array.isArray(imgArr)) {
          const flat = imgArr
            .map((x: any) => (typeof x === "string" ? x : x?.url ?? x?.picUrl ?? null))
            .filter((x: any): x is string => typeof x === "string" && x.startsWith("http"));
          if (flat.length) {
            base.coverImage = base.coverImage ?? flat[0];
            base.gallery = flat.slice(0, 12);
          }
        }
      }
      const skuList = findSkuList(next);
      if (skuList.length) {
        base.variants = parseVariants(skuList).filter(
          (v) => v.sizeLabel || v.sourcePrice != null,
        );
      }
    }

    // Determine status
    const hasTitle = !!base.title;
    const hasImage = !!base.coverImage;
    const hasVariants = base.variants.length > 0;
    const hasVariantPrices = base.variants.some((v) => (v.sourcePrice ?? 0) > 0);

    if (hasTitle && hasImage && hasVariants && hasVariantPrices) {
      base.status = "SUCCESS";
    } else if (hasTitle || hasImage) {
      base.status = "PARTIAL_IMPORT";
      if (!hasVariants) warnings.push("Хэмжээ/SKU мэдээлэл татагдсангүй. Гараар нэмнэ үү.");
      else if (!hasVariantPrices) warnings.push("Хэмжээний үнэ татагдсангүй. KRW үнийг гараар бөглөнө үү.");
      if (!hasImage) warnings.push("Зураг татагдсангүй.");
    } else {
      base.status = "MANUAL_REVIEW_REQUIRED";
      warnings.push("Эх сурвалжаас мэдээлэл татах боломжгүй байна. Гараар оруулна уу.");
    }

    return base;
  },
};
