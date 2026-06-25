import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cancel an order (merchant/admin action). Releases inventory reservations.
 * Idempotent — safe to call repeatedly.
 */
export const cancelOrderAndRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      orderId: z.string().uuid(),
      reason: z.enum(["cancelled", "released"]).default("cancelled"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase
      .from("orders")
      .select("id,merchant_id,payment_status,status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Response("Захиалга олдсонгүй", { status: 404 });

    const { data: ok } = await context.supabase.rpc("has_merchant_access", {
      _user_id: context.userId,
      _merchant_id: (order as any).merchant_id,
    });
    if (!ok) throw new Response("Forbidden", { status: 403 });

    if ((order as any).payment_status === "confirmed") {
      throw new Response("Төлбөр төлөгдсөн захиалгыг цуцалж болохгүй", { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { releaseForOrder } = await import("@/lib/inventory/reservation.server");

    const res = await releaseForOrder(data.orderId, data.reason);
    // Also release legacy variant_stock reservations (idempotent).
    await supabaseAdmin.rpc("release_legacy_stock_reservations", {
      _order_id: data.orderId,
      _reason: data.reason,
    });

    await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelled",
        payment_status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.orderId);

    return { ok: true, released: res.released };

  });

/**
 * Revert a paid order back to unpaid (admin/merchant correction). Does not
 * touch inventory: confirmed sales stay sold. Use the dedicated "оруулсан
 * нөөц буцаах" flow if stock needs to come back.
 */
export const revertOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      orderId: z.string().uuid(),
      status: z.enum(["unpaid", "pending"]).default("unpaid"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase
      .from("orders")
      .select("id,merchant_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Response("Захиалга олдсонгүй", { status: 404 });
    const { data: ok } = await context.supabase.rpc("has_merchant_access", {
      _user_id: context.userId,
      _merchant_id: (order as any).merchant_id,
    });
    if (!ok) throw new Response("Forbidden", { status: 403 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("orders")
      .update({ payment_status: data.status, paid_at: null, updated_at: new Date().toISOString() })
      .eq("id", data.orderId);
    return { ok: true };
  });
