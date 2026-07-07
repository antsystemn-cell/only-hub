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

    // Load incoming items + product variant info in one shot.
    const ids = data.items.map((i) => i.incoming_item_id);
    const { data: incomingRows, error: incErr } = await context.supabase
      .from("incoming_cargo_items")
      .select("id,product_id,variant_id,planned_quantity,received_quantity,damaged_quantity,planned_product_name,planned_unit_cost,notes,track_number,merchant_id,status")
      .eq("merchant_id", data.merchantId)
      .in("id", ids);
    if (incErr) throw new Response(incErr.message, { status: 500 });

    const incomingById = new Map<string, any>();
    const productIds = new Set<string>();
    for (const r of incomingRows ?? []) {
      incomingById.set(r.id as string, r);
      if (r.product_id) productIds.add(r.product_id as string);
    }

    // Fetch variants for those products (for validation only).
    let variantsByProduct: Record<string, any[]> = {};
    if (productIds.size > 0) {
      const { data: vrows, error: vErr } = await context.supabase
        .from("product_variants")
        .select("id,product_id")
        .in("product_id", Array.from(productIds));
      if (vErr) throw new Response(vErr.message, { status: 500 });
      for (const v of vrows ?? []) {
        const pid = v.product_id as string;
        (variantsByProduct[pid] = variantsByProduct[pid] ?? []).push(v);
      }
    }

    // Validate every line + build the sub-item plan.
    // Plan entry: { incoming_item_id, received_quantity, damaged_quantity, unit_cost, notes }
    // For splits we may need to create additional incoming_cargo_items rows first.
    type Plan = {
      incoming_item_id: string;
      received_quantity: number;
      damaged_quantity: number;
      unit_cost: number | null;
      notes: string | null;
    };
    const plan: Plan[] = [];
    const toUpdateVariant: Array<{ id: string; variant_id: string | null }> = [];
    const toCreateExtras: Array<{
      base: any;
      variant_id: string | null;
      quantity: number;
      unit_cost: number | null;
      notes: string | null;
      received_quantity: number;
      damaged_quantity: number;
    }> = [];

    for (const it of data.items) {
      const inc = incomingById.get(it.incoming_item_id);
      if (!inc) throw new Response("incoming_item_not_found", { status: 400 });
      if (inc.status === "cancelled") throw new Response("item_cancelled", { status: 400 });

      const hasVariants =
        !!inc.product_id && (variantsByProduct[inc.product_id]?.length ?? 0) > 0;
      const validVariantIds = new Set(
        (variantsByProduct[inc.product_id ?? ""] ?? []).map((v: any) => v.id),
      );

      const planned = Number(inc.planned_quantity ?? 0);
      const alreadyReceived = Number(inc.received_quantity ?? 0) + Number(inc.damaged_quantity ?? 0);
      const remaining = Math.max(0, planned - alreadyReceived);

      const splits = it.splits && it.splits.length > 0 ? it.splits : null;

      if (splits) {
        // Splits mode: each split becomes a separate receive line.
        // Sum of split (recv+damaged) must respect remaining unless allow_extra.
        const totalSplit = splits.reduce(
          (s, l) => s + Number(l.received_quantity || 0) + Number(l.damaged_quantity || 0),
          0,
        );
        if (!it.allow_extra && totalSplit > remaining) {
          throw new Response(
            `split_exceeds_remaining:${inc.planned_product_name}`,
            { status: 400 },
          );
        }
        // Every split needs a valid variant if product has variants.
        for (const l of splits) {
          if (hasVariants) {
            if (!l.variant_id) {
              throw new Response(
                `variant_required:${inc.planned_product_name}`,
                { status: 400 },
              );
            }
            if (!validVariantIds.has(l.variant_id)) {
              throw new Response("invalid_variant", { status: 400 });
            }
          }
          if (l.unit_cost != null && l.unit_cost < 0) {
            throw new Response("invalid_unit_cost", { status: 400 });
          }
        }

        // Strategy: first split reuses the base incoming item (update its
        // variant + planned_quantity to first-split total). Remaining splits
        // create new incoming items sharing product_id / track_number.
        const first = splits[0];
        const firstQty = Number(first.received_quantity || 0) + Number(first.damaged_quantity || 0);

        // Update base row to first split variant + adjusted planned qty.
        const { error: upErr } = await context.supabase
          .from("incoming_cargo_items")
          .update({
            variant_id: first.variant_id ?? inc.variant_id ?? null,
            planned_quantity: Math.max(alreadyReceived + firstQty, 0),
          })
          .eq("id", inc.id)
          .eq("merchant_id", data.merchantId);
        if (upErr) throw new Response(upErr.message, { status: 500 });

        plan.push({
          incoming_item_id: inc.id,
          received_quantity: Number(first.received_quantity || 0),
          damaged_quantity: Number(first.damaged_quantity || 0),
          unit_cost: first.unit_cost ?? it.unit_cost ?? null,
          notes: first.notes ?? it.notes ?? null,
        });

        for (let idx = 1; idx < splits.length; idx++) {
          const l = splits[idx];
          const qty = Number(l.received_quantity || 0) + Number(l.damaged_quantity || 0);
          const { data: newRow, error: cErr } = await context.supabase
            .from("incoming_cargo_items")
            .insert({
              merchant_id: data.merchantId,
              track_number: inc.track_number,
              product_id: inc.product_id,
              variant_id: l.variant_id ?? null,
              planned_product_name: inc.planned_product_name,
              planned_quantity: qty,
              planned_unit_cost: l.unit_cost ?? inc.planned_unit_cost ?? null,
              notes: l.notes ?? null,
              status: "ready_to_receive",
              created_by: context.userId,
            })
            .select("id")
            .single();
          if (cErr) throw new Response(cErr.message, { status: 500 });
          plan.push({
            incoming_item_id: newRow!.id as string,
            received_quantity: Number(l.received_quantity || 0),
            damaged_quantity: Number(l.damaged_quantity || 0),
            unit_cost: l.unit_cost ?? it.unit_cost ?? null,
            notes: l.notes ?? it.notes ?? null,
          });
        }
      } else {
        // Non-split path.
        const recv = Number(it.received_quantity || 0);
        const dmg = Number(it.damaged_quantity || 0);
        if (recv === 0 && dmg === 0) continue;

        // Variant validation.
        const effectiveVariant = it.variant_id ?? inc.variant_id ?? null;
        if (hasVariants) {
          if (!effectiveVariant) {
            throw new Response(
              `variant_required:${inc.planned_product_name}`,
              { status: 400 },
            );
          }
          if (!validVariantIds.has(effectiveVariant)) {
            throw new Response("invalid_variant", { status: 400 });
          }
        }
        if (!it.allow_extra && recv + dmg > remaining) {
          throw new Response(
            `exceeds_remaining:${inc.planned_product_name}`,
            { status: 400 },
          );
        }
        if (it.unit_cost != null && it.unit_cost < 0) {
          throw new Response("invalid_unit_cost", { status: 400 });
        }

        // If merchant chose/overrode variant, persist it on the incoming item
        // so downstream inventory sync routes correctly.
        if (it.variant_id !== undefined && it.variant_id !== inc.variant_id) {
          toUpdateVariant.push({ id: inc.id, variant_id: it.variant_id ?? null });
        }

        plan.push({
          incoming_item_id: inc.id,
          received_quantity: recv,
          damaged_quantity: dmg,
          unit_cost: it.unit_cost ?? null,
          notes: it.notes ?? null,
        });
      }
    }

    if (plan.length === 0) {
      return { ok: true, items_received: 0, total_units: 0, total_damaged: 0, inventory_updated: 0, pending_planned: 0 };
    }

    // Persist variant overrides.
    for (const u of toUpdateVariant) {
      const { error } = await context.supabase
        .from("incoming_cargo_items")
        .update({ variant_id: u.variant_id })
        .eq("id", u.id)
        .eq("merchant_id", data.merchantId);
      if (error) throw new Response(error.message, { status: 500 });
    }

    const { data: res, error } = await context.supabase.rpc(
      "receive_incoming_cargo_items",
      {
        _merchant_id: data.merchantId,
        _track_number: data.trackNumber,
        _received_by: context.userId,
        _items: plan as any,
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
