import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMerchantAccess(supabase: any, userId: string, merchantId: string) {
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

function normalizeCargoPhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("976") && digits.length === 11 ? digits.slice(3) : digits;
}

// ────────────────────────────────────────────────
// List inventory items
// ────────────────────────────────────────────────
export const listInventoryItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      q: z.string().max(120).optional(),
      status: z.string().max(40).optional(),
      lowStock: z.boolean().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.supabase, context.userId, data.merchantId);

    let qb = context.supabase
      .from("inventory_items")
      .select(
        "id,name,sku,barcode,quantity_on_hand,quantity_reserved,quantity_available,unit,cost_price,currency,source_type,source_cargo_tracking_number,warehouse_location,status,updated_at",
        { count: "exact" },
      )
      .eq("merchant_id", data.merchantId)
      .order("updated_at", { ascending: false });

    if (data.status) qb = qb.eq("status", data.status);
    if (data.q && data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      qb = qb.or(
        `name.ilike.${term},sku.ilike.${term},barcode.ilike.${term},source_cargo_tracking_number.ilike.${term}`,
      );
    }
    if (data.lowStock) qb = qb.lte("quantity_available", 5);

    const from = (data.page - 1) * data.pageSize;
    qb = qb.range(from, from + data.pageSize - 1);

    const { data: rows, count, error } = await qb;
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [], total: count ?? 0 };
  });

// ────────────────────────────────────────────────
// Find existing inventory items for a cargo tracking number
// ────────────────────────────────────────────────
export const findInventoryByCargoTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackingNumber: z.string().trim().min(1).max(80),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.supabase, context.userId, data.merchantId);
    const { data: rows, error } = await context.supabase
      .from("inventory_items")
      .select("id,name,sku,quantity_on_hand,unit,created_at")
      .eq("merchant_id", data.merchantId)
      .eq("source_cargo_tracking_number", data.trackingNumber)
      .order("created_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [] };
  });

// ────────────────────────────────────────────────
// Create inventory item from cargo
// ────────────────────────────────────────────────
const ELIGIBLE_CARGO_STATUSES = new Set(["arrived", "ready_for_pickup", "completed"]);

export const createInventoryFromCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackingNumber: z.string().trim().min(1).max(80),
      cargoId: z.string().trim().max(120).optional(),
      name: z.string().trim().min(1).max(200),
      sku: z.string().trim().max(80).optional(),
      quantity: z.number().positive().max(1_000_000).refine((n) => Number.isFinite(n), "invalid"),
      unit: z.string().trim().min(1).max(20).default("pcs"),
      costPrice: z
        .number()
        .nonnegative()
        .refine((n) => Number.isFinite(n), "invalid")
        .optional(),
      warehouseLocation: z.string().trim().max(120).optional(),
      note: z.string().trim().max(500).optional(),
      allowDuplicate: z.boolean().default(false),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.supabase, context.userId, data.merchantId);

    // ── Server-side cargo validation ───────────────────────────────
    // Resolve this merchant's cargo phone + hidden OnlyCargo customer code,
    // then verify the tracking number really belongs to them and is eligible.
    const { data: merchant, error: mErr } = await context.supabase
      .from("merchants")
      .select("onlycargo_customer_code,onlycargo_phone")
      .eq("id", data.merchantId)
      .maybeSingle();
    if (mErr) throw new Response(mErr.message, { status: 500 });
    const customerCode = (merchant as any)?.onlycargo_customer_code?.trim();
    const cargoPhone = normalizeCargoPhone((merchant as any)?.onlycargo_phone);
    if (!cargoPhone) {
      throw new Response(
        "Каргоны утасны дугаар тохируулаагүй байна.",
        { status: 400 },
      );
    }

    const isAdmin = await isPlatformAdmin(context.supabase, context.userId);

    let cargo: any = null;
    try {
      const { onlyCargo } = await import("@/lib/onlycargo/client.server");
      cargo = await onlyCargo.getShipment(data.trackingNumber);
    } catch (e: any) {
      const status = typeof e?.status === "number" ? e.status : 502;
      if (status === 404) {
        throw new Response("Энэ track № системд олдсонгүй.", { status: 404 });
      }
      throw new Response(
        "Каргоны мэдээлэл татаж чадсангүй. Дахин оролдоно уу.",
        { status: 502 },
      );
    }
    if (!cargo || !cargo.track_number) {
      throw new Response("Энэ track № системд олдсонгүй.", { status: 404 });
    }

    const shipmentCode = (cargo.customer_code ?? cargo.customerCode ?? null) as string | null;
    const shipmentMerchantId = (cargo.merchant_id ?? cargo.merchantId ?? null) as string | null;
    const shipmentPhone = (cargo.phone ?? cargo.phoneNumber ?? null) as string | null;
    if (!isAdmin) {
      const codeMatches = shipmentCode && shipmentCode === customerCode;
      const merchantMatches = shipmentMerchantId && shipmentMerchantId === data.merchantId;
      const phoneMatches = shipmentPhone && normalizeCargoPhone(shipmentPhone) === cargoPhone;
      if (!codeMatches && !merchantMatches && !phoneMatches) {
        throw new Response("Энэ карго танд хамаарахгүй байна.", { status: 403 });
      }
    }

    const cargoStatus = String(cargo.status ?? "").toLowerCase();
    if (!ELIGIBLE_CARGO_STATUSES.has(cargoStatus)) {
      throw new Response(
        "Энэ карго хараахан нөөцөд бүртгэх боломжтой төлөвт ороогүй байна.",
        { status: 409 },
      );
    }

    // ── Duplicate protection ───────────────────────────────────────
    const { data: existing, error: dupErr } = await context.supabase
      .from("inventory_items")
      .select("id,name,quantity_on_hand,unit")
      .eq("merchant_id", data.merchantId)
      .eq("source_cargo_tracking_number", data.trackingNumber)
      .order("created_at", { ascending: false });
    if (dupErr) throw new Response(dupErr.message, { status: 500 });
    if (existing && existing.length > 0 && !data.allowDuplicate) {
      return {
        ok: false as const,
        duplicate: true,
        existing,
        existingId: (existing[0] as any).id,
        message: "Энэ карго аль хэдийн нөөцөд бүртгэгдсэн байна.",
      };
    }

    // ── Atomic create (item + movement together) ──────────────────
    const note = data.allowDuplicate && existing && existing.length > 0
      ? `[duplicate-confirmed] ${data.note ?? ""}`.trim()
      : data.note ?? null;

    const { data: itemId, error: rpcErr } = await context.supabase.rpc(
      "create_inventory_from_cargo" as any,
      {
        _merchant_id: data.merchantId,
        _name: data.name,
        _sku: data.sku ?? null,
        _quantity: data.quantity,
        _unit: data.unit,
        _cost_price: data.costPrice ?? null,
        _warehouse_location: data.warehouseLocation ?? null,
        _tracking_number: data.trackingNumber,
        _cargo_id: data.cargoId ?? null,
        _note: note,
        _created_by: context.userId,
      } as any,
    );
    if (rpcErr) {
      const msg = rpcErr.message ?? "create failed";
      if (msg.includes("invalid_quantity")) {
        throw new Response("Тоо ширхэг буруу.", { status: 400 });
      }
      if (msg.includes("invalid_unit")) {
        throw new Response("Нэгж буруу.", { status: 400 });
      }
      throw new Response(msg, { status: 500 });
    }

    return { ok: true as const, itemId: itemId as string };
  });

// ────────────────────────────────────────────────
// Manual adjustment
// ────────────────────────────────────────────────
export const adjustInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      itemId: z.string().uuid(),
      delta: z.number().refine((n) => n !== 0, "delta required"),
      note: z.string().trim().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.supabase, context.userId, data.merchantId);

    const { data: item, error: getErr } = await context.supabase
      .from("inventory_items")
      .select("id,quantity_on_hand,merchant_id")
      .eq("id", data.itemId)
      .eq("merchant_id", data.merchantId)
      .maybeSingle();
    if (getErr) throw new Response(getErr.message, { status: 500 });
    if (!item) throw new Response("Not found", { status: 404 });

    const before = Number((item as any).quantity_on_hand);
    const after = before + data.delta;
    if (after < 0) throw new Response("Үлдэгдэл хасах байх боломжгүй", { status: 400 });

    const { error: upErr } = await context.supabase
      .from("inventory_items")
      .update({ quantity_on_hand: after })
      .eq("id", data.itemId);
    if (upErr) throw new Response(upErr.message, { status: 500 });

    const { error: movErr } = await context.supabase
      .from("inventory_movements")
      .insert({
        merchant_id: data.merchantId,
        inventory_item_id: data.itemId,
        movement_type: "manual_adjustment",
        quantity: data.delta,
        before_quantity: before,
        after_quantity: after,
        note: data.note ?? null,
        created_by: context.userId,
      });
    if (movErr) throw new Response(movErr.message, { status: 500 });
    return { ok: true as const };
  });

// ────────────────────────────────────────────────
// List movements
// ────────────────────────────────────────────────
export const listInventoryMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      itemId: z.string().uuid().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(30),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMerchantAccess(context.supabase, context.userId, data.merchantId);
    let qb = context.supabase
      .from("inventory_movements")
      .select(
        "id,created_at,movement_type,quantity,before_quantity,after_quantity,source_type,source_reference,note,inventory_item_id,inventory_items(name,sku,unit)",
        { count: "exact" },
      )
      .eq("merchant_id", data.merchantId)
      .order("created_at", { ascending: false });
    if (data.itemId) qb = qb.eq("inventory_item_id", data.itemId);
    const from = (data.page - 1) * data.pageSize;
    qb = qb.range(from, from + data.pageSize - 1);
    const { data: rows, count, error } = await qb;
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [], total: count ?? 0 };
  });

// ────────────────────────────────────────────────
// Admin: read across all merchants
// ────────────────────────────────────────────────
export const adminListInventoryItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      q: z.string().max(120).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(30),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context.supabase, context.userId))) {
      throw new Response("Forbidden", { status: 403 });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let qb = supabaseAdmin
      .from("inventory_items")
      .select(
        "id,name,sku,quantity_on_hand,quantity_reserved,quantity_available,unit,source_type,source_cargo_tracking_number,warehouse_location,status,updated_at,merchant_id,merchants(name,slug)",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false });
    if (data.q && data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      qb = qb.or(`name.ilike.${term},sku.ilike.${term},source_cargo_tracking_number.ilike.${term}`);
    }
    const from = (data.page - 1) * data.pageSize;
    qb = qb.range(from, from + data.pageSize - 1);
    const { data: rows, count, error } = await qb;
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [], total: count ?? 0 };
  });

export const adminListInventoryMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(30),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context.supabase, context.userId))) {
      throw new Response("Forbidden", { status: 403 });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = (data.page - 1) * data.pageSize;
    const { data: rows, count, error } = await supabaseAdmin
      .from("inventory_movements")
      .select(
        "id,created_at,movement_type,quantity,before_quantity,after_quantity,source_type,source_reference,note,merchant_id,inventory_items(name,sku),merchants(name,slug)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [], total: count ?? 0 };
  });
