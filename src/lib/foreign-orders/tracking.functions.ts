// Public-by-orderId foreign-order tracking — read-only summary for the
// customer's order detail page. RLS allows merchant staff via auth, but
// customers need lightweight access by orderId alone (used right after
// checkout, often before sign-in). We use service role + only return
// non-sensitive snapshot fields.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getOrderForeignTracking = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("source_purchase_queue")
      .select(
        "id,source,status,selected_size_label,customer_paid_price_mnt,created_at,updated_at,order_item_index",
      )
      .eq("order_id", data.orderId)
      .order("order_item_index", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("has_foreign_order_items,items,paid_at")
      .eq("id", data.orderId)
      .maybeSingle();

    return {
      hasForeign: !!order?.has_foreign_order_items,
      paidAt: order?.paid_at ?? null,
      items: rows ?? [],
      // expose delivery day estimates from the snapshot
      estimates: (Array.isArray(order?.items) ? (order!.items as any[]) : [])
        .map((it: any, idx: number) => ({
          index: idx,
          name: it?.name,
          image: it?.image,
          deliveryMinDays: it?.foreign?.delivery_min_days ?? null,
          deliveryMaxDays: it?.foreign?.delivery_max_days ?? null,
        }))
        .filter((e) => e.deliveryMinDays != null || e.deliveryMaxDays != null),
    };
  });
