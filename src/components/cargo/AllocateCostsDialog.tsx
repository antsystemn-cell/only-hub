import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Calculator } from "lucide-react";
import { toast } from "sonner";
import { allocateCargoCosts } from "@/lib/onlycargo/costs.functions";

type Method = "quantity" | "value" | "manual";

function fmt(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("mn-MN", { maximumFractionDigits: 2 });
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  merchantId: string;
  trackNumber: string;
  batches: any[];
  purchaseTotal: number;
  defaults: {
    cargoFee: number;
    customsFee: number;
    localDeliveryFee: number;
    otherExpenses: number;
  };
}

export function AllocateCostsDialog({
  open,
  onOpenChange,
  merchantId,
  trackNumber,
  batches,
  purchaseTotal,
  defaults,
}: Props) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<Method>("value");
  const [cargoFee, setCargoFee] = useState(String(defaults.cargoFee));
  const [customsFee, setCustomsFee] = useState(String(defaults.customsFee));
  const [localDelivery, setLocalDelivery] = useState(String(defaults.localDeliveryFee));
  const [otherExpenses, setOtherExpenses] = useState(String(defaults.otherExpenses));
  const [manual, setManual] = useState<Record<string, { c: string; cu: string; o: string }>>({});

  useEffect(() => {
    if (open) {
      setCargoFee(String(defaults.cargoFee));
      setCustomsFee(String(defaults.customsFee));
      setLocalDelivery(String(defaults.localDeliveryFee));
      setOtherExpenses(String(defaults.otherExpenses));
      const init: Record<string, { c: string; cu: string; o: string }> = {};
      for (const b of batches) init[b.id] = { c: "0", cu: "0", o: "0" };
      setManual(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const totalQty = batches.reduce((s, b) => s + Number(b.quantity || 0), 0);
  const totalExpense =
    (Number(cargoFee) || 0) +
    (Number(customsFee) || 0) +
    (Number(localDelivery) || 0) +
    (Number(otherExpenses) || 0);

  const preview = useMemo(() => {
    return batches.map((b) => {
      const qty = Number(b.quantity) || 0;
      const price = Number(b.purchase_price) || 0;
      const value = qty * price;
      let cargo = 0;
      let customs = 0;
      let other = 0;
      if (method === "quantity" && totalQty > 0) {
        cargo = (Number(cargoFee) || 0) * (qty / totalQty);
        customs = (Number(customsFee) || 0) * (qty / totalQty);
        other = ((Number(localDelivery) || 0) + (Number(otherExpenses) || 0)) * (qty / totalQty);
      } else if (method === "value") {
        const share = purchaseTotal > 0 ? value / purchaseTotal : totalQty > 0 ? qty / totalQty : 0;
        cargo = (Number(cargoFee) || 0) * share;
        customs = (Number(customsFee) || 0) * share;
        other = ((Number(localDelivery) || 0) + (Number(otherExpenses) || 0)) * share;
      } else {
        const m = manual[b.id] ?? { c: "0", cu: "0", o: "0" };
        cargo = Number(m.c) || 0;
        customs = Number(m.cu) || 0;
        other = Number(m.o) || 0;
      }
      const landedPerUnit = price + (qty > 0 ? (cargo + customs + other) / qty : 0);
      return { batch: b, value, cargo, customs, other, landedPerUnit };
    });
  }, [batches, method, cargoFee, customsFee, localDelivery, otherExpenses, manual, purchaseTotal, totalQty]);

  const manualTotals = useMemo(() => {
    let c = 0, cu = 0, o = 0;
    for (const v of Object.values(manual)) {
      c += Number(v.c) || 0;
      cu += Number(v.cu) || 0;
      o += Number(v.o) || 0;
    }
    return { c, cu, o };
  }, [manual]);

  const allocFn = useServerFn(allocateCargoCosts);
  const allocMut = useMutation({
    mutationFn: () =>
      allocFn({
        data: {
          merchantId,
          trackNumber,
          method,
          cargoFee: Number(cargoFee) || 0,
          customsFee: Number(customsFee) || 0,
          localDeliveryFee: Number(localDelivery) || 0,
          otherExpenses: Number(otherExpenses) || 0,
          manual:
            method === "manual"
              ? batches.map((b) => ({
                  batch_id: b.id,
                  cargo_cost: Number(manual[b.id]?.c) || 0,
                  customs_cost: Number(manual[b.id]?.cu) || 0,
                  other_cost: Number(manual[b.id]?.o) || 0,
                }))
              : [],
        },
      }),
    onSuccess: () => {
      toast.success("Зардал амжилттай хуваариллаа");
      qc.invalidateQueries({ queryKey: ["shipment-cost", merchantId, trackNumber] });
      qc.invalidateQueries({ queryKey: ["inventory-list"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" /> Зардал хуваарилах
          </DialogTitle>
          <DialogDescription>
            Карго, гаалийн болон бусад зардлыг шошго бүрт хуваарилж landed cost тооцоолно.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumField label="Карго (₮)" value={cargoFee} onChange={setCargoFee} />
            <NumField label="Гааль (₮)" value={customsFee} onChange={setCustomsFee} />
            <NumField label="Дотоодын хүргэлт (₮)" value={localDelivery} onChange={setLocalDelivery} />
            <NumField label="Бусад (₮)" value={otherExpenses} onChange={setOtherExpenses} />
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Хуваарилах арга</Label>
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as Method)} className="grid md:grid-cols-3 gap-2">
              <MethodCard value="value" current={method} title="Үнэлгээгээр (санал)" desc="Худалдан авалтын үнэд харьцуулсан хувиар хуваарилна." />
              <MethodCard value="quantity" current={method} title="Тоо ширхэгээр" desc="Бүх бүтээгдэхүүн рүү ижил хувиар хуваагдана." />
              <MethodCard value="manual" current={method} title="Гараар" desc="Бүтээгдэхүүн бүрт зардлаа өөрөө оруулна." />
            </RadioGroup>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Бараа</TableHead>
                  <TableHead className="text-right">Тоо</TableHead>
                  <TableHead className="text-right">Худалдан авалт</TableHead>
                  {method === "manual" ? (
                    <>
                      <TableHead className="text-right">Карго</TableHead>
                      <TableHead className="text-right">Гааль</TableHead>
                      <TableHead className="text-right">Бусад</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="text-right">Хуваарилсан карго</TableHead>
                      <TableHead className="text-right">Гааль</TableHead>
                      <TableHead className="text-right">Бусад</TableHead>
                    </>
                  )}
                  <TableHead className="text-right">Landed/нэгж</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row) => (
                  <TableRow key={row.batch.id}>
                    <TableCell className="text-xs">
                      <div className="font-medium">{row.batch.track_number}</div>
                      <div className="text-muted-foreground font-mono">
                        {String(row.batch.id).slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{fmt(row.batch.quantity)}</TableCell>
                    <TableCell className="text-right">{fmt(row.value)}₮</TableCell>
                    {method === "manual" ? (
                      <>
                        <TableCell className="text-right">
                          <Input
                            className="h-7 text-xs text-right"
                            type="number" min="0" step="0.01"
                            value={manual[row.batch.id]?.c ?? "0"}
                            onChange={(e) =>
                              setManual((m) => ({ ...m, [row.batch.id]: { ...(m[row.batch.id] ?? { c: "0", cu: "0", o: "0" }), c: e.target.value } }))
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="h-7 text-xs text-right"
                            type="number" min="0" step="0.01"
                            value={manual[row.batch.id]?.cu ?? "0"}
                            onChange={(e) =>
                              setManual((m) => ({ ...m, [row.batch.id]: { ...(m[row.batch.id] ?? { c: "0", cu: "0", o: "0" }), cu: e.target.value } }))
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="h-7 text-xs text-right"
                            type="number" min="0" step="0.01"
                            value={manual[row.batch.id]?.o ?? "0"}
                            onChange={(e) =>
                              setManual((m) => ({ ...m, [row.batch.id]: { ...(m[row.batch.id] ?? { c: "0", cu: "0", o: "0" }), o: e.target.value } }))
                            }
                          />
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-right">{fmt(row.cargo)}₮</TableCell>
                        <TableCell className="text-right">{fmt(row.customs)}₮</TableCell>
                        <TableCell className="text-right">{fmt(row.other)}₮</TableCell>
                      </>
                    )}
                    <TableCell className="text-right font-semibold text-primary">
                      {fmt(row.landedPerUnit)}₮
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {method === "manual" && (
            <div className="text-xs text-muted-foreground">
              Гарын тооцоо нийт: Карго {fmt(manualTotals.c)}₮ · Гааль {fmt(manualTotals.cu)}₮ · Бусад {fmt(manualTotals.o)}₮ · Зорилго: {fmt(totalExpense)}₮
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={allocMut.isPending}>
            Болих
          </Button>
          <Button onClick={() => allocMut.mutate()} disabled={allocMut.isPending}>
            {allocMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Хуваарилах
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min="0" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}

function MethodCard({ value, current, title, desc }: { value: Method; current: Method; title: string; desc: string }) {
  const active = current === value;
  return (
    <label className={`flex gap-2 rounded-md border p-2.5 cursor-pointer ${active ? "border-primary bg-primary/5" : ""}`}>
      <RadioGroupItem value={value} className="mt-0.5" />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}
