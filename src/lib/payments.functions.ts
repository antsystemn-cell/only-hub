import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type QpayCreds = { username?: string; client_id?: string; password?: string; client_secret?: string; invoice_code?: string; base_url?: string };

const clean = (value?: string) => value?.trim() ?? "";

async function assertMerchantAccess(userId: string, merchantId: string) {
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
      const { data: provider, error } = await supabaseAdmin
        .from("payment_providers")
        .select("provider_type,credentials,merchant_id")
        .eq("id", data.providerId)
        .maybeSingle();
      if (error || !provider) return { ok: false, message: "Үйлчилгээ олдсонгүй" };
      await assertMerchantAccess(userId, provider.merchant_id as string);

      if (provider.provider_type !== "qpay") {
        return { ok: true, message: "Тохиргоо хадгалагдсан (бодит шалгалт удахгүй)" };
      }

      const creds = (provider.credentials as QpayCreds) ?? {};
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
      return { ok: true, message: "QPay холболт амжилттай" };
    } catch (e: any) {
      console.error("testPaymentConnection failed:", e);
      return { ok: false, message: e?.message ?? "Сүлжээний алдаа" };
    }
  });
