// Merchant dialog: manage foreign-product variants (add / edit / delete),
// and per-variant manual price override with a revert-to-source toggle.
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, RotateCcw, Save, Lock, PowerOff } from "lucide-react";
import { fmtMnt } from "@/lib/format";
import {
  listProductVariants,
  upsertProductVariant,
  deleteProductVariant,
  revertVariantToSourcePrice,
} from "@/lib/foreign-orders/variants.functions";

type Row = {
  id?: string;
  size_label: string | null;
  color_label: string | null;
  source_price: number | null;
  rounded_customer_price_mnt: number | null;
  final_customer_price_mnt: number | null;
  manual_price_override: boolean;
  manual_customer_price_mnt: number | null;
  is_purchasable: boolean;
  is_visible: boolean;
  // Yuan pricing fields
  use_yuan_pricing?: boolean;
  yuan_price?: number | null;
  yuan_exchange_rate?: number;
  profit_margin_percent?: number;
  extra_fixed_fee_mnt?: number;
  // Local state for persistence during "Add" mode
  is_purchasable: boolean;
  is_visible: boolean;
};

const blank: Row = {
  size_label: "",
  color_label: "",
  source_price: null,
  rounded_customer_price_mnt: null,
  final_customer_price_mnt: null,
  manual_price_override: false,
  manual_customer_price_mnt: null,
  is_purchasable: true,
  is_visible: true,
  use_yuan_pricing: false,
  yuan_price: null,
  yuan_exchange_rate: 535,
  profit_margin_percent: 25,
  extra_fixed_fee_mnt: 30000,
};

export function ForeignVariantsDialog({
  open,
  onOpenChange,
  productId,
  productName,
  sourceCurrency,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string | null;
  productName: string;
  sourceCurrency?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Хувилбарууд — {productName}</DialogTitle>
        </DialogHeader>
        <ForeignVariantsManager productId={productId} sourceCurrency={sourceCurrency} />
      </DialogContent>
    </Dialog>
  );
}

export function ForeignVariantsManager({
  productId,
  sourceCurrency,
}: {
  productId: string | null;
  sourceCurrency?: string | null;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProductVariants);
  const upsertFn = useServerFn(upsertProductVariant);
  const deleteFn = useServerFn(deleteProductVariant);
  const revertFn = useServerFn(revertVariantToSourcePrice);

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["product-variants", productId],
    enabled: !!productId,
    queryFn: async () =>
      productId ? ((await listFn({ data: { productId } })) as any[]) : [],
  });

  const [draft, setDraft] = useState<Row>(blank);
  const [showAdd, setShowAdd] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["product-variants", productId] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const save = useMutation({
    mutationFn: async (r: Row) => {
      if (!productId) return;
      
      let finalManualMnt = r.manual_customer_price_mnt;
      let isManual = r.manual_price_override;

      if (r.use_yuan_pricing && r.yuan_price) {
        const rate = r.yuan_exchange_rate ?? 535;
        const margin = r.profit_margin_percent ?? 25;
        const extra = r.extra_fixed_fee_mnt ?? 30000;
        const base = r.yuan_price * rate;
        const withMargin = base * (1 + margin / 100);
        finalManualMnt = Math.round((withMargin + extra) / 1000) * 1000;
        isManual = true;
      }

      if (isManual && (!finalManualMnt || finalManualMnt <= 0)) {
        throw new Error("Гараар үнэ оруулна уу.");
      }
      
      await upsertFn({
        data: {
          productId,
          variantId: r.id ?? null,
          sizeLabel: r.size_label || null,
          colorLabel: r.color_label || null,
          sourcePrice: r.source_price ?? null,
          manualPriceOverride: isManual,
          manualCustomerPriceMnt: isManual ? finalManualMnt ?? null : null,
          isPurchasable: r.is_purchasable,
          isVisible: r.is_visible,
        },
      });
    },
    onSuccess: () => {
      toast.success("Хадгаллаа");
      setDraft(blank);
      setShowAdd(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Алдаа"),
  });

  const disableAllVariants = async () => {
    if (!variants.length || !productId) return;
    if (!confirm("Бүх хувилбарыг идэвхгүй болгох уу? (Захиалж болохгүй, Харагдахгүй)")) return;

    try {
      toast.info("Боловсруулж байна...");
      for (const v of variants) {
        await upsertFn({
          data: {
            productId,
            variantId: v.id,
            sizeLabel: v.size_label,
            colorLabel: v.color_label,
            sourcePrice: v.source_price,
            manualPriceOverride: !!v.manual_price_override,
            manualCustomerPriceMnt: v.manual_customer_price_mnt,
            isPurchasable: false,
            isVisible: false,
          }
        });
      }
      toast.success("Бүх хувилбарыг идэвхгүй болголоо");
      invalidate();
    } catch (err: any) {
      toast.error(err.message || "Алдаа гарлаа");
    }
  };

  const remove = useMutation({
    mutationFn: async (variantId: string) => {
      await deleteFn({ data: { variantId } });
    },
    onSuccess: () => {
      toast.success("Устгалаа");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Алдаа"),
  });

  const revert = useMutation({
    mutationFn: async (variantId: string) => {
      await revertFn({ data: { variantId } });
    },
    onSuccess: () => {
      toast.success("Эх линк дээрх үнэ рүү буцаалаа");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Алдаа"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Хувилбарын жагсаалт</h3>
        {variants.length > 0 && (
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5"
            onClick={disableAllVariants}
          >
            <PowerOff className="mr-1.5 h-3.5 w-3.5" />
            Бүгдийг идэвхгүй болгох
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Уншиж байна…</p>
      ) : (
        <>
          {variants.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Хувилбар алга. Доор "Хувилбар нэмэх" дээр дарж эхлүүлнэ үү.
            </p>
          )}

          {variants.map((v: any) => (
            <VariantRow
              key={v.id}
              v={v}
              sourceCurrency={sourceCurrency}
              onSave={(row) => save.mutate({ ...row, id: v.id })}
              onDelete={() => {
                if (confirm(`"${v.label ?? "энэ хувилбар"}"-ыг устгах уу?`)) remove.mutate(v.id);
              }}
              onRevert={() => revert.mutate(v.id)}
              pending={save.isPending || remove.isPending || revert.isPending}
            />
          ))}

          {showAdd ? (
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
              <div className="mb-2 text-sm font-medium">Шинэ хувилбар</div>
              <VariantEditor row={draft} onChange={setDraft} sourceCurrency={sourceCurrency} />
              <div className="mt-3 flex gap-2">
                <Button 
                  size="sm" 
                  onClick={() => {
                    // Pre-calculate Yuan price into manual_customer_price_mnt if active
                    let finalRow = { ...draft };
                    if (draft.use_yuan_pricing && draft.yuan_price) {
                      const rate = draft.yuan_exchange_rate ?? 535;
                      const margin = draft.profit_margin_percent ?? 25;
                      const extra = draft.extra_fixed_fee_mnt ?? 30000;
                      const base = draft.yuan_price * rate;
                      const withMargin = base * (1 + margin / 100);
                      finalRow.manual_customer_price_mnt = Math.round((withMargin + extra) / 1000) * 1000;
                      finalRow.manual_price_override = true;
                    }
                    save.mutate(finalRow);
                  }} 
                  disabled={save.isPending}
                >
                  <Save className="mr-1 h-3.5 w-3.5" />
                  {save.isPending ? "Хадгалж байна…" : "Хадгалах"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setDraft(blank); }}>
                  Болих
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => { setDraft(blank); setShowAdd(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Хувилбар нэмэх
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function VariantRow({
  v,
  onSave,
  onDelete,
  onRevert,
  sourceCurrency,
  pending,
}: {
  v: any;
  onSave: (row: Row) => void;
  onDelete: () => void;
  onRevert: () => void;
  sourceCurrency?: string | null;
  pending: boolean;
}) {
  const [row, setRow] = useState<Row>({
    id: v.id,
    size_label: v.size_label ?? "",
    color_label: v.color_label ?? "",
    source_price: v.source_price ?? null,
    rounded_customer_price_mnt: v.rounded_customer_price_mnt ?? null,
    final_customer_price_mnt: v.final_customer_price_mnt ?? null,
    manual_price_override: !!v.manual_price_override,
    manual_customer_price_mnt: v.manual_customer_price_mnt ?? v.rounded_customer_price_mnt ?? null,
    is_purchasable: !!v.is_purchasable,
    is_visible: !!v.is_visible,
    use_yuan_pricing: false,
    yuan_price: null,
    yuan_exchange_rate: 535,
    profit_margin_percent: 25,
    extra_fixed_fee_mnt: 30000,
  });

  const dirty =
    row.size_label !== (v.size_label ?? "") ||
    row.color_label !== (v.color_label ?? "") ||
    row.source_price !== (v.source_price ?? null) ||
    row.manual_price_override !== !!v.manual_price_override ||
    (row.manual_price_override && !row.use_yuan_pricing && row.manual_customer_price_mnt !== (v.manual_customer_price_mnt ?? null)) ||
    row.is_purchasable !== !!v.is_purchasable ||
    row.is_visible !== !!v.is_visible ||
    row.use_yuan_pricing;

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{v.label ?? "—"}</span>
        {v.manual_price_override && (
          <Badge className="gap-1 bg-amber-100 text-amber-700">
            <Lock className="h-3 w-3" /> Гараар түгжсэн
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px]">
          {v.availability_status ?? "—"}
        </Badge>
        <div className="ml-auto text-xs text-muted-foreground">
          Одоогийн үнэ: <b className="text-foreground">{fmtMnt(Number(v.rounded_customer_price_mnt ?? 0))}</b>
        </div>
      </div>

      <VariantEditor row={row} onChange={setRow} sourceCurrency={sourceCurrency} />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button 
          size="sm" 
          onClick={() => {
            let finalRow = { ...row };
            if (row.use_yuan_pricing && row.yuan_price) {
              const rate = row.yuan_exchange_rate ?? 535;
              const margin = row.profit_margin_percent ?? 25;
              const extra = row.extra_fixed_fee_mnt ?? 30000;
              const base = row.yuan_price * rate;
              const withMargin = base * (1 + margin / 100);
              finalRow.manual_customer_price_mnt = Math.round((withMargin + extra) / 1000) * 1000;
              finalRow.manual_price_override = true;
            }
            onSave(finalRow);
          }} 
          disabled={!dirty || pending}
        >
          <Save className="mr-1 h-3.5 w-3.5" /> Хадгалах
        </Button>
        {v.manual_price_override && (
          <Button size="sm" variant="outline" onClick={onRevert} disabled={pending}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Эх линкээр үнэлэх
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={onDelete} disabled={pending}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Устгах
        </Button>
      </div>
    </div>
  );
}

function VariantEditor({
  row,
  onChange,
  sourceCurrency,
}: {
  row: Row;
  onChange: (r: Row) => void;
  sourceCurrency?: string | null;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <Label className="text-xs">Хэмжээ</Label>
        <Input
          value={row.size_label ?? ""}
          onChange={(e) => onChange({ ...row, size_label: e.target.value })}
          placeholder="Жишээ: 260 / M / 32"
        />
      </div>
      <div>
        <Label className="text-xs">Өнгө</Label>
        <Input
          value={row.color_label ?? ""}
          onChange={(e) => onChange({ ...row, color_label: e.target.value })}
          placeholder="Жишээ: Хар / Улаан"
        />
      </div>
      
      <div>
        <Label className="text-xs">
          Эх үнэ ({sourceCurrency ?? "KRW"}) — автомат тооцоолол
        </Label>
        <Input
          type="number"
          value={row.source_price ?? ""}
          onChange={(e) =>
            onChange({ ...row, source_price: e.target.value === "" ? null : Number(e.target.value) })
          }
          placeholder="0"
        />
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3">
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">Үнийг Yuan-аар оруулах</span>
          <Switch
            checked={row.use_yuan_pricing ?? false}
            onCheckedChange={(v) => onChange({ ...row, use_yuan_pricing: v })}
          />
        </label>
        
        {row.use_yuan_pricing && (
          <div className="grid gap-2 pt-2 border-t border-border">
            <div>
              <Label className="text-[11px]">Yuan үнэ</Label>
              <Input
                type="number"
                value={row.yuan_price ?? ""}
                onChange={(e) => onChange({ ...row, yuan_price: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="0.00"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Yuan ханш (₮)</Label>
                <Input type="number" value={row.yuan_exchange_rate ?? 535} onChange={(e) => onChange({ ...row, yuan_exchange_rate: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-[11px]">+ Margin (%)</Label>
                <Input type="number" value={row.profit_margin_percent ?? 25} onChange={(e) => onChange({ ...row, profit_margin_percent: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label className="text-[11px]">+ Нэмэлт дүн (₮)</Label>
              <Input type="number" value={row.extra_fixed_fee_mnt ?? 30000} onChange={(e) => onChange({ ...row, extra_fixed_fee_mnt: Number(e.target.value) })} />
            </div>
            {row.yuan_price && (
              <p className="text-[10px] text-primary font-medium">
                Тооцоолсон дүн: {fmtMnt(Math.round(((row.yuan_price * (row.yuan_exchange_rate || 535)) * (1 + (row.profit_margin_percent || 25) / 100) + (row.extra_fixed_fee_mnt || 30000)) / 1000) * 1000)}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-dashed p-3 space-y-3 bg-muted/20">
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">Гараар үнэ тохируулах (MNT)</span>
          <Switch
            checked={row.manual_price_override}
            disabled={row.use_yuan_pricing}
            onCheckedChange={(v) => onChange({ ...row, manual_price_override: v })}
          />
        </label>
        <Input
          type="number"
          disabled={!row.manual_price_override || row.use_yuan_pricing}
          value={row.manual_customer_price_mnt ?? ""}
          onChange={(e) =>
            onChange({
              ...row,
              manual_customer_price_mnt: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          placeholder="Хэрэглэгчийн үнэ (MNT)"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {row.use_yuan_pricing ? "Yuan тооцоолол идэвхтэй байна." : "Асаавал энэ үнэ мөрдөгдөнө."}
        </p>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Switch
            id={`purchasable-${row.id || 'new'}`}
            checked={row.is_purchasable}
            onCheckedChange={(v) => onChange({ ...row, is_purchasable: v })}
          />
          <Label htmlFor={`purchasable-${row.id || 'new'}`} className="text-sm font-normal cursor-pointer">
            Захиалж болно
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id={`visible-${row.id || 'new'}`}
            checked={row.is_visible}
            onCheckedChange={(v) => onChange({ ...row, is_visible: v })}
          />
          <Label htmlFor={`visible-${row.id || 'new'}`} className="text-sm font-normal cursor-pointer">
            Харагдана
          </Label>
        </div>
      </div>
    </div>
  );
}
