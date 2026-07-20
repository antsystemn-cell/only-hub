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

const SplitLine = z.object({
  variant_id: z.string().uuid().nullable().optional(),
  received_quantity: z.number().min(0).max(1_000_000),
  damaged_quantity: z.number().min(0).max(1_000_000).optional().default(0),
  unit_cost: z.number().min(0).max(1_000_000_000).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const ReceiveItem = z.object({
  incoming_item_id: z.string().uuid(),
  received_quantity: z.number().min(0).max(1_000_000),
  damaged_quantity: z.number().min(0).max(1_000_000).optional().default(0),
  unit_cost: z.number().min(0).max(1_000_000_000).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  variant_id: z.string().uuid().nullable().optional(),
  allow_extra: z.boolean().optional().default(false),
  splits: z.array(SplitLine).max(50).optional(),
});

/**
 * Fetch product+variants context for a set of incoming items so the client can
 * do variant selection / split validation before calling receive.
 */
export const getReceiveValidationContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      productIds: z.array(z.string().uuid()).max(200),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);
    if (data.productIds.length === 0) return { variants: {} as Record<string, any[]> };
    const { data: rows, error } = await context.supabase
      .from("product_variants")
      .select("id,product_id,label,size_label,color_label,option_signature")
      .in("product_id", data.productIds);
    if (error) throw new Response(error.message, { status: 500 });
    const map: Record<string, any[]> = {};
    for (const r of rows ?? []) {
      const pid = (r as any).product_id as string;
      (map[pid] = map[pid] ?? []).push(r);
    }
    return { variants: map };
  });

const TYPED_ERROR_CODES = new Set([
  "missing_request_id",
  "incoming_item_not_found",
  "merchant_not_allowed",
  "shipment_mismatch",
  "item_cancelled",
  "variant_required",
  "invalid_variant",
  "qty_exceeded",
  "invalid_quantity",
  "invalid_unit_cost",
  "duplicate_request",
  "inventory_locked",
]);

function mapReceiveError(msg: string): { code: string; status: number } {
  const raw = String(msg || "").trim();
  const first = raw.split(/[:\n]/)[0]?.trim() ?? raw;
  if (TYPED_ERROR_CODES.has(first)) {
    return { code: first, status: first === "merchant_not_allowed" ? 403 : 409 };
  }
  if (/could not serialize|deadlock|lock/i.test(raw)) {
    return { code: "inventory_locked", status: 409 };
  }
  return { code: "receive_failed", status: 500 };
}

export const receiveIncomingCargoItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumber: z.string().trim().min(1).max(80),
      requestId: z.string().uuid().optional(),
      items: z.array(ReceiveItem).min(1).max(200),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId, data.merchantId);

    // Fallback UUID so legacy clients still get single-flight idempotency
    // within one request lifecycle.
    const requestId = data.requestId ?? crypto.randomUUID();

    const { data: res, error } = await context.supabase.rpc(
      "receive_incoming_cargo_items_v2",
      {
        _merchant_id: data.merchantId,
        _track_number: data.trackNumber,
        _received_by: context.userId,
        _items: data.items as any,
        _request_id: requestId,
      },
    );

    if (error) {
      const mapped = mapReceiveError(error.message);
      throw new Response(mapped.code, { status: mapped.status });
    }
    return { ...(res as any), request_id: requestId };
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
