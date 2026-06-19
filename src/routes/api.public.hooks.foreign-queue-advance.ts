// Automated foreign-order queue processor — advances items through the
// pipeline based on elapsed time since their last status change.
//
// Conservative defaults — operators can still flip statuses manually in the
// merchant dashboard. The processor never moves items into terminal states
// (DELIVERED / REFUNDED / CANCELLED / SOURCE_PURCHASE_FAILED) or out of
// WAITING_SOURCE_PURCHASE (requires human action to confirm purchase).
import { createFileRoute } from "@tanstack/react-router";

type Status =
  | "WAITING_SOURCE_PURCHASE"
  | "SOURCE_PURCHASED"
  | "KOREA_WAREHOUSE_RECEIVED"
  | "INTERNATIONAL_TRANSIT"
  | "UB_ARRIVED"
  | "DELIVERY_ASSIGNED";

// Time-in-status thresholds (hours) before auto-advancing.
const ADVANCE_RULES: Record<Status, { next: Status; afterHours: number } | null> = {
  WAITING_SOURCE_PURCHASE: null, // requires human confirmation
  SOURCE_PURCHASED: { next: "KOREA_WAREHOUSE_RECEIVED", afterHours: 48 },
  KOREA_WAREHOUSE_RECEIVED: { next: "INTERNATIONAL_TRANSIT", afterHours: 24 },
  INTERNATIONAL_TRANSIT: { next: "UB_ARRIVED", afterHours: 24 * 7 },
  UB_ARRIVED: { next: "DELIVERY_ASSIGNED", afterHours: 12 },
  DELIVERY_ASSIGNED: null, // local delivery flow takes over
};

export const Route = createFileRoute("/api/public/hooks/foreign-queue-advance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Lightweight protection — require Supabase anon key as apikey header.
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const advanceable = (Object.keys(ADVANCE_RULES) as Status[]).filter(
          (s) => ADVANCE_RULES[s] !== null,
        );

        const { data: rows, error } = await supabaseAdmin
          .from("source_purchase_queue")
          .select("id,status,updated_at")
          .in("status", advanceable as any);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const now = Date.now();
        const transitions: { id: string; from: Status; to: Status }[] = [];
        for (const row of rows ?? []) {
          const rule = ADVANCE_RULES[row.status as Status];
          if (!rule) continue;
          const last = new Date(row.updated_at).getTime();
          const elapsedH = (now - last) / 36e5;
          if (elapsedH >= rule.afterHours) {
            transitions.push({ id: row.id, from: row.status as Status, to: rule.next });
          }
        }

        // Batch by target status to minimize round-trips.
        const byTarget = new Map<Status, string[]>();
        for (const t of transitions) {
          const list = byTarget.get(t.to) ?? [];
          list.push(t.id);
          byTarget.set(t.to, list);
        }

        let updated = 0;
        for (const [target, ids] of byTarget) {
          const { error: uErr, count } = await supabaseAdmin
            .from("source_purchase_queue")
            .update({ status: target as any }, { count: "exact" })
            .in("id", ids);
          if (uErr) {
            console.error("[foreign-queue-advance] update failed", target, uErr.message);
            continue;
          }
          updated += count ?? ids.length;
        }

        // When an item reaches DELIVERY_ASSIGNED and the parent order has no
        // local delivery request yet, kick one off. This is the moment the
        // foreign-order pipeline hands control back to the delivery system.
        const readyForDelivery = transitions.filter((t) => t.to === "DELIVERY_ASSIGNED");
        let deliveryCreated = 0;
        if (readyForDelivery.length) {
          const ids = readyForDelivery.map((t) => t.id);
          const { data: queued } = await supabaseAdmin
            .from("source_purchase_queue")
            .select("order_id")
            .in("id", ids);
          const orderIds = Array.from(new Set((queued ?? []).map((q) => q.order_id)));
          try {
            const { createDeliveryRequest } = await import("@/lib/delivery/delivery.service");
            for (const orderId of orderIds) {
              const res = await createDeliveryRequest({ orderId });
              if (res?.ok && !(res as any).alreadyExists) deliveryCreated += 1;
            }
          } catch (e) {
            console.error("[foreign-queue-advance] delivery handoff failed", e);
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            scanned: rows?.length ?? 0,
            advanced: updated,
            deliveryCreated,
            transitions: transitions.length,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
