// Provider registry — keep the only place where adapters are wired.
import type { ExternalCatalogProvider, ForeignSourceKey } from "./types";
import { poizonKoreaProvider } from "./poizon-korea.server";

const REGISTRY: Partial<Record<ForeignSourceKey, ExternalCatalogProvider>> = {
  POIZON_KR: poizonKoreaProvider,
};

export function getProvider(source: ForeignSourceKey): ExternalCatalogProvider {
  const p = REGISTRY[source];
  if (!p) throw new Error(`Энэ эх сурвалжийн адаптер хараахан бэлэн биш байна: ${source}`);
  return p;
}
