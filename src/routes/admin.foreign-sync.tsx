import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  adminListForeignSyncProducts,
  adminListAllForeignSyncJobs,
  adminListForeignPriceChanges,
  adminRenameForeignProduct,
  adminSetForeignProductOrigin,
} from "@/lib/foreign-orders/admin-sync.functions";
import { triggerForeignSourceSync } from "@/lib/foreign-orders/sync.functions";
import { fmtMnt } from "@/lib/format";

export const Route = createFileRoute("/admin/foreign-sync")({
  component: AdminForeignSyncPage,
});

function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleString("mn-MN") : "—";
}

function AdminForeignSyncPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");

  const listProducts = useServerFn(adminListForeignSyncProducts);
  const listJobs = useServerFn(adminListAllForeignSyncJobs);
  const listChanges = useServerFn(adminListForeignPriceChanges);
  const triggerFn = useServerFn(triggerForeignSourceSync);
  const renameFn = useServerFn(adminRenameForeignProduct);

  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState("");

  const renameMut = useMutation({
    mutationFn: (input: { productId: string; name: string }) =>
      renameFn({ data: input }),
    onSuccess: () => {
      toast.success("Барааны нэр шинэчлэгдлээ");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-foreign-sync-products"] });
      qc.invalidateQueries({ queryKey: ["admin-foreign-sync-jobs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Нэр солих амжилтгүй"),
  });

  const productsQ = useQuery({
    queryKey: ["admin-foreign-sync-products", status, search],
    queryFn: () =>
      listProducts({
        data: {
          status: status || undefined,
          search: search || undefined,
          limit: 200,
        },
      }),
  });

  const jobsQ = useQuery({
    queryKey: ["admin-foreign-sync-jobs"],
    queryFn: () => listJobs({ data: { limit: 50 } }),
    refetchInterval: 30_000,
  });

  const changesQ = useQuery({
    queryKey: ["admin-foreign-price-changes"],
    queryFn: () => listChanges({ data: { limit: 50 } }),
    refetchInterval: 60_000,
  });

  const trigger = useMutation({
    mutationFn: (productId: string) => triggerFn({ data: { productId } }),
    onSuccess: (r) => {
      toast.success(
        `Sync: ${r.variantsAvailable} боломжтой / ${r.variantsUnavailable} дууссан / ${r.variantsUnknown} тодорхойгүй`,
      );
      qc.invalidateQueries({ queryKey: ["admin-foreign-sync-products"] });
      qc.invalidateQueries({ queryKey: ["admin-foreign-sync-jobs"] });
      qc.invalidateQueries({ queryKey: ["admin-foreign-price-changes"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync амжилтгүй"),
  });

  const totals = productsQ.data?.totals ?? { total: 0, ok: 0, failed: 0, review: 0, paused: 0 };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Гадаад эх сурвалжийн sync (Платформ)</h1>
        <p className="text-sm text-muted-foreground">
          Бүх мерчантуудын Poizon Korea барааны sync төлөв, лог, үнэ/боломжит байдлын өөрчлөлт.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Бүгд</div>
          <div className="text-2xl font-bold">{totals.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">OK</div>
          <div className="text-2xl font-bold text-emerald-600">{totals.ok}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Failed</div>
          <div className="text-2xl font-bold text-red-600">{totals.failed}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Хяналт шаардлагатай</div>
          <div className="text-2xl font-bold text-orange-600">{totals.review}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Зогссон</div>
          <div className="text-2xl font-bold text-muted-foreground">{totals.paused}</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Бүтээгдэхүүний sync төлөв</h2>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Хайх: нэр эсвэл линк"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-64"
            />
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Бүх статус</SelectItem>
                <SelectItem value="OK">OK</SelectItem>
                <SelectItem value="FAILED">FAILED</SelectItem>
                <SelectItem value="NEEDS_REVIEW">Хяналт</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Мерчант</th>
                <th className="py-2 pr-3">Бараа</th>
                <th className="py-2 pr-3">Давтамж</th>
                <th className="py-2 pr-3">Сүүлд</th>
                <th className="py-2 pr-3">Дараа</th>
                <th className="py-2 pr-3">Статус</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {(productsQ.data?.rows ?? []).map((p: any) => (
                <tr key={p.id} className="border-t align-top">
                  <td className="py-2 pr-3">
                    <Link
                      to="/admin/merchants"
                      className="font-medium hover:text-orange-600"
                    >
                      {p.merchants?.name ?? "—"}
                    </Link>
                    <div className="text-xs text-muted-foreground">{p.merchants?.slug}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-start gap-1">
                      <div className="font-medium">{p.name}</div>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-orange-600"
                        title="Нэр засах"
                        onClick={() => {
                          setEditing({ id: p.id, name: p.name });
                          setEditName(p.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {p.source_url && (
                      <a
                        href={p.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-orange-600 hover:underline"
                      >
                        Эх сурвалж →
                      </a>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {p.sync_enabled ? `${p.sync_frequency_hours ?? 24}ц` : "Зогссон"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {fmtDate(p.last_source_sync_at)}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {fmtDate(p.next_sync_at)}
                  </td>
                  <td className="py-2 pr-3">
                    {p.source_sync_status === "OK" && (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">OK</Badge>
                    )}
                    {p.source_sync_status === "FAILED" && (
                      <Badge variant="destructive">FAILED</Badge>
                    )}
                    {p.source_sync_status === "NEEDS_REVIEW" && (
                      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Хяналт</Badge>
                    )}
                    {p.sync_failure_count > 0 && (
                      <span className="ml-1 text-xs text-red-500">×{p.sync_failure_count}</span>
                    )}
                    {p.low_stock_warning && (
                      <Badge className="ml-1 bg-amber-100 text-amber-700 hover:bg-amber-100">
                        Үлдэгдэл бага
                      </Badge>
                    )}
                    {p.source_sync_error && (
                      <div className="mt-1 max-w-xs truncate text-xs text-red-600">
                        {p.source_sync_error}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={trigger.isPending}
                      onClick={() => trigger.mutate(p.id)}
                    >
                      {trigger.isPending && trigger.variables === p.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 h-3 w-3" />
                      )}
                      Шалгах
                    </Button>
                  </td>
                </tr>
              ))}
              {productsQ.data?.rows?.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    Гадаад эх сурвалжтай бараа алга.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Сүүлийн sync лог</h2>
          <div className="space-y-2 text-sm">
            {(jobsQ.data ?? []).map((j: any) => (
              <div key={j.id} className="rounded border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{j.products?.name ?? j.product_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">
                      {j.merchants?.name} • {fmtDate(j.created_at)}
                    </div>
                    <div className="text-xs">
                      avail/unavail/unk: <b>{j.variants_available}/{j.variants_unavailable}/{j.variants_unknown}</b>
                      {" • "}үнэ өөрчл: <b>{j.price_changes_count ?? 0}</b>
                      {" • "}статус өөрчл: <b>{j.availability_changes_count ?? 0}</b>
                    </div>
                    {j.error_message && (
                      <div className="mt-1 text-xs text-red-600">{j.error_message}</div>
                    )}
                  </div>
                  <Badge
                    className={
                      j.status === "SUCCESS"
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : j.status === "NEEDS_REVIEW"
                        ? "bg-orange-100 text-orange-700 hover:bg-orange-100"
                        : "bg-red-100 text-red-700 hover:bg-red-100"
                    }
                  >
                    {j.status}
                  </Badge>
                </div>
              </div>
            ))}
            {jobsQ.data?.length === 0 && (
              <div className="py-6 text-center text-muted-foreground">Лог алга.</div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Үнэ/боломжит байдлын өөрчлөлт</h2>
          <div className="space-y-2 text-sm">
            {(changesQ.data ?? []).map((v: any) => {
              const delta =
                v.source_price != null && v.previous_source_price != null
                  ? Number(v.source_price) - Number(v.previous_source_price)
                  : 0;
              return (
                <div key={v.id} className="rounded border p-2">
                  <div className="font-medium">{v.products?.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {v.products?.merchants?.name} • {v.label ?? `${v.size_label ?? ""} ${v.color_label ?? ""}`}
                  </div>
                  <div className="mt-1 text-xs">
                    {v.previous_source_price} {v.source_currency} → <b>{v.source_price} {v.source_currency}</b>
                    {delta !== 0 && (
                      <span className={delta > 0 ? "ml-2 text-red-600" : "ml-2 text-emerald-600"}>
                        {delta > 0 ? "+" : ""}{delta} {v.source_currency}
                      </span>
                    )}
                    {v.rounded_customer_price_mnt != null && (
                      <span className="ml-2 text-muted-foreground">
                        ≈ {fmtMnt(Number(v.rounded_customer_price_mnt))}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {v.availability_status}
                    </Badge>
                    {v.price_review_required && (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">
                        Мерчант хянана
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">{fmtDate(v.last_price_sync_at)}</span>
                  </div>
                </div>
              );
            })}
            {changesQ.data?.length === 0 && (
              <div className="py-6 text-center text-muted-foreground">Үнэ өөрчлөгдсөн бараа алга.</div>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Барааны нэр засах</DialogTitle>
          </DialogHeader>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Барааны шинэ нэр"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Болих
            </Button>
            <Button
              disabled={renameMut.isPending || !editName.trim() || editName.trim() === editing?.name}
              onClick={() =>
                editing && renameMut.mutate({ productId: editing.id, name: editName.trim() })
              }
            >
              {renameMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Хадгалах
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
