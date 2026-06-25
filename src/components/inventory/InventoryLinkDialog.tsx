import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2, RefreshCw, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  listInventoryLinks,
  createInventoryLink,
  updateInventoryLink,
  deleteInventoryLink,
  manualSyncInventoryLink,
  listMerchantProductsForLink,
  listProductVariants,
} from "@/lib/inventory/links.functions";

export function InventoryLinkDialog({
  open,
  onOpenChange,
  merchantId,
  inventoryItem,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  merchantId: string;
  inventoryItem: { id: string; name: string; quantity_available?: number; unit?: string } | null;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listInventoryLinks);
  const createFn = useServerFn(createInventoryLink);
  const updateFn = useServerFn(updateInventoryLink);
  const deleteFn = useServerFn(deleteInventoryLink);
  const syncFn = useServerFn(manualSyncInventoryLink);
  const productsFn = useServerFn(listMerchantProductsForLink);
  const variantsFn = useServerFn(listProductVariants);

  const enabled = !!open && !!inventoryItem;

  const linksQ = useQuery({
    queryKey: ["inv-links", merchantId, inventoryItem?.id],
    enabled,
    queryFn: () =>
      listFn({ data: { merchantId, inventoryItemId: inventoryItem!.id } }),
  });

  const [productSearch, setProductSearch] = useState("");
  const productsQ = useQuery({
    queryKey: ["inv-link-products", merchantId, productSearch],
    enabled,
    queryFn: () =>
      productsFn({ data: { merchantId, q: productSearch || undefined, limit: 20 } }),
  });

  const [productId, setProductId] = useState<string>("");
  const [variantId, setVariantId] = useState<string>("");
  const [multiplier, setMultiplier] = useState<string>("1");
  const [autoSync, setAutoSync] = useState(true);

  const variantsQ = useQuery({
    queryKey: ["inv-link-variants", merchantId, productId],
    enabled: enabled && !!productId,
    queryFn: () => variantsFn({ data: { merchantId, productId } }),
  });
  const variants = variantsQ.data?.items ?? [];

  const reset = () => {
    setProductId("");
    setVariantId("");
    setMultiplier("1");
    setAutoSync(true);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inv-links"] });
    qc.invalidateQueries({ queryKey: ["inventory-list"] });
    qc.invalidateQueries({ queryKey: ["linked-product-ids"] });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const mult = Number(multiplier);
      if (!productId) throw new Error("Бараа сонгоно уу");
      if (!Number.isFinite(mult) || mult <= 0) throw new Error("Үржигдэхүүн буруу");
      return createFn({
        data: {
          merchantId,
          inventoryItemId: inventoryItem!.id,
          productId,
          variantId: variantId || undefined,
          syncMode: autoSync ? "auto" : "manual",
          quantityMultiplier: mult,
        },
      });
    },
    onSuccess: () => {
      toast.success("Холбоо үүслээ");
      reset();
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const deleteMut = useMutation({
    mutationFn: (linkId: string) => deleteFn({ data: { merchantId, linkId } }),
    onSuccess: () => {
      toast.success("Холбоо устгалаа");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { linkId: string; isActive: boolean }) =>
      updateFn({ data: { merchantId, linkId: v.linkId, isActive: v.isActive } }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const syncMut = useMutation({
    mutationFn: (linkId: string) => syncFn({ data: { merchantId, linkId } }),
    onSuccess: () => {
      toast.success("Stock шинэчиллээ");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const links = linksQ.data?.items ?? [];

  const productOptions = useMemo(
    () => productsQ.data?.items ?? [],
    [productsQ.data],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Бараатай холбох
          </DialogTitle>
          <DialogDescription>
            {inventoryItem?.name} • Боломжит нөөц:{" "}
            <span className="font-semibold">
              {Number(inventoryItem?.quantity_available ?? 0)} {inventoryItem?.unit ?? ""}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="rounded-lg border p-3 space-y-3">
            <h3 className="text-sm font-semibold">Холбогдсон бараа</h3>
            {linksQ.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : links.length === 0 ? (
              <p className="text-sm text-muted-foreground">Одоогоор холбогдоогүй.</p>
            ) : (
              <ul className="space-y-2">
                {links.map((l: any) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-medium">{l.products?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.product_variants
                          ? `${l.product_variants.label ?? ""} ${l.product_variants.size_label ?? ""} ${l.product_variants.color_label ?? ""}`.trim() ||
                            "Сонголт"
                          : "Бүх бараа"}
                        {" • × "}
                        {Number(l.quantity_multiplier)}
                      </div>
                    </div>
                    <Badge variant={l.is_active ? "default" : "secondary"}>
                      {l.sync_mode === "auto" ? "Автомат sync" : "Гар sync"}
                    </Badge>
                    <Switch
                      checked={l.is_active}
                      onCheckedChange={(v) =>
                        toggleMut.mutate({ linkId: l.id, isActive: v })
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncMut.mutate(l.id)}
                      disabled={syncMut.isPending}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Stock шинэчлэх
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMut.mutate(l.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border p-3 space-y-3">
            <h3 className="text-sm font-semibold">Шинэ холбоо нэмэх</h3>
            <div className="grid gap-3">
              <div>
                <Label>Бараа хайх</Label>
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Барааны нэр..."
                />
              </div>
              <div>
                <Label>Бараа</Label>
                <Select
                  value={productId}
                  onValueChange={(v) => {
                    setProductId(v);
                    setVariantId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Сонгох..." />
                  </SelectTrigger>
                  <SelectContent>
                    {productOptions.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {variants.length > 0 && (
                <div>
                  <Label>Сонголт (заавал биш)</Label>
                  <Select value={variantId || "__none"} onValueChange={(v) => setVariantId(v === "__none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Бүх бараа" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Бүх бараа (variant байхгүй)</SelectItem>
                      {variants.map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {[v.label, v.size_label, v.color_label].filter(Boolean).join(" / ") ||
                            v.option_signature ||
                            v.id.slice(0, 6)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Үржигдэхүүн (multiplier)</Label>
                  <Input
                    type="number"
                    min={0.0001}
                    step="0.1"
                    value={multiplier}
                    onChange={(e) => setMultiplier(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    1 ширхэг бараа = хэдэн нөөц зарцуулах
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={autoSync} onCheckedChange={setAutoSync} />
                  <Label className="cursor-pointer">Автомат sync</Label>
                </div>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Хаах
          </Button>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !productId}>
            {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Холбох
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
