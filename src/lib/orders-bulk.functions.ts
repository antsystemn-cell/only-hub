import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createDeliveryRequest } from "@/lib/delivery/delivery.service";
import { confirmOrderPayment } from "@/lib/payments/confirm-order-payment.server";

const Ids = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

async function assertMerchantAccess(userId: string, orderIds: string[]) {
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id,merchant_id")
    .in("id", orderIds);
  if (!orders?.length) throw new Error("Захиалга олдсонгүй");
  const merchantIds = Array.from(new Set(orders.map((o) => o.merchant_id)));
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("merchant_id,role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r) => r.role === "platform_admin");
  if (!isAdmin) {
    const allowed = new Set((roles ?? []).map((r) => r.merchant_id).filter(Boolean));
    for (const m of merchantIds) {
      if (!allowed.has(m)) throw new Error("Хандах эрхгүй");
    }
  }
  return orders;
}

export const bulkUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    Ids.extend({
      status: z.enum(["pending", "phone_confirmed", "confirmed", "preparing", "delivering", "completed", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.userId, data.ids);
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: data.status })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    // If marking as completed, also confirm payment via the centralized service.
    if (data.status === "completed") {
      for (const id of data.ids) {
        await confirmOrderPayment({ orderId: id, source: "bulk_import" }).catch((e) =>
          console.error("bulk confirm failed", id, e),
        );
      }
    }
    return { ok: true as const, count: data.ids.length };
  });

export const bulkMarkPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Ids.parse(d))
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.userId, data.ids);
    let confirmed = 0;
    let delivered = 0;
    for (const id of data.ids) {
      const res = await confirmOrderPayment({ orderId: id, source: "bulk_mark_paid" });
      if (res.ok) {
        confirmed++;
        if (res.deliveryRequestCreated) delivered++;
      }
    }
    return { ok: true as const, count: confirmed, deliveryCreated: delivered };
  });

export const bulkCreateDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Ids.parse(d))
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.userId, data.ids);
    // Аль хэдийн хүргэлт үүсгэсэн захиалгуудыг хасах
    const { data: existing } = await supabaseAdmin
      .from("delivery_requests")
      .select("order_id")
      .in("order_id", data.ids);
    const skipSet = new Set((existing ?? []).map((r) => r.order_id));
    const toSend = data.ids.filter((id) => !skipSet.has(id));
    let ok = 0;
    const errors: string[] = [];
    for (const id of toSend) {
      try {
        const res = await createDeliveryRequest({ orderId: id });
        if (res.ok && !res.alreadyExists) ok++;
        else if (!res.ok) errors.push(`${id}: ${res.error}`);
      } catch (e: any) {
        errors.push(`${id}: ${e?.message ?? "error"}`);
      }
    }
    return { ok: true as const, count: ok, skipped: skipSet.size, errors };
  });

export const bulkDeleteOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Ids.parse(d))
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.userId, data.ids);
    // Clean up dependent rows first to avoid FK constraint failures
    const { data: drs } = await supabaseAdmin
      .from("delivery_requests")
      .select("id")
      .in("order_id", data.ids);
    const drIds = (drs ?? []).map((r) => r.id);
    if (drIds.length) {
      await supabaseAdmin.from("delivery_status_history").delete().in("delivery_request_id", drIds);
      await supabaseAdmin.from("delivery_webhooks").delete().in("delivery_request_id", drIds);
      await supabaseAdmin.from("delivery_requests").delete().in("id", drIds);
    }
    await supabaseAdmin.from("payment_requests").delete().in("order_id", data.ids);
    await supabaseAdmin.from("platform_transactions").delete().in("order_id", data.ids);
    const { error } = await supabaseAdmin.from("orders").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true as const, count: data.ids.length };
  });

// Single-order confirm — used by merchant/admin UI "Mark as paid" toggles.
// Always flows through the centralized confirmOrderPayment service.
export const markOrderPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.userId, [data.orderId]);
    const res = await confirmOrderPayment({ orderId: data.orderId, source: "merchant_manual" });
    return res;
  });
