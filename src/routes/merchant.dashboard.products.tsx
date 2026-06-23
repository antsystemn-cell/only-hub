import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Edit, Copy, Trash2, Search, ImageIcon, X, Upload } from "lucide-react";
import { fmtMnt, slugify } from "@/lib/format";
import { uploadOptimized } from "@/lib/image";
import { AddProductTypeDialog } from "@/components/merchant/AddProductTypeDialog";
import { ForeignProductImporter } from "@/components/merchant/ForeignProductImporter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForeignSyncView } from "@/components/dashboard/ForeignSyncView";
import type { Database } from "@/integrations/supabase/types";

type ForeignSource = Database["public"]["Enums"]["foreign_source"];

export const Route = createFileRoute("/merchant/dashboard/products")({
  component: ProductsPage,
});

type ColorVariant = { name: string; sku?: string; image?: string };
type Product = {
  id?: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  price: number;
  original_price?: number | null;
  discount: number;
  image_url?: string | null;
  thumbnail_url?: string | null;
  product_code?: string | null;
  category?: string | null;
  brand_id?: string | null;
  is_new: boolean;
  is_on_sale: boolean;
  is_bogo: boolean;
  is_active: boolean;
  stock_quantity: number;
  detail_media: Array<{ url: string; type?: "image" | "video"; caption?: string }>;
  gallery_images: string[];
  specifications: Array<{ key: string; value: string }>;
  colors: ColorVariant[];
  sizes: string[];
  variant_stock: Record<string, number>;
};

const blank: Product = {
  name: "", price: 0, discount: 0, is_new: false, is_on_sale: false, is_bogo: false, is_active: true,
  stock_quantity: 0, detail_media: [], gallery_images: [], specifications: [], colors: [], sizes: [], variant_stock: {},
};

function ProductsPage() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [foreignImporterSource, setForeignImporterSource] = useState<ForeignSource | null>(null);
  const [editing, setEditing] = useState<Product>(blank);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [uploading, setUploading] = useState(false);

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
        .select("can_create_foreign_order_products")
        .eq("id", merchantId)
        .maybeSingle();
      return data;
    },
  });
  const canForeign = !!merchantCaps?.can_create_foreign_order_products;
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", merchantId],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("merchant_id", merchantId).order("position");
      return data ?? [];
    },
  });
  const { data: brands = [] } = useQuery({
    queryKey: ["brands", merchantId],
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("*").eq("merchant_id", merchantId);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (p: Product) => {
      const payload: any = {
        ...p,
        merchant_id: merchantId,
        slug: p.slug || slugify(p.name),
      };
      if (editId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Хадгаллаа" : "Бүтээгдэхүүн нэмэгдлээ");
      qc.invalidateQueries({ queryKey: ["products", merchantId] });
      setEditing(blank); setEditId(null); setShowForm(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Алдаа"),
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

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const { url, thumbnailUrl } = await uploadOptimized(file, "product-images", merchantId);
      setEditing({ ...editing, image_url: url, thumbnail_url: thumbnailUrl });
      toast.success("Зураг ачаалагдлаа");
    } catch (e: any) { toast.error(e.message); } finally { setUploading(false); }
  };

  const filtered = products.filter((p: any) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.product_code ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || p.category === filterCat;
    return matchSearch && matchCat;
  });

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
          setEditing(blank);
          setEditId(null);
          setShowForm(true);
        }}
        onPickForeignSource={(source) => {
          setShowForm(false);
          setForeignImporterSource(source);
        }}
      />

      {foreignImporterSource && (
        <ForeignProductImporter
          merchantId={merchantId}
          source={foreignImporterSource}
          onClose={() => setForeignImporterSource(null)}
        />
      )}

      <Tabs defaultValue="products" className="space-y-6">
        {canForeign && (
          <TabsList>
            <TabsTrigger value="products">Бараа</TabsTrigger>
            <TabsTrigger value="foreign-sync">Гадаад Sync</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="products" className="mt-0 space-y-6">

      {showForm && (
        <Card className="rounded-2xl p-6">
          <h2 className="mb-4 text-lg font-semibold">{editId ? "Засварлах" : "Шинэ бүтээгдэхүүн"}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Үндсэн зураг</Label>
              <div className="mt-2 flex items-center gap-3">
                {editing.image_url ? (
                  <div className="relative">
                    <img src={editing.image_url} className="h-24 w-24 rounded-lg object-cover" />
                    <button onClick={() => setEditing({ ...editing, image_url: null, thumbnail_url: null })} className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <Input type="file" accept="image/*" disabled={uploading} onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
              </div>
            </div>
            {/* Gallery images */}
            <div className="md:col-span-2">
              <Label>Нэмэлт зурагнууд (галерей)</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(editing.gallery_images ?? []).map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} className="h-16 w-16 rounded-lg object-cover" />
                    <button type="button"
                      onClick={() => setEditing({ ...editing, gallery_images: (editing.gallery_images ?? []).filter((_, j) => j !== i) })}
                      className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary">
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      for (const file of files) {
                        try {
                          const { url } = await uploadOptimized(file, "product-images", merchantId);
                          setEditing((prev) => ({ ...prev, gallery_images: [...(prev.gallery_images ?? []), url] }));
                        } catch (err: any) { toast.error(err.message); }
                      }
                    }} />
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </label>
              </div>
            </div>
            <div>
              <Label>Нэр *</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <Label>SKU/Бараа код</Label>
              <Input value={editing.product_code ?? ""} onChange={(e) => setEditing({ ...editing, product_code: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>URL slug</Label>
              <div className="flex items-center gap-2">
                <Input value={editing.slug ?? ""} placeholder="auto-үүснэ"
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
                <Button type="button" variant="outline" size="sm"
                  onClick={() => setEditing({ ...editing, slug: slugify(editing.name) })}>Авто</Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">/store/.../product/{editing.slug || "..."}</p>
            </div>
            <div>
              <Label>Үнэ</Label>
              <Input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Хямдрахаас өмнөх үнэ</Label>
              <Input type="number" value={editing.original_price ?? ""} onChange={(e) => setEditing({ ...editing, original_price: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <Label>Хямдрал %</Label>
              <Input type="number" value={editing.discount} onChange={(e) => setEditing({ ...editing, discount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Үлдэгдэл</Label>
              <Input type="number" value={editing.stock_quantity} onChange={(e) => setEditing({ ...editing, stock_quantity: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Ангилал</Label>
              <Select value={editing.category ?? ""} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                <SelectTrigger><SelectValue placeholder="Сонгох" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Брэнд</Label>
              <Select value={editing.brand_id ?? ""} onValueChange={(v) => setEditing({ ...editing, brand_id: v })}>
                <SelectTrigger><SelectValue placeholder="Сонгох" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Тайлбар</Label>
              <Textarea rows={4} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            {/* Specifications */}
            <div className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <Label>Техникийн үзүүлэлт</Label>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setEditing({ ...editing, specifications: [...(editing.specifications ?? []), { key: "", value: "" }] })}>
                  <Plus className="mr-1 h-3 w-3" /> Нэмэх
                </Button>
              </div>
              <div className="space-y-2">
                {(editing.specifications ?? []).map((spec, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="Нэр" value={spec.key}
                      onChange={(e) => {
                        const s = [...editing.specifications]; s[i] = { ...s[i], key: e.target.value };
                        setEditing({ ...editing, specifications: s });
                      }} />
                    <Input placeholder="Утга" value={spec.value}
                      onChange={(e) => {
                        const s = [...editing.specifications]; s[i] = { ...s[i], value: e.target.value };
                        setEditing({ ...editing, specifications: s });
                      }} />
                    <Button type="button" size="icon" variant="ghost"
                      onClick={() => setEditing({ ...editing, specifications: editing.specifications.filter((_, j) => j !== i) })}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Detail Media */}
            <div className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <Label>Нарийвчилсан медиа (зураг/видео)</Label>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setEditing({ ...editing, detail_media: [...(editing.detail_media ?? []), { url: "", type: "image", caption: "" }] })}>
                  <Plus className="mr-1 h-3 w-3" /> Нэмэх
                </Button>
              </div>
              <div className="space-y-2">
                {(editing.detail_media ?? []).map((media, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl border border-border p-3">
                    <div className="grid flex-1 gap-2 md:grid-cols-[120px_1fr_1fr]">
                      <Select value={media.type ?? "image"}
                        onValueChange={(v) => {
                          const m = [...editing.detail_media]; m[i] = { ...m[i], type: v as "image" | "video" };
                          setEditing({ ...editing, detail_media: m });
                        }}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="image">🖼 Зураг</SelectItem>
                          <SelectItem value="video">🎬 Видео URL</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder={(media.type ?? "image") === "video" ? "YouTube/Vimeo URL" : "Зургийн URL"}
                        value={media.url}
                        onChange={(e) => {
                          const m = [...editing.detail_media]; m[i] = { ...m[i], url: e.target.value };
                          setEditing({ ...editing, detail_media: m });
                        }} />
                      <Input placeholder="Caption (заавал биш)" value={media.caption ?? ""}
                        onChange={(e) => {
                          const m = [...editing.detail_media]; m[i] = { ...m[i], caption: e.target.value };
                          setEditing({ ...editing, detail_media: m });
                        }} />
                    </div>
                    {(media.type ?? "image") === "image" && (
                      <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border hover:bg-muted">
                        <input type="file" accept="image/*" className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]; if (!file) return;
                            try {
                              const { url } = await uploadOptimized(file, "product-images", merchantId);
                              const m = [...editing.detail_media]; m[i] = { ...m[i], url };
                              setEditing({ ...editing, detail_media: m });
                              toast.success("Зураг ачаалагдлаа");
                            } catch (err: any) { toast.error(err.message); }
                          }} />
                        <Upload className="h-4 w-4" />
                      </label>
                    )}
                    {media.url && (media.type ?? "image") === "image" && (
                      <img src={media.url} className="h-9 w-9 rounded-md object-cover" />
                    )}
                    <Button type="button" size="icon" variant="ghost"
                      onClick={() => setEditing({ ...editing, detail_media: editing.detail_media.filter((_, j) => j !== i) })}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {(editing.detail_media ?? []).length === 0 && (
                  <p className="py-2 text-xs text-muted-foreground">Нэмэлт зураг/видео байхгүй</p>
                )}
              </div>
            </div>

            {/* Colors */}
            <div className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <Label>Өнгөний сонголт</Label>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setEditing({ ...editing, colors: [...(editing.colors ?? []), { name: "" }] })}>
                  <Plus className="mr-1 h-3 w-3" /> Нэмэх
                </Button>
              </div>
              <div className="space-y-2">
                {(editing.colors ?? []).map((color, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="Өнгийн нэр" value={color.name}
                      onChange={(e) => {
                        const c = [...editing.colors]; c[i] = { ...c[i], name: e.target.value };
                        setEditing({ ...editing, colors: c });
                      }} />
                    <Input placeholder="SKU (заавал биш)" value={color.sku ?? ""}
                      onChange={(e) => {
                        const c = [...editing.colors]; c[i] = { ...c[i], sku: e.target.value };
                        setEditing({ ...editing, colors: c });
                      }} />
                    <Button type="button" size="icon" variant="ghost"
                      onClick={() => setEditing({ ...editing, colors: editing.colors.filter((_, j) => j !== i) })}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Sizes */}
            <div className="md:col-span-2">
              <Label>Хэмжээний сонголт</Label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(editing.sizes ?? []).map((size, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
                    {size}
                    <button type="button" onClick={() => setEditing({ ...editing, sizes: editing.sizes.filter((_, j) => j !== i) })}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Input placeholder="Хэмжээ + Enter" className="w-40"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.currentTarget.value.trim()) {
                      e.preventDefault();
                      setEditing({ ...editing, sizes: [...(editing.sizes ?? []), e.currentTarget.value.trim()] });
                      e.currentTarget.value = "";
                    }
                  }} />
              </div>
            </div>

            {/* Variant stock grid */}
            {editing.colors?.length > 0 && editing.sizes?.length > 0 && (
              <div className="md:col-span-2 overflow-x-auto">
                <Label>Нөөц (өнгө × хэмжээ)</Label>
                <table className="mt-2 border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border border-border bg-muted p-2 text-left">Өнгө / Хэмжээ</th>
                      {editing.sizes.map((size) => (
                        <th key={size} className="border border-border bg-muted p-2">{size}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {editing.colors.map((color) => (
                      <tr key={color.name || Math.random()}>
                        <td className="border border-border p-2 font-medium">{color.name || "—"}</td>
                        {editing.sizes.map((size) => {
                          const k = `${color.name}|${size}`;
                          return (
                            <td key={size} className="border border-border p-1">
                              <Input type="number" className="h-8 w-20 text-center"
                                value={(editing.variant_stock ?? {})[k] ?? ""}
                                onChange={(e) => setEditing({
                                  ...editing,
                                  variant_stock: { ...(editing.variant_stock ?? {}), [k]: Number(e.target.value) },
                                })} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center gap-6 md:col-span-2">
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /> Идэвхтэй</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.is_new} onCheckedChange={(v) => setEditing({ ...editing, is_new: v })} /> Шинэ</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.is_on_sale} onCheckedChange={(v) => setEditing({ ...editing, is_on_sale: v })} /> Хямдралтай</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.is_bogo} onCheckedChange={(v) => setEditing({ ...editing, is_bogo: v })} /> 1+1 Үнэгүй</label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => save.mutate(editing)} disabled={save.isPending || !editing.name}>{save.isPending ? "Хадгалж байна..." : "Хадгалах"}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(blank); setEditId(null); }}>Болих</Button>
          </div>
        </Card>
      )}

      <Card className="rounded-2xl p-4">
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
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              {p.thumbnail_url || p.image_url ? (
                <img src={p.thumbnail_url || p.image_url} className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.category ?? "—"} • {p.product_code ?? ""}</div>
              </div>
              <div className="text-sm font-semibold">{fmtMnt(p.price)}</div>
              {p.discount > 0 && <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-xs text-red-600">-{p.discount}%</span>}
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setEditId(p.id); setShowForm(true); }}><Edit className="h-4 w-4" /></Button>
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
    </div>
  );
}
