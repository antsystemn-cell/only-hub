import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fmtMnt } from "@/lib/format";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const { isPlatformAdmin, loading } = useAuth();
  const qc = useQueryClient();

  const merchantsQ = useQuery({
    queryKey: ["admin-merchants"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("id,name,slug,commission_rate,is_active,created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const txQ = useQuery({
    queryKey: ["admin-tx"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_transactions")
        .select("id,merchant_id,order_id,order_total,commission_rate,commission_amount,status,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const ordersQ = useQuery({
    queryKey: ["admin-orders-count"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { count } = await supabase.from("orders").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const updateMerchant = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("merchants").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Шинэчиллээ");
      qc.invalidateQueries({ queryKey: ["admin-merchants"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (loading) return <div className="flex min-h-screen items-center justify-center">Уншиж байна...</div>;
  if (!isPlatformAdmin) return <div className="flex min-h-screen items-center justify-center text-destructive">Зөвшөөрөлгүй</div>;

  const merchants = merchantsQ.data ?? [];
  const txs = txQ.data ?? [];
  const totalCommission = txs.reduce((s: number, t: any) => s + Number(t.commission_amount), 0);
  const totalGmv = txs.reduce((s: number, t: any) => s + Number(t.order_total), 0);
  const activeMerchants = merchants.filter((m: any) => m.is_active).length;

  // commission per merchant lookup
  const commissionByMerchant: Record<string, { gmv: number; commission: number; count: number }> = {};
  for (const t of txs as any[]) {
    const m = (commissionByMerchant[t.merchant_id] ??= { gmv: 0, commission: 0, count: 0 });
    m.gmv += Number(t.order_total);
    m.commission += Number(t.commission_amount);
    m.count += 1;
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <h1 className="text-3xl font-bold">Платформ Админ</h1>
      <p className="text-sm text-muted-foreground">Бүх дэлгүүр болон шимтгэлийн тойм</p>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Card className="rounded-2xl p-5"><div className="text-sm text-muted-foreground">Идэвхтэй мерчант</div><div className="mt-2 text-2xl font-bold">{activeMerchants} / {merchants.length}</div></Card>
        <Card className="rounded-2xl p-5"><div className="text-sm text-muted-foreground">Нийт захиалга</div><div className="mt-2 text-2xl font-bold">{ordersQ.data ?? 0}</div></Card>
        <Card className="rounded-2xl p-5"><div className="text-sm text-muted-foreground">Нийт GMV</div><div className="mt-2 text-2xl font-bold">{fmtMnt(totalGmv)}</div></Card>
        <Card className="rounded-2xl p-5"><div className="text-sm text-muted-foreground">Шимтгэлийн орлого</div><div className="mt-2 text-2xl font-bold text-emerald-600">{fmtMnt(totalCommission)}</div></Card>
      </div>

      <Tabs defaultValue="merchants" className="mt-8">
        <TabsList>
          <TabsTrigger value="merchants">Мерчантууд</TabsTrigger>
          <TabsTrigger value="transactions">Гүйлгээ</TabsTrigger>
        </TabsList>

        <TabsContent value="merchants">
          <Card className="rounded-2xl p-4">
            <div className="space-y-2">
              {merchants.map((m: any) => {
                const stat = commissionByMerchant[m.id] ?? { gmv: 0, commission: 0, count: 0 };
                return (
                  <MerchantRow
                    key={m.id}
                    merchant={m}
                    stat={stat}
                    onUpdate={(patch) => updateMerchant.mutate({ id: m.id, patch })}
                  />
                );
              })}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card className="rounded-2xl p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="p-2">Огноо</th>
                    <th className="p-2">Мерчант</th>
                    <th className="p-2">Захиалгын дүн</th>
                    <th className="p-2">Хувь</th>
                    <th className="p-2">Шимтгэл</th>
                    <th className="p-2">Төлөв</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t: any) => {
                    const m = merchants.find((x: any) => x.id === t.merchant_id);
                    return (
                      <tr key={t.id} className="border-t border-border">
                        <td className="p-2">{new Date(t.created_at).toLocaleString("mn-MN")}</td>
                        <td className="p-2">{m?.name ?? t.merchant_id.slice(0, 6)}</td>
                        <td className="p-2">{fmtMnt(t.order_total)}</td>
                        <td className="p-2">{t.commission_rate}%</td>
                        <td className="p-2 font-medium text-emerald-600">{fmtMnt(t.commission_amount)}</td>
                        <td className="p-2"><span className="rounded bg-muted px-2 py-0.5 text-xs">{t.status}</span></td>
                      </tr>
                    );
                  })}
                  {txs.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Гүйлгээ алга</td></tr>
                  )}
                </tbody>
                {txs.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="p-2" colSpan={2}>Нийт</td>
                      <td className="p-2">{fmtMnt(totalGmv)}</td>
                      <td className="p-2"></td>
                      <td className="p-2 text-emerald-600">{fmtMnt(totalCommission)}</td>
                      <td className="p-2"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MerchantRow({ merchant: m, stat, onUpdate }: { merchant: any; stat: { gmv: number; commission: number; count: number }; onUpdate: (patch: any) => void }) {
  const [editRate, setEditRate] = useState(false);
  const [rate, setRate] = useState<string>(String(m.commission_rate));

  const saveRate = () => {
    const v = Number(rate);
    if (Number.isNaN(v) || v < 0 || v > 100) return toast.error("0-100 хооронд утга оруулна уу");
    onUpdate({ commission_rate: v });
    setEditRate(false);
  };

  return (
    <div className="grid items-center gap-3 rounded-xl border border-border p-3 text-sm md:grid-cols-[2fr_1fr_1fr_1fr_140px_100px]">
      <div>
        <div className="font-medium">{m.name}</div>
        <div className="text-xs text-muted-foreground">/{m.slug}</div>
      </div>
      <div className="text-xs"><span className="text-muted-foreground">Захиалга: </span>{stat.count}</div>
      <div className="text-xs"><span className="text-muted-foreground">GMV: </span>{fmtMnt(stat.gmv)}</div>
      <div className="text-xs"><span className="text-muted-foreground">Шимтгэл: </span><span className="text-emerald-600">{fmtMnt(stat.commission)}</span></div>
      <div className="flex items-center gap-1">
        {editRate ? (
          <>
            <Input className="h-8 w-20" type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
            <Button size="icon" variant="ghost" onClick={saveRate}><Check className="h-4 w-4 text-emerald-600" /></Button>
            <Button size="icon" variant="ghost" onClick={() => { setEditRate(false); setRate(String(m.commission_rate)); }}><X className="h-4 w-4" /></Button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">{m.commission_rate}%</span>
            <Button size="icon" variant="ghost" onClick={() => setEditRate(true)}><Pencil className="h-3.5 w-3.5" /></Button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={m.is_active} onCheckedChange={(v) => onUpdate({ is_active: v })} />
        <span className="text-xs">{m.is_active ? "Идэвхтэй" : "Хаалттай"}</span>
      </div>
    </div>
  );
}
