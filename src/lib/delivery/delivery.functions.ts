// Client-аас дуудах createServerFn wrapper-ууд.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calculateDeliveryFee as calcFee,
  cancelDeliveryRequest as cancelDr,
  createDeliveryRequest as createDr,
  updateDeliveryStatus as updateDr,
} from "./delivery.service";
import { swiftSyncStatus } from "./delivery.swift";
import type { DeliveryStatus } from "./delivery.types";

const STATUS_VALUES: DeliveryStatus[] = [
  "pending",
  "requested",
  "assigned",
  "picked_up",
  "in_transit",
  "delivered",
  "failed",
  "cancelled",
];

async function assertStaffOfDeliveryRequest(userId: string, deliveryRequestId: string) {
  const { data: dr } = await supabaseAdmin
    .from("delivery_requests")
    .select("id,merchant_id,driver_id")
    .eq("id", deliveryRequestId)
    .maybeSingle();
  if (!dr) return { dr: null, allowed: false, isDriver: false };
  const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: dr.merchant_id,
  });
  const isDriver = dr.driver_id === userId;
  return { dr, allowed: !!ok || isDriver, isDriver };
}

export const createDeliveryRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("merchant_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Захиалга олдсонгүй" };
    const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
      _user_id: userId,
      _merchant_id: order.merchant_id,
    });
    if (!ok) return { ok: false as const, error: "Эрх хүрэхгүй" };
    return createDr({ orderId: data.orderId, userId });
  });

export const updateDeliveryStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        deliveryRequestId: z.string().uuid(),
        status: z.enum(STATUS_VALUES as [string, ...string[]]),
        note: z.string().max(500).optional().nullable(),
        driverId: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { allowed, isDriver } = await assertStaffOfDeliveryRequest(userId, data.deliveryRequestId);
    if (!allowed) return { ok: false as const, error: "Эрх хүрэхгүй" };
    // Driver зөвхөн picked_up / in_transit / delivered / failed-ийг өөрчилнө
    if (
      isDriver &&
      !["picked_up", "in_transit", "delivered", "failed"].includes(data.status)
    ) {
      return { ok: false as const, error: "Жолоочийн эрхгүй үйлдэл" };
    }
    return updateDr({
      deliveryRequestId: data.deliveryRequestId,
      status: data.status as DeliveryStatus,
      note: data.note ?? null,
      driverId: data.driverId ?? undefined,
    });
  });

export const cancelDeliveryRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      deliveryRequestId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { allowed } = await assertStaffOfDeliveryRequest(userId, data.deliveryRequestId);
    if (!allowed) return { ok: false as const, error: "Эрх хүрэхгүй" };
    return cancelDr({ deliveryRequestId: data.deliveryRequestId, reason: data.reason });
  });

export const calculateDeliveryFeeFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      merchantId: z.string().uuid(),
      subtotal: z.number().nonnegative().optional(),
      address: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data }) => calcFee(data));

export const listMerchantDeliveryRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      merchantId: z.string().uuid(),
      status: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
      _user_id: userId,
      _merchant_id: data.merchantId,
    });
    if (!ok) return { ok: false as const, error: "Эрх хүрэхгүй", items: [] as any[] };

    let q = supabaseAdmin
      .from("delivery_requests")
      .select("*")
      .eq("merchant_id", data.merchantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: items, error } = await q;
    if (error) return { ok: false as const, error: error.message, items: [] };
    return { ok: true as const, items: items ?? [] };
  });

export const getDeliveryHistoryByOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: dr } = await supabaseAdmin
      .from("delivery_requests")
      .select("*")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (!dr) return { ok: true as const, deliveryRequest: null, history: [] };
    const { data: history } = await supabaseAdmin
      .from("delivery_status_history")
      .select("*")
      .eq("delivery_request_id", dr.id)
      .order("created_at", { ascending: true });
    return { ok: true as const, deliveryRequest: dr, history: history ?? [] };
  });
