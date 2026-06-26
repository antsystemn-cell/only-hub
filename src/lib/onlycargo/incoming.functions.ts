import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StatusEnum = z.enum([
  "planned",
  "waiting_arrival",
  "ready_to_receive",
  "received",
  "cancelled",
]);

async function assertAccess(supabase: any, userId: string, merchantId: string) {
  const { data: access } = await supabase.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: merchantId,
  });
  if (!access) throw new Response("Forbidden", { status: 403 });
}

export const listIncomingCargoItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumber: z.string().trim().min(1).max(80).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    let q = context.supabase
      .from("incoming_cargo_items")
      .select("*")
      .eq("merchant_id", data.merchantId)
      .order("created_at", { ascending: false });
    if (data.trackNumber) q = q.eq("track_number", data.trackNumber);
    const { data: rows, error } = await q;
    if (error) throw new Response(error.message, { status: 500 });
    return rows ?? [];
  });

export const getIncomingCargoSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumbers: z.array(z.string().min(1).max(80)).max(200),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    if (!data.trackNumbers.length) return {} as Record<string, { items: number; planned_qty: number; ready: number }>;
    const { data: rows, error } = await context.supabase
      .from("incoming_cargo_items")
      .select("track_number,planned_quantity,status")
      .eq("merchant_id", data.merchantId)
      .in("track_number", data.trackNumbers);
    if (error) throw new Response(error.message, { status: 500 });
    const out: Record<string, { items: number; planned_qty: number; ready: number }> = {};
    for (const r of rows ?? []) {
      const k = r.track_number as string;
      if (!out[k]) out[k] = { items: 0, planned_qty: 0, ready: 0 };
      out[k].items += 1;
      out[k].planned_qty += Number(r.planned_quantity ?? 0);
      if (r.status === "ready_to_receive") out[k].ready += 1;
    }
    return out;
  });

export const createIncomingCargoItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumber: z.string().trim().min(1).max(80),
      productId: z.string().uuid().optional().nullable(),
      variantId: z.string().uuid().optional().nullable(),
      plannedProductName: z.string().trim().min(1).max(300),
      plannedQuantity: z.number().positive().max(1000000),
      plannedUnitCost: z.number().min(0).max(1_000_000_000).optional().nullable(),
      notes: z.string().trim().max(1000).optional().nullable(),
      initialStatus: StatusEnum.optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    const { data: row, error } = await context.supabase
      .from("incoming_cargo_items")
      .insert({
        merchant_id: data.merchantId,
        track_number: data.trackNumber,
        product_id: data.productId ?? null,
        variant_id: data.variantId ?? null,
        planned_product_name: data.plannedProductName,
        planned_quantity: data.plannedQuantity,
        planned_unit_cost: data.plannedUnitCost ?? null,
        notes: data.notes ?? null,
        status: data.initialStatus ?? "planned",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Response(error.message, { status: 500 });
    return row;
  });

export const updateIncomingCargoItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      id: z.string().uuid(),
      plannedProductName: z.string().trim().min(1).max(300).optional(),
      plannedQuantity: z.number().positive().max(1000000).optional(),
      plannedUnitCost: z.number().min(0).max(1_000_000_000).optional().nullable(),
      notes: z.string().trim().max(1000).optional().nullable(),
      productId: z.string().uuid().optional().nullable(),
      variantId: z.string().uuid().optional().nullable(),
      status: StatusEnum.optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    const patch: any = {};
    if (data.plannedProductName !== undefined) patch.planned_product_name = data.plannedProductName;
    if (data.plannedQuantity !== undefined) patch.planned_quantity = data.plannedQuantity;
    if (data.plannedUnitCost !== undefined) patch.planned_unit_cost = data.plannedUnitCost;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.productId !== undefined) patch.product_id = data.productId;
    if (data.variantId !== undefined) patch.variant_id = data.variantId;
    if (data.status !== undefined) patch.status = data.status;
    const { data: row, error } = await context.supabase
      .from("incoming_cargo_items")
      .update(patch)
      .eq("id", data.id)
      .eq("merchant_id", data.merchantId)
      .select("*")
      .single();
    if (error) throw new Response(error.message, { status: 500 });
    return row;
  });

export const deleteIncomingCargoItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      id: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    const { error } = await context.supabase
      .from("incoming_cargo_items")
      .delete()
      .eq("id", data.id)
      .eq("merchant_id", data.merchantId);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

/**
 * Reconcile statuses for one shipment based on current cargo status (from API).
 * - cargo arrived | ready_for_pickup → items in (planned, waiting_arrival) become ready_to_receive
 * - cargo in_transit | processing | received → items in planned become waiting_arrival
 * Does NOT touch items already 'received' or 'cancelled'.
 */
export const reconcileIncomingCargoStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumber: z.string().trim().min(1).max(80),
      cargoStatus: z.string().min(1).max(40),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    const ready = data.cargoStatus === "arrived" || data.cargoStatus === "ready_for_pickup";
    const inTransit = ["in_transit", "processing", "received"].includes(data.cargoStatus);
    if (!ready && !inTransit) return { updated: 0 };

    if (ready) {
      const { error, count } = await context.supabase
        .from("incoming_cargo_items")
        .update({ status: "ready_to_receive" }, { count: "exact" })
        .eq("merchant_id", data.merchantId)
        .eq("track_number", data.trackNumber)
        .in("status", ["planned", "waiting_arrival"]);
      if (error) throw new Response(error.message, { status: 500 });
      return { updated: count ?? 0 };
    }
    const { error, count } = await context.supabase
      .from("incoming_cargo_items")
      .update({ status: "waiting_arrival" }, { count: "exact" })
      .eq("merchant_id", data.merchantId)
      .eq("track_number", data.trackNumber)
      .eq("status", "planned");
    if (error) throw new Response(error.message, { status: 500 });
    return { updated: count ?? 0 };
  });

/** Lightweight product search for the picker — name / product_code. */
export const searchMerchantProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      q: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    let q = context.supabase
      .from("products")
      .select("id,name,product_code,image_url,thumbnail_url")
      .eq("merchant_id", data.merchantId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (data.q && data.q.length > 0) {
      q = q.or(`name.ilike.%${data.q}%,product_code.ilike.%${data.q}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Response(error.message, { status: 500 });
    return rows ?? [];
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
    await assertAccess(context.supabase, context.userId, data.merchantId);
    const { data: rows, error } = await context.supabase
      .from("product_variants")
      .select("id,label,size_label,color_label,option_signature")
      .eq("product_id", data.productId)
      .order("created_at", { ascending: true });
    if (error) throw new Response(error.message, { status: 500 });
    return rows ?? [];
  });
