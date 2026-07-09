import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, PackageOpen, Link2, RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import { listInventoryItems } from "@/lib/inventory/inventory.functions";
import { manualSyncInventoryLink } from "@/lib/inventory/links.functions";
import { InventoryLinkDialog } from "@/components/inventory/InventoryLinkDialog";
import { PurchaseHistoryDialog } from "@/components/inventory/PurchaseHistoryDialog";

export const Route = createFileRoute("/merchant/dashboard/inventory/")({
  component: InventoryListPage,
});

function InventoryListPage() {
  const { primaryMerchantId } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [linkTarget, setLinkTarget] = useState<any | null>(null);
  const [historyTarget, setHistoryTarget] = useState<any | null>(null);
  const pageSize = 20;

  const listFn = useServerFn(listInventoryItems);
  const syncFn = useServerFn(manualSyncInventoryLink);
  const syncMut = useMutation({
    mutationFn: (inventoryItemId: string) =>
      syncFn({ data: { merchantId: primaryMerchantId!, inventoryItemId } }),
    onSuccess: (r: any) => {
      toast.success(`Stock шинэчиллээ (${r?.synced ?? 0})`);
      qc.invalidateQueries({ queryKey: ["inventory-list"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inventory-list", primaryMerchantId, search, status, lowStock, page],
    enabled: !!primaryMerchantId,
    queryFn: () =>
      listFn({
        data: {
          merchantId: primaryMerchantId!,
          q: search || undefined,
          status: status || undefined,
          lowStock,
          page,
          pageSize,
        },
      }),
  });

  if (!primaryMerchantId) {
    return <div className="text-muted-foreground">Дэлгүүр сонгоно уу.</div>;
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <form
            className="flex gap-2 flex-1 min-w-[200px] max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q.trim());
              setPage(1);
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Нэр, SKU, track №..."
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">Хайх</Button>
          </form>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Идэвхтэй</SelectItem>
              <SelectItem value="archived">Архив</SelectItem>
              <SelectItem value="all">Бүгд</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={lowStock ? "default" : "outline"}
            onClick={() => { setLowStock((v) => !v); setPage(1); }}
          >
            Бага үлдэгдэл
          </Button>
          <Button asChild className="ml-auto">
            <Link to="/merchant/dashboard/inventory/from-cargo">Каргогоос нэмэх</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="text-sm text-destructive py-6 text-center">
            {String((error as any)?.message ?? "Алдаа")}
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-10 text-center flex flex-col items-center gap-2">
            <PackageOpen className="h-8 w-8" />
            Нөөц алга. Каргогоос бүртгэж эхлээрэй.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Нэр</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Боломжит</TableHead>
                    <TableHead className="text-right">Сүүлийн худалдан авалт</TableHead>
                    <TableHead className="text-right">Дундаж landed</TableHead>
                    <TableHead className="text-right">Дундаж карго</TableHead>
                    <TableHead className="text-right">Хам.өндөр/нам</TableHead>
                    <TableHead>Эх үүсвэр</TableHead>
                    <TableHead className="text-right">Үйлдэл</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div>{r.name}</div>
                        <div className="text-[11px] text-muted-foreground">{r.unit} · {r.warehouse_location ?? "-"}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.sku ?? "-"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {Number(r.quantity_available).toLocaleString("mn-MN")}
                        <div className="text-[10px] text-muted-foreground">/ {Number(r.quantity_on_hand).toLocaleString("mn-MN")}</div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.last_purchase_cost == null ? "-" : Number(r.last_purchase_cost).toLocaleString("mn-MN") + "₮"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold text-primary">
                        {Number(r.landed_cost_avg || 0) === 0 ? "-" : Number(r.landed_cost_avg).toLocaleString("mn-MN") + "₮"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {Number(r.average_cargo_cost || 0) === 0 ? "-" : Number(r.average_cargo_cost).toLocaleString("mn-MN") + "₮"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {r.highest_cost == null ? "-" : Number(r.highest_cost).toLocaleString("mn-MN")}
                        {" / "}
                        {r.lowest_cost == null ? "-" : Number(r.lowest_cost).toLocaleString("mn-MN")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.source_cargo_tracking_number ? (
                          <span className="font-mono">{r.source_cargo_tracking_number}</span>
                        ) : (
                          r.source_type ?? "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setLinkTarget(r)}>
                            <Link2 className="h-3.5 w-3.5 mr-1" /> Холбох
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => syncMut.mutate(r.id)}
                            disabled={syncMut.isPending}
                            title="Stock шинэчлэх"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="text-sm text-muted-foreground">
                Нийт: {total.toLocaleString("mn-MN")}
              </div>
              {totalPages > 1 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Өмнөх</Button>
                  <span className="text-sm self-center">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Дараах</Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
      <InventoryLinkDialog
        open={!!linkTarget}
        onOpenChange={(v) => { if (!v) setLinkTarget(null); }}
        merchantId={primaryMerchantId}
        inventoryItem={linkTarget}
      />
    </div>
  );
}
