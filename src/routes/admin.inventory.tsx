import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Boxes } from "lucide-react";
import {
  adminListInventoryItems,
  adminListInventoryMovements,
} from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/admin/inventory")({
  component: AdminInventoryPage,
});

function AdminInventoryPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Boxes className="h-7 w-7" /> Нөөц (Бүх мерчант)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Зөвхөн харах эрх.</p>
      </div>
      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Нөөцийн жагсаалт</TabsTrigger>
          <TabsTrigger value="movements">Хөдөлгөөн</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="mt-4"><AdminItems /></TabsContent>
        <TabsContent value="movements" className="mt-4"><AdminMovements /></TabsContent>
      </Tabs>
    </div>
  );
}

function AdminItems() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const listFn = useServerFn(adminListInventoryItems);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-inventory-items", search, page],
    queryFn: () => listFn({ data: { q: search || undefined, page, pageSize } }),
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className="p-4 space-y-4">
      <form className="flex gap-2 max-w-md" onSubmit={(e) => { e.preventDefault(); setSearch(q); setPage(1); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Нэр, SKU, track №..." />
        <Button type="submit" variant="secondary">Хайх</Button>
      </form>
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Бичлэг алга.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Мерчант</TableHead>
                  <TableHead>Нэр</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Нийт</TableHead>
                  <TableHead className="text-right">Боломжит</TableHead>
                  <TableHead>Карго</TableHead>
                  <TableHead>Шинэчилсэн</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.merchants?.name ?? r.merchant_id.slice(0, 8)}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.sku ?? "-"}</TableCell>
                    <TableCell className="text-right">{Number(r.quantity_on_hand)}</TableCell>
                    <TableCell className="text-right font-semibold">{Number(r.quantity_available)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.source_cargo_tracking_number ?? "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleString("mn-MN")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-between pt-2">
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

function AdminMovements() {
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const listFn = useServerFn(adminListInventoryMovements);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-inventory-movements", page],
    queryFn: () => listFn({ data: { page, pageSize } }),
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className="p-4 space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Хөдөлгөөн алга.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Огноо</TableHead>
                  <TableHead>Мерчант</TableHead>
                  <TableHead>Бараа</TableHead>
                  <TableHead>Төрөл</TableHead>
                  <TableHead className="text-right">Тоо</TableHead>
                  <TableHead className="text-right">Дараа</TableHead>
                  <TableHead>Эх үүсвэр</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("mn-MN")}</TableCell>
                    <TableCell className="text-sm">{r.merchants?.name ?? r.merchant_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm">{r.inventory_items?.name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{r.movement_type}</Badge></TableCell>
                    <TableCell className="text-right">{Number(r.quantity)}</TableCell>
                    <TableCell className="text-right font-semibold">{Number(r.after_quantity)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.source_reference ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-between pt-2">
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
