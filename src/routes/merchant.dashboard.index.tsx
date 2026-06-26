import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMnt, STATUS_LABELS } from "@/lib/format";
import { getMerchantCargoCounts } from "@/lib/onlycargo/cargo.functions";
import {
  Package, ShoppingCart, TrendingUp, Users, Wallet, BadgePercent,
  CalendarDays, CalendarRange, Clock, Truck, CheckCircle2, AlertTriangle,
  Boxes, PackageCheck, Link2,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

export const Route = createFileRoute("/merchant/dashboard/")({
  component: StatsPage,
});

const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

type SalesPeriod = "today" | "7d" | "month" | "custom";

const DELIVERY_LABELS: Record<string, string> = {
  pending: "Хүлээгдэж буй",
  assigned: "Хуваарилагдсан",
  in_transit: "Хүргэлтэнд",
  delivered: "Хүргэгдсэн",
  cancelled: "Цуцлагдсан",
};

function StatsPage() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;
  const [period, setPeriod] = useState<SalesPeriod>("7d");
  const cargoCountsFn = useServerFn(getMerchantCargoCounts);

  const { data, isLoading } = useQuery({
    queryKey: ["stats", merchantId],
    queryFn: async () => {
      const [products, orders, inventory, delivery, links] = await Promise.all([
        supabase.from("products")
          .select("id,name,sales,category,price,stock_quantity,low_stock_warning,image_url")
          .eq("merchant_id", merchantId),
        supabase.from("orders")
          .select("id,total,status,payment_status,phone,created_at,platform_commission_amount,items")
          .eq("merchant_id", merchantId),
        supabase.from("inventory_items")
          .select("id,name,quantity_on_hand,quantity_reserved,quantity_available,status")
          .eq("merchant_id", merchantId),
        supabase.from("delivery_requests")
          .select("id,status,created_at")
          .eq("merchant_id", merchantId),
        supabase.from("inventory_product_links")
          .select("product_id").eq("merchant_id", merchantId),
      ]);
      return {
        products: products.data ?? [],
        orders: orders.data ?? [],
        inventory: inventory.data ?? [],
        delivery: delivery.data ?? [],
        links: links.data ?? [],
      };
    },
  });

  const { data: cargoCounts } = useQuery({
    queryKey: ["stats-cargo-counts", merchantId],
    queryFn: () => cargoCountsFn({ data: { merchantId } }).catch(() => ({} as Record<string, number>)),
    staleTime: 60_000,
  });

  useRealtimeSync({
    tables: ["orders", "delivery_requests", "inventory_items"],
    queryKeys: [["stats", merchantId]],
    merchantId,
    enabled: !!merchantId,
  });

  const products = data?.products ?? [];
  const orders = data?.orders ?? [];
  const inventory = data?.inventory ?? [];
  const delivery = data?.delivery ?? [];
  const linkedProductIds = useMemo(
    () => new Set((data?.links ?? []).map((l: any) => l.product_id)),
    [data?.links],
  );

  const paid = orders.filter((o: any) => o.payment_status === "confirmed" || o.status === "completed");
  const totalRevenue = paid.reduce((s: number, o: any) => s + Number(o.total), 0);
  const totalCommission = paid.reduce((s: number, o: any) => s + Number(o.platform_commission_amount ?? 0), 0);
  const netRevenue = totalRevenue - totalCommission;
  const customers = new Set(orders.map((o: any) => o.phone).filter(Boolean)).size;

  // Today / 7d / month
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start7d = startToday - 6 * 86400000;
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const todayOrders = orders.filter((o: any) => new Date(o.created_at).getTime() >= startToday);
  const week = orders.filter((o: any) => new Date(o.created_at).getTime() >= start7d);
  const monthOrders = orders.filter((o: any) => new Date(o.created_at).getTime() >= startMonth);
  const todaySales = todayOrders
    .filter((o: any) => o.payment_status === "confirmed" || o.status === "completed")
    .reduce((s: number, o: any) => s + Number(o.total), 0);
  const monthSales = monthOrders
    .filter((o: any) => o.payment_status === "confirmed" || o.status === "completed")
    .reduce((s: number, o: any) => s + Number(o.total), 0);
  const aov = paid.length ? Math.round(totalRevenue / paid.length) : 0;

  // Status counters
  const awaitingPayment = orders.filter((o: any) => o.payment_status !== "confirmed" && o.status !== "cancelled" && o.status !== "completed").length;
  const inDelivery = orders.filter((o: any) => o.status === "delivering").length;
  const completedOrders = orders.filter((o: any) => o.status === "completed").length;

  // Inventory summary
  const invTotal = inventory.reduce((s: number, i: any) => s + Number(i.quantity_on_hand ?? 0), 0);
  const invReserved = inventory.reduce((s: number, i: any) => s + Number(i.quantity_reserved ?? 0), 0);
  const invAvailable = inventory.reduce(
    (s: number, i: any) => s + Number(i.quantity_available ?? Math.max(0, (i.quantity_on_hand ?? 0) - (i.quantity_reserved ?? 0))),
    0,
  );
  const lowStockProducts = products.filter((p: any) => p.low_stock_warning || Number(p.stock_quantity ?? 0) <= 3);
  const lowStockInv = inventory.filter((i: any) => Number(i.quantity_available ?? 0) <= 3).length;

  // Cargo
  const cargoInTransit = (cargoCounts?.in_transit ?? 0) + (cargoCounts?.created ?? 0);
  const cargoArrived = cargoCounts?.arrived ?? 0;
  const cargoReady = cargoCounts?.ready_for_pickup ?? 0;
  const cargoTotal = cargoInTransit + cargoArrived + cargoReady;

  // Delivery summary
  const deliveryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of delivery) m[(d as any).status] = (m[(d as any).status] ?? 0) + 1;
    return m;
  }, [delivery]);

  // Sales chart data based on period
  const salesChart = useMemo(() => {
    if (period === "today") {
      const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${h}:00`, revenue: 0 }));
      for (const o of paid as any[]) {
        const t = new Date(o.created_at);
        if (t.getTime() >= startToday) buckets[t.getHours()].revenue += Number(o.total);
      }
      return buckets;
    }
    if (period === "month") {
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const buckets = Array.from({ length: days }, (_, i) => ({ label: `${i + 1}`, revenue: 0 }));
      for (const o of paid as any[]) {
        const t = new Date(o.created_at);
        if (t.getTime() >= startMonth) buckets[t.getDate() - 1].revenue += Number(o.total);
      }
      return buckets;
    }
    // 7d
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startToday - (6 - i) * 86400000);
      return { label: d.toLocaleDateString("mn-MN", { month: "short", day: "numeric" }), revenue: 0, ts: d.getTime() };
    });
    for (const o of paid as any[]) {
      const t = new Date(o.created_at).getTime();
      if (t >= start7d) {
        const idx = Math.min(6, Math.floor((t - start7d) / 86400000));
        if (buckets[idx]) buckets[idx].revenue += Number(o.total);
      }
    }
    return buckets;
  }, [paid, period, startToday, startMonth, start7d, now]);

  // Top selling products
  const top5 = [...products]
    .sort((a: any, b: any) => (b.sales ?? 0) - (a.sales ?? 0))
    .slice(0, 5);

  // Revenue per product
  const revenueByProduct = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; qty: number }> = {};
    for (const o of paid as any[]) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const key = it.id || it.product_id || it.name;
        if (!key) continue;
        const e = (map[key] ??= { name: it.name ?? "—", revenue: 0, qty: 0 });
        e.revenue += Number(it.price ?? 0) * Number(it.quantity ?? 1);
        e.qty += Number(it.quantity ?? 1);
      }
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [paid]);

  const statusDist = Object.entries(
    orders.reduce<Record<string, number>>((acc: Record<string, number>, o: any) => { acc[o.status] = (acc[o.status] ?? 0) + 1; return acc; }, {})
  ).map(([k, v]) => ({ status: STATUS_LABELS[k] ?? k, count: v }));

  const catDist = Object.entries(
    products.reduce<Record<string, number>>((acc: Record<string, number>, p: any) => { const k = p.category ?? "Бусад"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Статистик</h1>
        <p className="text-sm text-muted-foreground">Дэлгүүрийн үйл ажиллагааны бодит хяналт</p>
      </div>

      {/* Primary KPIs */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Metric icon={CalendarDays} label="Өнөөдрийн борлуулалт" value={fmtMnt(todaySales)} sub={`${todayOrders.length} захиалга`} />
        <Metric icon={CalendarRange} label="Энэ сар" value={fmtMnt(monthSales)} sub={`${monthOrders.length} захиалга`} />
        <Metric icon={ShoppingCart} label="Нийт захиалга" value={orders.length} sub={`7 хоног: ${week.length}`} />
        <Metric icon={Users} label="Үйлчлүүлэгч" value={customers} />
      </div>

      {/* Operational KPIs */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-5">
        <Metric icon={Clock} label="Төлбөр хүлээж буй" value={awaitingPayment} tone="amber" />
        <Metric icon={Truck} label="Хүргэлтэнд" value={inDelivery} tone="violet" />
        <Metric icon={CheckCircle2} label="Дууссан" value={completedOrders} tone="emerald" />
        <Metric icon={AlertTriangle} label="Бага үлдэгдэлтэй" value={lowStockProducts.length} tone={lowStockProducts.length > 0 ? "red" : undefined} />
        <Metric icon={Package} label="Бараа" value={products.length} />
      </div>

      {/* Cargo KPIs */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
        <Metric icon={Truck} label="Карго замд" value={cargoInTransit} sub="Тээвэрлэгдэж буй" />
        <Metric icon={PackageCheck} label="Бэлэн авах" value={cargoReady} tone="emerald" sub="Хүлээж авч болно" />
        <Metric icon={Boxes} label="Ирсэн ачаа" value={cargoArrived} />
      </div>

      {/* Revenue summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" /> Цэвэр орлого</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{fmtMnt(netRevenue)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Платформын шимтгэлийг хассан</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><BadgePercent className="h-4 w-4" /> Шимтгэл</div>
          <div className="mt-2 text-2xl font-bold">{fmtMnt(totalCommission)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Only платформоос</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4" /> Дундаж захиалга</div>
          <div className="mt-2 text-2xl font-bold">{fmtMnt(aov)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Нийт борлуулалт: {fmtMnt(totalRevenue)}</div>
        </Card>
      </div>

      {/* Sales chart with period filter */}
      <Card className="rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Борлуулалтын хандлага</h3>
          <div className="flex flex-wrap gap-2">
            {([
              ["today", "Өнөөдөр"],
              ["7d", "7 хоног"],
              ["month", "Энэ сар"],
              ["custom", "Хугацаа сонгох"],
            ] as const).map(([k, label]) => (
              <Button
                key={k}
                size="sm"
                variant={period === k ? "default" : "outline"}
                disabled={k === "custom"}
                onClick={() => setPeriod(k as SalesPeriod)}
                title={k === "custom" ? "Удахгүй" : undefined}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="h-64">
          {salesChart.every((b) => b.revenue === 0) ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Энэ хугацаанд төлөгдсөн захиалга алга
            </div>
          ) : (
            <ResponsiveContainer>
              <BarChart data={salesChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  formatter={(v: any) => fmtMnt(Number(v))}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Top products + Revenue per product */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Топ зарагдсан бараа</h3>
          {top5.length === 0 ? (
            <EmptyState label="Бараа алга" />
          ) : (
            <div className="space-y-3">
              {top5.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {p.image_url && <img src={p.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      {linkedProductIds.has(p.id) && (
                        <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]"><Link2 className="h-3 w-3" />Inventory</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.sales ?? 0} зарагдсан · Үлдэгдэл {p.stock_quantity ?? 0}</div>
                  </div>
                  <div className="text-sm font-semibold">{fmtMnt(Number(p.price))}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Орлогоор тэргүүлэгч бараа</h3>
          {revenueByProduct.length === 0 ? (
            <EmptyState label="Төлөгдсөн захиалга алга" />
          ) : (
            <div className="space-y-3">
              {revenueByProduct.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.qty} ширхэг</div>
                  </div>
                  <div className="text-sm font-semibold text-emerald-600">{fmtMnt(r.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Inventory + Cargo + Delivery summaries */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Boxes className="h-4 w-4" /> Агуулахын дүн</h3>
          {inventory.length === 0 ? (
            <EmptyState label="Агуулах хоосон байна" />
          ) : (
            <div className="space-y-2 text-sm">
              <Row label="Нийт үлдэгдэл" value={invTotal.toLocaleString("mn-MN")} />
              <Row label="Захиалгад битүүмжилсэн" value={invReserved.toLocaleString("mn-MN")} tone="amber" />
              <Row label="Боломжтой" value={invAvailable.toLocaleString("mn-MN")} tone="emerald" />
              <Row label="Бага үлдэгдэлтэй" value={lowStockInv} tone={lowStockInv > 0 ? "red" : undefined} />
            </div>
          )}
        </Card>

        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Truck className="h-4 w-4" /> Карго тойм</h3>
          {cargoTotal === 0 ? (
            <EmptyState label="Идэвхтэй карго алга" />
          ) : (
            <div className="space-y-2 text-sm">
              <Row label="Замд явж буй" value={cargoInTransit} />
              <Row label="Ирсэн" value={cargoArrived} />
              <Row label="Бэлэн авах" value={cargoReady} tone="emerald" />
            </div>
          )}
        </Card>

        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Truck className="h-4 w-4" /> Хүргэлтийн тойм</h3>
          {delivery.length === 0 ? (
            <EmptyState label="Хүргэлтийн хүсэлт алга" />
          ) : (
            <div className="space-y-2 text-sm">
              {(["pending", "assigned", "in_transit", "delivered", "cancelled"]).map((k) => (
                <Row
                  key={k}
                  label={DELIVERY_LABELS[k] ?? k}
                  value={deliveryCounts[k] ?? 0}
                  tone={k === "delivered" ? "emerald" : k === "cancelled" ? "red" : k === "in_transit" ? "violet" : undefined}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Low stock + status + categories */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> Бага үлдэгдэлтэй бараа</h3>
          {lowStockProducts.length === 0 ? (
            <EmptyState label="Бүх бараа хангалттай үлдэгдэлтэй" />
          ) : (
            <div className="space-y-2">
              {lowStockProducts.slice(0, 6).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0 truncate">{p.name}</div>
                  <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-600">
                    {p.stock_quantity ?? 0}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Захиалгын төлөв</h3>
          <div className="h-56">
            {statusDist.length === 0 ? (
              <EmptyState label="Захиалга алга" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={statusDist} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="category" dataKey="status" stroke="hsl(var(--muted-foreground))" fontSize={11} width={110} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Ангилал</h3>
          <div className="h-56">
            {catDist.length === 0 ? (
              <EmptyState label="Бараа алга" />
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={catDist} dataKey="value" nameKey="name" outerRadius={80} label>
                    {catDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Package; label: string; value: string | number; sub?: string;
  tone?: "emerald" | "amber" | "red" | "violet";
}) {
  const toneClass =
    tone === "emerald" ? "text-emerald-600"
    : tone === "amber" ? "text-amber-600"
    : tone === "red" ? "text-red-600"
    : tone === "violet" ? "text-violet-600"
    : "";
  return (
    <Card className="rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs sm:text-sm text-muted-foreground">{label}</div>
        <Icon className={`h-4 w-4 ${toneClass || "text-muted-foreground"}`} />
      </div>
      <div className={`mt-2 text-xl sm:text-2xl font-bold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string | number; tone?: "emerald" | "amber" | "red" | "violet" }) {
  const toneClass =
    tone === "emerald" ? "text-emerald-600"
    : tone === "amber" ? "text-amber-600"
    : tone === "red" ? "text-red-600"
    : tone === "violet" ? "text-violet-600"
    : "";
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
