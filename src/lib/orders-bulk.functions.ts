import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createDeliveryRequest } from "@/lib/delivery/delivery.service";

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
    const patch: any = { status: data.status };
    if (data.status === "completed") patch.payment_status = "confirmed";
    const { error } = await supabaseAdmin.from("orders").update(patch).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true as const, count: data.ids.length };
  });

export const bulkMarkPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Ids.parse(d))
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.userId, data.ids);
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: "confirmed" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    // auto-create delivery request for each (idempotent inside service)
    let delivered = 0;
    for (const id of data.ids) {
      try {
        await createDeliveryRequest({ orderId: id });
        delivered++;
      } catch (e) {
        console.error("auto delivery failed", id, e);
      }
    }
    return { ok: true as const, count: data.ids.length, deliveryCreated: delivered };
  });

export const bulkCreateDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Ids.parse(d))
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.userId, data.ids);
    let ok = 0;
    const errors: string[] = [];
    for (const id of data.ids) {
      try {
        await createDeliveryRequest({ orderId: id });
        ok++;
      } catch (e: any) {
        errors.push(`${id}: ${e?.message ?? "error"}`);
      }
    }
    return { ok: true as const, count: ok, errors };
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
