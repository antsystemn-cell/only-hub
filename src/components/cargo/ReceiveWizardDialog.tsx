import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, PackageCheck, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, ClipboardCheck,
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listIncomingCargoItems } from "@/lib/onlycargo/incoming.functions";
import { receiveIncomingCargoItems } from "@/lib/onlycargo/receive.functions";

type Draft = {
  incoming_item_id: string;
  received_quantity: number;
  damaged_quantity: number;
  unit_cost: number | null;
  notes: string;
};

const STEPS = [
  { key: 1, label: "Ачаа" },
  { key: 2, label: "Бараа" },
  { key: 3, label: "Тоо хэмжээ" },
  { key: 4, label: "Баталгаажуулах" },
] as const;

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

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["incoming-cargo-items", merchantId, trackNumber],
    queryFn: () => listFn({ data: { merchantId, trackNumber } }),
    enabled: open,
  });

  // exclude items already fully received or cancelled
  const receivable = useMemo(
    () =>
      (rows as any[]).filter(
        (r) => r.status !== "received" && r.status !== "cancelled",
      ),
    [rows],
  );

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [done, setDone] = useState<null | {
    items_received: number;
    total_units: number;
    total_damaged: number;
    inventory_updated: number;
    pending_planned: number;
  }>(null);

  // seed drafts on open / data change
  useMemo(() => {
    if (!open) return;
    const next: Record<string, Draft> = {};
    for (const r of receivable) {
      const remaining = Math.max(
        0,
        Number(r.planned_quantity ?? 0) -
          Number(r.received_quantity ?? 0) -
          Number(r.damaged_quantity ?? 0),
      );
      next[r.id] = drafts[r.id] ?? {
        incoming_item_id: r.id,
        received_quantity: remaining,
        damaged_quantity: 0,
        unit_cost: r.planned_unit_cost == null ? null : Number(r.planned_unit_cost),
        notes: "",
      };
    }
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rows]);

  function resetAndClose(v: boolean) {
    if (!v) {
      setStep(1);
      setDone(null);
      setDrafts({});
    }
    onOpenChange(v);
  }

  const totals = useMemo(() => {
    let units = 0,
      damaged = 0,
      lines = 0;
    for (const d of Object.values(drafts)) {
      if (d.received_quantity > 0 || d.damaged_quantity > 0) lines++;
      units += d.received_quantity;
      damaged += d.damaged_quantity;
    }
    return { units, damaged, lines };
  }, [drafts]);

  const confirmMut = useMutation({
    mutationFn: () =>
      receiveFn({
        data: {
          merchantId,
          trackNumber,
          items: Object.values(drafts)
            .filter((d) => d.received_quantity > 0 || d.damaged_quantity > 0)
            .map((d) => ({
              incoming_item_id: d.incoming_item_id,
              received_quantity: d.received_quantity,
              damaged_quantity: d.damaged_quantity,
              unit_cost: d.unit_cost ?? null,
              notes: d.notes.trim() || null,
            })),
        },
      }),
    onSuccess: (res: any) => {
      toast.success("Хүлээн авлаа");
      qc.invalidateQueries({ queryKey: ["incoming-cargo-items", merchantId, trackNumber] });
      qc.invalidateQueries({ queryKey: ["incoming-cargo-summary", merchantId] });
      qc.invalidateQueries({ queryKey: ["incoming-cargo-receipts", merchantId, trackNumber] });
      qc.invalidateQueries({ queryKey: ["inventory-items", merchantId] });
      setDone({
        items_received: Number(res?.items_received ?? 0),
        total_units: Number(res?.total_units ?? 0),
        total_damaged: Number(res?.total_damaged ?? 0),
        inventory_updated: Number(res?.inventory_updated ?? 0),
        pending_planned: Number(res?.pending_planned ?? 0),
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
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

        {/* Stepper */}
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
                  Дараагийн алхамд барааны жагсаалт, хүлээн авах тоог тохируулна. Нөөц зөвхөн
                  баталгаажуулсны дараа л өөрчлөгдөнө.
                </div>
              </Card>
            )}

            {step === 2 && (
              <Card className="p-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Бараа</TableHead>
                      <TableHead className="text-right">Хүлээгдэж буй</TableHead>
                      <TableHead className="text-right">Өмнө авсан</TableHead>
                      <TableHead className="text-right">Үлдсэн</TableHead>
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
                  const remaining = Math.max(
                    0,
                    Number(r.planned_quantity ?? 0) -
                      Number(r.received_quantity ?? 0) -
                      Number(r.damaged_quantity ?? 0),
                  );
                  const total = d.received_quantity + d.damaged_quantity;
                  const over = total > remaining;
                  return (
                    <Card key={r.id} className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <div className="font-medium text-sm">{r.planned_product_name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Үлдсэн: <b>{remaining.toLocaleString("mn-MN")}</b>
                          </div>
                        </div>
                        {over && (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertTriangle className="h-3 w-3 mr-1" /> Үлдэгдлээс хэтэрсэн
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Хүлээн авсан</Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={d.received_quantity}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [r.id]: { ...d, received_quantity: Number(e.target.value || 0) },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Гэмтэлтэй</Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={d.damaged_quantity}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [r.id]: { ...d, damaged_quantity: Number(e.target.value || 0) },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Нэгж зардал ₮</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={d.unit_cost ?? ""}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [r.id]: {
                                  ...d,
                                  unit_cost: e.target.value === "" ? null : Number(e.target.value),
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Тэмдэглэл</Label>
                          <Input
                            value={d.notes}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [r.id]: { ...d, notes: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
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
                <div className="text-xs text-muted-foreground border-t pt-3 flex gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  Баталгаажуулмагц нөөц нэмэгдэж, холбоосон бараанд автоматаар sync хийгдэнэ.
                </div>
                <Textarea placeholder="Нэмэлт тэмдэглэл (заавал биш)" className="min-h-[60px]" />
              </Card>
            )}

            {/* Nav */}
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
                <Button onClick={() => setStep((s) => (s + 1) as any)}>
                  Үргэлжлүүлэх <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={() => confirmMut.mutate()}
                  disabled={confirmMut.isPending || totals.lines === 0}
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
