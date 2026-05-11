import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { fmtMnt } from "@/lib/format";

export const Route = createFileRoute("/merchant/dashboard/users")({ component: UsersPage });

function UsersPage() {
  const { primaryMerchantId } = useAuth();
  const { data: orders = [] } = useQuery({
    queryKey: ["users-orders", primaryMerchantId],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("phone,guest_name,total,created_at").eq("merchant_id", primaryMerchantId!);
      return data ?? [];
    },
  });
  const map = new Map<string, { phone: string; name: string; orders: number; total: number; last: string }>();
  for (const o of orders as any[]) {
    if (!o.phone) continue;
    const cur = map.get(o.phone) ?? { phone: o.phone, name: o.guest_name ?? "", orders: 0, total: 0, last: o.created_at };
    cur.orders += 1; cur.total += Number(o.total); if (o.created_at > cur.last) cur.last = o.created_at;
    map.set(o.phone, cur);
  }
  const list = [...map.values()].sort((a, b) => b.total - a.total);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Үйлчлүүлэгч</h1>
      <Card className="rounded-2xl p-4">
        {list.length === 0 ? <p className="py-10 text-center text-muted-foreground">Үйлчлүүлэгч алга</p> :
          <div className="space-y-2">
            {list.map((u) => (
              <div key={u.phone} className="flex items-center justify-between rounded-xl border border-border p-3">
                <div><div className="font-medium">{u.name || "Зочин"}</div><div className="text-xs text-muted-foreground">{u.phone}</div></div>
                <div className="text-right text-sm"><div>{u.orders} захиалга</div><div className="font-semibold">{fmtMnt(u.total)}</div></div>
              </div>
            ))}
          </div>}
      </Card>
    </div>
  );
}
