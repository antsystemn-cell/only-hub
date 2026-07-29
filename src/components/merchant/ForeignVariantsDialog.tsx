// Merchant dialog: manage foreign-product variants (add / edit / delete),
// and per-variant manual price override with a revert-to-source toggle.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, RotateCcw, Save, Lock } from "lucide-react";
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
      if (r.manual_price_override && (!r.manual_customer_price_mnt || r.manual_customer_price_mnt <= 0)) {
        throw new Error("Гараар үнэ оруулна уу.");
      }
      await upsertFn({
        data: {
          productId,
          variantId: r.id ?? null,
          sizeLabel: r.size_label || null,
          colorLabel: r.color_label || null,
          sourcePrice: r.source_price ?? null,
          manualPriceOverride: r.manual_price_override,
          manualCustomerPriceMnt: r.manual_price_override ? r.manual_customer_price_mnt ?? null : null,
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
                <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending}>
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
  });

  const dirty =
    row.size_label !== (v.size_label ?? "") ||
    row.color_label !== (v.color_label ?? "") ||
    row.source_price !== (v.source_price ?? null) ||
    row.manual_price_override !== !!v.manual_price_override ||
    (row.manual_price_override && row.manual_customer_price_mnt !== (v.manual_customer_price_mnt ?? null)) ||
    row.is_purchasable !== !!v.is_purchasable ||
    row.is_visible !== !!v.is_visible;

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
        <Button size="sm" onClick={() => onSave(row)} disabled={!dirty || pending}>
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
      <div className="rounded-lg border border-dashed p-2">
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">Гараар үнэ тохируулах</span>
          <Switch
            checked={row.manual_price_override}
            onCheckedChange={(v) => onChange({ ...row, manual_price_override: v })}
          />
        </label>
        <Input
          type="number"
          disabled={!row.manual_price_override}
          value={row.manual_customer_price_mnt ?? ""}
          onChange={(e) =>
            onChange({
              ...row,
              manual_customer_price_mnt: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          placeholder="Хэрэглэгчийн үнэ (MNT)"
          className="mt-2"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Асаавал энэ үнэ мөрдөгдөнө. Унтраавал эх линкээс дахин тооцоолно.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={row.is_purchasable}
          onCheckedChange={(v) => onChange({ ...row, is_purchasable: v })}
        />
        Захиалж болно
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={row.is_visible}
          onCheckedChange={(v) => onChange({ ...row, is_visible: v })}
        />
        Харагдана
      </label>
    </div>
  );
}
