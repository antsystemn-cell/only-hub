// Source purchase queue — merchant-side server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STATUSES = z.enum([
  "PAID",
  "WAITING_SOURCE_PURCHASE",
  "SOURCE_PURCHASED",
  "KOREA_WAREHOUSE_RECEIVED",
  "INTERNATIONAL_TRANSIT",
  "UB_ARRIVED",
  "DELIVERY_ASSIGNED",
  "DELIVERED",
  "SOURCE_PURCHASE_FAILED",
  "REFUNDED",
  "CANCELLED",
]);

export const listSourcePurchaseQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { merchantId: string; status?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("source_purchase_queue")
      .select("*, orders:order_id(external_ref, guest_name, phone, total, paid_at)")
      .eq("merchant_id", data.merchantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status as any);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateSourcePurchaseQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: STATUSES.optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, any> = {};
    if (data.status) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { data: row, error } = await supabase
      .from("source_purchase_queue")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
