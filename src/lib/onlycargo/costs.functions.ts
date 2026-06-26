import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAccess(supabase: any, userId: string, merchantId: string) {
  const { data: access } = await supabase.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: merchantId,
  });
  if (!access) throw new Response("Forbidden", { status: 403 });
}

// ---------- Shipment cost summary ----------

export const getShipmentCostSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumber: z.string().trim().min(1).max(80),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);

    const [{ data: cost }, { data: batches }] = await Promise.all([
      context.supabase
        .from("cargo_shipment_costs")
        .select("*")
        .eq("merchant_id", data.merchantId)
        .eq("track_number", data.trackNumber)
        .maybeSingle(),
      context.supabase
        .from("inventory_batches")
        .select("*")
        .eq("merchant_id", data.merchantId)
        .eq("track_number", data.trackNumber)
        .order("created_at", { ascending: true }),
    ]);

    const batchList = batches ?? [];
    const purchaseTotal = batchList.reduce(
      (sum: number, b: any) => sum + Number(b.quantity) * Number(b.purchase_price),
      0,
    );
    return {
      cost: cost ?? null,
      batches: batchList,
      purchaseTotal,
    };
  });

export const saveShipmentCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumber: z.string().trim().min(1).max(80),
      cargoFee: z.number().min(0).max(1e12).default(0),
      customsFee: z.number().min(0).max(1e12).default(0),
      localDeliveryFee: z.number().min(0).max(1e12).default(0),
      otherExpenses: z.number().min(0).max(1e12).default(0),
      notes: z.string().max(1000).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    const { data: res, error } = await context.supabase.rpc("upsert_shipment_costs", {
      _merchant_id: data.merchantId,
      _track_number: data.trackNumber,
      _cargo_fee: data.cargoFee,
      _customs_fee: data.customsFee,
      _local_delivery_fee: data.localDeliveryFee,
      _other_expenses: data.otherExpenses,
      _notes: (data.notes ?? "") as string,
    });
    if (error) throw new Response(error.message, { status: 500 });
    return res as any;
  });

// ---------- Allocate costs ----------

const ManualEntry = z.object({
  batch_id: z.string().uuid(),
  cargo_cost: z.number().min(0).max(1e12).default(0),
  customs_cost: z.number().min(0).max(1e12).default(0),
  other_cost: z.number().min(0).max(1e12).default(0),
});

export const allocateCargoCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumber: z.string().trim().min(1).max(80),
      method: z.enum(["quantity", "value", "manual"]),
      cargoFee: z.number().min(0).max(1e12).default(0),
      customsFee: z.number().min(0).max(1e12).default(0),
      localDeliveryFee: z.number().min(0).max(1e12).default(0),
      otherExpenses: z.number().min(0).max(1e12).default(0),
      manual: z.array(ManualEntry).max(500).optional().default([]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    const { data: res, error } = await context.supabase.rpc("allocate_cargo_costs", {
      _merchant_id: data.merchantId,
      _track_number: data.trackNumber,
      _method: data.method,
      _cargo_fee: data.cargoFee,
      _customs_fee: data.customsFee,
      _other_expenses: data.otherExpenses,
      _local_delivery_fee: data.localDeliveryFee,
      _manual: data.manual as any,
      _allocated_by: context.userId,
    });
    if (error) throw new Response(error.message, { status: 500 });
    return res as any;
  });

// ---------- Inventory batches for an item ----------

export const listInventoryBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    const { data: rows, error } = await context.supabase
      .from("inventory_batches")
      .select("*")
      .eq("merchant_id", data.merchantId)
      .eq("inventory_item_id", data.inventoryItemId)
      .order("received_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 500 });
    return rows ?? [];
  });
