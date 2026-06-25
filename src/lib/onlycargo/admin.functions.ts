import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin debug: list recent OnlyCargo webhook events.
 * Platform admins only. Read-only.
 */
export const listOnlycargoWebhookEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });

    const { data: rows, error } = await context.supabase
      .from("webhook_events")
      .select(
        "id, processed_at, processing_status, error_message, event_key, merchant_id, result, payload",
      )
      .eq("provider", "onlycargo")
      .order("processed_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Response(error.message, { status: 500 });
    return { items: rows ?? [] };
  });
