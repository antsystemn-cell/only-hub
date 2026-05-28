import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Truck, LogOut } from "lucide-react";
import { DeliveryStatusBadge } from "@/components/DeliveryTimeline";
import { updateDeliveryStatusFn } from "@/lib/delivery/delivery.functions";
import type { DeliveryStatus } from "@/lib/delivery/delivery.types";
import { fmtMnt } from "@/lib/format";

const listDriverDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data } = await supabaseAdmin
      .from("delivery_requests")
      .select("*, merchants:merchant_id(name)")
      .eq("driver_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return { items: data ?? [] };
  });

export const Route = createFileRoute("/driver")({
  head: () => ({ meta: [{ title: "Жолоочийн хэсэг — Only" }] }),
  component: DriverPage,
});

function DriverPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listDriverDeliveries);
  const updateFn = useServerFn(updateDeliveryStatusFn);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { redirect: "/driver" } });
  }, [user, loading, navigate]);

  const { data, refetch } = useQuery({
    queryKey: ["driver-deliveries", user?.id],
    enabled: !!user,
    queryFn: () => listFn({ data: {} }),
  });
  const items = (data?.items ?? []) as any[];

  const updateMut = useMutation({
    mutationFn: (args: { id: string; status: DeliveryStatus }) =>
      updateFn({ data: { deliveryRequestId: args.id, status: args.status } }),
    onSuccess: (r: any) => {
      if (r?.ok) { toast.success("Шинэчлэв"); refetch(); }
      else toast.error(r?.error ?? "Алдаа");
    },
  });

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Уншиж байна...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="text-lg font-bold">Only · Жолооч</Link>
          <Button variant="ghost" size="sm" onClick={() => signOut().then(() => navigate({ to: "/" }))}>
            <LogOut className="mr-2 h-4 w-4" /> Гарах
          </Button>
        </div>
      </header>

      <div className="container mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-bold">Миний хүргэлтүүд</h1>

        {items.length === 0 ? (
          <Card className="mt-4 rounded-2xl border-dashed p-10 text-center">
            <Truck className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Танд оноосон хүргэлт байхгүй байна.</p>
          </Card>
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((dr) => (
              <Card key={dr.id} className="rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">
                    {dr.external_ref ?? dr.id.slice(0, 8)}
                  </span>
                  <DeliveryStatusBadge status={dr.status} />
                </div>
                <p className="mt-2 text-sm font-semibold">{dr.recipient_name ?? "—"}</p>
                <a
                  href={`tel:${dr.recipient_phone ?? ""}`}
                  className="text-sm text-primary underline"
                >
                  {dr.recipient_phone ?? "—"}
                </a>
                <p className="mt-1 text-sm text-muted-foreground">{dr.dropoff_address ?? "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dr.merchants?.name} · {fmtMnt(Number(dr.fee ?? 0))}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {dr.status === "assigned" && (
                    <Button size="sm" onClick={() => updateMut.mutate({ id: dr.id, status: "picked_up" })}>
                      Барааг авлаа
                    </Button>
                  )}
                  {(dr.status === "picked_up" || dr.status === "assigned") && (
                    <Button size="sm" variant="outline" onClick={() => updateMut.mutate({ id: dr.id, status: "in_transit" })}>
                      Замдаа
                    </Button>
                  )}
                  {["assigned", "picked_up", "in_transit"].includes(dr.status) && (
                    <>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => updateMut.mutate({ id: dr.id, status: "delivered" })}>
                        Хүргэсэн
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => updateMut.mutate({ id: dr.id, status: "failed" })}>
                        Амжилтгүй
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
