import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { fmtMnt, STATUS_LABELS } from "@/lib/format";
import { Package, ShoppingCart, TrendingUp, Users, Wallet, BadgePercent } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

export const Route = createFileRoute("/merchant/dashboard/")({
  component: StatsPage,
});

const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

function StatsPage() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;

  const { data } = useQuery({
    queryKey: ["stats", merchantId],
    queryFn: async () => {
      const [products, orders] = await Promise.all([
        supabase.from("products").select("id,name,sales,category,price").eq("merchant_id", merchantId),
        supabase.from("orders").select("id,total,status,payment_status,phone,created_at,platform_commission_amount,items").eq("merchant_id", merchantId),
      ]);
      return { products: products.data ?? [], orders: orders.data ?? [] };
    },
  });

  const products = data?.products ?? [];
  const orders = data?.orders ?? [];

  const paid = orders.filter((o) => o.payment_status === "confirmed" || o.status === "completed");
  const totalRevenue = paid.reduce((s, o) => s + Number(o.total), 0);
  const totalCommission = paid.reduce((s, o) => s + Number(o.platform_commission_amount ?? 0), 0);
  const netRevenue = totalRevenue - totalCommission;
  const customers = new Set(orders.map((o) => o.phone).filter(Boolean)).size;

  // Today / 7d / AOV
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start7d = startToday - 6 * 86400000;
  const todayOrders = orders.filter((o) => new Date(o.created_at).getTime() >= startToday);
  const week = orders.filter((o) => new Date(o.created_at).getTime() >= start7d);
  const aov = paid.length ? Math.round(totalRevenue / paid.length) : 0;

  // Monthly revenue last 6 months
  const monthly = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const next = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1);
    const sum = paid.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= d.getTime() && t < next.getTime();
    }).reduce((s, o) => s + Number(o.total), 0);
    return { month: d.toLocaleDateString("mn-MN", { month: "short" }), revenue: sum };
  });

  const top5 = [...products].sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0)).slice(0, 5).map((p) => ({ name: p.name.slice(0, 12), sales: p.sales ?? 0 }));

  const statusDist = Object.entries(
    orders.reduce<Record<string, number>>((acc, o) => { acc[o.status] = (acc[o.status] ?? 0) + 1; return acc; }, {})
  ).map(([k, v]) => ({ status: STATUS_LABELS[k] ?? k, count: v }));

  const catDist = Object.entries(
    products.reduce<Record<string, number>>((acc, p) => { const k = p.category ?? "Бусад"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Статистик</h1>
        <p className="text-sm text-muted-foreground">Дэлгүүрийн ерөнхий тойм</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Package} label="Бараа" value={products.length} />
        <Metric icon={ShoppingCart} label="Захиалга" value={orders.length} />
        <Metric icon={TrendingUp} label="Нийт борлуулалт" value={fmtMnt(totalRevenue)} />
        <Metric icon={Users} label="Үйлчлүүлэгч" value={customers} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" /> Цэвэр орлого</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{fmtMnt(netRevenue)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Платформын шимтгэлийг хассан</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><BadgePercent className="h-4 w-4" /> Шимтгэл хасагдсан</div>
          <div className="mt-2 text-2xl font-bold">{fmtMnt(totalCommission)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Only платформоос</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-sm text-muted-foreground">Дундаж захиалга</div>
          <div className="mt-2 text-2xl font-bold">{fmtMnt(aov)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Өнөөдөр: {todayOrders.length} • 7 хоног: {week.length}</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Сүүлийн 6 сарын борлуулалт</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Топ 5 бүтээгдэхүүн</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={top5} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={90} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="sales" fill="hsl(var(--chart-2))" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Захиалгын төлөв</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={statusDist} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="category" dataKey="status" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Ангилал хуваарилалт</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={catDist} dataKey="value" nameKey="name" outerRadius={90} label>
                  {catDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string | number }) {
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </Card>
  );
}
