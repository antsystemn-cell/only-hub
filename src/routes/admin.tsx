import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { fmtMnt } from "@/lib/format";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const { isPlatformAdmin, loading } = useAuth();
  const { data } = useQuery({
    queryKey: ["admin-overview"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const [merchants, txs] = await Promise.all([
        supabase.from("merchants").select("id,name,slug,commission_rate,is_active"),
        supabase.from("platform_transactions").select("commission_amount,order_total"),
      ]);
      return { merchants: merchants.data ?? [], txs: txs.data ?? [] };
    },
  });
  if (loading) return <div className="flex min-h-screen items-center justify-center">Уншиж байна...</div>;
  if (!isPlatformAdmin) return <div className="flex min-h-screen items-center justify-center text-destructive">Зөвшөөрөлгүй</div>;
  const totalCommission = (data?.txs ?? []).reduce((s, t: any) => s + Number(t.commission_amount), 0);
  const totalGmv = (data?.txs ?? []).reduce((s, t: any) => s + Number(t.order_total), 0);

  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-3xl font-bold">Платформ Админ</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl p-5"><div className="text-sm text-muted-foreground">Нийт мерчант</div><div className="mt-2 text-2xl font-bold">{data?.merchants.length ?? 0}</div></Card>
        <Card className="rounded-2xl p-5"><div className="text-sm text-muted-foreground">Нийт GMV</div><div className="mt-2 text-2xl font-bold">{fmtMnt(totalGmv)}</div></Card>
        <Card className="rounded-2xl p-5"><div className="text-sm text-muted-foreground">Шимтгэлийн орлого</div><div className="mt-2 text-2xl font-bold text-emerald-600">{fmtMnt(totalCommission)}</div></Card>
      </div>
      <Card className="mt-6 rounded-2xl p-5">
        <h2 className="mb-4 font-semibold">Мерчантууд</h2>
        <div className="space-y-2">
          {(data?.merchants ?? []).map((m: any) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
              <div><div className="font-medium">{m.name}</div><div className="text-xs text-muted-foreground">/{m.slug}</div></div>
              <div className="flex items-center gap-3">
                <span className="text-xs">Шимтгэл: {m.commission_rate}%</span>
                <span className={`rounded px-2 py-0.5 text-xs ${m.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted"}`}>{m.is_active ? "Идэвхтэй" : "Идэвхгүй"}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
