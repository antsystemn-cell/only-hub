// External catalog provider interface (provider-agnostic).
import type { Database } from "@/integrations/supabase/types";

export type ForeignSourceKey = Database["public"]["Enums"]["foreign_source"];

export type ImportStatus =
  | "SUCCESS"
  | "PARTIAL_IMPORT"
  | "IMPORT_FAILED"
  | "MANUAL_REVIEW_REQUIRED";

export type ParsedVariant = {
  sourceVariantId?: string | null;
  sizeLabel?: string | null;
  colorLabel?: string | null;
  sourcePrice?: number | null;
  sourceAvailabilityStatus?: string | null;
  available?: boolean;
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
  description: string | null;
  coverImage: string | null;
  gallery: string[];
  variants: ParsedVariant[];
  warnings: string[];
};

export interface ExternalCatalogProvider {
  source: ForeignSourceKey;
  resolveLink(url: string): { ok: boolean; productId: string | null; reason?: string };
  getProduct(input: { url: string; productId: string }): Promise<ParsedProduct>;
}
