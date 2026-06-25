import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, PackageOpen } from "lucide-react";
import { listInventoryItems } from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/merchant/dashboard/inventory/")({
  component: InventoryListPage,
});

function InventoryListPage() {
  const { primaryMerchantId } = useAuth();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const listFn = useServerFn(listInventoryItems);
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
                    <TableHead className="text-right">Нийт</TableHead>
                    <TableHead className="text-right">Түгжсэн</TableHead>
                    <TableHead className="text-right">Боломжит</TableHead>
                    <TableHead>Нэгж</TableHead>
                    <TableHead>Эх үүсвэр</TableHead>
                    <TableHead>Байршил</TableHead>
                    <TableHead>Шинэчилсэн</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.sku ?? "-"}</TableCell>
                      <TableCell className="text-right">{Number(r.quantity_on_hand).toLocaleString("mn-MN")}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {Number(r.quantity_reserved).toLocaleString("mn-MN")}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {Number(r.quantity_available).toLocaleString("mn-MN")}
                      </TableCell>
                      <TableCell className="text-sm">{r.unit}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.source_cargo_tracking_number ? (
                          <span className="font-mono">{r.source_cargo_tracking_number}</span>
                        ) : (
                          r.source_type ?? "-"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{r.warehouse_location ?? "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.updated_at).toLocaleString("mn-MN")}
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
              <div className="flex items-center gap-2">
                <Badge variant="outline">Бараатай холбох — дараагийн шатанд</Badge>
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
    </div>
  );
}
