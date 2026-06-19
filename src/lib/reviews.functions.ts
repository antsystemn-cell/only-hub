import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      productId: z.string().uuid(),
      orderId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(2000).optional().nullable(),
      images: z.array(z.string().url()).max(8).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Validate order belongs to user, is delivered + paid, and get merchant
    const { data: order, error: oErr } = await context.supabase
      .from("orders")
      .select("id, merchant_id, user_id, payment_status, delivery_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oErr) return { ok: false as const, error: oErr.message };
    if (!order) return { ok: false as const, error: "Захиалга олдсонгүй" };
    if (order.user_id !== context.userId) return { ok: false as const, error: "Зөвхөн өөрийн захиалгад үнэлгээ үлдээх боломжтой" };
    if (order.payment_status !== "confirmed" || order.delivery_status !== "delivered") {
      return { ok: false as const, error: "Зөвхөн төлөгдсөн, хүргэгдсэн захиалгад үнэлгээ өгөх боломжтой" };
    }

    const { error } = await context.supabase
      .from("reviews")
      .upsert({
        product_id: data.productId,
        merchant_id: order.merchant_id,
        user_id: context.userId,
        order_id: data.orderId,
        rating: data.rating,
        comment: data.comment ?? null,
        images: data.images ?? [],
        verified_purchase: true,
      }, { onConflict: "product_id,user_id,order_id" });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const myReviewableOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: orders } = await context.supabase
      .from("orders")
      .select("id, items, created_at")
      .eq("user_id", context.userId)
      .eq("payment_status", "confirmed")
      .eq("delivery_status", "delivered")
      .order("created_at", { ascending: false })
      .limit(50);
    const matching = (orders ?? []).filter((o: any) =>
      Array.isArray(o.items) && o.items.some((it: any) => it?.product_id === data.productId),
    );
    return { ok: true as const, orders: matching.map((o: any) => ({ id: o.id as string, created_at: o.created_at as string })) };
  });
