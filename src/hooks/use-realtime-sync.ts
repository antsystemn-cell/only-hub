import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type TableName = "orders" | "delivery_requests" | "delivery_status_history" | "platform_transactions";

/**
 * Subscribe to realtime changes on one or more tables and invalidate the
 * given query keys whenever a row changes. Optionally restricts events
 * to a single merchant via the `merchant_id` column filter.
 */
export function useRealtimeSync(opts: {
  tables: TableName[];
  queryKeys: (string | undefined)[][];
  merchantId?: string | null;
  enabled?: boolean;
}) {
  const qc = useQueryClient();
  const { tables, queryKeys, merchantId, enabled = true } = opts;
  const tablesKey = tables.join(",");
  const keysKey = queryKeys.map((k) => k.join("|")).join(",");

  useEffect(() => {
    if (!enabled) return;
    const channelName = `sync:${tablesKey}:${merchantId ?? "all"}:${Math.random().toString(36).slice(2, 8)}`;
    let channel = supabase.channel(channelName);
    for (const table of tables) {
      const filter =
        merchantId && (table === "orders" || table === "delivery_requests" || table === "platform_transactions")
          ? { event: "*" as const, schema: "public", table, filter: `merchant_id=eq.${merchantId}` }
          : { event: "*" as const, schema: "public", table };
      channel = channel.on("postgres_changes" as any, filter as any, () => {
        for (const key of queryKeys) {
          qc.invalidateQueries({ queryKey: key.filter(Boolean) as string[] });
        }
      });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey, keysKey, merchantId, enabled]);
}
