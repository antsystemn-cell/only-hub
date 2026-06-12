import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMnt } from "@/lib/format";
import { Store, TrendingUp, ShoppingCart, BarChart3, Clock, ChevronRight, Truck, Wallet } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid, BarChart, Bar,
} from "recharts";

export const Route = createFileRoute("/admin/")({ component: AdminOverview });

const PAID_STATUSES = new Set(["confirmed", "paid"]);
const DELIVERING_STATUSES = new Set(["assigned", "picked_up", "in_transit", "out_for_delivery", "delivering"]);
const DELIVERED_STATUSES = new Set(["delivered", "completed"]);

function AdminOverview() {
  const { isPlatformAdmin } = useAuth();

  // Real orders across all merchants — single source of truth for stats.
  const ordersQ = useQuery({
    queryKey: ["admin-overview-orders"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,merchant_id,total,status,payment_status,payment_method,delivery_status,delivery_order_id,platform_commission_amount,platform_commission_rate,guest_name,phone,created_at,paid_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      return data ?? [];
    },
  });

  const merchantsQ = useQuery({
    queryKey: ["admin-merchants-overview"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("id,name,slug,is_active,approval_status,created_at");
      return data ?? [];
    },
  });

  useRealtimeSync({
    tables: ["orders", "delivery_requests", "platform_transactions"],
    queryKeys: [["admin-overview-orders"], ["admin-merchants-overview"]],
    enabled: isPlatformAdmin,
  });

  const orders = (ordersQ.data ?? []) as any[];
  const merchants = (merchantsQ.data ?? []) as any[];
  const pendingMerchants = useMemo(() => merchants.filter((m) => m.approval_status === "pending"), [merchants]);

  const paidOrders = useMemo(() => orders.filter((o) => PAID_STATUSES.has(o.payment_status)), [orders]);
  const totalGmv = paidOrders.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const totalCommission = paidOrders.reduce((s, o) => s + Number(o.platform_commission_amount ?? 0), 0);
  const netToMerchants = totalGmv - totalCommission;
  const activeMerchants = merchants.filter((m) => m.is_active).length;
  const totalOrderCount = orders.length;
  const paidOrderCount = paidOrders.length;
  const aov = paidOrderCount ? Math.round(totalGmv / paidOrderCount) : 0;

  const deliveryOrders = useMemo(() => orders.filter((o) => o.delivery_order_id || o.delivery_status), [orders]);
  const deliveryInTransit = deliveryOrders.filter((o) => DELIVERING_STATUSES.has(o.delivery_status)).length;
  const deliveryDelivered = deliveryOrders.filter((o) => DELIVERED_STATUSES.has(o.delivery_status)).length;

  const monthlyData = useMemo(() => {
    const map: Record<string, { key: string; month: string; gmv: number; commission: number; count: number }> = {};
    for (const o of paidOrders) {
      const d = new Date(o.paid_at ?? o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}-р сар`;
      const e = (map[key] ??= { key, month: label, gmv: 0, commission: 0, count: 0 });
      e.gmv += Number(o.total ?? 0);
      e.commission += Number(o.platform_commission_amount ?? 0);
      e.count += 1;
    }
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key)).slice(-6);
  }, [paidOrders]);

  const topMerchants = useMemo(() => {
    const map: Record<string, { id: string; gmv: number; commission: number; count: number }> = {};
    for (const o of paidOrders) {
      const e = (map[o.merchant_id] ??= { id: o.merchant_id, gmv: 0, commission: 0, count: 0 });
      e.gmv += Number(o.total ?? 0);
      e.commission += Number(o.platform_commission_amount ?? 0);
      e.count += 1;
    }
    return Object.values(map).sort((a, b) => b.gmv - a.gmv).slice(0, 5).map((e) => ({
      ...e,
      name: merchants.find((m) => m.id === e.id)?.name ?? e.id.slice(0, 6),
    }));
  }, [paidOrders, merchants]);

  const recentOrders = orders.slice(0, 10);

  const cards = [
    { label: "Идэвхтэй дэлгүүр", value: `${activeMerchants} / ${merchants.length}`, icon: Store, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Нийт GMV (төлөгдсөн)", value: fmtMnt(totalGmv), icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Платформын шимтгэл", value: fmtMnt(totalCommission), icon: BarChart3, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Захиалга (нийт/төлөгдсөн)", value: `${totalOrderCount} / ${paidOrderCount}`, icon: ShoppingCart, color: "text-orange-500", bg: "bg-orange-500/10" },
  ];

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Платформын тойм</h1>
        <p className="mt-1 text-sm text-muted-foreground">Бүх дэлгүүр, захиалгын бодит нэгтгэл (real-time)</p>
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" /> Мерчантуудад төлөгдөх</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{fmtMnt(netToMerchants)}</div>
          <div className="mt-1 text-xs text-muted-foreground">GMV − платформын шимтгэл</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-sm text-muted-foreground">Дундаж захиалга (AOV)</div>
          <div className="mt-2 text-2xl font-bold">{fmtMnt(aov)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Зөвхөн төлөгдсөн захиалгаар</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-sm text-muted-foreground">Сүүлийн 24 цаг</div>
          <div className="mt-2 text-2xl font-bold">
            {orders.filter((o) => Date.now() - new Date(o.created_at).getTime() < 86400000).length}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">шинэ захиалга</div>
        </Card>
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
        <div className="mb-4 flex items-center gap-2">
          <Truck className="h-5 w-5 text-violet-500" />
          <h3 className="font-semibold">Хүргэлтийн тойм</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Хүргэлтэнд илгээсэн", value: deliveryOrders.length, color: "text-violet-600" },
            { label: "Хүргэлтэнд явж буй", value: deliveryInTransit, color: "text-blue-600" },
            { label: "Хүргэгдсэн", value: deliveryDelivered, color: "text-emerald-600" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Сүүлийн захиалгууд</h3>
          <Link to="/admin/orders"><Button variant="ghost" size="sm">Бүгд <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2">Огноо</th>
                <th className="pb-2">Дэлгүүр</th>
                <th className="pb-2">Худалдан авагч</th>
                <th className="pb-2 text-right">Дүн</th>
                <th className="pb-2 text-right">Төлбөр</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentOrders.map((o: any) => {
                const m = merchants.find((x) => x.id === o.merchant_id);
                const isPaid = PAID_STATUSES.has(o.payment_status);
                return (
                  <tr key={o.id} className="hover:bg-muted/30">
                    <td className="py-2 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("mn-MN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2 font-medium">{m?.name ?? o.merchant_id.slice(0, 6)}</td>
                    <td className="py-2 text-xs">{o.guest_name ?? "—"} <span className="text-muted-foreground">{o.phone ?? ""}</span></td>
                    <td className="py-2 text-right">{fmtMnt(o.total)}</td>
                    <td className={`py-2 text-right text-xs font-semibold ${isPaid ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {isPaid ? "Төлөгдсөн" : "Хүлээгдэж буй"}
                    </td>
                  </tr>
                );
              })}
              {recentOrders.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Захиалга алга</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
