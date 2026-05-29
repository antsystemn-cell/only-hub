import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertMerchantAccess(userId: string, merchantId: string) {
  const { data } = await supabaseAdmin.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: merchantId,
  });
  if (!data) throw new Error("Зөвшөөрөлгүй");
}

export const getMerchantDeliveryConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { merchantId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.userId, data.merchantId);
    const { data: row } = await supabaseAdmin
      .from("merchants")
      .select("id,delivery_api_key,delivery_endpoint,delivery_webhook_secret,delivery_mode")
      .eq("id", data.merchantId)
      .maybeSingle();
    return {
      ok: true as const,
      delivery_api_key: (row as any)?.delivery_api_key ?? "",
      delivery_endpoint: (row as any)?.delivery_endpoint ?? "",
      delivery_webhook_secret: (row as any)?.delivery_webhook_secret ?? "",
      delivery_mode: ((row as any)?.delivery_mode as "local" | "swift") ?? "local",
    };
  });

export const updateMerchantDeliveryConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    merchantId: string;
    delivery_api_key: string;
    delivery_endpoint: string;
    delivery_webhook_secret: string;
    delivery_mode: "local" | "swift";
  }) => d)
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.userId, data.merchantId);
    const { error } = await supabaseAdmin
      .from("merchants")
      .update({
        delivery_api_key: data.delivery_api_key.trim() || null,
        delivery_endpoint: data.delivery_endpoint.trim() || null,
        delivery_webhook_secret: data.delivery_webhook_secret.trim() || null,
        delivery_mode: data.delivery_mode,
      })
      .eq("id", data.merchantId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
