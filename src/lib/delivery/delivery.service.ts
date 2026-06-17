// Хүргэлтийн нэгдсэн service. Зөвхөн server-side. Local + External горимыг хоёуланг удирдана.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { swiftSendOrder, mapSwiftStatus } from "./delivery.swift";
import type { DeliveryStatus, DeliveryMode } from "./delivery.types";

export interface CreateDeliveryRequestArgs {
  orderId: string;
  modeOverride?: DeliveryMode;
  userId?: string | null;
}

export interface CalculateDeliveryFeeArgs {
  merchantId: string;
  address?: string | null;
  subtotal?: number;
  packageInfo?: Record<string, any>;
}

export async function calculateDeliveryFee(
  args: CalculateDeliveryFeeArgs,
): Promise<{ fee: number; reason?: string }> {
  const { merchantId, subtotal = 0 } = args;

  // 1. merchant-level: эхний идэвхтэй delivery_option
  const { data: opt } = await supabaseAdmin
    .from("delivery_options")
    .select("price")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (opt) return { fee: Number(opt.price ?? 0), reason: "merchant_option" };

  // 2. platform settings fallback
  const { data: rules } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "delivery_fee_rules")
    .maybeSingle();

  const rulesVal: any = (rules as any)?.value ?? {};
  const flat = Number(rulesVal.flat ?? 5000);
  const freeOver = Number(rulesVal.free_over ?? 0);
  if (freeOver > 0 && subtotal >= freeOver) {
    return { fee: 0, reason: "free_over_threshold" };
  }
  return { fee: flat, reason: "platform_flat" };
}

export async function createDeliveryRequest(args: CreateDeliveryRequestArgs) {
  const { orderId, modeOverride } = args;

  // existing?
  const { data: existing } = await supabaseAdmin
    .from("delivery_requests")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing) {
    return { ok: true as const, alreadyExists: true, deliveryRequest: existing };
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false as const, error: "Захиалга олдсонгүй" };

  const { data: merchant } = await supabaseAdmin
    .from("merchants")
    .select("id,name,slug,delivery_api_key,delivery_endpoint,delivery_mode")
    .eq("id", order.merchant_id)
    .maybeSingle();
  if (!merchant) return { ok: false as const, error: "Дэлгүүр олдсонгүй" };

  // Платформын Swift Delivery Hub глобал тохиргоо байгаа эсэх
  const swiftConfigured = !!(process.env.SWIFT_DELIVERY_API_URL && process.env.SWIFT_DELIVERY_API_KEY);
  const merchantMode = (merchant as any).delivery_mode as string | null;
  // Default: Swift тохируулсан бол external, мерчант "local" гэж тусгайлан сонгосон үед л local үлдээнэ
  const mode: DeliveryMode =
    modeOverride ??
    (merchantMode === "local"
      ? "local"
      : merchantMode === "swift" || merchantMode === "external" || swiftConfigured
        ? "external"
        : "local");

  const { data: created, error: insErr } = await supabaseAdmin
    .from("delivery_requests")
    .insert({
      order_id: order.id,
      merchant_id: order.merchant_id,
      mode,
      provider: mode === "external" ? "swift" : "local",
      status: "pending",
      recipient_name: order.guest_name ?? null,
      recipient_phone: order.phone,
      dropoff_address: order.shipping_address,
      fee: Number(order.delivery_fee ?? 0),
      package_info: { items_count: Array.isArray(order.items) ? order.items.length : 0 },
    })
    .select("*")
    .single();

  if (insErr || !created) {
    // Race-safe fallback: another concurrent caller may have inserted first.
    // The new UNIQUE(order_id) constraint will surface as a duplicate-key
    // error here. Re-fetch the existing row and return as alreadyExists so
    // the caller does NOT trigger Swift dispatch twice.
    const { data: again } = await supabaseAdmin
      .from("delivery_requests")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    if (again) {
      console.log("[delivery] createDeliveryRequest race resolved", orderId);
      return { ok: true as const, alreadyExists: true, deliveryRequest: again };
    }
    return { ok: false as const, error: insErr?.message ?? "Үүсгэхэд алдаа гарлаа" };
  }


  // External mode: send to Swift immediately
  if (mode === "external") {
    const res = await swiftSendOrder({ order, merchant, deliveryRequestId: created.id });
    if (res.ok) {
      await supabaseAdmin
        .from("delivery_requests")
        .update({
          status: "requested",
          provider: "swift",
          external_ref: res.externalRef,
          requested_at: new Date().toISOString(),
        })
        .eq("id", created.id);
      await supabaseAdmin
        .from("orders")
        .update({ delivery_order_id: res.externalRef })
        .eq("id", order.id);
    } else {
      await supabaseAdmin
        .from("delivery_requests")
        .update({ status: "failed", last_error: res.error })
        .eq("id", created.id);
      return { ok: false as const, error: res.error };
    }
  } else {
    // local mode: just mark as 'requested'
    await supabaseAdmin
      .from("delivery_requests")
      .update({ status: "requested", requested_at: new Date().toISOString() })
      .eq("id", created.id);
  }

  const { data: refreshed } = await supabaseAdmin
    .from("delivery_requests")
    .select("*")
    .eq("id", created.id)
    .single();

  return { ok: true as const, deliveryRequest: refreshed };
}

export async function updateDeliveryStatus(args: {
  deliveryRequestId: string;
  status: DeliveryStatus;
  note?: string | null;
  driverId?: string | null;
  collectedInCash?: boolean;
}) {
  const { deliveryRequestId, status, note, driverId, collectedInCash } = args;
  const patch: any = { status, last_error: status === "failed" ? note : null };
  if (driverId !== undefined) patch.driver_id = driverId;
  if (status === "assigned") patch.assigned_at = new Date().toISOString();
  if (status === "picked_up") patch.picked_up_at = new Date().toISOString();
  if (status === "delivered") patch.delivered_at = new Date().toISOString();
  if (status === "cancelled") patch.cancelled_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("delivery_requests")
    .update(patch)
    .eq("id", deliveryRequestId)
    .select("*")
    .single();
  if (error) return { ok: false as const, error: error.message };

  if (note) {
    await supabaseAdmin
      .from("delivery_status_history")
      .insert({ delivery_request_id: deliveryRequestId, status, note });
  }

  // "Хүргэлтэнд гарсан" төлөвт орсон үед tracking link SMS-ийг автоматаар явуулна (idempotent).
  if ((status === "in_transit" || status === "picked_up") && data?.order_id) {
    try {
      const { sendTrackingLinkSms } = await import("@/lib/tracking/tracking-notify.server");
      void sendTrackingLinkSms(data.order_id);
    } catch (e) {
      console.error("[delivery] sendTrackingLinkSms (dispatched) failed", e);
    }
  }

  // Хүргэлт амжилттай төгсөхөд автомат төлбөр цуглуулалт асаана.
  if (status === "delivered" && data?.order_id) {
    try {
      const { logNotification } = await import("@/lib/notifications/log.server");
      await logNotification({
        orderId: data.order_id,
        merchantId: data.merchant_id,
        eventType: "delivered",
        channel: "system",
        status: "sent",
        provider: data.provider ?? "local",
        message: "Order delivered",
      });
      const { onDeliveryCompleted } = await import(
        "@/lib/payment-collection/collection.service"
      );
      await onDeliveryCompleted({
        orderId: data.order_id,
        collectedInCash: !!collectedInCash,
      });
    } catch (e) {
      console.error("[delivery] onDeliveryCompleted failed", e);
    }
  }

  return { ok: true as const, deliveryRequest: data };
}

export async function cancelDeliveryRequest(args: {
  deliveryRequestId: string;
  reason?: string;
}) {
  return updateDeliveryStatus({
    deliveryRequestId: args.deliveryRequestId,
    status: "cancelled",
    note: args.reason ?? null,
  });
}

// External-ээс ирсэн fulfillment_status-аар sync
export async function syncDeliveryStatusFromExternal(args: {
  deliveryRequestId: string;
  fulfillmentStatus: string;
  externalRef?: string | null;
}) {
  const { data: current } = await supabaseAdmin
    .from("delivery_requests")
    .select("status, order_id")
    .eq("id", args.deliveryRequestId)
    .maybeSingle();
  const prev = current?.status ?? "requested";
  const next = mapSwiftStatus(args.fulfillmentStatus, prev) as DeliveryStatus;
  const patch: any = { status: next };
  if (args.externalRef) patch.external_ref = args.externalRef;
  if (next === "assigned" && prev !== "assigned") patch.assigned_at = new Date().toISOString();
  if (next === "picked_up") patch.picked_up_at = new Date().toISOString();
  if (next === "delivered") patch.delivered_at = new Date().toISOString();
  if (next === "cancelled") patch.cancelled_at = new Date().toISOString();

  await supabaseAdmin
    .from("delivery_requests")
    .update(patch)
    .eq("id", args.deliveryRequestId);

  // "Хүргэлтэнд гарсан" төлөвт орсон үед tracking link SMS-ийг автоматаар явуулна (idempotent).
  if (
    (next === "in_transit" || next === "picked_up") &&
    prev !== "in_transit" &&
    prev !== "picked_up" &&
    current?.order_id
  ) {
    try {
      const { sendTrackingLinkSms } = await import("@/lib/tracking/tracking-notify.server");
      void sendTrackingLinkSms(current.order_id);
    } catch (e) {
      console.error("[delivery] sendTrackingLinkSms (webhook) failed", e);
    }
  }

  // Хүргэгдсэн төлөв шинээр орж ирвэл автомат төлбөрийн SMS-ийг асаана.
  if (next === "delivered" && prev !== "delivered" && current?.order_id) {
    try {
      const { onDeliveryCompleted } = await import(
        "@/lib/payment-collection/collection.service"
      );
      await onDeliveryCompleted({ orderId: current.order_id });
    } catch (e) {
      console.error("[delivery] onDeliveryCompleted (webhook) failed", e);
    }
  }

  return { ok: true as const, status: next };
}

