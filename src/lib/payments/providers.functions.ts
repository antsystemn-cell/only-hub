// Public server functions used by the merchant dashboard "Төлбөрийн тохиргоо"
// page. All credential reads/writes happen server-side; the browser only ever
// sees masked status, last_tested_at, and config_status — never raw secrets.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROVIDER_TYPES = ["qpay", "storepay", "pocket", "omniway", "hipay", "cash"] as const;

const PROVIDER_DEFAULTS: Record<
  (typeof PROVIDER_TYPES)[number],
  { name: string; icon: string; description: string }
> = {
  qpay:     { name: "QPay",     icon: "💎", description: "QR кодоор бүх банкны апп-аас төлөх" },
  storepay: { name: "Storepay", icon: "🟣", description: "Хуваан төлөх (Storepay)" },
  pocket:   { name: "Pocket",   icon: "🔵", description: "Pocket апп / QR" },
  omniway:  { name: "Omniway",  icon: "🟠", description: "Omniway PG (QR)" },
  hipay:    { name: "HiPay",    icon: "🟢", description: "HiPay төлбөрийн систем" },
  cash:     { name: "Бэлэн",     icon: "💵", description: "Хүргэлтээр эсвэл бэлнээр төлөх" },
};

const LEGACY_REQUIRED_FIELDS: Record<string, string[]> = {
  hipay: ["entity_id", "client_secret"],
  cash: [],
};

function requiredFieldsFor(providerType: string, adapter: { requiredFields: string[] } | null) {
  return adapter?.requiredFields ?? LEGACY_REQUIRED_FIELDS[providerType] ?? [];
}

const CREDENTIAL_KEYS_TO_MASK = new Set([
  "password", "client_secret", "app_password", "api_key", "secret", "private_key",
]);

function maskValue(v: unknown): string {
  if (typeof v !== "string" || v.length === 0) return "";
  if (v.length <= 4) return "•".repeat(v.length);
  return v.slice(0, 2) + "•".repeat(Math.max(4, v.length - 4)) + v.slice(-2);
}

function maskCredentials(creds: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds ?? {})) {
    if (CREDENTIAL_KEYS_TO_MASK.has(k)) out[k] = maskValue(v);
    else out[k] = typeof v === "string" ? v : v == null ? "" : String(v);
  }
  return out;
}

async function assertMerchantAccess(userId: string, merchantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: merchantId,
  });
  if (!data) throw new Error("Зөвшөөрөлгүй");
}

async function assertPlatformAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("is_platform_admin", { _user_id: userId });
  if (!data) throw new Error("Зөвхөн платформын админд");
}

// ───────────────────────── List providers for a merchant ─────────────────────────
export const listMerchantProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ merchantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertMerchantAccess(userId, data.merchantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("id, name, use_platform_payment_fallback")
      .eq("id", data.merchantId)
      .maybeSingle();

    const { data: own } = await supabaseAdmin
      .from("payment_providers")
      .select("id,name,provider_type,icon,logo_url,description,is_active,config_status,last_tested_at,test_message,credentials,position,use_platform_fallback")
      .eq("merchant_id", data.merchantId)
      .order("position", { ascending: true });

    const ownByType = new Map<string, any>();
    for (const row of own ?? []) ownByType.set(row.provider_type as string, row);

    const { data: platformAll } = await supabaseAdmin
      .from("payment_providers")
      .select("provider_type, name, icon, is_active, config_status")
      .eq("is_platform_managed", true);
    const platformByType = new Map<string, any>();
    for (const r of platformAll ?? []) platformByType.set(r.provider_type as string, r);

    const merged = PROVIDER_TYPES.map((t, idx) => {
      const row = ownByType.get(t);
      const platformRow = platformByType.get(t);
      const defaults = PROVIDER_DEFAULTS[t];
      const fallbackAvailable =
        !!platformRow && !!platformRow.is_active && platformRow.config_status === "verified";
      const platformIcon = (platformRow?.icon as string) || defaults.icon;
      if (row) {
        const useFallback = !!row.use_platform_fallback;
        return {
          providerType: t,
          id: row.id as string,
          name: (row.name as string) || defaults.name,
          icon: useFallback ? platformIcon : ((row.icon as string) || platformIcon),
          description: (row.description as string) || defaults.description,
          isActive: !!row.is_active,
          usePlatformFallback: useFallback,
          platformFallbackAvailable: fallbackAvailable,
          configStatus: (row.config_status as string) || "incomplete",
          lastTestedAt: (row.last_tested_at as string) || null,
          testMessage: (row.test_message as string) || null,
          credentialsMasked: maskCredentials((row.credentials as any) ?? {}),
          position: row.position as number,
        };
      }
      return {
        providerType: t,
        id: null as string | null,
        name: defaults.name,
        icon: platformIcon,
        description: defaults.description,
        isActive: false,
        usePlatformFallback: false,
        platformFallbackAvailable: fallbackAvailable,
        configStatus: "incomplete",
        lastTestedAt: null as string | null,
        testMessage: null as string | null,
        credentialsMasked: {} as Record<string, string>,
        position: idx,
      };
    });

    return {
      ok: true as const,
      merchant: {
        id: merchant?.id ?? data.merchantId,
        name: merchant?.name ?? "",
        usePlatformFallback: !!merchant?.use_platform_payment_fallback,
      },
      providers: merged,
      platformAvailableTypes: (platformAll ?? [])
        .filter((p: any) => p.is_active && p.config_status === "verified")
        .map((p: any) => p.provider_type as string),
    };
  });

// ───────────────────────── Upsert (enable / save creds) ─────────────────────────
export const saveMerchantProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      merchantId: z.string().uuid(),
      providerType: z.enum(PROVIDER_TYPES),
      isActive: z.boolean(),
      usePlatformFallback: z.boolean().optional(),
      credentials: z.record(z.string(), z.string().max(2000)).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertMerchantAccess(userId, data.merchantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAdapter } = await import("@/lib/payments/adapters/index.server");
    const adapter = getAdapter(data.providerType);
    const requiredFields = requiredFieldsFor(data.providerType, adapter);
    const useFallback = !!data.usePlatformFallback;

    const { data: existing } = await supabaseAdmin
      .from("payment_providers")
      .select("id, credentials")
      .eq("merchant_id", data.merchantId)
      .eq("provider_type", data.providerType)
      .maybeSingle();

    const existingCreds = ((existing?.credentials as any) ?? {}) as Record<string, any>;
    const newCreds: Record<string, string> = { ...existingCreds };
    for (const [k, v] of Object.entries(data.credentials ?? {})) {
      if (v && v.trim()) newCreds[k] = v.trim();
    }

    const allRequiredPresent = requiredFields.every(
      (f) => typeof newCreds[f] === "string" && (newCreds[f] as string).length > 0,
    );
    // When using platform fallback, the merchant's own row is just a flag — config is "verified".
    const configStatus = useFallback
      ? "verified"
      : (allRequiredPresent && !adapter ? "verified" : "incomplete");
    const defaults = PROVIDER_DEFAULTS[data.providerType];

    let row;
    if (existing) {
      const { data: updated, error } = await supabaseAdmin
        .from("payment_providers")
        .update({
          name: defaults.name,
          description: defaults.description,
          credentials: newCreds,
          is_active: data.isActive,
          use_platform_fallback: useFallback,
          config_status: configStatus,
          test_message: null,
          last_tested_at: useFallback ? new Date().toISOString() : null,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) return { ok: false as const, message: error.message };
      row = updated;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("payment_providers")
        .insert({
          merchant_id: data.merchantId,
          provider_type: data.providerType,
          name: defaults.name,
          description: defaults.description,
          credentials: newCreds,
          is_active: data.isActive,
          use_platform_fallback: useFallback,
          config_status: configStatus,
          position: 100,
        })
        .select("id")
        .single();
      if (error) return { ok: false as const, message: error.message };
      row = inserted;
    }

    return {
      ok: true as const,
      providerId: row!.id as string,
      message: useFallback
        ? "Хадгалагдлаа. Платформын нөөц төлбөрийн системээр ажиллана."
        : allRequiredPresent
          ? adapter
            ? "Хадгалагдлаа. Холболтыг шалгаж туршина уу."
            : "Хадгалагдлаа. Checkout дээр идэвхжлээ."
          : `Хадгалагдсан. ${requiredFields.join(", ")} утгуудыг бүгдийг оруулна уу.`,
    };
  });

// ───────────────────────── Test connection ─────────────────────────
export const testMerchantProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ providerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAdapter } = await import("@/lib/payments/adapters/index.server");

    const { data: row, error } = await supabaseAdmin
      .from("payment_providers")
      .select("id, merchant_id, provider_type, credentials, is_platform_managed")
      .eq("id", data.providerId)
      .maybeSingle();
    if (error || !row) return { ok: false as const, message: "Үйлчилгээ олдсонгүй" };

    if (row.is_platform_managed) {
      await assertPlatformAdmin(userId);
    } else {
      if (!row.merchant_id) return { ok: false as const, message: "Эзэмшигч тодорхойгүй" };
      await assertMerchantAccess(userId, row.merchant_id as string);
    }

    const adapter = getAdapter(row.provider_type as string);
    if (!adapter) {
      const requiredFields = requiredFieldsFor(row.provider_type as string, null);
      const credentials = ((row.credentials as any) ?? {}) as Record<string, any>;
      const missing = requiredFields.filter(
        (field) => typeof credentials[field] !== "string" || credentials[field].trim().length === 0,
      );
      const ok = missing.length === 0;
      const message = ok
        ? "Холболтын мэдээлэл бүрэн байна. Checkout дээр идэвхжлээ."
        : `${missing.join(", ")} талбар дутуу байна`;
      await supabaseAdmin
        .from("payment_providers")
        .update(
          ok
            ? {
                is_active: true,
                config_status: "verified",
                last_tested_at: new Date().toISOString(),
                test_message: message,
              }
            : {
                config_status: "failed",
                last_tested_at: null,
                test_message: message,
              },
        )
        .eq("id", row.id);
      return { ok, message };
    }

    const result = await adapter.testConnection((row.credentials as any) ?? {});
    await supabaseAdmin
      .from("payment_providers")
      .update(
        result.ok
          ? {
              is_active: true,
              config_status: "verified",
              last_tested_at: new Date().toISOString(),
              test_message: result.message,
            }
          : {
              config_status: "failed",
              last_tested_at: null,
              test_message: result.message,
            },
      )
      .eq("id", row.id);
    return { ok: result.ok, message: result.message };
  });

// ───────────────────────── Toggle platform fallback opt-in (legacy global) ─────────────────────────
export const setMerchantPlatformFallback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ merchantId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertMerchantAccess(userId, data.merchantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("merchants")
      .update({ use_platform_payment_fallback: data.enabled })
      .eq("id", data.merchantId);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const };
  });

// ───────────────────────── Admin: list platform-managed providers ─────────────────────────
export const listPlatformProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("payment_providers")
      .select("id,name,provider_type,icon,description,is_active,config_status,last_tested_at,test_message,credentials,position")
      .eq("is_platform_managed", true)
      .order("position", { ascending: true });

    const byType = new Map<string, any>();
    for (const r of rows ?? []) byType.set(r.provider_type as string, r);

    const providers = PROVIDER_TYPES.map((t, idx) => {
      const row = byType.get(t);
      const defaults = PROVIDER_DEFAULTS[t];
      if (row) {
        return {
          providerType: t,
          id: row.id as string,
          name: (row.name as string) || defaults.name,
          icon: (row.icon as string) || defaults.icon,
          description: (row.description as string) || defaults.description,
          isActive: !!row.is_active,
          configStatus: (row.config_status as string) || "incomplete",
          lastTestedAt: (row.last_tested_at as string) || null,
          testMessage: (row.test_message as string) || null,
          credentialsMasked: maskCredentials((row.credentials as any) ?? {}),
          position: row.position as number,
        };
      }
      return {
        providerType: t,
        id: null as string | null,
        name: defaults.name,
        icon: defaults.icon,
        description: defaults.description,
        isActive: false,
        configStatus: "incomplete",
        lastTestedAt: null as string | null,
        testMessage: null as string | null,
        credentialsMasked: {} as Record<string, string>,
        position: idx,
      };
    });

    return { ok: true as const, providers };
  });

// ───────────────────────── Admin: save platform provider ─────────────────────────
export const savePlatformProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      providerType: z.enum(PROVIDER_TYPES),
      isActive: z.boolean(),
      icon: z.string().trim().max(1000).optional(),
      credentials: z.record(z.string(), z.string().max(2000)).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAdapter } = await import("@/lib/payments/adapters/index.server");
    const adapter = getAdapter(data.providerType);
    const requiredFields = requiredFieldsFor(data.providerType, adapter);
    const defaults = PROVIDER_DEFAULTS[data.providerType];

    const { data: existing } = await supabaseAdmin
      .from("payment_providers")
      .select("id, credentials, icon")
      .eq("is_platform_managed", true)
      .eq("provider_type", data.providerType)
      .maybeSingle();

    const existingCreds = ((existing?.credentials as any) ?? {}) as Record<string, any>;
    const newCreds: Record<string, string> = { ...existingCreds };
    for (const [k, v] of Object.entries(data.credentials ?? {})) {
      if (v && v.trim()) newCreds[k] = v.trim();
    }
    const allRequiredPresent = requiredFields.every(
      (f) => typeof newCreds[f] === "string" && (newCreds[f] as string).length > 0,
    );
    const configStatus = allRequiredPresent && !adapter ? "verified" : "incomplete";
    const iconValue = data.icon !== undefined ? (data.icon.trim() || defaults.icon) : (existing?.icon ?? defaults.icon);

    if (existing) {
      const { error } = await supabaseAdmin
        .from("payment_providers")
        .update({
          name: defaults.name,
          description: defaults.description,
          icon: iconValue,
          credentials: newCreds,
          is_active: data.isActive,
          config_status: configStatus,
          test_message: null,
          last_tested_at: null,
        })
        .eq("id", existing.id);
      if (error) return { ok: false as const, message: error.message };
    } else {
      const { error } = await supabaseAdmin
        .from("payment_providers")
        .insert({
          merchant_id: null,
          is_platform_managed: true,
          provider_type: data.providerType,
          name: defaults.name,
          description: defaults.description,
          icon: iconValue,
          credentials: newCreds,
          is_active: data.isActive,
          config_status: configStatus,
          position: 100,
        });
      if (error) return { ok: false as const, message: error.message };
    }

    return {
      ok: true as const,
      message: allRequiredPresent
        ? adapter ? "Хадгалагдлаа. Холболт шалгана уу." : "Хадгалагдлаа."
        : `Хадгалагдсан. ${requiredFields.join(", ")} дутуу байна.`,
    };
  });

// ───────────────────────── Public: checkout method list ─────────────────────────
export const getCheckoutMethodsForStore = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ merchantSlug: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listCheckoutMethodsForMerchant } = await import("@/lib/payments/provider-resolver.server");

    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("id")
      .eq("slug", data.merchantSlug)
      .maybeSingle();
    if (!merchant) return { ok: false as const, methods: [] };
    const methods = await listCheckoutMethodsForMerchant(merchant.id as string);
    return { ok: true as const, methods };
  });
