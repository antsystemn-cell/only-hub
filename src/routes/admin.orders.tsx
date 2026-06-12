import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtMnt, STATUS_LABELS, STATUS_TONE, PAYMENT_STATUS_LABELS } from "@/lib/format";
import { Search, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin/orders")({ component: AdminOrdersPage });

function AdminOrdersPage() {
  const { isPlatformAdmin } = useAuth();
  const [search, setSearch] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-all-orders"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,total,status,payment_status,payment_method,guest_name,phone,merchant_id,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  const { data: merchants = [] } = useQuery({
    queryKey: ["admin-orders-merchants"],
    queryFn: async () => {
      const { data } = await supabase.from("merchants").select("id,name,slug");
      return data ?? [];
    },
  });
  const mById: Record<string, { name: string; slug: string }> = {};
  (merchants as any[]).forEach((m) => { mById[m.id] = { name: m.name, slug: m.slug }; });

  useRealtimeSync({
    tables: ["orders", "delivery_requests"],
    queryKeys: [["admin-all-orders"]],
    enabled: isPlatformAdmin,
  });

  const filtered = (orders as any[]).filter((o) =>
    !search ||
    o.id.includes(search) ||
    (o.phone ?? "").includes(search) ||
    (o.guest_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Бүх захиалга</h1>
          <p className="mt-1 text-sm text-muted-foreground">Платформ дээрх сүүлийн 500 захиалга</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ID, утас, нэр хайх..." className="w-72 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="rounded-2xl p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Огноо</th>
                <th className="px-4 py-3">Дэлгүүр</th>
                <th className="px-4 py-3">Худалдан авагч</th>
                <th className="px-4 py-3">Дүн</th>
                <th className="px-4 py-3">Төлөв</th>
                <th className="px-4 py-3">Төлбөр</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Уншиж байна...</td></tr>}
              {!isLoading && filtered.map((o: any) => {
                const m = mById[o.merchant_id];
                return (
                  <tr key={o.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("mn-MN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 font-medium">{m?.name ?? o.merchant_id.slice(0, 6)}</td>
                    <td className="px-4 py-3">
                      <div>{o.guest_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{o.phone ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{fmtMnt(o.total)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={STATUS_TONE[o.status] ?? ""}>
                        {STATUS_LABELS[o.status] ?? o.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{o.payment_method?.toUpperCase()}</div>
                      <div className={o.payment_status === "confirmed" ? "text-emerald-600" : "text-muted-foreground"}>
                        {PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m && (
                        <Link to="/store/$merchantSlug/order/$orderId" params={{ merchantSlug: m.slug, orderId: o.id }}>
                          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Захиалга олдсонгүй</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
