import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, PackageCheck, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle,
  ClipboardCheck, Split, Plus, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listIncomingCargoItems } from "@/lib/onlycargo/incoming.functions";
import {
  receiveIncomingCargoItems,
  getReceiveValidationContext,
} from "@/lib/onlycargo/receive.functions";

type SplitLine = {
  variant_id: string | null;
  received_quantity: number;
  damaged_quantity: number;
  unit_cost: number | null;
  notes: string;
};

type Draft = {
  incoming_item_id: string;
  received_quantity: number;
  damaged_quantity: number;
  unit_cost: number | null;
  notes: string;
  variant_id: string | null; // override / current
  allow_extra: boolean;
  splits: SplitLine[] | null; // null = not split
};

const STEPS = [
  { key: 1, label: "Ачаа" },
  { key: 2, label: "Бараа" },
  { key: 3, label: "Хувилбар / Тоо" },
  { key: 4, label: "Баталгаажуулах" },
] as const;

function variantLabel(v: any): string {
  return (
    v?.label ||
    [v?.size_label, v?.color_label].filter(Boolean).join(" / ") ||
    v?.option_signature ||
    v?.id?.slice(0, 6) ||
    "хувилбар"
  );
}

function normalizeQty(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function ReceiveWizardDialog({
  open,
  onOpenChange,
  merchantId,
  trackNumber,
  cargoStatus,
  cargoSummary,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  merchantId: string;
  trackNumber: string;
  cargoStatus?: string;
  cargoSummary?: { weight?: any; description?: string | null };
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listIncomingCargoItems);
  const receiveFn = useServerFn(receiveIncomingCargoItems);
  const ctxFn = useServerFn(getReceiveValidationContext);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["incoming-cargo-items", merchantId, trackNumber],
    queryFn: () => listFn({ data: { merchantId, trackNumber } }),
    enabled: open,
  });

  const receivable = useMemo(
    () =>
      (rows as any[]).filter(
        (r) => r.status !== "received" && r.status !== "cancelled",
      ),
    [rows],
  );

  const linkedProductIds = useMemo(
    () =>
      Array.from(
        new Set(
          receivable.map((r) => r.product_id).filter(Boolean) as string[],
        ),
      ),
    [receivable],
  );

  const { data: ctx } = useQuery({
    queryKey: ["receive-ctx", merchantId, linkedProductIds.sort().join(",")],
    queryFn: () =>
      ctxFn({ data: { merchantId, productIds: linkedProductIds } }),
    enabled: open && linkedProductIds.length > 0,
  });

  const variantsByProduct: Record<string, any[]> = ctx?.variants ?? {};

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [done, setDone] = useState<null | {
    items_received: number;
    total_units: number;
    total_damaged: number;
    inventory_updated: number;
    pending_planned: number;
  }>(null);

  // Seed drafts when dialog opens or data loads.
  useEffect(() => {
    if (!open) return;
    setDrafts((prev) => {
      const next: Record<string, Draft> = { ...prev };
      for (const r of receivable) {
        if (next[r.id]) continue;
        const remaining = Math.max(
          0,
          Number(r.planned_quantity ?? 0) -
            Number(r.received_quantity ?? 0) -
            Number(r.damaged_quantity ?? 0),
        );
        next[r.id] = {
          incoming_item_id: r.id,
          received_quantity: remaining,
          damaged_quantity: 0,
          unit_cost: r.planned_unit_cost == null ? null : Number(r.planned_unit_cost),
          notes: "",
          variant_id: r.variant_id ?? null,
          allow_extra: false,
          splits: null,
        };
      }
      return next;
    });
  }, [open, receivable]);

  function resetAndClose(v: boolean) {
    if (!v) {
      setStep(1);
      setDone(null);
      setDrafts({});
    }
    onOpenChange(v);
  }

  function patch(id: string, p: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  function addSplit(id: string) {
    setDrafts((prev) => {
      const d = prev[id];
      const base: SplitLine = {
        variant_id: null,
        received_quantity: 0,
        damaged_quantity: 0,
        unit_cost: d.unit_cost,
        notes: "",
      };
      const splits = d.splits ?? [
        {
          variant_id: d.variant_id,
          received_quantity: d.received_quantity,
          damaged_quantity: d.damaged_quantity,
          unit_cost: d.unit_cost,
          notes: d.notes,
        },
      ];
      return { ...prev, [id]: { ...d, splits: [...splits, base] } };
    });
  }

  function updateSplit(id: string, idx: number, p: Partial<SplitLine>) {
    setDrafts((prev) => {
      const d = prev[id];
      if (!d.splits) return prev;
      const splits = d.splits.map((s, i) => (i === idx ? { ...s, ...p } : s));
      return { ...prev, [id]: { ...d, splits } };
    });
  }

  function removeSplit(id: string, idx: number) {
    setDrafts((prev) => {
      const d = prev[id];
      if (!d.splits) return prev;
      const splits = d.splits.filter((_, i) => i !== idx);
      return {
        ...prev,
        [id]: { ...d, splits: splits.length === 0 ? null : splits },
      };
    });
  }

  function collapseSplits(id: string) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], splits: null } }));
  }

  // Validation for step 3 → step 4 progression.
  const validation = useMemo(() => {
    const errs: string[] = [];
    for (const r of receivable) {
      const d = drafts[r.id];
      if (!d) continue;
      const variants = r.product_id ? (variantsByProduct[r.product_id] ?? []) : [];
      const hasVariants = variants.length > 0;
      const remaining = Math.max(
        0,
        Number(r.planned_quantity ?? 0) -
          Number(r.received_quantity ?? 0) -
          Number(r.damaged_quantity ?? 0),
      );

      if (d.splits) {
        const total = d.splits.reduce(
          (s, l) => s + normalizeQty(l.received_quantity) + normalizeQty(l.damaged_quantity),
          0,
        );
        if (total === 0) continue;
        if (hasVariants && d.splits.some((l) => !l.variant_id)) {
          errs.push(`"${r.planned_product_name}" — хуваалт бүрд хувилбар сонгоно уу.`);
        }
        if (!d.allow_extra && total > remaining) {
          errs.push(`"${r.planned_product_name}" — хуваалтын нийлбэр үлдэгдлээс их байна.`);
        }
      } else {
        const total = normalizeQty(d.received_quantity) + normalizeQty(d.damaged_quantity);
        if (total === 0) continue;
        if (hasVariants && !d.variant_id) {
          errs.push(`"${r.planned_product_name}" — хувилбар сонгоно уу.`);
        }
        if (!d.allow_extra && total > remaining) {
          errs.push(`"${r.planned_product_name}" — Хүлээн авсан тоо төлөвлөснөөс их байна.`);
        }
      }
    }
    return errs;
  }, [receivable, drafts, variantsByProduct]);

  const totals = useMemo(() => {
    let units = 0, damaged = 0, lines = 0;
    for (const d of Object.values(drafts)) {
      if (d.splits) {
        for (const l of d.splits) {
          const r = normalizeQty(l.received_quantity);
          const dm = normalizeQty(l.damaged_quantity);
          if (r > 0 || dm > 0) lines++;
          units += r; damaged += dm;
        }
      } else {
        const r = normalizeQty(d.received_quantity);
        const dm = normalizeQty(d.damaged_quantity);
        if (r > 0 || dm > 0) lines++;
        units += r; damaged += dm;
      }
    }
    return { units, damaged, lines };
  }, [drafts]);

  const [requestId, setRequestId] = useState<string>(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36),
  );

  const confirmMut = useMutation({
    mutationFn: () =>
      receiveFn({
        data: {
          merchantId,
          trackNumber,
          requestId,
          items: Object.values(drafts)
            .map((d) => {
              if (d.splits) {
                const clean = d.splits
                  .filter((l) => normalizeQty(l.received_quantity) > 0 || normalizeQty(l.damaged_quantity) > 0)
                  .map((l) => ({
                    variant_id: l.variant_id,
                    received_quantity: normalizeQty(l.received_quantity),
                    damaged_quantity: normalizeQty(l.damaged_quantity),
                    unit_cost: l.unit_cost ?? null,
                    notes: l.notes.trim() || null,
                  }));
                if (clean.length === 0) return null;
                return {
                  incoming_item_id: d.incoming_item_id,
                  received_quantity: 0,
                  damaged_quantity: 0,
                  allow_extra: d.allow_extra,
                  splits: clean,
                };
              }
              if (d.received_quantity <= 0 && d.damaged_quantity <= 0) return null;
              return {
                incoming_item_id: d.incoming_item_id,
                received_quantity: normalizeQty(d.received_quantity),
                damaged_quantity: normalizeQty(d.damaged_quantity),
                unit_cost: d.unit_cost ?? null,
                notes: d.notes.trim() || null,
                variant_id: d.variant_id,
                allow_extra: d.allow_extra,
              };
            })
            .filter(Boolean) as any[],
        },
      }),
    onSuccess: (res: any) => {
      toast.success("Хүлээн авлаа");
      qc.invalidateQueries({ queryKey: ["incoming-cargo-items", merchantId, trackNumber] });
      qc.invalidateQueries({ queryKey: ["incoming-cargo-summary", merchantId] });
      qc.invalidateQueries({ queryKey: ["incoming-cargo-receipts", merchantId, trackNumber] });
      qc.invalidateQueries({ queryKey: ["inventory-items", merchantId] });
      qc.invalidateQueries({ queryKey: ["inventory-batches", merchantId] });
      setDone({
        items_received: Number(res?.items_received ?? 0),
        total_units: Number(res?.total_units ?? 0),
        total_damaged: Number(res?.total_damaged ?? 0),
        inventory_updated: Number(res?.inventory_updated ?? 0),
        pending_planned: Number(res?.pending_planned ?? 0),
      });
    },
    onError: (e: any) => {
      const code = String(e?.message ?? "").trim();
      const map: Record<string, string> = {
        shipment_mismatch: "Ачаа болон бараа таарахгүй байна",
        variant_required: "Хувилбар (size/color) сонгоно уу",
        invalid_variant: "Сонгосон хувилбар буруу байна",
        qty_exceeded: "Төлөвлөсөн тооноос хэтэрсэн байна",
        invalid_quantity: "Тоо хэмжээ буруу байна",
        invalid_unit_cost: "Нэгжийн үнэ буруу байна",
        item_cancelled: "Энэ мөр цуцлагдсан байна",
        incoming_item_not_found: "Ирэх бараа олдсонгүй",
        merchant_not_allowed: "Танд эрх байхгүй байна",
        inventory_locked: "Өөр оператор одоо хүлээн авч байна, дахин оролдоно уу",
        receive_failed: "Хүлээн авалт амжилтгүй боллоо",
      };
      toast.error(map[code] ?? code ?? "Алдаа");
      // Rotate request id so the retry is a fresh attempt, not an idempotent replay
      setRequestId(
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36),
      );
    },
  });


  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" /> Хүлээн авах урсгал
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{trackNumber}</span> • Нөөц рүү хүлээн авах
          </DialogDescription>
        </DialogHeader>

        {!done && (
          <ol className="grid grid-cols-4 gap-2 mb-2">
            {STEPS.map((s) => (
              <li
                key={s.key}
                className={cn(
                  "flex items-center gap-2 rounded border px-2 py-1.5 text-xs",
                  step === s.key
                    ? "border-primary text-primary font-semibold bg-primary/5"
                    : step > s.key
                      ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
                      : "text-muted-foreground",
                )}
              >
                {step > s.key ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <span className="h-4 w-4 rounded-full border text-[10px] inline-flex items-center justify-center">
                    {s.key}
                  </span>
                )}
                {s.label}
              </li>
            ))}
          </ol>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : done ? (
          <SuccessScreen
            done={done}
            trackNumber={trackNumber}
            onClose={() => resetAndClose(false)}
          />
        ) : receivable.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Хүлээн авах бараа байхгүй байна. Эхлээд "Энэ ачаан дахь бараа" хэсэгт бүртгэнэ үү.
          </div>
        ) : (
          <>
            {step === 1 && (
              <Card className="p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Track</span>
                  <span className="font-mono">{trackNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Ачааны төлөв</span>
                  <Badge variant="outline">{cargoStatus ?? "-"}</Badge>
                </div>
                {cargoSummary?.description && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Тайлбар</span>
                    <span className="text-right max-w-[60%]">{cargoSummary.description}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 text-xs text-muted-foreground">
                  Дараагийн алхмуудад бараа, хувилбар, бодит тоог баталгаажуулна. Нөөц зөвхөн эцсийн
                  баталгаажуулалтын дараа л шинэчлэгдэнэ.
                </div>
              </Card>
            )}

            {step === 2 && (
              <Card className="p-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Бараа</TableHead>
                      <TableHead className="text-right">Төлөвл.</TableHead>
                      <TableHead className="text-right">Өмнө</TableHead>
                      <TableHead className="text-right">Үлдсэн</TableHead>
                      <TableHead>Хувилбар</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivable.map((r: any) => {
                      const remaining = Math.max(
                        0,
                        Number(r.planned_quantity ?? 0) -
                          Number(r.received_quantity ?? 0) -
                          Number(r.damaged_quantity ?? 0),
                      );
                      const variants = r.product_id ? (variantsByProduct[r.product_id] ?? []) : [];
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{r.planned_product_name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {r.product_id ? "Холбоосон бараа" : "Төлөвлөсөн"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{Number(r.planned_quantity).toLocaleString("mn-MN")}</TableCell>
                          <TableCell className="text-right">{Number(r.received_quantity).toLocaleString("mn-MN")}</TableCell>
                          <TableCell className="text-right font-semibold">{remaining.toLocaleString("mn-MN")}</TableCell>
                          <TableCell className="text-xs">
                            {variants.length === 0
                              ? <span className="text-muted-foreground">—</span>
                              : <Badge variant="outline">{variants.length} хувилбар</Badge>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}

            {step === 3 && (
              <div className="space-y-3">
                {receivable.map((r: any) => {
                  const d = drafts[r.id];
                  if (!d) return null;
                  const variants: any[] = r.product_id ? (variantsByProduct[r.product_id] ?? []) : [];
                  const hasVariants = variants.length > 0;
                  const remaining = Math.max(
                    0,
                    Number(r.planned_quantity ?? 0) -
                      Number(r.received_quantity ?? 0) -
                      Number(r.damaged_quantity ?? 0),
                  );
                  const currentTotal = d.splits
                    ? d.splits.reduce((s, l) => s + normalizeQty(l.received_quantity) + normalizeQty(l.damaged_quantity), 0)
                    : normalizeQty(d.received_quantity) + normalizeQty(d.damaged_quantity);
                  const missing = Math.max(0, remaining - currentTotal);
                  const over = !d.allow_extra && currentTotal > remaining;

                  return (
                    <Card key={r.id} className="p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <div className="font-medium text-sm">{r.planned_product_name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Үлдсэн: <b>{remaining.toLocaleString("mn-MN")}</b>
                            {" • "}Дутуу: <b>{missing.toLocaleString("mn-MN")}</b>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {hasVariants && !d.splits && (
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              onClick={() => addSplit(r.id)}
                            >
                              <Split className="h-3.5 w-3.5 mr-1" /> Хувилбар болгон хуваах
                            </Button>
                          )}
                          {d.splits && (
                            <Button size="sm" variant="ghost" type="button" onClick={() => collapseSplits(r.id)}>
                              Хуваалт буцаах
                            </Button>
                          )}
                          {over && (
                            <Badge variant="destructive" className="text-[10px]">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Үлдэгдлээс их
                            </Badge>
                          )}
                        </div>
                      </div>

                      {!d.splits ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                            {hasVariants && (
                              <div className="space-y-1 md:col-span-2">
                                <Label className="text-[11px]">Хувилбар *</Label>
                                <Select
                                  value={d.variant_id ?? ""}
                                  onValueChange={(v) => patch(r.id, { variant_id: v || null })}
                                >
                                  <SelectTrigger className={cn(!d.variant_id && "border-destructive/60")}>
                                    <SelectValue placeholder="Хувилбар сонгох" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {variants.map((v) => (
                                      <SelectItem key={v.id} value={v.id}>{variantLabel(v)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <div className="space-y-1">
                              <Label className="text-[11px]">Хүлээн авсан</Label>
                              <Input
                                type="number" min="0" step="1"
                                value={d.received_quantity}
                                onChange={(e) => patch(r.id, { received_quantity: normalizeQty(e.target.value) })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Гэмтэлтэй</Label>
                              <Input
                                type="number" min="0" step="1"
                                value={d.damaged_quantity}
                                onChange={(e) => patch(r.id, { damaged_quantity: normalizeQty(e.target.value) })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Нэгж зардал ₮</Label>
                              <Input
                                type="number" min="0" step="0.01"
                                value={d.unit_cost ?? ""}
                                onChange={(e) => patch(r.id, { unit_cost: e.target.value === "" ? null : Number(e.target.value) })}
                              />
                            </div>
                          </div>
                          <Input
                            placeholder="Тэмдэглэл"
                            value={d.notes}
                            onChange={(e) => patch(r.id, { notes: e.target.value })}
                          />
                        </>
                      ) : (
                        <div className="space-y-2">
                          {d.splits.map((l, idx) => (
                            <div key={idx} className="rounded border p-2 space-y-2 bg-muted/30">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-medium">Хуваалт #{idx + 1}</span>
                                <Button
                                  size="icon" variant="ghost" type="button"
                                  onClick={() => removeSplit(r.id, idx)}
                                  className="h-6 w-6"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <div className="space-y-1 md:col-span-2">
                                  <Label className="text-[11px]">Хувилбар *</Label>
                                  <Select
                                    value={l.variant_id ?? ""}
                                    onValueChange={(v) => updateSplit(r.id, idx, { variant_id: v || null })}
                                  >
                                    <SelectTrigger className={cn(!l.variant_id && "border-destructive/60")}>
                                      <SelectValue placeholder="Хувилбар сонгох" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {variants.map((v) => (
                                        <SelectItem key={v.id} value={v.id}>{variantLabel(v)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Хүлээн авсан</Label>
                                  <Input
                                    type="number" min="0" step="1"
                                    value={l.received_quantity}
                                    onChange={(e) => updateSplit(r.id, idx, { received_quantity: normalizeQty(e.target.value) })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Гэмтэлтэй</Label>
                                  <Input
                                    type="number" min="0" step="1"
                                    value={l.damaged_quantity}
                                    onChange={(e) => updateSplit(r.id, idx, { damaged_quantity: normalizeQty(e.target.value) })}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                          <Button
                            size="sm" variant="outline" type="button"
                            onClick={() => addSplit(r.id)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Хуваалт нэмэх
                          </Button>
                        </div>
                      )}

                      {over && (
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={d.allow_extra}
                            onCheckedChange={(v) => patch(r.id, { allow_extra: !!v })}
                          />
                          Илүү хүлээн авахыг зөвшөөрөх
                        </label>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {step === 4 && (
              <Card className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Мөр" value={totals.lines} />
                  <Stat label="Хүлээн авах" value={totals.units} />
                  <Stat label="Гэмтэлтэй" value={totals.damaged} />
                </div>
                {validation.length > 0 && (
                  <div className="text-xs rounded border border-destructive/40 bg-destructive/5 text-destructive p-2 space-y-1">
                    {validation.map((e, i) => <div key={i}>• {e}</div>)}
                  </div>
                )}
                <div className="text-xs text-muted-foreground border-t pt-3 flex gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  Баталгаажуулмагц нөөц нэмэгдэж, холбоосон бараанд автоматаар sync хийгдэнэ.
                </div>
                <Textarea placeholder="Нэмэлт тэмдэглэл (заавал биш)" className="min-h-[60px]" />
              </Card>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => (step === 1 ? resetAndClose(false) : setStep((s) => (s - 1) as any))}
                disabled={confirmMut.isPending}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                {step === 1 ? "Болих" : "Буцах"}
              </Button>
              {step < 4 ? (
                <Button
                  onClick={() => {
                    if (step === 3 && validation.length > 0) {
                      toast.error(validation[0]);
                      return;
                    }
                    setStep((s) => (s + 1) as any);
                  }}
                >
                  Үргэлжлүүлэх <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={() => confirmMut.mutate()}
                  disabled={confirmMut.isPending || totals.lines === 0 || validation.length > 0}
                >
                  {confirmMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Хүлээн авч баталгаажуулах
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-muted/40 px-2 py-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{Number(value).toLocaleString("mn-MN")}</div>
    </div>
  );
}

function SuccessScreen({
  done,
  trackNumber,
  onClose,
}: {
  done: {
    items_received: number;
    total_units: number;
    total_damaged: number;
    inventory_updated: number;
    pending_planned: number;
  };
  trackNumber: string;
  onClose: () => void;
}) {
  return (
    <div className="py-4 space-y-4">
      <div className="flex flex-col items-center text-center gap-2">
        <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="font-semibold text-lg">Амжилттай хүлээн авлаа</h3>
        <p className="text-xs text-muted-foreground font-mono">{trackNumber}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Бараа" value={done.items_received} />
        <Stat label="Нэгж" value={done.total_units} />
        <Stat label="Гэмтэлтэй" value={done.total_damaged} />
        <Stat label="Нөөц шинэчлэгдсэн" value={done.inventory_updated} />
      </div>
      {done.pending_planned > 0 && (
        <div className="text-xs rounded border bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 p-2">
          {done.pending_planned} төлөвлөсөн бараа хүлээгдэж байна — Marketplace бараа автоматаар үүсэхгүй.
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={onClose}>Хаах</Button>
      </div>
    </div>
  );
}
