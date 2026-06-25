// Sweep stale unpaid orders. Releases inventory + legacy reservations and
// marks the order as expired. Safe / idempotent — called by cron.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const expireUnpaidOrders = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ minutes: z.number().int().min(1).max(7 * 24 * 60).default(60) }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const { data: res, error } = await supabaseAdmin.rpc("expire_unpaid_orders", {
      _minutes: data.minutes,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, ...(res as any) };
  });
