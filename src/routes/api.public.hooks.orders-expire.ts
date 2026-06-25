// Periodic sweep for unpaid orders past their TTL.
// Call hourly with the Supabase publishable apikey.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/orders-expire")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        let minutes = 60;
        try {
          const body = (await request.json()) as { minutes?: number };
          if (body?.minutes && Number.isFinite(body.minutes)) minutes = Math.max(1, Math.min(Math.floor(body.minutes), 7 * 24 * 60));
        } catch {}
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("expire_unpaid_orders", { _minutes: minutes });
        return new Response(JSON.stringify(error ? { ok: false, error: error.message } : { ok: true, ...(data as any) }), {
          status: error ? 500 : 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
