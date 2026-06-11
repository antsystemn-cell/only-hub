// Admin/staff notification visibility + resend + retry server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listNotificationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        merchantId: z.string().uuid().optional(),
        orderId: z.string().uuid().optional(),
        status: z.string().max(30).optional(),
        eventType: z.string().max(40).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", {
      _user_id: userId,
    });
    let q = supabaseAdmin
      .from("notifications_log")
      .select(
        "*, orders:order_id(external_ref,phone,total,payment_status,delivery_status,merchant_id)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (!isAdmin) {
      if (!data.merchantId) {
        return { ok: false as const, error: "Эрх хүрэхгүй", items: [] as any[] };
      }
      const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
        _user_id: userId,
        _merchant_id: data.merchantId,
      });
      if (!ok) return { ok: false as const, error: "Эрх хүрэхгүй", items: [] as any[] };
      q = q.eq("merchant_id", data.merchantId);
    } else if (data.merchantId) {
      q = q.eq("merchant_id", data.merchantId);
    }
    if (data.orderId) q = q.eq("order_id", data.orderId);
    if (data.status) q = q.eq("status", data.status);
    if (data.eventType) q = q.eq("event_type", data.eventType);
    const { data: items, error } = await q;
    if (error) return { ok: false as const, error: error.message, items: [] };
    return { ok: true as const, items: items ?? [] };
  });

// Resend any logged notification by id. Currently supports SMS payment requests.
export const resendNotificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ notificationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: row } = await supabaseAdmin
      .from("notifications_log")
      .select("*")
      .eq("id", data.notificationId)
      .maybeSingle();
    if (!row) return { ok: false as const, error: "Мэдэгдэл олдсонгүй" };

    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", {
      _user_id: userId,
    });
    if (!isAdmin && row.merchant_id) {
      const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
        _user_id: userId,
        _merchant_id: row.merchant_id,
      });
      if (!ok) return { ok: false as const, error: "Эрх хүрэхгүй" };
    } else if (!isAdmin) {
      return { ok: false as const, error: "Эрх хүрэхгүй" };
    }

    if (row.channel === "sms" && row.event_type === "payment_requested" && row.order_id) {
      const { resendCollectionSms } = await import(
        "@/lib/payment-collection/collection.service"
      );
      const res = await resendCollectionSms(row.order_id);
      return res.ok
        ? { ok: true as const, message: "SMS дахин илгээлээ" }
        : { ok: false as const, error: res.error };
    }
    return { ok: false as const, error: "Энэ төрлийн мэдэгдлийг дахин илгээх боломжгүй" };
  });

// Retry payment-collection SMS that previously failed (sms_attempts < maxAttempts).
export const retryFailedCollectionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        merchantId: z.string().uuid().optional(),
        maxAttempts: z.number().int().min(1).max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", {
      _user_id: userId,
    });
    if (!isAdmin) {
      if (!data.merchantId) return { ok: false as const, error: "Эрх хүрэхгүй", retried: 0 };
      const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
        _user_id: userId,
        _merchant_id: data.merchantId,
      });
      if (!ok) return { ok: false as const, error: "Эрх хүрэхгүй", retried: 0 };
    }
    const maxAttempts = data.maxAttempts ?? 3;
    let q = supabaseAdmin
      .from("payment_requests")
      .select("order_id, sms_attempts, merchant_id, status")
      .not("last_sms_error", "is", null)
      .lt("sms_attempts", maxAttempts)
      .neq("status", "paid")
      .limit(50);
    if (data.merchantId) q = q.eq("merchant_id", data.merchantId);
    const { data: rows } = await q;
    let retried = 0;
    let failed = 0;
    const { resendCollectionSms } = await import(
      "@/lib/payment-collection/collection.service"
    );
    for (const r of rows ?? []) {
      if (!r.order_id) continue;
      const res = await resendCollectionSms(r.order_id);
      if (res.ok) retried++; else failed++;
    }
    return { ok: true as const, retried, failed, scanned: rows?.length ?? 0 };
  });

export const getNotificationStatsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ merchantId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", {
      _user_id: userId,
    });
    if (!isAdmin) {
      if (!data.merchantId) return { ok: false as const, error: "Эрх хүрэхгүй" };
      const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
        _user_id: userId,
        _merchant_id: data.merchantId,
      });
      if (!ok) return { ok: false as const, error: "Эрх хүрэхгүй" };
    }
    let q = supabaseAdmin
      .from("notifications_log")
      .select("event_type,status,created_at,merchant_id")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString())
      .limit(2000);
    if (data.merchantId) q = q.eq("merchant_id", data.merchantId);
    const { data: rows } = await q;
    const list = rows ?? [];
    const total = list.length;
    const sent = list.filter((r: any) => r.status === "sent").length;
    const failed = list.filter((r: any) => r.status === "failed").length;
    const byEvent: Record<string, number> = {};
    for (const r of list) {
      byEvent[r.event_type] = (byEvent[r.event_type] ?? 0) + 1;
    }
    return {
      ok: true as const,
      stats: {
        total,
        sent,
        failed,
        successRate: total ? Math.round((sent / total) * 100) : 0,
        byEvent,
      },
    };
  });
