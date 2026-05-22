import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertPlatformAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "platform_admin")
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

/** List all auth users with their roles + merchant assignments. */
export const listAllUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);

    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Response(error.message, { status: 500 });

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("id,user_id,role,merchant_id,created_at");

    const { data: merchants } = await supabaseAdmin
      .from("merchants")
      .select("id,name,slug");

    return {
      users: list.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })),
      roles: roles ?? [],
      merchants: merchants ?? [],
    };
  });

/** Grant platform_admin role to an existing user (by email). */
export const grantPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ email: z.string().email().max(255) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);

    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const target = data.email.trim().toLowerCase();
    const user = list.data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (!user) throw new Response("Хэрэглэгч олдсонгүй", { status: 404 });

    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "platform_admin")
      .is("merchant_id", null)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: user.id, role: "platform_admin", merchant_id: null });
      if (error) throw new Response(error.message, { status: 500 });
    }
    return { ok: true as const, userId: user.id };
  });

/** Remove a role row by id. */
export const removeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ roleId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("user_roles").delete().eq("id", data.roleId);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true as const };
  });
