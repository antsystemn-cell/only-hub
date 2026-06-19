// Platform-admin foreign-source sync dashboard data.
// Lists sync state + recent jobs + price/availability change history across all merchants.
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
  merchantId: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const adminListForeignSyncProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("products")
      .select(
        "id,name,source_url,foreign_source,sync_enabled,sync_frequency_hours,last_source_sync_at,next_sync_at,source_sync_status,source_sync_error,sync_failure_count,low_stock_warning,merchant_id,merchants:merchant_id(id,name,slug)",
      )
      .eq("product_type", "FOREIGN_ORDER")
      .order("last_source_sync_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    if (data.status) q = q.eq("source_sync_status", data.status as any);
    if (data.merchantId) q = q.eq("merchant_id", data.merchantId);
    if (data.search) q = q.or(`name.ilike.%${data.search}%,source_url.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const totals = (rows ?? []).reduce(
      (a, r: any) => {
        a.total++;
        if (r.source_sync_status === "OK") a.ok++;
        else if (r.source_sync_status === "FAILED") a.failed++;
        else if (r.source_sync_status === "NEEDS_REVIEW") a.review++;
        if (!r.sync_enabled) a.paused++;
        return a;
      },
      { total: 0, ok: 0, failed: 0, review: 0, paused: 0 },
    );
    return { rows: rows ?? [], totals };
  });

const jobsSchema = z.object({
  merchantId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const adminListAllForeignSyncJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jobsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("foreign_source_sync_jobs")
      .select(
        "*, products:product_id(name,source_url), merchants:merchant_id(name,slug)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.merchantId) q = q.eq("merchant_id", data.merchantId);
    if (data.status) q = q.eq("status", data.status as any);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const changesSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
});

export const adminListForeignPriceChanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => changesSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Variants where source price recently changed.
    const { data: rows, error } = await supabaseAdmin
      .from("product_variants")
      .select(
        "id,label,size_label,color_label,source_price,previous_source_price,source_currency,source_price_mnt,rounded_customer_price_mnt,availability_status,price_review_required,last_price_sync_at,product_id,products:product_id(name,merchant_id,merchants:merchant_id(name,slug))",
      )
      .not("previous_source_price", "is", null)
      .order("last_price_sync_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
