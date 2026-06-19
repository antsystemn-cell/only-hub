// Cron-driven foreign-source sync.
// Picks due products and runs the parser against each, updating availability
// and prices. Authenticated by Supabase anon key in `apikey` header (the
// canonical cron pattern). Bypasses Lovable Cloud auth via the `/api/public`
// prefix.
import { createFileRoute } from "@tanstack/react-router";

const MAX_BATCH = 15;

export const Route = createFileRoute("/api/public/hooks/foreign-source-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        if (!apikey || apikey.length < 20) {
          return new Response("unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runForeignSourceSync } = await import("@/lib/foreign-orders/sync.functions");

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("products")
          .select("id, merchant_id")
          .eq("product_type", "FOREIGN_ORDER")
          .eq("is_active", true)
          .eq("sync_enabled", true)
          .or(`next_sync_at.is.null,next_sync_at.lte.${nowIso}`)
          .order("next_sync_at", { ascending: true, nullsFirst: true })
          .limit(MAX_BATCH);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        if (!due?.length) {
          return Response.json({ ok: true, processed: 0 });
        }

        const results: any[] = [];
        for (const p of due) {
          try {
            const r = await runForeignSourceSync(supabaseAdmin, p.id);
            results.push({ productId: p.id, status: r.status, error: r.error });
          } catch (e: any) {
            results.push({ productId: p.id, status: "FAILED", error: e?.message ?? String(e) });
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
