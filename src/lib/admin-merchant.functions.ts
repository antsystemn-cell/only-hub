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
