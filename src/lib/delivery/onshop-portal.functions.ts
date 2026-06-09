import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getOnshopPortalUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ merchantCode: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const sessionUrl = process.env.ONSHOP_SESSION_URL;
    const apiKey = process.env.ONSHOP_DELIVERY_API_KEY;
    if (!sessionUrl || !apiKey) {
      return { ok: false as const, error: "ON Shop тохиргоо дутуу байна" };
    }

    // Authorization
    if (data.merchantCode) {
      // Merchant context: require access to that merchant
      const { data: merchant } = await supabaseAdmin
        .from("merchants")
        .select("id")
        .or(`id.eq.${data.merchantCode},slug.eq.${data.merchantCode}`)
        .maybeSingle();
      if (!merchant) {
        return { ok: false as const, error: "Дэлгүүр олдсонгүй" };
      }
      const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
        _user_id: userId,
        _merchant_id: merchant.id,
      });
      if (!ok) return { ok: false as const, error: "Эрх хүрэхгүй" };
    } else {
      // Admin context
      const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", {
        _user_id: userId,
      });
      if (!isAdmin) return { ok: false as const, error: "Зөвхөн админ" };
    }

    try {
      const res = await fetch(sessionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(
          data.merchantCode ? { merchant_code: data.merchantCode } : {},
        ),
      });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        return {
          ok: false as const,
          error: j?.error ?? `HTTP ${res.status}`,
        };
      }
      return {
        ok: true as const,
        portalUrl: j.portal_url as string,
        expiresAt: j.expires_at as string | undefined,
      };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Холбогдоход алдаа" };
    }
  });
