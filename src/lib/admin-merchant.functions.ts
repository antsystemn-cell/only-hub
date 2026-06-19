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

/** Create a brand-new auth user and assign merchant_admin to a merchant. */
export const createMerchantAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      email: z.string().email().max(255),
      password: z.string().min(6).max(72),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);

    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const target = data.email.trim().toLowerCase();
    let userId = list.data.users.find((u) => (u.email ?? "").toLowerCase() === target)?.id;

    if (!userId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      });
      if (error || !created.user) throw new Response(error?.message ?? "Хэрэглэгч үүсгэх алдаа", { status: 500 });
      userId = created.user.id;
    }

    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("merchant_id", data.merchantId)
      .eq("role", "merchant_admin")
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId, merchant_id: data.merchantId, role: "merchant_admin",
      });
      if (error) throw new Response(error.message, { status: 500 });
    }

    const { data: muExisting } = await supabaseAdmin
      .from("merchant_users")
      .select("id")
      .eq("user_id", userId)
      .eq("merchant_id", data.merchantId)
      .maybeSingle();
    if (!muExisting) {
      await supabaseAdmin.from("merchant_users").insert({
        user_id: userId, merchant_id: data.merchantId, role: "admin",
      });
    }

    return { ok: true as const, userId };
  });

/** Assign merchant_admin role to an EXISTING auth user (by userId). */
export const assignMerchantAdminByUserId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      userId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);

    // Verify user exists
    const { data: userResp, error: userErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (userErr || !userResp.user) throw new Response("Хэрэглэгч олдсонгүй", { status: 404 });

    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", data.userId)
      .eq("merchant_id", data.merchantId)
      .eq("role", "merchant_admin")
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin.from("user_roles").insert({
        user_id: data.userId, merchant_id: data.merchantId, role: "merchant_admin",
      });
      if (error) throw new Response(error.message, { status: 500 });
    }

    const { data: muExisting } = await supabaseAdmin
      .from("merchant_users")
      .select("id")
      .eq("user_id", data.userId)
      .eq("merchant_id", data.merchantId)
      .maybeSingle();
    if (!muExisting) {
      await supabaseAdmin.from("merchant_users").insert({
        user_id: data.userId, merchant_id: data.merchantId, role: "admin",
      });
    }

    return { ok: true as const, userId: data.userId, email: userResp.user.email ?? null };
  });

/** List all auth users (lightweight) — platform admins only. */
export const listAuthUsersLite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Response(error.message, { status: 500 });
    return {
      users: data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })),
    };
  });
