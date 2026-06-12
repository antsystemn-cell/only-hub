// Resolver for which payment provider row applies to a given checkout.
// Two layers:
//   1. The merchant's own configured + verified providers (merchant-owned credentials).
//   2. If the merchant opts in via merchants.use_platform_payment_fallback,
//      the platform's own provider accounts (is_platform_managed=true).
// The frontend gets a sanitized list; credentials never leave the server.

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
  // Backward-compat: HiPay used to be saved as { merchant_id, api_key }.
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

export async function listCheckoutMethodsForMerchant(merchantId: string): Promise<CheckoutMethod[]> {
  const { data: merchant } = await supabaseAdmin
    .from("merchants")
    .select("id, use_platform_payment_fallback")
    .eq("id", merchantId)
    .maybeSingle();

  const { data: own } = await supabaseAdmin
    .from("payment_providers")
    .select("id, name, provider_type, icon, logo_url, description, config_status, credentials, is_active, position")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  const ownList: CheckoutMethod[] = (own ?? [])
    .filter(isCheckoutReady)
    .map((p) => ({
      id: p.id as string,
      providerType: p.provider_type as string,
      name: p.name as string,
      icon: (p.icon as string) ?? null,
      logoUrl: (p.logo_url as string) ?? null,
      description: (p.description as string) ?? null,
      isPlatformFallback: false,
    }));

  // Only add platform fallback when merchant has opted in.
  if (!merchant?.use_platform_payment_fallback) return ownList;

  const ownTypes = new Set(ownList.map((m) => m.providerType));
  const { data: platform } = await supabaseAdmin
    .from("payment_providers")
    .select("id, name, provider_type, icon, logo_url, description, config_status, credentials, is_active, position")
    .eq("is_platform_managed", true)
    .eq("is_active", true)
    .order("position", { ascending: true });

  const platformList: CheckoutMethod[] = (platform ?? [])
    .filter(isCheckoutReady)
    .filter((p) => !ownTypes.has(p.provider_type as string))
    .map((p) => ({
      id: p.id as string,
      providerType: p.provider_type as string,
      name: p.name as string,
      icon: (p.icon as string) ?? null,
      logoUrl: (p.logo_url as string) ?? null,
      description: (p.description as string) ?? null,
      isPlatformFallback: true,
    }));

  return [...ownList, ...platformList];
}

export async function loadProviderRowForCheckout(opts: {
  merchantId: string;
  providerType: string;
}): Promise<{
  row: any;
  isPlatformFallback: boolean;
} | null> {
  // Try merchant's own first
  const { data: own } = await supabaseAdmin
    .from("payment_providers")
    .select("*")
    .eq("merchant_id", opts.merchantId)
    .eq("provider_type", opts.providerType)
    .eq("is_active", true)
    .maybeSingle();
  if (own && isCheckoutReady(own)) return { row: own, isPlatformFallback: false };

  // Platform fallback (only if merchant opted in)
  const { data: merchant } = await supabaseAdmin
    .from("merchants")
    .select("use_platform_payment_fallback")
    .eq("id", opts.merchantId)
    .maybeSingle();
  if (!merchant?.use_platform_payment_fallback) return null;

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
