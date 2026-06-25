import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, PackagePlus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { listMerchantCargo } from "@/lib/onlycargo/cargo.functions";
import { createInventoryFromCargo, findInventoryByCargoTracking } from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/merchant/dashboard/inventory/from-cargo")({
  component: FromCargoPage,
});

const ELIGIBLE_STATUSES = ["arrived", "ready_for_pickup", "completed"];

function FromCargoPage() {
  const { primaryMerchantId } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("arrived");
  const [selected, setSelected] = useState<any | null>(null);

  const listFn = useServerFn(listMerchantCargo);
  const cargoQuery = useQuery({
    queryKey: ["inventory-from-cargo", primaryMerchantId, statusFilter],
    enabled: !!primaryMerchantId,
    queryFn: () =>
      listFn({
        data: { merchantId: primaryMerchantId!, status: statusFilter, page: 1, pageSize: 50 },
      }),
  });

  if (!primaryMerchantId) return <div className="text-muted-foreground">Дэлгүүр сонгоно уу.</div>;

  const rows = cargoQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Статус:</span>
          {ELIGIBLE_STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
            >
              {s === "arrived" ? "Ирсэн" : s === "ready_for_pickup" ? "Бэлэн" : "Хүлээлгэсэн"}
            </Button>
          ))}
        </div>

        {cargoQuery.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : cargoQuery.isError ? (
          <div className="text-sm text-destructive py-6 text-center">
            {String((cargoQuery.error as any)?.message ?? "Алдаа")}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-10 text-center">
            Нөөцлөх боломжтой ачаа алга.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Track №</TableHead>
                  <TableHead>Тайлбар</TableHead>
                  <TableHead className="text-right">Жин (кг)</TableHead>
                  <TableHead className="text-right">Үнэ ₮</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Байршил</TableHead>
                  <TableHead>Огноо</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.track_number}>
                    <TableCell className="font-mono text-xs">{r.track_number}</TableCell>
                    <TableCell className="text-sm">{r.description ?? "-"}</TableCell>
                    <TableCell className="text-right text-sm">{r.weight != null ? Number(r.weight).toFixed(2) : "-"}</TableCell>
                    <TableCell className="text-right text-sm">{r.price != null ? Number(r.price).toLocaleString("mn-MN") : "-"}</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.location ?? "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.updated_at ? new Date(r.updated_at).toLocaleDateString("mn-MN") : "-"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => setSelected(r)}>
                        <PackagePlus className="mr-1.5 h-3.5 w-3.5" /> Нөөцөд бүртгэх
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <ConvertDialog
        merchantId={primaryMerchantId}
        cargo={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function ConvertDialog({
  merchantId,
  cargo,
  onClose,
}: {
  merchantId: string;
  cargo: any | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState<string>("1");
  const [unit, setUnit] = useState("pcs");
  const [costPrice, setCostPrice] = useState<string>("");
  const [warehouse, setWarehouse] = useState("");
  const [note, setNote] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const findFn = useServerFn(findInventoryByCargoTracking);
  const createFn = useServerFn(createInventoryFromCargo);

  const trackNumber = cargo?.track_number ?? "";

  const dupQuery = useQuery({
    queryKey: ["inventory-dup", merchantId, trackNumber],
    enabled: !!cargo,
    queryFn: () => findFn({ data: { merchantId, trackingNumber: trackNumber } }),
  });
  const existing = dupQuery.data?.items ?? [];
  const hasDup = existing.length > 0;

  const reset = () => {
    setName(""); setSku(""); setQuantity("1"); setUnit("pcs");
    setCostPrice(""); setWarehouse(""); setNote(""); setAllowDuplicate(false);
  };

  const mut = useMutation({
    mutationFn: async () => {
      const qty = Number(quantity);
      if (!name.trim()) throw new Error("Нэр шаардлагатай");
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Тоо ширхэг буруу");
      return createFn({
        data: {
          merchantId,
          trackingNumber: trackNumber,
          cargoId: cargo?.id ? String(cargo.id) : undefined,
          name: name.trim(),
          sku: sku.trim() || undefined,
          quantity: qty,
          unit: unit.trim() || "pcs",
          costPrice: costPrice ? Number(costPrice) : undefined,
          warehouseLocation: warehouse.trim() || undefined,
          note: note.trim() || undefined,
          allowDuplicate,
        },
      });
    },
    onSuccess: (res: any) => {
      if (res?.duplicate) {
        toast.warning(res.message ?? "Энэ карго аль хэдийн нөөцөд бүртгэгдсэн байна.");
        return;
      }
      toast.success("Нөөцөд бүртгэлээ");
      qc.invalidateQueries({ queryKey: ["inventory-list"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      reset();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  return (
    <Dialog open={!!cargo} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Каргоноос нөөцөд бүртгэх</DialogTitle>
          <DialogDescription>
            Track №: <span className="font-mono">{trackNumber}</span>
          </DialogDescription>
        </DialogHeader>

        {hasDup && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium">Энэ карго аль хэдийн нөөцөд бүртгэгдсэн байна.</p>
                <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                  {existing.map((it: any) => (
                    <li key={it.id}>• {it.name} — {Number(it.quantity_on_hand)} {it.unit}</li>
                  ))}
                </ul>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} />
              Дахин нэмэлт нөөцийн бичлэг үүсгэхийг зөвшөөрөх
            </label>
          </div>
        )}

        <div className="grid gap-3">
          <div>
            <Label>Бүтээгдэхүүний нэр *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Жнь: Гутал 42-р" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>SKU</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div>
              <Label>Нэгж</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Тоо ширхэг *</Label>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label>Өртөг (₮)</Label>
              <Input type="number" min={0} value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Агуулахын байршил</Label>
            <Input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="Жнь: A-12" />
          </div>
          <div>
            <Label>Тэмдэглэл</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Болих</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || (hasDup && !allowDuplicate)}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Бүртгэх
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
