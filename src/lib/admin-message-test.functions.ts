import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTestSmsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        phone: z.string().min(6).max(20),
        message: z.string().min(1).max(800),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    if (!isAdmin) return { ok: false as const, error: "Зөвхөн платформ админ ашиглана" };

    const { sendCallproSms } = await import("@/lib/payment-collection/callpro.server");
    const { logNotification } = await import("@/lib/notifications/log.server");

    const res = await sendCallproSms({ phone: data.phone, message: data.message });
    await logNotification({
      eventType: "sms_test",
      channel: "sms",
      provider: "callpro",
      recipient: data.phone,
      status: res.ok ? "sent" : "failed",
      message: data.message,
      error: res.ok ? null : res.error,
      payload: res.ok ? { raw: res.raw } : null,
    });

    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const, raw: res.raw };
  });

export const listSmsTestLogsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(1).max(200).optional().default(50),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    if (!isAdmin) return { ok: false as const, error: "Эрхгүй", items: [], total: 0, page: 1, pageSize: 50 };
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: items, count } = await supabaseAdmin
      .from("notifications_log")
      .select("id,event_type,recipient,status,message,error,created_at,provider", { count: "exact" })
      .eq("channel", "sms")
      .order("created_at", { ascending: false })
      .range(from, to);
    return { ok: true as const, items: items ?? [], total: count ?? 0, page, pageSize };
  });
