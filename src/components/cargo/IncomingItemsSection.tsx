import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Package2, Plus, Pencil, Trash2, X, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  listIncomingCargoItems,
  createIncomingCargoItem,
  updateIncomingCargoItem,
  deleteIncomingCargoItem,
  reconcileIncomingCargoStatuses,
  searchMerchantProducts,
  listProductVariants,
} from "@/lib/onlycargo/incoming.functions";
import { useEffect } from "react";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  planned: { label: "Төлөвлөсөн", cls: "bg-muted text-foreground" },
  waiting_arrival: { label: "Замд", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  ready_to_receive: { label: "Хүлээж авахад бэлэн", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  received: { label: "Хүлээн авсан", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  cancelled: { label: "Цуцалсан", cls: "bg-destructive/10 text-destructive" },
};

function statusBadge(s: string) {
  const cfg = STATUS_LABEL[s] ?? { label: s, cls: "bg-muted" };
  return <span className={"inline-flex px-2 py-0.5 rounded text-xs " + cfg.cls}>{cfg.label}</span>;
}

export function IncomingItemsSection({
  merchantId,
  trackNumber,
  cargoStatus,
}: {
  merchantId: string;
  trackNumber: string;
  cargoStatus?: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listIncomingCargoItems);
  const reconcileFn = useServerFn(reconcileIncomingCargoStatuses);
  const [adding, setAdding] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["incoming-cargo-items", merchantId, trackNumber],
    queryFn: () => listFn({ data: { merchantId, trackNumber } }),
  });

  // Auto-reconcile statuses against the cargo status (one-shot per dialog open).
  useEffect(() => {
    if (!cargoStatus) return;
    reconcileFn({ data: { merchantId, trackNumber, cargoStatus } })
      .then((r: any) => {
        if (r?.updated) {
          qc.invalidateQueries({ queryKey: ["incoming-cargo-items", merchantId, trackNumber] });
          qc.invalidateQueries({ queryKey: ["incoming-cargo-summary", merchantId] });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId, trackNumber, cargoStatus]);

  const summary = useMemo(() => {
    const items = rows.length;
    const plannedQty = rows.reduce((s: number, r: any) => s + Number(r.planned_quantity ?? 0), 0);
    const receivedQty = rows.reduce((s: number, r: any) => s + Number(r.received_quantity ?? 0), 0);
    const plannedCost = rows.reduce(
      (s: number, r: any) => s + Number(r.planned_quantity ?? 0) * Number(r.planned_unit_cost ?? 0),
      0,
    );
    const ready = rows.filter((r: any) => r.status === "ready_to_receive").length;
    return { items, plannedQty, receivedQty, plannedCost, ready, remaining: Math.max(0, plannedQty - receivedQty) };
  }, [rows]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Package2 className="h-4 w-4" /> Энэ ачаан дахь бараа
        </h3>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Бараа нэмэх
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <SummaryStat label="Бараа" value={summary.items.toLocaleString("mn-MN")} />
        <SummaryStat label="Нийт тоо" value={summary.plannedQty.toLocaleString("mn-MN")} />
        <SummaryStat label="Хүлээн авсан" value={summary.receivedQty.toLocaleString("mn-MN")} />
        <SummaryStat label="Үлдсэн" value={summary.remaining.toLocaleString("mn-MN")} />
        <SummaryStat label="Зардал ₮" value={summary.plannedCost ? summary.plannedCost.toLocaleString("mn-MN") : "-"} />
      </div>

      {adding && (
        <AddItemForm
          merchantId={merchantId}
          trackNumber={trackNumber}
          cargoStatus={cargoStatus}
          onClose={() => setAdding(false)}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Бараа бүртгээгүй байна.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Бараа</TableHead>
                <TableHead className="text-right">Тоо</TableHead>
                <TableHead className="text-right">Нэгж үнэ</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <ItemRow key={r.id} row={r} merchantId={merchantId} trackNumber={trackNumber} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/40 px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function ItemRow({ row, merchantId, trackNumber }: { row: any; merchantId: string; trackNumber: string }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateIncomingCargoItem);
  const deleteFn = useServerFn(deleteIncomingCargoItem);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.planned_product_name as string);
  const [qty, setQty] = useState(String(row.planned_quantity ?? ""));
  const [cost, setCost] = useState(row.planned_unit_cost == null ? "" : String(row.planned_unit_cost));
  const [notes, setNotes] = useState((row.notes as string | null) ?? "");

  const updateMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          merchantId,
          id: row.id,
          plannedProductName: name.trim(),
          plannedQuantity: Number(qty),
          plannedUnitCost: cost === "" ? null : Number(cost),
          notes: notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Шинэчиллээ");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["incoming-cargo-items", merchantId, trackNumber] });
      qc.invalidateQueries({ queryKey: ["incoming-cargo-summary", merchantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const statusMut = useMutation({
    mutationFn: (status: string) =>
      updateFn({ data: { merchantId, id: row.id, status: status as any } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incoming-cargo-items", merchantId, trackNumber] });
      qc.invalidateQueries({ queryKey: ["incoming-cargo-summary", merchantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { merchantId, id: row.id } }),
    onSuccess: () => {
      toast.success("Устгалаа");
      qc.invalidateQueries({ queryKey: ["incoming-cargo-items", merchantId, trackNumber] });
      qc.invalidateQueries({ queryKey: ["incoming-cargo-summary", merchantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  if (editing) {
    return (
      <TableRow>
        <TableCell colSpan={5}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Барааны нэр" />
            <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="0" step="0.01" placeholder="Тоо" />
            <Input value={cost} onChange={(e) => setCost(e.target.value)} type="number" min="0" step="0.01" placeholder="Нэгж үнэ" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
                {updateMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Хадгалах
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Болих</Button>
            </div>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Тэмдэглэл" className="md:col-span-4 min-h-[60px]" />
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <div className="text-sm font-medium">{row.planned_product_name}</div>
        {row.product_id && <div className="text-[10px] text-muted-foreground">Холбоосон бараа</div>}
        {row.notes && <div className="text-xs text-muted-foreground mt-0.5">{row.notes}</div>}
      </TableCell>
      <TableCell className="text-right text-sm">
        {Number(row.planned_quantity ?? 0).toLocaleString("mn-MN")}
      </TableCell>
      <TableCell className="text-right text-sm">
        {row.planned_unit_cost == null ? "-" : Number(row.planned_unit_cost).toLocaleString("mn-MN") + "₮"}
      </TableCell>
      <TableCell>
        <Select value={row.status} onValueChange={(v) => statusMut.mutate(v)}>
          <SelectTrigger className="h-7 w-[180px]">
            <SelectValue>{statusBadge(row.status)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          <Button size="icon" variant="ghost" onClick={() => setEditing(true)} title="Засах">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              if (confirm("Устгах уу?")) deleteMut.mutate();
            }}
            title="Устгах"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function AddItemForm({
  merchantId,
  trackNumber,
  cargoStatus,
  onClose,
}: {
  merchantId: string;
  trackNumber: string;
  cargoStatus?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createIncomingCargoItem);
  const [mode, setMode] = useState<"existing" | "planned">("planned");

  // existing-product picker state
  const [q, setQ] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [variantId, setVariantId] = useState<string>("");

  // shared inputs
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  const searchFn = useServerFn(searchMerchantProducts);
  const variantsFn = useServerFn(listProductVariants);

  const productsQuery = useQuery({
    queryKey: ["merchant-products-search", merchantId, q],
    queryFn: () => searchFn({ data: { merchantId, q: q.trim() || undefined, limit: 15 } }),
    enabled: mode === "existing" && !selectedProduct,
  });

  const variantsQuery = useQuery({
    queryKey: ["product-variants", merchantId, selectedProduct?.id],
    queryFn: () => variantsFn({ data: { merchantId, productId: selectedProduct!.id } }),
    enabled: !!selectedProduct,
  });

  const initialStatus =
    cargoStatus === "arrived" || cargoStatus === "ready_for_pickup"
      ? "ready_to_receive"
      : ["in_transit", "processing", "received"].includes(cargoStatus ?? "")
        ? "waiting_arrival"
        : "planned";

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          merchantId,
          trackNumber,
          productId: mode === "existing" ? selectedProduct?.id ?? null : null,
          variantId: mode === "existing" && variantId ? variantId : null,
          plannedProductName: name.trim() || (selectedProduct?.name ?? ""),
          plannedQuantity: Number(qty),
          plannedUnitCost: cost === "" ? null : Number(cost),
          notes: notes.trim() || null,
          initialStatus,
        },
      }),
    onSuccess: () => {
      toast.success("Бараа нэмлээ");
      qc.invalidateQueries({ queryKey: ["incoming-cargo-items", merchantId, trackNumber] });
      qc.invalidateQueries({ queryKey: ["incoming-cargo-summary", merchantId] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-md bg-background p-0.5 border">
          <button
            type="button"
            onClick={() => setMode("planned")}
            className={"px-3 py-1 text-xs rounded " + (mode === "planned" ? "bg-primary text-primary-foreground" : "")}
          >
            Шинэ (төлөвлөсөн)
          </button>
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={"px-3 py-1 text-xs rounded " + (mode === "existing" ? "bg-primary text-primary-foreground" : "")}
          >
            Дэлгүүрийн бараа
          </button>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {mode === "existing" && (
        <div className="space-y-2">
          {!selectedProduct ? (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Барааны нэр, кодоор хайх..."
                  className="pl-8"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded border bg-background divide-y">
                {productsQuery.isLoading ? (
                  <div className="p-3 text-xs text-muted-foreground">Уншиж байна…</div>
                ) : (productsQuery.data ?? []).length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">Бараа олдсонгүй</div>
                ) : (
                  (productsQuery.data ?? []).map((p: any) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        setSelectedProduct(p);
                        setName(p.name);
                      }}
                      className="flex items-center gap-2 w-full text-left p-2 hover:bg-muted text-sm"
                    >
                      {p.thumbnail_url || p.image_url ? (
                        <img src={p.thumbnail_url || p.image_url} alt="" className="h-8 w-8 rounded object-cover border" />
                      ) : (
                        <div className="h-8 w-8 rounded border bg-muted" />
                      )}
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.product_code && <span className="text-[10px] text-muted-foreground">{p.product_code}</span>}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded border bg-background p-2">
              <div className="flex items-center gap-2 min-w-0">
                {selectedProduct.thumbnail_url || selectedProduct.image_url ? (
                  <img src={selectedProduct.thumbnail_url || selectedProduct.image_url} alt="" className="h-8 w-8 rounded object-cover border" />
                ) : null}
                <span className="truncate text-sm font-medium">{selectedProduct.name}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setSelectedProduct(null); setVariantId(""); }}>
                Солих
              </Button>
            </div>
          )}

          {selectedProduct && (variantsQuery.data ?? []).length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Хувилбар</Label>
              <Select value={variantId} onValueChange={setVariantId}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Сонгох (заавал биш)" />
                </SelectTrigger>
                <SelectContent>
                  {(variantsQuery.data ?? []).map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {[v.color_label, v.size_label, v.label].filter(Boolean).join(" / ") || v.option_signature || v.id.slice(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {mode === "planned" && (
        <div className="space-y-1">
          <Label className="text-xs">Барааны нэр *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Жишээ: Nike Air Max" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Тоо ширхэг *</Label>
          <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="0" step="0.01" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Хүлээгдэж буй нэгж үнэ (₮)</Label>
          <Input value={cost} onChange={(e) => setCost(e.target.value)} type="number" min="0" step="0.01" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Тэмдэглэл</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px]">Эхлэх төлөв: {STATUS_LABEL[initialStatus].label}</Badge>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Болих</Button>
          <Button
            size="sm"
            disabled={
              createMut.isPending ||
              !qty ||
              Number(qty) <= 0 ||
              (mode === "existing" && !selectedProduct) ||
              (mode === "planned" && !name.trim())
            }
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Нэмэх
          </Button>
        </div>
      </div>
    </div>
  );
}
