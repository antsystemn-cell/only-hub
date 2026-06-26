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

const ReceiveItem = z.object({
  incoming_item_id: z.string().uuid(),
  received_quantity: z.number().min(0).max(1_000_000),
  damaged_quantity: z.number().min(0).max(1_000_000).optional().default(0),
  unit_cost: z.number().min(0).max(1_000_000_000).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const receiveIncomingCargoItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumber: z.string().trim().min(1).max(80),
      items: z.array(ReceiveItem).min(1).max(200),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    const payload = data.items.map((i) => ({
      incoming_item_id: i.incoming_item_id,
      received_quantity: i.received_quantity,
      damaged_quantity: i.damaged_quantity ?? 0,
      unit_cost: i.unit_cost ?? null,
      notes: i.notes ?? null,
    }));
    const { data: res, error } = await context.supabase.rpc(
      "receive_incoming_cargo_items",
      {
        _merchant_id: data.merchantId,
        _track_number: data.trackNumber,
        _received_by: context.userId,
        _items: payload as any,
      },
    );
    if (error) throw new Response(error.message, { status: 500 });
    return res as any;
  });

export const listIncomingCargoReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumber: z.string().trim().min(1).max(80),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    const { data: rows, error } = await context.supabase
      .from("incoming_cargo_receipts")
      .select("*")
      .eq("merchant_id", data.merchantId)
      .eq("track_number", data.trackNumber)
      .order("created_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 500 });
    return rows ?? [];
  });
