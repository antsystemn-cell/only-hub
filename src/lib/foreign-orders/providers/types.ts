// External catalog provider interface (provider-agnostic).
import type { Database } from "@/integrations/supabase/types";

export type ForeignSourceKey = Database["public"]["Enums"]["foreign_source"];

export type ImportStatus =
  | "SUCCESS"
  | "PARTIAL_IMPORT"
  | "IMPORT_FAILED"
  | "MANUAL_REVIEW_REQUIRED";

export type ExtractionMethod =
  | "STATIC_HTML"
  | "EMBEDDED_JSON"
  | "RENDERED_DOM"
  | "META_FALLBACK"
  | "HTML_OPTION_BLOCK";

/**
 * Canonical availability enum used across importer, sync engine,
 * customer storefront and cart/checkout enforcement.
 */
export type AvailabilityStatus =
  | "AVAILABLE"
  | "LOW_STOCK"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "NEEDS_REVIEW";

export type UnavailableReason =
  | "POIZON_OPTION_PRICE_MISSING"
  | "SOURCE_REMOVED"
  | "MERCHANT_DISABLED"
  | "SYNC_FAILED"
  | "MANUAL"
  | null;

export type OptionGroup = {
  name: string;
  level: number;
  /** Visible key, e.g. "DEFAULT", "KR" — included in the displayed label when not DEFAULT. */
  prefix?: string | null;
  values: Array<{
    propertyValueId: string;
    value: string;
    sizeHint?: string | null;
  }>;
};

export type ParsedVariant = {
  sourceVariantId?: string | null;
  /** Composed primary label, e.g. "좁음 (B) / KR 230" — kept for back-compat with sizeLabel. */
  sizeLabel?: string | null;
  colorLabel?: string | null;
  /** Decomposed: one entry per option group, in level order. */
  options?: Array<{ groupName: string; value: string; prefix?: string | null }>;
  sourcePrice?: number | null;
  /** Legacy string status kept for back-compat with existing code (e.g. "available"/"unavailable"). */
  sourceAvailabilityStatus?: string | null;
  /** Canonical availability decision (preferred). */
  availabilityStatus: AvailabilityStatus;
  /** Whether the variant should be purchasable in the storefront. */
  isPurchasable: boolean;
  unavailableReason?: UnavailableReason;
  /** The raw price/availability text we observed in the source page. */
  sourceAvailabilityRawText?: string | null;
  /** ISO timestamp when this row's availability was last read from source. */
  lastAvailabilitySyncAt?: string | null;
  /** Stable signature for matching across syncs, e.g. "size:KR 295|box:블랙 박스". */
  optionSignature?: string | null;
  /** Convenience boolean used by legacy callers. */
  available?: boolean;
};

export type ProductInfoRow = { label: string; value: string };

export type ProductIntroSection = { title: string; content: string };

export type DeliveryOption = {
  type: string;
  estimatedDays: string | null;
  displayedPrice: number | null;
  domesticDeliveryFee: number | null;
};

export type ParsedProduct = {
  status: ImportStatus;
  source: ForeignSourceKey;
  sourceUrl: string;
  sourceProductId: string | null;
  sourceCurrency: string;
  sourceCountry: string;
  sourceName: string;
  title: string | null;
  brand: string | null;
  category: string | null;
  categoryBreadcrumbs: string[];
  description: string | null;
  baseSourcePrice: number | null;
  coverImage: string | null;
  gallery: string[];
  productInfo: ProductInfoRow[];
  productIntroSections: ProductIntroSection[];
  optionGroups: OptionGroup[];
  variants: ParsedVariant[];
  deliveryOptions: DeliveryOption[];
  /** "품절 임박" detected near the product area — show LOW_STOCK warning. */
  lowStockWarning: boolean;
  warnings: string[];
  extractionMethod: ExtractionMethod;
  diagnostics: {
    httpStatus: number | null;
    htmlLength: number;
    fetchedAt: string;
    foundImagesCount: number;
    foundProductInfoCount: number;
    foundOptionGroupsCount: number;
    foundVariantsCount: number;
    foundDeliveryOptionsCount: number;
    optionBlockFound: boolean;
    unavailableMarkersFound: number;
    lowStockMarkerFound: boolean;
    variantsAvailable: number;
    variantsUnavailable: number;
    variantsUnknown: number;
  };
};

export interface ExternalCatalogProvider {
  source: ForeignSourceKey;
  resolveLink(url: string): { ok: boolean; productId: string | null; reason?: string };
  getProduct(input: { url: string; productId: string }): Promise<ParsedProduct>;
}

/** Build a stable, normalized option signature from a variant's options. */
export function buildOptionSignature(
  options: Array<{ groupName: string; value: string; prefix?: string | null }> | undefined,
): string | null {
  if (!options || options.length === 0) return null;
  const parts = options
    .map((o) => {
      const key = normalizeKey(o.groupName);
      const valRaw = (o.prefix && o.prefix !== "DEFAULT" ? `${o.prefix} ${o.value}` : o.value) ?? "";
      const val = normalizeValue(valRaw);
      return `${key}:${val}`;
    })
    .filter(Boolean)
    .sort();
  return parts.join("|");
}

function normalizeKey(s: string): string {
  const v = (s || "").trim().toLowerCase().replace(/\s+/g, " ");
  const map: Record<string, string> = {
    "사이즈": "size",
    "사이즈: kr": "size",
    "size": "size",
    "색상": "color",
    "컬러": "color",
    "color": "color",
    "박스": "box",
    "box": "box",
    "용량": "volume",
    "volume": "volume",
    "스타일": "style",
    "style": "style",
    "에디션": "edition",
    "edition": "edition",
    "옵션": "option",
    "구성": "option",
  };
  return map[v] ?? v;
}

function normalizeValue(s: string): string {
  return (s || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}
