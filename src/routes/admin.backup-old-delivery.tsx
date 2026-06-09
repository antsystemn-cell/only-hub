import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Truck, Download } from "lucide-react";
import {
  DELIVERY_STATUS_LABELS, type DeliveryStatus,
} from "@/lib/delivery/delivery.types";
import { DeliveryStatusBadge } from "@/components/DeliveryTimeline";
import { updateDeliveryStatusFn } from "@/lib/delivery/delivery.functions";
import { fmtMnt } from "@/lib/format";

export const adminListAllDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      status: z.string().optional(),
      search: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", { _user_id: userId });
    if (!isAdmin) return { ok: false as const, error: "Эрх хүрэхгүй", items: [] as any[] };
    let q = supabaseAdmin
      .from("delivery_requests")
      .select("*, merchants:merchant_id(name,slug)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.ilike("recipient_phone", `%${data.search}%`);
    const { data: items, error } = await q;
    if (error) return { ok: false as const, error: error.message, items: [] };
    return { ok: true as const, items: items ?? [] };
  });

export const Route = createFileRoute("/admin/backup-old-delivery")({
  head: () => ({ meta: [{ title: "Хүргэлт — Admin" }] }),
  component: AdminDeliveryPage,
});

function AdminDeliveryPage() {
  const listFn = useServerFn(adminListAllDeliveries);
  const updateFn = useServerFn(updateDeliveryStatusFn);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, refetch } = useQuery({
    queryKey: ["admin-deliveries", filter, search],
    queryFn: () =>
      listFn({
        data: {
          ...(filter !== "all" ? { status: filter } : {}),
          ...(search ? { search } : {}),
        },
      }),
  });
  const items = (data?.ok ? data.items : []) as any[];

  const updateMut = useMutation({
    mutationFn: (args: { id: string; status: DeliveryStatus }) =>
      updateFn({ data: { deliveryRequestId: args.id, status: args.status } }),
    onSuccess: (r: any) => {
      if (r?.ok) { toast.success("Шинэчлэв"); refetch(); }
      else toast.error(r?.error ?? "Алдаа");
    },
  });

  const exportCsv = () => {
    const header = ["ID", "Дэлгүүр", "Утас", "Хаяг", "Төлөв", "Горим", "Төлбөр", "Огноо"];
    const rows = items.map((d) => [
      d.external_ref ?? d.id,
      d.merchants?.name ?? "",
      d.recipient_phone ?? "",
      (d.dropoff_address ?? "").replace(/,/g, " "),
      DELIVERY_STATUS_LABELS[d.status as DeliveryStatus] ?? d.status,
      d.mode,
      d.fee ?? 0,
      new Date(d.created_at).toISOString(),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deliveries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Хүргэлтийн удирдлага</h1>
          <p className="text-sm text-muted-foreground">Бүх дэлгүүрийн хүргэлтүүд</p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" /> CSV татах
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Бүх төлөв</SelectItem>
            {Object.entries(DELIVERY_STATUS_LABELS).map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Утас..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {items.length === 0 ? (
        <Card className="mt-6 rounded-2xl border-dashed p-10 text-center">
          <Truck className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">Хүргэлт олдсонгүй</p>
        </Card>
      ) : (
        <div className="mt-6 space-y-2">
          {items.map((dr) => (
            <Card key={dr.id} className="rounded-xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">
                      {dr.external_ref ?? dr.id.slice(0, 8)}
                    </span>
                    <DeliveryStatusBadge status={dr.status} />
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{dr.mode}</span>
                    <span className="text-xs text-muted-foreground">{dr.merchants?.name}</span>
                  </div>
                  <p className="mt-1 text-sm">
                    {dr.recipient_name ?? "—"} · {dr.recipient_phone ?? "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">{dr.dropoff_address ?? "—"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(dr.created_at).toLocaleString("mn-MN")} · {fmtMnt(Number(dr.fee ?? 0))}
                  </p>
                </div>
                <Select
                  value={dr.status}
                  onValueChange={(v) => updateMut.mutate({ id: dr.id, status: v as DeliveryStatus })}
                >
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DELIVERY_STATUS_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
