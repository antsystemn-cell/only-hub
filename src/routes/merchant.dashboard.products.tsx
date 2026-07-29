import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Edit, Copy, Trash2, Search, ImageIcon, History, ExternalLink } from "lucide-react";
import { PurchaseHistoryDialog } from "@/components/inventory/PurchaseHistoryDialog";
import { ProductEditForm, blankProduct } from "@/components/merchant/ProductEditForm";
import { fmtMnt } from "@/lib/format";
import { AddProductTypeDialog } from "@/components/merchant/AddProductTypeDialog";
import { ForeignProductImporter } from "@/components/merchant/ForeignProductImporter";
import { ManualForeignProductImporter } from "@/components/merchant/ManualForeignProductImporter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForeignSyncView } from "@/components/dashboard/ForeignSyncView";
import type { Database } from "@/integrations/supabase/types";

type ForeignSource = Database["public"]["Enums"]["foreign_source"];

export const Route = createFileRoute("/merchant/dashboard/products")({
  component: () => <Outlet />,
});

export default function ProductsPage() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;
  const qc = useQueryClient();
  const [showNewForm, setShowNewForm] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [foreignImporterSource, setForeignImporterSource] = useState<ForeignSource | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<"all" | "POIZON_KR" | "TAOBAO">("all");
  const [historyProduct, setHistoryProduct] = useState<{ id: string; name: string } | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products", merchantId],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("merchant_id", merchantId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: merchantCaps } = useQuery({
    queryKey: ["merchant-caps", merchantId],
    enabled: !!merchantId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("can_create_foreign_order_products, slug")
        .eq("id", merchantId)
        .maybeSingle();
      return data;
    },
  });
  const canForeign = !!merchantCaps?.can_create_foreign_order_products;
  const merchantSlug = merchantCaps?.slug ?? null;
  const { data: linkedProductIds = new Set<string>() } = useQuery({
    queryKey: ["linked-product-ids", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("inventory_product_links")
        .select("product_id")
        .eq("merchant_id", merchantId)
        .eq("is_active", true);
      return new Set<string>((data ?? []).map((r: any) => r.product_id));
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", merchantId],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("merchant_id", merchantId).order("position");
      return data ?? [];
    },
  });


  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Устгалаа"); qc.invalidateQueries({ queryKey: ["products", merchantId] }); },
  });

  const duplicate = async (p: any) => {
    const copy = { ...p, name: p.name + " (хуулбар)", product_code: null, slug: null };
    delete copy.id; delete copy.created_at; delete copy.updated_at;
    const { error } = await supabase.from("products").insert(copy);
    if (error) toast.error(error.message); else { toast.success("Хуулбарлалаа"); qc.invalidateQueries({ queryKey: ["products", merchantId] }); }
  };

  const filtered = products.filter((p: any) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.product_code ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || p.category === filterCat;
    const matchSource = filterSource === "all" || p.foreign_source === filterSource;
    return matchSearch && matchCat && matchSource;
  });
  const countPoizon = products.filter((p: any) => p.foreign_source === "POIZON_KR").length;
  const countTaobao = products.filter((p: any) => p.foreign_source === "TAOBAO").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Бүтээгдэхүүн</h1>
          <p className="text-sm text-muted-foreground">Нийт {products.length}</p>
        </div>
        <Button onClick={() => { setShowTypePicker(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Шинэ бүтээгдэхүүн
        </Button>
      </div>

      <AddProductTypeDialog
        open={showTypePicker}
        onOpenChange={setShowTypePicker}
        merchantId={merchantId}
        onPickReadyStock={() => {
          setShowNewForm(true);
        }}
        onPickForeignSource={(source) => {
          setShowNewForm(false);
          setForeignImporterSource(source);
        }}
      />

      {foreignImporterSource && (
        foreignImporterSource === "POIZON_KR" || foreignImporterSource === "TAOBAO" ? (
          <ForeignProductImporter
            merchantId={merchantId}
            source={foreignImporterSource}
            onClose={() => setForeignImporterSource(null)}
          />
        ) : (
          <ManualForeignProductImporter
            merchantId={merchantId}
            source={foreignImporterSource}
            onClose={() => setForeignImporterSource(null)}
          />
        )
      )}

      <Tabs defaultValue="products" className="space-y-6">
        {canForeign && (
          <TabsList>
            <TabsTrigger value="products">Бараа</TabsTrigger>
            <TabsTrigger value="foreign-sync">Гадаад Sync</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="products" className="mt-0 space-y-6">

      {showNewForm && (
        <ProductEditForm
          merchantId={merchantId}
          editId={null}
          initial={blankProduct}
          onSaved={() => setShowNewForm(false)}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      <Card className="rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterSource("all")}
            className={`rounded-full border px-3 py-1 text-xs ${filterSource === "all" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Бүгд <span className="ml-1 opacity-70">{products.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterSource("POIZON_KR")}
            className={`rounded-full border px-3 py-1 text-xs ${filterSource === "POIZON_KR" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
          >
            🇰🇷 Poizon Korea <span className="ml-1 opacity-70">{countPoizon}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterSource("TAOBAO")}
            className={`rounded-full border px-3 py-1 text-xs ${filterSource === "TAOBAO" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
          >
            🇨🇳 Taobao <span className="ml-1 opacity-70">{countTaobao}</span>
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Хайх..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Бүх ангилал</SelectItem>
              {categories.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">Бүтээгдэхүүн алга</p>
          ) : filtered.map((p: any) => (
            <div key={p.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border p-3 sm:flex sm:items-center">
              {p.thumbnail_url || p.image_url ? (
                <img src={p.thumbnail_url || p.image_url} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
              )}
              <div className="min-w-0 sm:flex-1">
                <div className="font-medium break-words">{p.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="break-words">{p.category ?? "—"} {p.product_code ? `• ${p.product_code}` : ""}</span>
                  {(linkedProductIds as Set<string>).has(p.id) ? (
                    <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700">Нөөцтэй холбогдсон</span>
                  ) : (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Нөөцтэй холбогдоогүй</span>
                  )}
                  <span className="sm:hidden font-semibold text-foreground">{fmtMnt(p.price)}</span>
                  {p.discount > 0 && <span className="sm:hidden rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-600">-{p.discount}%</span>}
                </div>
              </div>
              <div className="hidden sm:block text-sm font-semibold whitespace-nowrap">{fmtMnt(p.price)}</div>
              {p.discount > 0 && <span className="hidden sm:inline-block rounded-md bg-red-500/10 px-2 py-0.5 text-xs text-red-600">-{p.discount}%</span>}
              <div className="col-span-3 flex justify-end gap-1 sm:col-span-1 border-t border-border/50 pt-2 sm:border-0 sm:pt-0">
                <Button size="icon" variant="ghost" title="Худалдан авалтын түүх" onClick={() => setHistoryProduct({ id: p.id, name: p.name })}><History className="h-4 w-4" /></Button>
                {merchantSlug && p.slug && p.is_active && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Сайт дээр харах"
                    asChild
                  >
                    <a
                      href={`/store/${merchantSlug}/product/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                {p.source_url && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Эх сурвалж линк"
                    asChild
                  >
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 text-blue-600" />
                    </a>
                  </Button>
                )}
                <Button size="icon" variant="ghost" title="Засах" asChild>
                  <Link to="/merchant/dashboard/products/edit/$id" params={{ id: p.id }}>
                    <Edit className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="icon" variant="ghost" onClick={() => duplicate(p)}><Copy className="h-4 w-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Устгах уу?</AlertDialogTitle>
                      <AlertDialogDescription>"{p.name}" буцаах боломжгүйгээр устгана.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Болих</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(p.id)}>Устгах</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}

        </div>
      </Card>
        </TabsContent>
        {canForeign && (
          <TabsContent value="foreign-sync" className="mt-0">
            <ForeignSyncView />
          </TabsContent>
        )}
      </Tabs>
      <PurchaseHistoryDialog
        open={!!historyProduct}
        onOpenChange={(v) => { if (!v) setHistoryProduct(null); }}
        merchantId={merchantId}
        mode={historyProduct ? { kind: "product", productId: historyProduct.id, title: historyProduct.name } : null}
      />
    </div>
  );
}
