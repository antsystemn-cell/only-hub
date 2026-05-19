import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMnt } from "@/lib/format";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/admin/analytics")({ component: AdminAnalyticsPage });

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function AdminAnalyticsPage() {
  const { isPlatformAdmin } = useAuth();
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");

  const { data: txs = [] } = useQuery({
    queryKey: ["admin-analytics-tx"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_transactions")
        .select("id,merchant_id,order_total,commission_amount,commission_rate,created_at")
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const { data: merchants = [] } = useQuery({
    queryKey: ["admin-analytics-merchants"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("merchants").select("id,name");
      return data ?? [];
    },
  });

  const merchantMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const x of merchants as any[]) m[x.id] = x.name;
    return m;
  }, [merchants]);

  const filteredTxs = useMemo(() => {
    if (period === "all") return txs as any[];
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const cutoff = Date.now() - days * 86400_000;
    return (txs as any[]).filter((t) => new Date(t.created_at).getTime() >= cutoff);
  }, [txs, period]);

  const totalGmv = filteredTxs.reduce((s, t) => s + Number(t.order_total), 0);
  const totalCommission = filteredTxs.reduce((s, t) => s + Number(t.commission_amount), 0);
  const avgRate = filteredTxs.length > 0
    ? filteredTxs.reduce((s, t) => s + Number(t.commission_rate), 0) / filteredTxs.length
    : 0;

  const dailyData = useMemo(() => {
    const map: Record<string, { date: string; gmv: number; commission: number }> = {};
    for (const t of filteredTxs) {
      const d = new Date(t.created_at);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      const e = (map[key] ??= { date: key, gmv: 0, commission: 0 });
      e.gmv += Number(t.order_total);
      e.commission += Number(t.commission_amount);
    }
    return Object.values(map);
  }, [filteredTxs]);

  const merchantPie = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of filteredTxs) {
      map[t.merchant_id] = (map[t.merchant_id] ?? 0) + Number(t.order_total);
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 6)
      .map(([id, gmv]) => ({ name: merchantMap[id] ?? id.slice(0, 6), gmv }));
  }, [filteredTxs, merchantMap]);

  const rateBreakdown = useMemo(() => {
    const map: Record<string, { rate: string; gmv: number; commission: number; count: number }> = {};
    for (const t of filteredTxs) {
      const key = `${t.commission_rate}%`;
      const e = (map[key] ??= { rate: key, gmv: 0, commission: 0, count: 0 });
      e.gmv += Number(t.order_total); e.commission += Number(t.commission_amount); e.count += 1;
    }
    return Object.values(map).sort((a, b) => b.gmv - a.gmv);
  }, [filteredTxs]);

  const exportExcel = () => {
    const rows = filteredTxs.map((t) => ({
      Огноо: new Date(t.created_at).toLocaleString("mn-MN"),
      Дэлгүүр: merchantMap[t.merchant_id] ?? t.merchant_id.slice(0, 6),
      "Захиалгын дүн": t.order_total,
      "Шимтгэлийн хувь": t.commission_rate,
      "Шимтгэлийн дүн": t.commission_amount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Тайлан");
    XLSX.writeFile(wb, `only-analytics-${period}-${Date.now()}.xlsx`);
  };

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Санхүүгийн аналитик</h1>
          <p className="mt-1 text-sm text-muted-foreground">Платформын бүх гүйлгээ, орлогын задаргаа</p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d", "90d", "all"] as const).map((p) => (
            <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
              {p === "7d" ? "7 хоног" : p === "30d" ? "30 хоног" : p === "90d" ? "90 хоног" : "Бүгд"}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={exportExcel}>📊 Excel</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl p-5">
          <div className="text-sm text-muted-foreground">Нийт GMV</div>
          <div className="mt-2 text-2xl font-bold">{fmtMnt(totalGmv)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{filteredTxs.length} гүйлгээ</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-sm text-muted-foreground">Нийт шимтгэл</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{fmtMnt(totalCommission)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{totalGmv > 0 ? ((totalCommission / totalGmv) * 100).toFixed(2) : 0}% дундаж хувь</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-sm text-muted-foreground">Дундаж commission rate</div>
          <div className="mt-2 text-2xl font-bold">{avgRate.toFixed(2)}%</div>
          <div className="mt-1 text-xs text-muted-foreground">Бүх дэлгүүрийн дундаж</div>
        </Card>
      </div>

      <Card className="rounded-2xl p-5">
        <h3 className="mb-4 font-semibold">Өдрийн GMV / Шимтгэл</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
            <Tooltip formatter={(v: any, n: string) => [fmtMnt(Number(v)), n === "gmv" ? "GMV" : "Шимтгэл"]} />
            <Legend />
            <Line type="monotone" dataKey="gmv" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="gmv" />
            <Line type="monotone" dataKey="commission" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="commission" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Дэлгүүрийн GMV хувиарлал</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={merchantPie} dataKey="gmv" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {merchantPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtMnt(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="rounded-2xl p-5">
          <h3 className="mb-4 font-semibold">Commission rate задаргаа</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rateBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="rate" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
              <Tooltip formatter={(v: any, n: string) => [fmtMnt(Number(v)), n === "gmv" ? "GMV" : "Шимтгэл"]} />
              <Bar dataKey="gmv" fill="var(--chart-1)" radius={[8, 8, 0, 0]} name="gmv" />
              <Bar dataKey="commission" fill="var(--chart-2)" radius={[8, 8, 0, 0]} name="commission" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-1">
            {rateBreakdown.map((r) => (
              <div key={r.rate} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{r.rate} — {r.count} гүйлгээ</span>
                <span className="font-medium text-emerald-600">{fmtMnt(r.commission)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
