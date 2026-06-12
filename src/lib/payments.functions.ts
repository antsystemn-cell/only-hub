import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type QpayCreds = { username?: string; client_id?: string; password?: string; client_secret?: string; invoice_code?: string; base_url?: string };

const clean = (value?: string) => value?.trim() ?? "";

const REQUIRED_FIELDS: Record<string, string[]> = {
  qpay: ["username", "password", "invoice_code"],
  storepay: ["username", "password", "app_username", "app_password", "store_id"],
  pocket: ["client_id", "client_secret", "terminal_id"],
  omniway: ["username", "password"],
  hipay: ["entity_id", "client_secret"],
  cash: [],
};

function missingFields(providerType: string, credentials: Record<string, any>) {
  return (REQUIRED_FIELDS[providerType] ?? []).filter((field) => !clean(credentials[field]));
}

async function assertMerchantAccess(userId: string, merchantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: merchantId,
  });
  if (!data) throw new Error("Зөвшөөрөлгүй");
}

export const getPaymentProviderCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { providerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: provider, error } = await supabaseAdmin
      .from("payment_providers")
      .select("merchant_id,credentials")
      .eq("id", data.providerId)
      .maybeSingle();
    if (error || !provider) return { ok: false as const, message: "Үйлчилгээ олдсонгүй" };
    await assertMerchantAccess(userId, provider.merchant_id as string);
    return { ok: true as const, credentials: (provider.credentials ?? {}) as Record<string, string> };
  });

export const testPaymentConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { providerId: string }) => d)
  .handler(async ({ data, context }) => {
    try {
      const { userId } = context;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: provider, error } = await supabaseAdmin
        .from("payment_providers")
        .select("id,provider_type,credentials,merchant_id")
        .eq("id", data.providerId)
        .maybeSingle();
      if (error || !provider) return { ok: false, message: "Үйлчилгээ олдсонгүй" };
      await assertMerchantAccess(userId, provider.merchant_id as string);

      const credentials = ((provider.credentials as any) ?? {}) as Record<string, any>;
      const { getAdapter } = await import("@/lib/payments/adapters/index.server");
      const adapter = getAdapter(provider.provider_type as string);

      if (adapter) {
        const result = await adapter.testConnection(credentials);
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
          .eq("id", provider.id);
        return { ok: result.ok, message: result.message };
      }

      if (provider.provider_type !== "qpay") {
        const missing = missingFields(provider.provider_type as string, credentials);
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
          .eq("id", provider.id);
        return { ok, message };
      }

      const creds = credentials as QpayCreds;
      const username = clean(creds.username || creds.client_id);
      const password = clean(creds.password || creds.client_secret);
      const invoiceCode = clean(creds.invoice_code);
      const baseUrl = (creds.base_url || "https://merchant.qpay.mn/v2").replace(/\/$/, "");
      if (!username || !password || !invoiceCode) {
        return { ok: false, message: "QPay client_id / client_secret / invoice_code дутуу" };
      }
      if (password === invoiceCode) {
        return {
          ok: false,
          message: "QPay client_secret/password нь invoice_code-той ижил хадгалагдсан байна. Only Shop дээр QPAY_CLIENT_ID, QPAY_CLIENT_SECRET, QPAY_INVOICE_CODE гэсэн 3 тусдаа утга ашигладаг — client_secret-ээ password талбарт оруулна уу.",
        };
      }

      const basicAuth =
        typeof btoa === "function"
          ? btoa(`${username}:${password}`)
          : Buffer.from(`${username}:${password}`).toString("base64");

      const res = await fetch(`${baseUrl}/auth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic " + basicAuth,
        },
        body: "",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let detail = text;
        try {
          const j = JSON.parse(text);
          detail = j.message || j.error || j.error_description || text;
        } catch {}
        const hint =
          res.status === 401 || res.status === 403 || res.status === 500
            ? " — username / password буруу эсвэл QPay merchant эрх олгогдоогүй байж магадгүй"
            : "";
        return { ok: false, message: `QPay (${res.status}): ${detail || "тодорхойгүй алдаа"}${hint}` };
      }
      const json = (await res.json()) as { access_token?: string };
      if (!json.access_token) return { ok: false, message: "QPay token буцаагдаагүй" };
      await supabaseAdmin
        .from("payment_providers")
        .update({
          is_active: true,
          config_status: "verified",
          last_tested_at: new Date().toISOString(),
          test_message: "QPay холболт амжилттай",
        })
        .eq("id", provider.id);
      return { ok: true, message: "QPay холболт амжилттай" };
    } catch (e: any) {
      console.error("testPaymentConnection failed:", e);
      return { ok: false, message: e?.message ?? "Сүлжээний алдаа" };
    }
  });
