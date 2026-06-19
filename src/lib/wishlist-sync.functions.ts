import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wishlist_items")
      .select("product_id, created_at")
      .order("created_at", { ascending: false });
    if (error) return { ok: false as const, error: error.message, items: [] as string[] };
    return { ok: true as const, items: (data ?? []).map((r: any) => r.product_id as string) };
  });

export const addWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wishlist_items")
      .upsert({ user_id: context.userId, product_id: data.productId }, { onConflict: "user_id,product_id" });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const removeWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wishlist_items")
      .delete()
      .eq("user_id", context.userId)
      .eq("product_id", data.productId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const mergeWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productIds: z.array(z.string().uuid()).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.productIds.length === 0) {
      const { data: rows } = await context.supabase
        .from("wishlist_items")
        .select("product_id")
        .order("created_at", { ascending: false });
      return { ok: true as const, items: (rows ?? []).map((r: any) => r.product_id as string) };
    }
    const rows = data.productIds.map((pid) => ({ user_id: context.userId, product_id: pid }));
    await context.supabase
      .from("wishlist_items")
      .upsert(rows, { onConflict: "user_id,product_id" });
    const { data: all } = await context.supabase
      .from("wishlist_items")
      .select("product_id")
      .order("created_at", { ascending: false });
    return { ok: true as const, items: (all ?? []).map((r: any) => r.product_id as string) };
  });
