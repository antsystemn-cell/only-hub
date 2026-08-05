import { taobaoProvider } from "./taobao.server";
import { poizonKrProvider } from "./poizon-korea.server";
import type { ExternalCatalogProvider } from "./types";
import type { Database } from "@/integrations/supabase/types";

type ForeignSource = Database["public"]["Enums"]["foreign_source"];

const PROVIDERS: Partial<Record<ForeignSource, ExternalCatalogProvider>> = {
  TAOBAO: taobaoProvider,
  TMALL: taobaoProvider,
  POIZON_KR: poizonKrProvider,
};

export function getProvider(source: ForeignSource): ExternalCatalogProvider {
  const p = PROVIDERS[source];
  if (!p) throw new Error(`Эх сурвалжид тохирох адаптер олдсонгүй: ${source}`);
  return p;
}
