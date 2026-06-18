import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package } from "lucide-react";
import { fmtMnt, STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/format";
import { DeliveryStatusBadge } from "@/components/DeliveryTimeline";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/account/orders")({
  head: () => ({ meta: [{ title: "Миний захиалгууд — Only" }] }),
  component: AccountOrdersPage,
});

function AccountOrdersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { redirect: "/account/orders" } });
  }, [user, loading, navigate]);

  const { data: orders = [] } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, external_ref, total, status, payment_status, delivery_status, created_at, merchant_id, items")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const { data: merchants = [] } = useQuery({
    queryKey: ["orders-merchants", orders.map((o: any) => o.merchant_id).join(",")],
    enabled: orders.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(orders.map((o: any) => o.merchant_id)));
      const { data } = await supabase.from("merchants").select("id,name,slug").in("id", ids);
      return data ?? [];
    },
  });

  const merchantMap = new Map(merchants.map((m: any) => [m.id, m]));

  const filtered = orders.filter((o: any) => statusFilter === "all" || o.status === statusFilter);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Уншиж байна...</div>;
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader showSearch={false} />

      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Link to="/account" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Бүртгэл рүү буцах
        </Link>
        <h1 className="text-2xl font-bold sm:text-3xl">Миний захиалгууд</h1>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { v: "all", l: "Бүгд" },
            { v: "pending", l: "Хүлээгдэж буй" },
            { v: "confirmed", l: "Баталгаажсан" },
            { v: "delivering", l: "Хүргэгдэж буй" },
            { v: "completed", l: "Дууссан" },
            { v: "cancelled", l: "Цуцалсан" },
          ].map((f) => (
            <Button
              key={f.v}
              variant={statusFilter === f.v ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f.v)}
            >
              {f.l}
            </Button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card className="mt-6 rounded-2xl border-dashed p-10 text-center">
            <Package className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Захиалга байхгүй байна.</p>
            <Link to="/stores"><Button className="mt-4">Дэлгүүр үзэх</Button></Link>
          </Card>
        ) : (
          <div className="mt-6 space-y-3">
            {filtered.map((o: any) => {
              const m: any = merchantMap.get(o.merchant_id);
              const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
              return (
                <Card key={o.id} className="rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {o.external_ref ?? o.id.slice(0, 8)}
                        </span>
                        <Badge variant="outline">{STATUS_LABELS[o.status] ?? o.status}</Badge>
                        <Badge variant="outline">
                          {PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status}
                        </Badge>
                        <DeliveryStatusBadge status={o.delivery_status} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {m?.name ?? "Дэлгүүр"} · {itemsCount} бараа ·{" "}
                        {new Date(o.created_at).toLocaleString("mn-MN")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{fmtMnt(Number(o.total))}</p>
                      {m?.slug && (
                        <Link
                          to="/store/$merchantSlug/order/$orderId"
                          params={{ merchantSlug: m.slug, orderId: o.id }}
                        >
                          <Button variant="outline" size="sm" className="mt-2">
                            Дэлгэрэнгүй
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
