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
  | "META_FALLBACK";

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
  sourceAvailabilityStatus?: string | null;
  available?: boolean;
};

export type ProductInfoRow = { label: string; value: string };

export type ProductIntroSection = { title: string; content: string };

export type DeliveryOption = {
  type: string; // e.g. "국내 배송", "해외 직구"
  estimatedDays: string | null; // e.g. "5~8일"
  displayedPrice: number | null; // KRW
  domesticDeliveryFee: number | null; // KRW, parsed from skuDeliveryDesc
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
  };
};

export interface ExternalCatalogProvider {
  source: ForeignSourceKey;
  resolveLink(url: string): { ok: boolean; productId: string | null; reason?: string };
  getProduct(input: { url: string; productId: string }): Promise<ParsedProduct>;
}
