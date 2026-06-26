import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, Save, Calculator } from "lucide-react";
import { toast } from "sonner";
import {
  getShipmentCostSummary,
  saveShipmentCosts,
} from "@/lib/onlycargo/costs.functions";
import { AllocateCostsDialog } from "./AllocateCostsDialog";

function fmt(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("mn-MN", { maximumFractionDigits: 2 });
}

export function ShipmentCostSummary({
  merchantId,
  trackNumber,
}: {
  merchantId: string;
  trackNumber: string;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getShipmentCostSummary);
  const saveFn = useServerFn(saveShipmentCosts);

  const { data, isLoading } = useQuery({
    queryKey: ["shipment-cost", merchantId, trackNumber],
    queryFn: () => getFn({ data: { merchantId, trackNumber } }),
  });

  const cost = (data as any)?.cost;
  const batches = ((data as any)?.batches ?? []) as any[];
  const purchaseTotal = Number((data as any)?.purchaseTotal ?? 0);

  const [cargoFee, setCargoFee] = useState("0");
  const [customsFee, setCustomsFee] = useState("0");
  const [localDelivery, setLocalDelivery] = useState("0");
  const [otherExpenses, setOtherExpenses] = useState("0");
  const [allocOpen, setAllocOpen] = useState(false);

  useEffect(() => {
    if (cost) {
      setCargoFee(String(cost.cargo_fee ?? 0));
      setCustomsFee(String(cost.customs_fee ?? 0));
      setLocalDelivery(String(cost.local_delivery_fee ?? 0));
      setOtherExpenses(String(cost.other_expenses ?? 0));
    }
  }, [cost?.cargo_fee, cost?.customs_fee, cost?.local_delivery_fee, cost?.other_expenses]);

  const totals = useMemo(() => {
    const cf = Number(cargoFee) || 0;
    const cs = Number(customsFee) || 0;
    const ld = Number(localDelivery) || 0;
    const ot = Number(otherExpenses) || 0;
    return {
      expense: cf + cs + ld + ot,
      landed: purchaseTotal + cf + cs + ld + ot,
    };
  }, [cargoFee, customsFee, localDelivery, otherExpenses, purchaseTotal]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          merchantId,
          trackNumber,
          cargoFee: Number(cargoFee) || 0,
          customsFee: Number(customsFee) || 0,
          localDeliveryFee: Number(localDelivery) || 0,
          otherExpenses: Number(otherExpenses) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Зардал хадгалагдлаа");
      qc.invalidateQueries({ queryKey: ["shipment-cost", merchantId, trackNumber] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Ачааны зардлын тооцоо
        </h3>
        {cost?.allocation_method && (
          <Badge variant="outline" className="text-xs">
            Хуваарилсан: {cost.allocation_method}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Барааны худалдан авалт" value={fmt(purchaseTotal) + "₮"} />
            <Stat label="Нийт нэмэлт зардал" value={fmt(totals.expense) + "₮"} />
            <Stat
              label="Нийт landed cost"
              value={fmt(totals.landed) + "₮"}
              highlight
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Карго төлбөр (₮)" value={cargoFee} onChange={setCargoFee} />
            <Field label="Гаалийн төлбөр (₮)" value={customsFee} onChange={setCustomsFee} />
            <Field label="Дотоодын хүргэлт (₮)" value={localDelivery} onChange={setLocalDelivery} />
            <Field label="Бусад зардал (₮)" value={otherExpenses} onChange={setOtherExpenses} />
          </div>

          <div className="flex flex-wrap gap-2 justify-end pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Хадгалах
            </Button>
            <Button
              size="sm"
              onClick={() => setAllocOpen(true)}
              disabled={batches.length === 0}
              title={batches.length === 0 ? "Эхлээд бараа хүлээн авна уу" : "Зардал хуваарилах"}
            >
              <Calculator className="mr-1.5 h-4 w-4" /> Зардал хуваарилах
            </Button>
          </div>

          {batches.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Зардал хуваарилахын өмнө дор хаяж нэг бараа хүлээн авсан байх ёстой.
            </p>
          )}
        </>
      )}

      <AllocateCostsDialog
        open={allocOpen}
        onOpenChange={setAllocOpen}
        merchantId={merchantId}
        trackNumber={trackNumber}
        batches={batches}
        purchaseTotal={purchaseTotal}
        defaults={{
          cargoFee: Number(cargoFee) || 0,
          customsFee: Number(customsFee) || 0,
          localDeliveryFee: Number(localDelivery) || 0,
          otherExpenses: Number(otherExpenses) || 0,
        }}
      />
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2.5 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );
}
