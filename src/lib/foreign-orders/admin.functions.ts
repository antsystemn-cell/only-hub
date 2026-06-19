// Admin-only foreign-order management: list across merchants + totals.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "platform_admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden: platform admin only");
}

const filterSchema = z.object({
  status: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  merchantId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const adminListForeignQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("source_purchase_queue")
      .select(
        "*, merchants:merchant_id(id,name,slug), orders:order_id(external_ref,guest_name,phone,total,paid_at,platform_commission_amount,platform_commission_rate)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status as any);
    if (data.source) q = q.eq("source", data.source as any);
    if (data.merchantId) q = q.eq("merchant_id", data.merchantId);
    if (data.search) q = q.or(`source_url.ilike.%${data.search}%,notes.ilike.%${data.search}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Aggregate totals across the filtered set
    const totals = (rows ?? []).reduce(
      (acc, r: any) => {
        acc.count += 1;
        acc.gmvMnt += Number(r.customer_paid_price_mnt ?? 0);
        acc.sourceCostMnt += Number(r.source_price_mnt ?? 0);
        if (r.orders?.platform_commission_amount != null) {
          acc.commissionMnt += Number(r.orders.platform_commission_amount);
        }
        return acc;
      },
      { count: 0, gmvMnt: 0, sourceCostMnt: 0, commissionMnt: 0 },
    );

    return { rows: rows ?? [], totals };
  });
