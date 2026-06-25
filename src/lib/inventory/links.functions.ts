import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMerchant(supabase: any, userId: string, merchantId: string) {
  const { data: ok } = await supabase.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: merchantId,
  });
  if (!ok) throw new Response("Forbidden", { status: 403 });
}

async function isPlatformAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("is_platform_admin", { _user_id: userId });
  return !!data;
}

// ─────────────────────────────────────────────────
// List links
// ─────────────────────────────────────────────────
export const listInventoryLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      inventoryItemId: z.string().uuid().optional(),
      productId: z.string().uuid().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchant(context.supabase, context.userId, data.merchantId);
    let qb = context.supabase
      .from("inventory_product_links")
      .select(
        "id,inventory_item_id,product_id,variant_id,sync_mode,quantity_multiplier,is_active,created_at,updated_at," +
          "inventory_items(name,sku,unit,quantity_on_hand,quantity_available)," +
          "products(name,stock_quantity,variant_stock,thumbnail_url,image_url)," +
          "product_variants(label,size_label,color_label,option_signature)",
      )
      .eq("merchant_id", data.merchantId)
      .order("created_at", { ascending: false });
    if (data.inventoryItemId) qb = qb.eq("inventory_item_id", data.inventoryItemId);
    if (data.productId) qb = qb.eq("product_id", data.productId);
    const { data: rows, error } = await qb;
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [] };
  });

// ─────────────────────────────────────────────────
// Link counts per product (for badges)
// ─────────────────────────────────────────────────
export const listLinkedProductIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ merchantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMerchant(context.supabase, context.userId, data.merchantId);
    const { data: rows, error } = await context.supabase
      .from("inventory_product_links")
      .select("product_id")
      .eq("merchant_id", data.merchantId)
      .eq("is_active", true);
    if (error) throw new Response(error.message, { status: 500 });
    return { productIds: Array.from(new Set((rows ?? []).map((r: any) => r.product_id))) };
  });

// ─────────────────────────────────────────────────
// Create link
// ─────────────────────────────────────────────────
export const createInventoryLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
      productId: z.string().uuid(),
      variantId: z.string().uuid().optional().nullable(),
      syncMode: z.enum(["auto", "manual"]).default("auto"),
      quantityMultiplier: z.number().positive().max(10_000).default(1),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchant(context.supabase, context.userId, data.merchantId);

    // Cross-merchant safety: ensure inventory item and product both belong to this merchant
    const [{ data: item }, { data: product }] = await Promise.all([
      context.supabase
        .from("inventory_items")
        .select("id,merchant_id")
        .eq("id", data.inventoryItemId)
        .maybeSingle(),
      context.supabase
        .from("products")
        .select("id,merchant_id")
        .eq("id", data.productId)
        .maybeSingle(),
    ]);
    if (!item || (item as any).merchant_id !== data.merchantId) {
      throw new Response("Энэ нөөц танд хамаарахгүй байна.", { status: 403 });
    }
    if (!product || (product as any).merchant_id !== data.merchantId) {
      throw new Response("Энэ бараа танд хамаарахгүй байна.", { status: 403 });
    }
    if (data.variantId) {
      const { data: variant } = await context.supabase
        .from("product_variants")
        .select("id,product_id")
        .eq("id", data.variantId)
        .maybeSingle();
      if (!variant || (variant as any).product_id !== data.productId) {
        throw new Response("Сонгосон сонголт энэ бараанд хамаарахгүй байна.", { status: 400 });
      }
    }

    // Duplicate active link
    let dupQb = context.supabase
      .from("inventory_product_links")
      .select("id")
      .eq("merchant_id", data.merchantId)
      .eq("product_id", data.productId)
      .eq("is_active", true);
    dupQb = data.variantId
      ? dupQb.eq("variant_id", data.variantId)
      : dupQb.is("variant_id", null);
    const { data: dup } = await dupQb.limit(1);
    if (dup && dup.length > 0) {
      throw new Response("Энэ бараа/сонголт өмнө нь холбогдсон байна.", { status: 409 });
    }

    const { data: created, error } = await context.supabase
      .from("inventory_product_links")
      .insert({
        merchant_id: data.merchantId,
        inventory_item_id: data.inventoryItemId,
        product_id: data.productId,
        variant_id: data.variantId ?? null,
        sync_mode: data.syncMode,
        quantity_multiplier: data.quantityMultiplier,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !created) throw new Response(error?.message ?? "create failed", { status: 500 });

    // Initial sync
    await context.supabase.rpc("sync_inventory_link" as any, {
      _link_id: (created as any).id,
      _trigger: "manual:create",
    } as any);

    return { ok: true, id: (created as any).id };
  });

// ─────────────────────────────────────────────────
// Update link (multiplier / sync_mode / is_active)
// ─────────────────────────────────────────────────
export const updateInventoryLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      linkId: z.string().uuid(),
      syncMode: z.enum(["auto", "manual"]).optional(),
      quantityMultiplier: z.number().positive().max(10_000).optional(),
      isActive: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchant(context.supabase, context.userId, data.merchantId);
    const patch: Record<string, unknown> = {};
    if (data.syncMode !== undefined) patch.sync_mode = data.syncMode;
    if (data.quantityMultiplier !== undefined) patch.quantity_multiplier = data.quantityMultiplier;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase
      .from("inventory_product_links")
      .update(patch as any)
      .eq("id", data.linkId)
      .eq("merchant_id", data.merchantId);
    if (error) throw new Response(error.message, { status: 500 });

    if (data.isActive !== false) {
      await context.supabase.rpc("sync_inventory_link" as any, {
        _link_id: data.linkId,
        _trigger: "manual:update",
      } as any);
    }
    return { ok: true };
  });

// ─────────────────────────────────────────────────
// Delete link
// ─────────────────────────────────────────────────
export const deleteInventoryLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      linkId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchant(context.supabase, context.userId, data.merchantId);
    const { error } = await context.supabase
      .from("inventory_product_links")
      .delete()
      .eq("id", data.linkId)
      .eq("merchant_id", data.merchantId);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

// ─────────────────────────────────────────────────
// Manual sync
// ─────────────────────────────────────────────────
export const manualSyncInventoryLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      linkId: z.string().uuid().optional(),
      inventoryItemId: z.string().uuid().optional(),
      productId: z.string().uuid().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchant(context.supabase, context.userId, data.merchantId);

    let qb = context.supabase
      .from("inventory_product_links")
      .select("id")
      .eq("merchant_id", data.merchantId)
      .eq("is_active", true);
    if (data.linkId) qb = qb.eq("id", data.linkId);
    if (data.inventoryItemId) qb = qb.eq("inventory_item_id", data.inventoryItemId);
    if (data.productId) qb = qb.eq("product_id", data.productId);
    const { data: links, error } = await qb;
    if (error) throw new Response(error.message, { status: 500 });

    const results: any[] = [];
    for (const l of links ?? []) {
      const { data: res } = await context.supabase.rpc("sync_inventory_link" as any, {
        _link_id: (l as any).id,
        _trigger: "manual",
      } as any);
      results.push({ linkId: (l as any).id, ...(res as object | null ?? {}) });
    }
    return { ok: true, synced: results.length, results };
  });

// ─────────────────────────────────────────────────
// Sync logs
// ─────────────────────────────────────────────────
export const listInventorySyncLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      inventoryItemId: z.string().uuid().optional(),
      productId: z.string().uuid().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(30),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchant(context.supabase, context.userId, data.merchantId);
    let qb = context.supabase
      .from("inventory_sync_logs")
      .select(
        "id,created_at,inventory_item_id,product_id,variant_id,old_stock,new_stock,sync_status,error_message,trigger_source," +
          "inventory_items(name),products(name)",
        { count: "exact" },
      )
      .eq("merchant_id", data.merchantId)
      .order("created_at", { ascending: false });
    if (data.inventoryItemId) qb = qb.eq("inventory_item_id", data.inventoryItemId);
    if (data.productId) qb = qb.eq("product_id", data.productId);
    const from = (data.page - 1) * data.pageSize;
    const { data: rows, count, error } = await qb.range(from, from + data.pageSize - 1);
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [], total: count ?? 0 };
  });

// ─────────────────────────────────────────────────
// Product picker (for link dialog)
// ─────────────────────────────────────────────────
export const listMerchantProductsForLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      q: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchant(context.supabase, context.userId, data.merchantId);
    let qb = context.supabase
      .from("products")
      .select("id,name,thumbnail_url,image_url,stock_quantity,variant_stock")
      .eq("merchant_id", data.merchantId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(data.limit);
    if (data.q && data.q.trim()) {
      qb = qb.ilike("name", `%${data.q.trim()}%`);
    }
    const { data: rows, error } = await qb;
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [] };
  });

export const listProductVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      productId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchant(context.supabase, context.userId, data.merchantId);
    const { data: product } = await context.supabase
      .from("products")
      .select("merchant_id")
      .eq("id", data.productId)
      .maybeSingle();
    if (!product || (product as any).merchant_id !== data.merchantId) {
      throw new Response("Forbidden", { status: 403 });
    }
    const { data: rows, error } = await context.supabase
      .from("product_variants")
      .select("id,label,size_label,color_label,option_signature")
      .eq("product_id", data.productId);
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [] };
  });

// ─────────────────────────────────────────────────
// Admin: read all
// ─────────────────────────────────────────────────
export const adminListInventoryLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context.supabase, context.userId))) {
      throw new Response("Forbidden", { status: 403 });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = (data.page - 1) * data.pageSize;
    const { data: rows, count, error } = await supabaseAdmin
      .from("inventory_product_links")
      .select(
        "id,merchant_id,inventory_item_id,product_id,variant_id,sync_mode,quantity_multiplier,is_active,updated_at," +
          "merchants(name,slug),inventory_items(name,quantity_available),products(name)",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [], total: count ?? 0 };
  });
