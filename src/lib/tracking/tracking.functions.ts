import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Public: token-аар захиалгын мэдээлэл татах. Нэвтрэлт шаардахгүй.
export const getPublicOrderByTokenFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token: z.string().min(8).max(128) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { resolveOrderByToken } = await import("./tracking.server");
    return resolveOrderByToken(data.token);
  });

// Public: token-аар төлбөрийн intent үүсгэх (QPay/Storepay/Pocket/Omniway)
export const createPublicPaymentIntentFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      token: z.string().min(8).max(128),
      providerType: z.enum(["qpay", "storepay", "pocket", "omniway"]),
      phone: z.string().trim().max(30).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tok } = await supabaseAdmin
      .from("public_order_tokens")
      .select("order_id, is_active, expires_at")
      .eq("public_token", data.token)
      .maybeSingle();
    if (!tok) return { ok: false as const, error: "Холбоос буруу" };
    if (!tok.is_active) return { ok: false as const, error: "Холбоос идэвхгүй" };
    if (tok.expires_at && new Date(tok.expires_at) < new Date()) {
      return { ok: false as const, error: "Холбоосын хугацаа дууссан" };
    }
    const { createPaymentIntent } = await import(
      "@/lib/payments/payment-intents.functions"
    );
    // call the underlying handler logic via server fn re-entry
    return (createPaymentIntent as any)({
      data: {
        orderId: tok.order_id,
        providerType: data.providerType,
        phone: data.phone ?? null,
      },
    });
  });

// Staff/admin: tracking link авах, regenerate, disable, send SMS дахин.
async function assertStaffByOrder(userId: string, orderId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("merchant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { allowed: false, merchantId: null as string | null };
  const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: order.merchant_id,
  });
  return { allowed: !!ok, merchantId: order.merchant_id as string };
}

export const getTrackingLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { allowed } = await assertStaffByOrder(context.userId, data.orderId);
    if (!allowed) return { ok: false as const, error: "Эрх хүрэхгүй" };
    const { getOrCreateTrackingToken, buildTrackingUrl } = await import("./tracking.server");
    const tok = await getOrCreateTrackingToken(data.orderId);
    return {
      ok: true as const,
      url: buildTrackingUrl(tok.public_token),
      token: tok.public_token,
      isActive: tok.is_active,
      expiresAt: tok.expires_at,
      openCount: tok.open_count ?? 0,
      lastAccessedAt: tok.last_accessed_at,
    };
  });

export const regenerateTrackingTokenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { allowed } = await assertStaffByOrder(context.userId, data.orderId);
    if (!allowed) return { ok: false as const, error: "Эрх хүрэхгүй" };
    const { regenerateTrackingToken, buildTrackingUrl } = await import("./tracking.server");
    const tok = await regenerateTrackingToken(data.orderId);
    return { ok: true as const, url: buildTrackingUrl(tok.public_token), token: tok.public_token };
  });

export const disableTrackingTokenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { allowed } = await assertStaffByOrder(context.userId, data.orderId);
    if (!allowed) return { ok: false as const, error: "Эрх хүрэхгүй" };
    const { disableTrackingToken } = await import("./tracking.server");
    await disableTrackingToken(data.orderId);
    return { ok: true as const };
  });

export const resendTrackingLinkSmsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { allowed } = await assertStaffByOrder(context.userId, data.orderId);
    if (!allowed) return { ok: false as const, error: "Эрх хүрэхгүй" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // reset marker so SMS sends again
    await supabaseAdmin
      .from("delivery_requests")
      .update({ tracking_sms_sent_at: null })
      .eq("order_id", data.orderId);
    const { sendTrackingLinkSms } = await import("./tracking-notify.server");
    return sendTrackingLinkSms(data.orderId);
  });
