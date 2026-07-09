import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, PackageOpen, ChevronRight } from "lucide-react";
import { listInventoryBatches, listBatchesForProduct, getBatchDetail } from "@/lib/onlycargo/costs.functions";

type Mode = { kind: "inventory"; inventoryItemId: string; title?: string }
          | { kind: "product"; productId: string; title?: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  merchantId: string | null | undefined;
  mode: Mode | null;
}

function fmt(n: any) {
  if (n == null) return "-";
  return Number(n).toLocaleString("mn-MN");
}
function fmtDate(s: any) {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleDateString("mn-MN", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch { return "-"; }
}

export function PurchaseHistoryDialog({ open, onOpenChange, merchantId, mode }: Props) {
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const listInvFn = useServerFn(listInventoryBatches);
  const listProdFn = useServerFn(listBatchesForProduct);
  const detailFn = useServerFn(getBatchDetail);

  const enabled = !!(open && merchantId && mode);
  const queryKey = mode
    ? mode.kind === "inventory"
      ? ["batches-inv", merchantId, mode.inventoryItemId]
      : ["batches-prod", merchantId, mode.productId]
    : ["batches-none"];

  const { data: batches, isLoading } = useQuery({
    queryKey,
    enabled,
    queryFn: () => {
      if (!merchantId || !mode) return [] as any[];
      if (mode.kind === "inventory")
        return listInvFn({ data: { merchantId, inventoryItemId: mode.inventoryItemId } });
      return listProdFn({ data: { merchantId, productId: mode.productId } });
    },
  });

  const { data: detail, isFetching: detailLoading } = useQuery({
    queryKey: ["batch-detail", merchantId, selectedBatchId],
    enabled: !!(merchantId && selectedBatchId),
    queryFn: () => detailFn({ data: { merchantId: merchantId!, batchId: selectedBatchId! } }),
  });

  const rows = batches ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelectedBatchId(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Худалдан авалтын түүх{mode?.title ? ` — ${mode.title}` : ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-10 text-center flex flex-col items-center gap-2">
            <PackageOpen className="h-8 w-8" />
            Худалдан авалтын бүртгэл алга.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Track №</TableHead>
                    <TableHead>Хүлээн авсан</TableHead>
                    <TableHead className="text-right">Тоо</TableHead>
                    <TableHead className="text-right">Үлдэгдэл</TableHead>
                    <TableHead className="text-right">Заран/Гэмтэл</TableHead>
                    <TableHead className="text-right">Худ.үнэ</TableHead>
                    <TableHead className="text-right">Landed</TableHead>
                    <TableHead>Агуулах</TableHead>
                    <TableHead>Төлөв</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((b: any) => (
                    <TableRow
                      key={b.id}
                      className={selectedBatchId === b.id ? "bg-muted/50" : ""}
                    >
                      <TableCell className="font-mono text-xs">{b.track_number ?? "-"}</TableCell>
                      <TableCell className="text-xs">{fmtDate(b.received_at)}</TableCell>
                      <TableCell className="text-right">{fmt(b.quantity)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(b.remaining_quantity)}</TableCell>
                      <TableCell className="text-right text-xs">
                        {fmt(b.sold_quantity)} / {fmt(b.damaged_quantity)}
                      </TableCell>
                      <TableCell className="text-right">{fmt(b.purchase_price)}₮</TableCell>
                      <TableCell className="text-right font-medium text-primary">{fmt(b.landed_cost)}₮</TableCell>
                      <TableCell className="text-xs">{b.warehouse_location ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={b.status === "active" ? "default" : "secondary"}>
                          {b.status ?? "active"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedBatchId(b.id)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {selectedBatchId && (
              <div className="border rounded-md p-4 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Batch дэлгэрэнгүй</h3>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedBatchId(null)}>
                    Хаах
                  </Button>
                </div>
                {detailLoading || !detail ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">Худалдан авалт</div>
                      <div>Track: <span className="font-mono">{detail.batch.track_number ?? "-"}</span></div>
                      <div>Хүлээн авсан: {fmtDate(detail.batch.received_at)}</div>
                      <div>Тоо: {fmt(detail.batch.quantity)} → Үлдэгдэл {fmt(detail.batch.remaining_quantity)}</div>
                      <div>Заран/Гэмтэл: {fmt(detail.batch.sold_quantity)} / {fmt(detail.batch.damaged_quantity)}</div>
                      <div>Худ. үнэ: {fmt(detail.batch.purchase_price)}₮</div>
                      <div>Landed: {fmt(detail.batch.landed_cost)}₮</div>
                      <div>Агуулах: {detail.batch.warehouse_location ?? "-"}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">Ачааны зардал</div>
                      {detail.shipmentCost ? (
                        <>
                          <div>Cargo: {fmt(detail.shipmentCost.cargo_fee)}₮</div>
                          <div>Гааль: {fmt(detail.shipmentCost.customs_fee)}₮</div>
                          <div>Дотоод хүрг.: {fmt(detail.shipmentCost.local_delivery_fee)}₮</div>
                          <div>Бусад: {fmt(detail.shipmentCost.other_expenses)}₮</div>
                          <div>Хуваарилалт: {detail.shipmentCost.allocation_method ?? "-"}</div>
                        </>
                      ) : (
                        <div className="text-xs text-muted-foreground">Зардал бүртгэгдээгүй.</div>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Сүүлийн хөдөлгөөн</div>
                      {detail.movements.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Хөдөлгөөн алга.</div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                          {detail.movements.map((m: any) => (
                            <div key={m.id} className="flex justify-between border-b border-border/40 py-1">
                              <span>{fmtDate(m.created_at)} · {m.movement_type}</span>
                              <span className="font-mono">{fmt(m.quantity)} ({fmt(m.before_quantity)}→{fmt(m.after_quantity)})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
