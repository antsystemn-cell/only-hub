import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Truck } from "lucide-react";
import {
  listMerchantDeliveryRequests,
  updateDeliveryStatusFn,
  cancelDeliveryRequestFn,
} from "@/lib/delivery/delivery.functions";
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/delivery/delivery.types";
import { DeliveryStatusBadge } from "@/components/DeliveryTimeline";
import { fmtMnt } from "@/lib/format";

export const Route = createFileRoute("/merchant/dashboard/delivery")({
  component: MerchantDeliveryPage,
});

const NEXT_STATUSES: DeliveryStatus[] = [
  "requested", "assigned", "picked_up", "in_transit", "delivered", "failed", "cancelled",
];

function MerchantDeliveryPage() {
  const { primaryMerchantId } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listMerchantDeliveryRequests);
  const updateFn = useServerFn(updateDeliveryStatusFn);
  const cancelFn = useServerFn(cancelDeliveryRequestFn);
  const [filter, setFilter] = useState<string>("all");

  const { data, refetch } = useQuery({
    queryKey: ["merchant-deliveries", primaryMerchantId, filter],
    enabled: !!primaryMerchantId,
    queryFn: async () =>
      listFn({
        data: {
          merchantId: primaryMerchantId!,
          ...(filter !== "all" ? { status: filter } : {}),
        },
      }),
  });

  const items = (data?.ok ? data.items : []) as any[];

  // Driver list for assign dropdown
  const { data: drivers = [] } = useQuery({
    queryKey: ["merchant-drivers", primaryMerchantId],
    enabled: !!primaryMerchantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("merchant_id", primaryMerchantId)
        .eq("role", "merchant_driver");
      return data ?? [];
    },
  });

  const updateMut = useMutation({
    mutationFn: (args: { id: string; status: DeliveryStatus; note?: string; driverId?: string }) =>
      updateFn({
        data: {
          deliveryRequestId: args.id,
          status: args.status,
          note: args.note ?? null,
          driverId: args.driverId ?? null,
        },
      }),
    onSuccess: (r: any) => {
      if (r?.ok) { toast.success("Төлөв шинэчлэгдлээ"); refetch(); }
      else toast.error(r?.error ?? "Алдаа гарлаа");
    },
  });

  if (!primaryMerchantId) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Та эхлээд дэлгүүртэй холбогдох ёстой.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Хүргэлт</h1>
          <p className="text-sm text-muted-foreground">Захиалгын хүргэлтийн төлөв, жолоочийн оноолт</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Бүгд</SelectItem>
            {Object.entries(DELIVERY_STATUS_LABELS).map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <Card className="mt-6 rounded-2xl border-dashed p-10 text-center">
          <Truck className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">Хүргэлт байхгүй байна.</p>
        </Card>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((dr) => (
            <DeliveryRow
              key={dr.id}
              dr={dr}
              drivers={drivers}
              onUpdate={(args) => updateMut.mutate({ id: dr.id, ...args })}
              onCancel={async () => {
                if (!confirm("Хүргэлтийг цуцлах уу?")) return;
                const r: any = await cancelFn({ data: { deliveryRequestId: dr.id } });
                if (r?.ok) { toast.success("Цуцлав"); refetch(); }
                else toast.error(r?.error ?? "Алдаа");
              }}
            />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

function DeliveryRow({
  dr, drivers, onUpdate, onCancel,
}: {
  dr: any;
  drivers: any[];
  onUpdate: (args: { status: DeliveryStatus; note?: string; driverId?: string }) => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DeliveryStatus>(dr.status);
  const [note, setNote] = useState("");
  const [driverId, setDriverId] = useState<string>(dr.driver_id ?? "");

  return (
    <Card className="rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">
              {dr.external_ref ?? dr.id.slice(0, 8)}
            </span>
            <DeliveryStatusBadge status={dr.status} />
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">
              {dr.mode}
            </span>
          </div>
          <p className="mt-1 text-sm">{dr.recipient_name ?? "—"} · {dr.recipient_phone ?? "—"}</p>
          <p className="text-sm text-muted-foreground">{dr.dropoff_address ?? "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(dr.created_at).toLocaleString("mn-MN")} · {fmtMnt(Number(dr.fee ?? 0))}
          </p>
          {dr.last_error && <p className="mt-1 text-xs text-destructive">{dr.last_error}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Төлөв өөрчлөх</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Хүргэлтийн төлөв шинэчлэх</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Select value={status} onValueChange={(v) => setStatus(v as DeliveryStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NEXT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {status === "assigned" && (
                  <Select value={driverId} onValueChange={setDriverId}>
                    <SelectTrigger><SelectValue placeholder="Жолооч сонгох" /></SelectTrigger>
                    <SelectContent>
                      {drivers.map((d) => (
                        <SelectItem key={d.user_id} value={d.user_id}>
                          {d.user_id.slice(0, 8)}…
                        </SelectItem>
                      ))}
                      {drivers.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          Жолооч бүртгэлгүй
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                )}
                <Textarea
                  placeholder="Тэмдэглэл (заавал биш)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Болих</Button>
                <Button
                  onClick={() => {
                    onUpdate({
                      status,
                      note: note || undefined,
                      driverId: status === "assigned" ? driverId || undefined : undefined,
                    });
                    setOpen(false);
                  }}
                >
                  Хадгалах
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {!["delivered", "cancelled", "failed"].includes(dr.status) && (
            <Button variant="ghost" size="sm" onClick={onCancel}>Цуцлах</Button>
          )}
        </div>
      </div>
    </Card>
  );
}
