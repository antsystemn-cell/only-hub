import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { listInventoryMovements } from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/merchant/dashboard/inventory/movements")({
  component: MovementsPage,
});

const TYPE_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  cargo_received: { label: "Каргоноос", variant: "default" },
  manual_adjustment: { label: "Гар тохируулга", variant: "secondary" },
  correction: { label: "Засвар", variant: "secondary" },
  reserved: { label: "Түгжсэн", variant: "outline" },
  released: { label: "Чөлөөлсөн", variant: "outline" },
  sold: { label: "Зарагдсан", variant: "default" },
  returned: { label: "Буцаасан", variant: "destructive" },
};

function MovementsPage() {
  const { primaryMerchantId } = useAuth();
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const listFn = useServerFn(listInventoryMovements);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inventory-movements", primaryMerchantId, page],
    enabled: !!primaryMerchantId,
    queryFn: () => listFn({ data: { merchantId: primaryMerchantId!, page, pageSize } }),
  });

  if (!primaryMerchantId) return <div className="text-muted-foreground">Дэлгүүр сонгоно уу.</div>;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className="p-4 space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <div className="text-sm text-destructive py-6 text-center">{String((error as any)?.message ?? "Алдаа")}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Хөдөлгөөн алга.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Огноо</TableHead>
                  <TableHead>Бараа</TableHead>
                  <TableHead>Төрөл</TableHead>
                  <TableHead className="text-right">Тоо</TableHead>
                  <TableHead className="text-right">Өмнө</TableHead>
                  <TableHead className="text-right">Дараа</TableHead>
                  <TableHead>Эх үүсвэр</TableHead>
                  <TableHead>Тэмдэглэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r: any) => {
                  const t = TYPE_LABEL[r.movement_type] ?? { label: r.movement_type, variant: "outline" as const };
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("mn-MN")}</TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{r.inventory_items?.name ?? "—"}</div>
                        {r.inventory_items?.sku && <div className="text-xs text-muted-foreground font-mono">{r.inventory_items.sku}</div>}
                      </TableCell>
                      <TableCell><Badge variant={t.variant}>{t.label}</Badge></TableCell>
                      <TableCell className={`text-right font-medium ${Number(r.quantity) > 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {Number(r.quantity) > 0 ? "+" : ""}{Number(r.quantity)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{Number(r.before_quantity)}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">{Number(r.after_quantity)}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{r.source_reference ?? "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.note ?? "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-between items-center pt-2">
              <span className="text-sm text-muted-foreground">Нийт: {total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Өмнөх</Button>
                <span className="text-sm self-center">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Дараах</Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
