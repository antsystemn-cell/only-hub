// Resolver for which payment provider row applies to a given checkout.
// Each merchant payment_providers row carries `use_platform_fallback`. When set,
// checkout uses the platform-managed provider row of the same type instead of
// the merchant's own credentials. The frontend gets a sanitized list only.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { getAdapter } from "@/lib/payments/adapters/index.server";

const LEGACY_CHECKOUT_FIELDS: Record<string, string[]> = {
  hipay: ["entity_id", "client_secret"],
  cash: [],
};

function hasValue(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function requiredFieldsFor(providerType: string): string[] {
  const adapter = getAdapter(providerType);
  if (adapter) return adapter.requiredFields;
  return LEGACY_CHECKOUT_FIELDS[providerType] ?? [];
}

function isCheckoutReady(row: any) {
  const credentials = (row.credentials ?? {}) as Record<string, unknown>;
  const required = requiredFieldsFor(row.provider_type as string);
  const aliases: Record<string, string[]> = {
    entity_id: ["merchant_id"],
    client_secret: ["api_key"],
  };
  const allPresent = required.every((field) => {
    if (hasValue(credentials[field])) return true;
    return (aliases[field] ?? []).some((alt) => hasValue(credentials[alt]));
  });
  if (allPresent) return true;
  return row.config_status === "verified";
}

export type CheckoutMethod = {
  id: string;
  providerType: string;
  name: string;
  icon: string | null;
  logoUrl: string | null;
  description: string | null;
  isPlatformFallback: boolean;
};

async function loadPlatformByType(): Promise<Map<string, any>> {
  const { data: platform } = await supabaseAdmin
    .from("payment_providers")
    .select("id, name, provider_type, icon, logo_url, description, config_status, credentials, is_active, position")
    .eq("is_platform_managed", true)
    .eq("is_active", true);
  const map = new Map<string, any>();
  for (const p of platform ?? []) map.set(p.provider_type as string, p);
  return map;
}

export async function listCheckoutMethodsForMerchant(merchantId: string): Promise<CheckoutMethod[]> {
  const { data: own } = await supabaseAdmin
    .from("payment_providers")
    .select("id, name, provider_type, icon, logo_url, description, config_status, credentials, is_active, position, use_platform_fallback")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  const platformByType = await loadPlatformByType();
  const out: CheckoutMethod[] = [];

  for (const p of own ?? []) {
    if ((p as any).use_platform_fallback) {
      const plat = platformByType.get(p.provider_type as string);
      if (plat && isCheckoutReady(plat)) {
        out.push({
          id: plat.id as string,
          providerType: plat.provider_type as string,
          name: (plat.name as string) ?? (p.name as string),
          icon: (plat.icon as string) ?? (p.icon as string) ?? null,
          logoUrl: (plat.logo_url as string) ?? null,
          description: (plat.description as string) ?? (p.description as string) ?? null,
          isPlatformFallback: true,
        });
      }
      continue;
    }
    if (isCheckoutReady(p)) {
      out.push({
        id: p.id as string,
        providerType: p.provider_type as string,
        name: p.name as string,
        icon: (p.icon as string) ?? null,
        logoUrl: (p.logo_url as string) ?? null,
        description: (p.description as string) ?? null,
        isPlatformFallback: false,
      });
    }
  }
  return out;
}

export async function loadProviderRowForCheckout(opts: {
  merchantId: string;
  providerType: string;
}): Promise<{
  row: any;
  isPlatformFallback: boolean;
} | null> {
  const { data: own } = await supabaseAdmin
    .from("payment_providers")
    .select("*")
    .eq("merchant_id", opts.merchantId)
    .eq("provider_type", opts.providerType)
    .eq("is_active", true)
    .maybeSingle();

  if ((own as any)?.use_platform_fallback) {
    const { data: plat } = await supabaseAdmin
      .from("payment_providers")
      .select("*")
      .eq("is_platform_managed", true)
      .eq("provider_type", opts.providerType)
      .eq("is_active", true)
      .maybeSingle();
    if (!plat || !isCheckoutReady(plat)) return null;
    return { row: plat, isPlatformFallback: true };
  }

  if (own && isCheckoutReady(own)) return { row: own, isPlatformFallback: false };
  return null;
}
