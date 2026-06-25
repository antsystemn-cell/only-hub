// Periodic sweep that expires unpaid inventory reservations past their TTL.
// Call hourly (or more often) from a cron with the Supabase anon `apikey`.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/inventory-reservations-expire")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { expireAll } = await import("@/lib/inventory/reservation.server");
        const res = await expireAll();
        return new Response(JSON.stringify(res), {
          status: res.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
