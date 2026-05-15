import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLES = ["merchant_admin", "merchant_moderator", "merchant_driver"] as const;
type StaffRole = (typeof ROLES)[number];

async function assertOwner(supabase: any, userId: string, merchantId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("merchant_id", merchantId)
    .eq("role", "merchant_owner")
    .maybeSingle();
  if (error) throw new Response(error.message, { status: 500 });
  if (!data) {
    // Allow platform admins as well
    const { data: pa } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "platform_admin")
      .maybeSingle();
    if (!pa) throw new Response("Forbidden", { status: 403 });
  }
}

/** Look up a registered user by email (admin client). */
export const findUserByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      email: z.string().email().max(255),
      merchantId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.merchantId);
    // listUsers paginates; perPage max is 1000
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Response(error.message, { status: 500 });
    const target = data.email.trim().toLowerCase();
    const u = list.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (!u) return { found: false as const };
    return { found: true as const, userId: u.id, email: u.email ?? "" };
  });

/** List all staff (non-customer roles) for a merchant. */
export const listMerchantStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ merchantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.merchantId);
    const { data: rows, error } = await context.supabase
      .from("user_roles")
      .select("id,user_id,role,created_at")
      .eq("merchant_id", data.merchantId);
    if (error) throw new Response(error.message, { status: 500 });

    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailById = new Map<string, string>();
    list?.users.forEach((u) => { if (u.email) emailById.set(u.id, u.email); });

    return (rows ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      role: r.role as string,
      email: emailById.get(r.user_id) ?? "",
      created_at: r.created_at,
    })).filter((r) => ids.includes(r.user_id));
  });

/** Assign a staff role to an existing user. */
export const assignStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      userId: z.string().uuid(),
      role: z.enum(ROLES),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.merchantId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: data.userId, merchant_id: data.merchantId, role: data.role as StaffRole },
        { onConflict: "user_id,merchant_id,role" } as any,
      );
    if (error) throw new Response(error.message, { status: 500 });
    // Also mirror into merchant_users for legacy compatibility
    await supabaseAdmin.from("merchant_users").upsert(
      { user_id: data.userId, merchant_id: data.merchantId, role: data.role.replace("merchant_", "") },
      { onConflict: "user_id,merchant_id" } as any,
    );
    return { ok: true as const };
  });

/** Remove a staff role row. */
export const removeStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      roleRowId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.merchantId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("id", data.roleRowId)
      .eq("merchant_id", data.merchantId)
      .neq("role", "merchant_owner");
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true as const };
  });
