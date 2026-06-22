import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fmtMnt } from "@/lib/format";
import { Globe2, ExternalLink } from "lucide-react";
import { FOREIGN_SOURCES } from "@/lib/foreign-orders/sources";
import {
  listSourcePurchaseQueue,
  updateSourcePurchaseQueueItem,
} from "@/lib/foreign-orders/queue.functions";

const STATUS_OPTIONS = [
  "WAITING_SOURCE_PURCHASE",
  "SOURCE_PURCHASED",
  "KOREA_WAREHOUSE_RECEIVED",
  "INTERNATIONAL_TRANSIT",
  "UB_ARRIVED",
  "DELIVERY_ASSIGNED",
  "DELIVERED",
  "SOURCE_PURCHASE_FAILED",
  "REFUNDED",
  "CANCELLED",
] as const;

const STATUS_LABEL: Record<string, string> = {
  PAID: "Төлбөр төлсөн",
  WAITING_SOURCE_PURCHASE: "Эх сурвалжаас худалдан авах хүлээгдэж буй",
  SOURCE_PURCHASED: "Эх сурвалжаас худалдаж авсан",
  KOREA_WAREHOUSE_RECEIVED: "Солонгос агуулахад ирсэн",
  INTERNATIONAL_TRANSIT: "Олон улсын тээвэрт",
  UB_ARRIVED: "УБ-д ирсэн",
  DELIVERY_ASSIGNED: "Хүргэлтэд гарсан",
  DELIVERED: "Хүргэгдсэн",
  SOURCE_PURCHASE_FAILED: "Худалдан авалт амжилтгүй",
  REFUNDED: "Буцаалт хийсэн",
  CANCELLED: "Цуцалсан",
};

const STATUS_COLOR: Record<string, string> = {
  WAITING_SOURCE_PURCHASE: "bg-amber-100 text-amber-700",
  SOURCE_PURCHASED: "bg-blue-100 text-blue-700",
  KOREA_WAREHOUSE_RECEIVED: "bg-indigo-100 text-indigo-700",
  INTERNATIONAL_TRANSIT: "bg-purple-100 text-purple-700",
  UB_ARRIVED: "bg-cyan-100 text-cyan-700",
  DELIVERY_ASSIGNED: "bg-emerald-100 text-emerald-700",
  DELIVERED: "bg-green-100 text-green-700",
  SOURCE_PURCHASE_FAILED: "bg-red-100 text-red-700",
  REFUNDED: "bg-gray-100 text-gray-700",
  CANCELLED: "bg-gray-100 text-gray-700",
};

export function ForeignQueueView() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId ?? null;
  const [statusFilter, setStatusFilter] = useState<string>("");
  const qc = useQueryClient();
  const listFn = useServerFn(listSourcePurchaseQueue);
  const updateFn = useServerFn(updateSourcePurchaseQueueItem);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["spq", merchantId, statusFilter],
    enabled: !!merchantId,
    queryFn: () =>
      listFn({ data: { merchantId: merchantId!, status: statusFilter || undefined } }),
  });

  const updateMut = useMutation({
    mutationFn: (input: { id: string; status?: string; notes?: string }) =>
      updateFn({ data: input as any }),
    onSuccess: () => {
      toast.success("Шинэчиллээ");
      qc.invalidateQueries({ queryKey: ["spq", merchantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="font-semibold">Эх сурвалжаас худалдан авах дараалал</h2>
            <p className="text-xs text-muted-foreground">
              Гадаадаас захиалгаар хийгдсэн, төлбөр баталгаажсан бараанууд.
            </p>
          </div>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Бүх төлөв" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Бүх төлөв</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Уншиж байна…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Дараалалд бараа байхгүй байна.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r: any) => {
            const src = FOREIGN_SOURCES[r.source as keyof typeof FOREIGN_SOURCES];
            const o = r.orders ?? {};
            return (
              <div
                key={r.id}
                className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge className={STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-700"}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {src?.name ?? r.source}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    #{o.external_ref ?? r.order_id.slice(0, 8)}
                  </span>
                  {r.source_url && (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Эх сурвалж
                    </a>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Захиалагч</div>
                    <div>
                      {o.guest_name ?? "—"} · {o.phone ?? "—"}
                    </div>
                    {r.selected_size_label && (
                      <div className="mt-1 text-xs">
                        Хэмжээ: <b>{r.selected_size_label}</b>
                      </div>
                    )}
                    {r.source_variant_id && (
                      <div className="text-xs text-muted-foreground">
                        SKU: {r.source_variant_id}
                      </div>
                    )}
                  </div>
                  <div className="text-xs">
                    <div>
                      Эх үнэ:{" "}
                      <b>
                        {r.source_price ?? "—"} {r.source_currency ?? ""}
                      </b>{" "}
                      ({fmtMnt(Number(r.source_price_mnt ?? 0))})
                    </div>
                    <div>
                      Хэрэглэгчээс:{" "}
                      <b>{fmtMnt(Number(r.customer_paid_price_mnt ?? 0))}</b>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Textarea
                    defaultValue={r.notes ?? ""}
                    placeholder="Тэмдэглэл (захиалгын №, tracking, агуулахын тэмдэг…)"
                    className="min-h-16 text-xs"
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== (r.notes ?? "")) updateMut.mutate({ id: r.id, notes: v });
                    }}
                  />
                  <div className="flex gap-2 sm:flex-col">
                    <Select
                      value={r.status}
                      onValueChange={(v) => updateMut.mutate({ id: r.id, status: v })}
                    >
                      <SelectTrigger className="w-full sm:w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
