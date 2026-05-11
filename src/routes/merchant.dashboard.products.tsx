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
import { Plus, Edit, Copy, Trash2, Search, ImageIcon, X } from "lucide-react";
import { fmtMnt, slugify } from "@/lib/format";
import { uploadOptimized } from "@/lib/image";

export const Route = createFileRoute("/merchant/dashboard/products")({
  component: ProductsPage,
});

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
  is_active: boolean;
  stock_quantity: number;
  detail_media: Array<{ url: string; caption?: string }>;
  specifications: Array<{ key: string; value: string }>;
};

const blank: Product = {
  name: "", price: 0, discount: 0, is_new: false, is_on_sale: false, is_active: true,
  stock_quantity: 0, detail_media: [], specifications: [],
};

function ProductsPage() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
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
        <Button onClick={() => { setShowForm(!showForm); setEditing(blank); setEditId(null); }}>
          <Plus className="mr-2 h-4 w-4" /> Шинэ бүтээгдэхүүн
        </Button>
      </div>

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
            <div>
              <Label>Нэр *</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <Label>SKU/Бараа код</Label>
              <Input value={editing.product_code ?? ""} onChange={(e) => setEditing({ ...editing, product_code: e.target.value })} />
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
            <div className="flex items-center gap-6 md:col-span-2">
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /> Идэвхтэй</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.is_new} onCheckedChange={(v) => setEditing({ ...editing, is_new: v })} /> Шинэ</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.is_on_sale} onCheckedChange={(v) => setEditing({ ...editing, is_on_sale: v })} /> Хямдралтай</label>
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
    </div>
  );
}
