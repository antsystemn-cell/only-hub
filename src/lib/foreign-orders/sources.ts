// Foreign source registry — single source of truth for UI + permission checks.

import type { Database } from "@/integrations/supabase/types";

export type ForeignSource = Database["public"]["Enums"]["foreign_source"];

export type ForeignSourceDef = {
  key: ForeignSource;
  name: string;
  country: string;
  currency: string;
  active: boolean;
  defaultDeliveryMinDays: number;
  defaultDeliveryMaxDays: number;
  badgeLabel: string;
  urlPattern?: RegExp;
  extractProductId?: (url: string) => string | null;
};

export const FOREIGN_SOURCES: Record<ForeignSource, ForeignSourceDef> = {
  POIZON_KR: {
    key: "POIZON_KR",
    name: "Poizon Korea",
    country: "KR",
    currency: "KRW",
    active: true,
    defaultDeliveryMinDays: 10,
    defaultDeliveryMaxDays: 14,
    badgeLabel: "Poizon Korea-с захиалгаар",
    urlPattern: /^https?:\/\/(?:kr\.)?poizon\.com\/product\/[\w-]+-(\d+)\/?(?:[?#].*)?$/i,
    extractProductId: (url: string) => {
      const m = url.match(/-(\d+)\/?(?:[?#].*)?$/);
      return m ? m[1] : null;
    },
  },
  DEWU_CN: {
    key: "DEWU_CN",
    name: "Dewu (得物)",
    country: "CN",
    currency: "CNY",
    active: false,
    defaultDeliveryMinDays: 10,
    defaultDeliveryMaxDays: 14,
    badgeLabel: "Dewu-с захиалгаар",
  },
  TAOBAO: {
    key: "TAOBAO",
    name: "Taobao",
    country: "CN",
    currency: "CNY",
    active: true,
    defaultDeliveryMinDays: 10,
    defaultDeliveryMaxDays: 18,
    badgeLabel: "Taobao-с захиалгаар",
    urlPattern: /^https?:\/\/([\w-]+\.)?(taobao|tmall|1688)\.com\//i,
    extractProductId: (url: string) => {
      try {
        const u = new URL(url);
        const id = u.searchParams.get("id");
        if (id && /^\d+$/.test(id)) return id;
        const m = url.match(/[?&]id=(\d+)/);
        return m ? m[1] : null;
      } catch {
        return null;
      }
    },
  },
  TMALL: {
    key: "TMALL",
    name: "Tmall",
    country: "CN",
    currency: "CNY",
    active: false,
    defaultDeliveryMinDays: 10,
    defaultDeliveryMaxDays: 18,
    badgeLabel: "Tmall-с захиалгаар",
  },
  ALIBABA_1688: {
    key: "ALIBABA_1688",
    name: "1688 / Alibaba",
    country: "CN",
    currency: "CNY",
    active: false,
    defaultDeliveryMinDays: 12,
    defaultDeliveryMaxDays: 20,
    badgeLabel: "1688-с захиалгаар",
  },
  AMAZON: {
    key: "AMAZON",
    name: "Amazon",
    country: "US",
    currency: "USD",
    active: false,
    defaultDeliveryMinDays: 14,
    defaultDeliveryMaxDays: 21,
    badgeLabel: "Amazon-с захиалгаар",
  },
  MANUAL_EXTERNAL: {
    key: "MANUAL_EXTERNAL",
    name: "Бусад эх сурвалж",
    country: "—",
    currency: "USD",
    active: false,
    defaultDeliveryMinDays: 10,
    defaultDeliveryMaxDays: 21,
    badgeLabel: "Гадаадаас захиалгаар",
  },
};

export function getForeignSourceDef(key: ForeignSource | null | undefined): ForeignSourceDef | null {
  if (!key) return null;
  return FOREIGN_SOURCES[key] ?? null;
}

export function isMerchantAllowedSource(
  allowed: ForeignSource[] | null | undefined,
  source: ForeignSource,
): boolean {
  if (!allowed) return false;
  return allowed.includes(source);
}
