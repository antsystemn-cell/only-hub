import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMnt } from "@/lib/format";
import { Store, TrendingUp, ShoppingCart, BarChart3, Clock, ChevronRight, Truck } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid, BarChart, Bar,
} from "recharts";

export const Route = createFileRoute("/admin/")({ component: AdminOverview });

function AdminOverview() {
  const { isPlatformAdmin } = useAuth();

  const txQ = useQuery({
    queryKey: ["admin-tx-overview"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_transactions")
        .select("id,merchant_id,order_total,commission_amount,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  const merchantsQ = useQuery({
    queryKey: ["admin-merchants-overview"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("id,name,is_active,approval_status,created_at");
      return data ?? [];
    },
  });

  const deliveryQ = useQuery({
    queryKey: ["admin-delivery-overview"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,delivery_order_id,delivery_status")
        .not("delivery_order_id", "is", null);
      return data ?? [];
    },
  });
  const deliveryOrders = (deliveryQ.data ?? []) as any[];

  const txs = (txQ.data ?? []) as any[];
  const merchants = (merchantsQ.data ?? []) as any[];
  const pendingMerchants = useMemo(() => merchants.filter((m) => m.approval_status === "pending"), [merchants]);
  const totalGmv = txs.reduce((s, t) => s + Number(t.order_total), 0);
  const totalCommission = txs.reduce((s, t) => s + Number(t.commission_amount), 0);
  const activeMerchants = merchants.filter((m) => m.is_active).length;

  const monthlyData = useMemo(() => {
    const map: Record<string, { month: string; gmv: number; commission: number; count: number }> = {};
    for (const t of txs) {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}-р сар`;
      const e = (map[key] ??= { month: label, gmv: 0, commission: 0, count: 0 });
      e.gmv += Number(t.order_total);
      e.commission += Number(t.commission_amount);
      e.count += 1;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, v]) => v);
  }, [txs]);

  const topMerchants = useMemo(() => {
    const map: Record<string, { id: string; gmv: number; commission: number; count: number }> = {};
    for (const t of txs) {
      const e = (map[t.merchant_id] ??= { id: t.merchant_id, gmv: 0, commission: 0, count: 0 });
      e.gmv += Number(t.order_total); e.commission += Number(t.commission_amount); e.count += 1;
    }
    return Object.values(map).sort((a, b) => b.gmv - a.gmv).slice(0, 5).map((e) => ({
      ...e,
      name: merchants.find((m) => m.id === e.id)?.name ?? e.id.slice(0, 6),
    }));
  }, [txs, merchants]);

  const cards = [
    { label: "Идэвхтэй дэлгүүр", value: `${activeMerchants} / ${merchants.length}`, icon: Store, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Нийт GMV", value: fmtMnt(totalGmv), icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Шимтгэлийн орлого", value: fmtMnt(totalCommission), icon: BarChart3, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Нийт гүйлгээ", value: String(txs.length), icon: ShoppingCart, color: "text-orange-500", bg: "bg-orange-500/10" },
  ];

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Платформын тойм</h1>
        <p className="mt-1 text-sm text-muted-foreground">Бүх дэлгүүр, гүйлгээний нэгтгэл</p>
      </div>

      {pendingMerchants.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-amber-300/50 bg-amber-50/40 px-5 py-3 dark:bg-amber-950/20">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 shrink-0 text-amber-500" />
            <p className="text-sm font-medium">
              <span className="font-bold text-amber-600">{pendingMerchants.length}</span> дэлгүүр баталгаажуулалт хүлээж байна
            </p>
          </div>
          <Link to="/admin/merchants">
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
              Харах <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="rounded-2xl p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <p className="mt-2 text-2xl font-bold">{c.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.bg}`}>
                  <Icon className={`h-5 w-5 ${c.color}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Сарын GMV / Шимтгэл</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="comGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
              <Tooltip formatter={(v: any, n: string) => [fmtMnt(Number(v)), n === "gmv" ? "GMV" : "Шимтгэл"]} />
              <Area type="monotone" dataKey="gmv" stroke="var(--chart-1)" fill="url(#gmvGrad)" strokeWidth={2} name="gmv" />
              <Area type="monotone" dataKey="commission" stroke="var(--chart-2)" fill="url(#comGrad)" strokeWidth={2} name="commission" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Шилдэг 5 дэлгүүр (GMV)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topMerchants} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v: any) => fmtMnt(Number(v))} />
              <Bar dataKey="gmv" fill="var(--chart-1)" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Сүүлийн гүйлгээнүүд</h3>
          <Link to="/admin/analytics"><Button variant="ghost" size="sm">Бүгд <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2">Огноо</th>
                <th className="pb-2">Дэлгүүр</th>
                <th className="pb-2 text-right">GMV</th>
                <th className="pb-2 text-right">Шимтгэл</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {txs.slice(0, 8).map((t) => {
                const m = merchants.find((x) => x.id === t.merchant_id);
                return (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="py-2 text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("mn-MN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2 font-medium">{m?.name ?? t.merchant_id.slice(0, 6)}</td>
                    <td className="py-2 text-right">{fmtMnt(t.order_total)}</td>
                    <td className="py-2 text-right font-semibold text-emerald-600">{fmtMnt(t.commission_amount)}</td>
                  </tr>
                );
              })}
              {txs.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Гүйлгээ алга</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
