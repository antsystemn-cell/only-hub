import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  onDeliveryCompleted,
  resendCollectionSms,
  markRequestPaid,
} from "./collection.service";

async function assertStaffOrder(userId: string, orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,merchant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { allowed: false, order: null };
  const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: order.merchant_id,
  });
  return { allowed: !!ok, order };
}

export const triggerCollectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        collectedInCash: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { allowed } = await assertStaffOrder(userId, data.orderId);
    if (!allowed) return { ok: false as const, error: "Эрх хүрэхгүй" };
    return onDeliveryCompleted({
      orderId: data.orderId,
      collectedInCash: data.collectedInCash,
    });
  });

export const resendCollectionSmsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { allowed } = await assertStaffOrder(userId, data.orderId);
    if (!allowed) return { ok: false as const, error: "Эрх хүрэхгүй" };
    return resendCollectionSms(data.orderId);
  });

export const markRequestPaidFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { allowed } = await assertStaffOrder(userId, data.orderId);
    if (!allowed) return { ok: false as const, error: "Эрх хүрэхгүй" };
    return markRequestPaid(data.orderId);
  });

export const listPaymentRequestsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        merchantId: z.string().uuid().optional(),
        status: z.string().max(30).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", {
      _user_id: userId,
    });
    let q = supabaseAdmin
      .from("payment_requests")
      .select("*, orders:order_id(external_ref,total,phone,guest_name,shipping_address,payment_status,status,merchant_id)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!isAdmin && data.merchantId) {
      const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
        _user_id: userId,
        _merchant_id: data.merchantId,
      });
      if (!ok) return { ok: false as const, error: "Эрх хүрэхгүй", items: [] as any[] };
      q = q.eq("merchant_id", data.merchantId);
    } else if (!isAdmin) {
      return { ok: false as const, error: "Эрх хүрэхгүй", items: [] as any[] };
    }
    if (data.status) q = q.eq("status", data.status);
    const { data: items, error } = await q;
    if (error) return { ok: false as const, error: error.message, items: [] };
    return { ok: true as const, items: items ?? [] };
  });

export const getCollectionStatsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ merchantId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", {
      _user_id: userId,
    });
    let base = supabaseAdmin.from("payment_requests").select("*", { count: "exact", head: false });
    if (!isAdmin && data.merchantId) {
      const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
        _user_id: userId,
        _merchant_id: data.merchantId,
      });
      if (!ok) return { ok: false as const, error: "Эрх хүрэхгүй" };
      base = base.eq("merchant_id", data.merchantId);
    } else if (!isAdmin) {
      return { ok: false as const, error: "Эрх хүрэхгүй" };
    }
    const { data: rows } = await base;
    const list = rows ?? [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const pending = list.filter((r: any) => r.status === "requested" || r.status === "pending");
    const paidToday = list.filter(
      (r: any) => r.status === "paid" && r.paid_at && new Date(r.paid_at) >= todayStart,
    );
    const overdue = list.filter(
      (r: any) =>
        r.status !== "paid" &&
        r.expires_at &&
        new Date(r.expires_at) < new Date(),
    );
    const totalRequested = list.filter((r: any) => r.status !== "pending").length;
    const paidCount = list.filter((r: any) => r.status === "paid").length;
    const rate = totalRequested ? Math.round((paidCount / totalRequested) * 100) : 0;
    const pendingAmount = pending.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const paidTodayAmount = paidToday.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    return {
      ok: true as const,
      stats: {
        pendingCount: pending.length,
        pendingAmount,
        paidTodayCount: paidToday.length,
        paidTodayAmount,
        overdueCount: overdue.length,
        collectionRate: rate,
      },
    };
  });

export const getPaymentRequestByOrderFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: req } = await supabaseAdmin
      .from("payment_requests")
      .select("*")
      .eq("order_id", data.orderId)
      .maybeSingle();
    return { ok: true as const, request: req ?? null };
  });
