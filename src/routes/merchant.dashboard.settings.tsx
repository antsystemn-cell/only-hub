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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, Eye, EyeOff, Pencil, X, Truck, Copy, CheckCircle, RefreshCw } from "lucide-react";
import { fmtMnt, slugify } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { testPaymentConnection, getPaymentProviderCredentials } from "@/lib/payments.functions";
import { saveMerchantProvider, testMerchantProvider } from "@/lib/payments/providers.functions";
import { getMerchantDeliveryConfig, updateMerchantDeliveryConfig } from "@/lib/merchant-delivery.functions";
import { TiptapEditor } from "@/components/admin/TiptapEditor";

export const Route = createFileRoute("/merchant/dashboard/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Тохиргоо</h1>
      <Tabs defaultValue="store">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="store">Дэлгүүр</TabsTrigger>
          <TabsTrigger value="categories">Ангилал</TabsTrigger>
          <TabsTrigger value="brands">Брэнд</TabsTrigger>
          <TabsTrigger value="delivery">Хүргэлт</TabsTrigger>
          <TabsTrigger value="policy">Хүргэлт & Бодлого</TabsTrigger>
          <TabsTrigger value="payments">Төлбөр</TabsTrigger>
          <TabsTrigger value="banners">Баннер</TabsTrigger>
          <TabsTrigger value="import">📥 Импорт</TabsTrigger>
        </TabsList>
        <TabsContent value="store"><StoreProfileTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>

        <TabsContent value="brands"><CrudList table="brands" fields={[{ k: "name", l: "Нэр" }, { k: "logo_url", l: "Лого URL" }]} /></TabsContent>
        <TabsContent value="delivery">
          <div className="space-y-5">
            <DeliveryApiCard />
            <CrudList table="delivery_options" fields={[
              { k: "name", l: "Нэр" },
              { k: "description", l: "Тайлбар" },
              { k: "price", l: "Үнэ ₮", type: "number" },
              { k: "address", l: "Хаяг" },
              { k: "phone", l: "Утас" },
              { k: "payment_terms", l: "Төлбөрийн нөхцөл" },
              { k: "estimated_days_min", l: "Хам. бага хоног", type: "number" },
              { k: "estimated_days_max", l: "Хам. их хоног", type: "number" },
            ]} hasActiveToggle />
          </div>
        </TabsContent>
        <TabsContent value="policy"><ShippingPolicyTab /></TabsContent>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
        <TabsContent value="banners"><CrudList table="promo_banners" fields={[
          { k: "title", l: "Гарчиг" },
          { k: "subtitle", l: "Дэд гарчиг" },
          { k: "button_text", l: "Товчны текст" },
          { k: "button_link", l: "Товчны линк" },
          { k: "banner_image", l: "Зургийн URL" },
        ]} hasActiveToggle /></TabsContent>
        <TabsContent value="import"><ImportTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function StoreProfileTab() {
  const { primaryMerchantId } = useAuth();
  const qc = useQueryClient();
  const merchantId = primaryMerchantId;

  const { data: merchant } = useQuery({
    queryKey: ["merchant-profile", merchantId],
    enabled: !!merchantId,
    queryFn: async () =>
      (await supabase.from("merchants").select("id,name,slug,description,logo_url").eq("id", merchantId!).maybeSingle()).data,
  });

  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Initialize from loaded data once
  if (merchant && name === null && description === null && logoUrl === null) {
    setName(merchant.name ?? "");
    setDescription(merchant.description ?? "");
    setLogoUrl(merchant.logo_url ?? "");
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!merchantId) throw new Error("merchant байхгүй");
      const { error } = await supabase
        .from("merchants")
        .update({ name: name ?? "", description: description ?? null, logo_url: logoUrl || null })
        .eq("id", merchantId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Хадгалагдлаа");
      qc.invalidateQueries({ queryKey: ["merchant-profile", merchantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const uploadLogo = async (file: File) => {
    if (!merchantId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${merchantId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("merchant-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("merchant-logos").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      const { error } = await supabase
        .from("merchants")
        .update({ logo_url: pub.publicUrl })
        .eq("id", merchantId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["merchant-profile", merchantId] });
      toast.success("Лого шинэчлэгдлээ");
    } catch (e: any) {
      toast.error(e?.message ?? "Лого upload амжилтгүй");
    } finally {
      setUploading(false);
    }
  };

  if (!merchantId) {
    return <Card className="rounded-2xl p-6 text-sm text-muted-foreground">Дэлгүүр олдсонгүй.</Card>;
  }

  return (
    <Card className="rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Дэлгүүрийн профайл</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Энд оруулсан лого, нэр нь нүүр хуудас, "Бүх дэлгүүр" жагсаалт, дэлгүүрийн нүүр, барааны дэлгэрэнгүй зэрэг хэрэглэгчийн талын бүх хуудсанд харагдана.
        </p>
      </div>

      <div className="flex items-start gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">Лого алга</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <Label>Дэлгүүрийн лого</Label>
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted">
                {uploading ? "Байршуулж байна..." : "Зураг сонгож upload"}
              </span>
            </label>
            {logoUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  setLogoUrl("");
                  await supabase.from("merchants").update({ logo_url: null }).eq("id", merchantId);
                  qc.invalidateQueries({ queryKey: ["merchant-profile", merchantId] });
                  toast.success("Лого устгагдлаа");
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Лого устгах
              </Button>
            )}
          </div>
          <Input
            placeholder="Эсвэл лого URL шууд оруулах"
            value={logoUrl ?? ""}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Дэлгүүрийн нэр</Label>
          <Input value={name ?? ""} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label>Тайлбар</Label>
          <Textarea rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Хадгалж байна..." : "Хадгалах"}
        </Button>
      </div>
    </Card>
  );
}



function ImportTab() {
  const { primaryMerchantId } = useAuth();
  const [jsonInput, setJsonInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
  const qc = useQueryClient();

  const importProducts = async () => {
    if (!jsonInput.trim()) return toast.error("JSON оруулна уу");
    setLoading(true);
    let items: any[];
    try {
      items = JSON.parse(jsonInput);
      if (!Array.isArray(items)) items = [items];
    } catch {
      toast.error("JSON формат буруу"); setLoading(false); return;
    }
    let success = 0, errors = 0;
    for (const item of items) {
      try {
        const { error } = await (supabase as any).from("products").insert({
          merchant_id: primaryMerchantId!,
          name: item.name,
          slug: item.slug || slugify(item.name) + "-" + Math.random().toString(36).slice(2, 5),
          price: Number(item.price ?? 0),
          original_price: item.original_price ? Number(item.original_price) : null,
          discount: Number(item.discount ?? 0),
          image_url: item.image_url ?? null,
          thumbnail_url: item.thumbnail_url ?? item.image_url ?? null,
          category: item.category ?? "general",
          description: item.description ?? null,
          product_code: item.product_code ?? null,
          stock_quantity: Number(item.stock_quantity ?? 0),
          is_new: !!item.is_new,
          is_on_sale: !!item.is_on_sale,
          is_active: item.is_active !== false,
          colors: item.colors ?? [],
          sizes: item.sizes ?? [],
          variant_stock: item.variant_stock ?? {},
          specifications: item.specifications ?? [],
          detail_media: item.detail_media ?? [],
        });
        if (error) { errors++; console.error(error.message); } else success++;
      } catch { errors++; }
    }
    setResult({ success, errors });
    setLoading(false);
    qc.invalidateQueries({ queryKey: ["products", primaryMerchantId] });
    toast.success(`${success} бараа импортлогдлоо${errors > 0 ? `, ${errors} алдаа` : ""}`);
  };

  return (
    <Card className="rounded-2xl p-6">
      <h3 className="mb-1 font-semibold">Бараа импорт (JSON)</h3>
      <p className="mb-4 text-sm text-muted-foreground">JSON массив форматаар бараануудыг нэг дор оруулна.</p>
      <textarea
        className="w-full rounded-xl border border-border bg-muted p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
        rows={12}
        placeholder={`[\n  {\n    "name": "Барааны нэр",\n    "price": 25000,\n    "original_price": 30000,\n    "category": "Хувцас",\n    "image_url": "https://...",\n    "is_new": true\n  }\n]`}
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
      />
      {result && (
        <div className="mt-2 rounded-xl bg-muted p-3 text-sm">
          ✅ Амжилттай: <span className="font-semibold text-emerald-600">{result.success}</span>{" "}
          {result.errors > 0 && <>❌ Алдаа: <span className="font-semibold text-red-600">{result.errors}</span></>}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button onClick={importProducts} disabled={loading || !jsonInput.trim()}>
          {loading ? "Импортлож байна..." : "Импортлох"}
        </Button>
        <Button variant="outline" onClick={() => { setJsonInput(""); setResult(null); }}>Цэвэрлэх</Button>
      </div>
    </Card>
  );
}

function CategoriesTab() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;
  const qc = useQueryClient();
  const emptyForm = { name: "", icon: "", slug: "", position: 0 };
  const [form, setForm] = useState<any>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  const { data: merchant } = useQuery({
    queryKey: ["merchant-slug-for-categories", merchantId],
    queryFn: async () => (await supabase.from("merchants").select("slug").eq("id", merchantId).maybeSingle()).data,
  });
  const merchantSlug = merchant?.slug ?? "";
  const isOrdersMerchant = merchantSlug === "orders";

  const { data: items = [] } = useQuery({
    queryKey: ["categories", merchantId],
    queryFn: async () => (await supabase.from("categories").select("*").eq("merchant_id", merchantId).order("position")).data ?? [],
  });

  const buildUrl = (slug: string) => {
    if (!slug) return "";
    if (isOrdersMerchant) return `/orders/${slug}`;
    return `/store/${merchantSlug}?category=${encodeURIComponent(slug)}`;
  };

  const save = useMutation({
    mutationFn: async () => {
      const name = (form.name ?? "").trim();
      if (!name) throw new Error("Ангиллын нэр оруулна уу");
      const rawSlug = (form.slug ?? "").trim() || slugify(name);
      const cleanSlug = rawSlug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      if (!cleanSlug) throw new Error("URL хаяг буруу байна");
      const payload: any = {
        merchant_id: merchantId,
        name,
        icon: form.icon ?? null,
        slug: cleanSlug,
        position: Number(form.position ?? 0) || 0,
      };
      if (editId) {
        const { error } = await supabase.from("categories").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Шинэчиллээ" : "Нэмэгдлээ");
      qc.invalidateQueries({ queryKey: ["categories", merchantId] });
      setForm(emptyForm); setEditId(null); setSlugTouched(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = async (id: string) => {
    if (!confirm("Ангилал устгах уу?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Устгалаа"); qc.invalidateQueries({ queryKey: ["categories", merchantId] }); }
  };

  const startEdit = (it: any) => {
    setEditId(it.id);
    setForm({ name: it.name ?? "", icon: it.icon ?? "", slug: it.slug ?? "", position: it.position ?? 0 });
    setSlugTouched(true);
  };

  const previewSlug = (form.slug?.trim() || slugify(form.name ?? ""));

  return (
    <Card className="rounded-2xl p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold">{editId ? "Ангилал засах" : "Шинэ ангилал"}</h3>
        <p className="text-sm text-muted-foreground">Ангилал бүрд өөрийн URL (slug) тохируулж болно.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Нэр</Label>
          <Input
            value={form.name ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setForm((f: any) => ({ ...f, name: v, slug: slugTouched ? f.slug : slugify(v) }));
            }}
            placeholder="Жишээ: Оригинал пүүз, гутал"
          />
        </div>
        <div>
          <Label>Icon (emoji)</Label>
          <Input value={form.icon ?? ""} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="👟" />
        </div>
        <div className="md:col-span-2">
          <Label>URL хаяг (slug)</Label>
          <Input
            value={form.slug ?? ""}
            onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value }); }}
            placeholder="original-sneakers"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Зөвхөн жижиг үсэг, тоо, зураас (-). Хоосон орхивол нэрнээс автоматаар үүснэ.
          </p>
          {previewSlug && (
            <div className="mt-2 rounded-lg border border-dashed bg-muted/40 p-2 text-xs">
              <span className="text-muted-foreground">Урьдчилан харах: </span>
              <code className="break-all font-mono text-foreground">only.mn{buildUrl(previewSlug)}</code>
            </div>
          )}
        </div>
        <div>
          <Label>Байрлал (position)</Label>
          <Input type="number" value={form.position ?? 0} onChange={(e) => setForm({ ...form, position: e.target.value })} />
        </div>
        <div className="flex items-end gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {editId ? <><Pencil className="mr-1 h-4 w-4" /> Шинэчлэх</> : <><Plus className="mr-1 h-4 w-4" /> Нэмэх</>}
          </Button>
          {editId && (
            <Button variant="outline" onClick={() => { setForm(emptyForm); setEditId(null); setSlugTouched(false); }}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <h4 className="text-sm font-semibold text-muted-foreground">Ангиллууд ({items.length})</h4>
        {(items as any[]).map((it) => (
          <div key={it.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm">
            <span className="text-lg">{it.icon || "📁"}</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{it.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                <code className="font-mono">only.mn{buildUrl(it.slug || slugify(it.name))}</code>
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => startEdit(it)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => del(it.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Одоогоор ангилал алга. Дээрх хэсгээс нэмнэ үү.
          </div>
        )}
      </div>
    </Card>
  );
}

function CrudList({ table, fields, hasActiveToggle }: { table: "categories" | "brands" | "delivery_options" | "promo_banners"; fields: { k: string; l: string; type?: string }[]; hasActiveToggle?: boolean }) {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<string | null>(null);
  const { data: items = [] } = useQuery({
    queryKey: [table, merchantId],
    queryFn: async () => {
      const { data } = await (supabase as any).from(table).select("*").eq("merchant_id", merchantId);
      return data ?? [];
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form, merchant_id: merchantId };
      ["price", "estimated_days_min", "estimated_days_max"].forEach((k) => {
        if (payload[k] != null && payload[k] !== "") payload[k] = Number(payload[k]);
      });
      delete payload.id; delete payload.created_at;
      if (editId) {
        const { error } = await (supabase as any).from(table).update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from(table).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Шинэчиллээ" : "Нэмэгдлээ");
      qc.invalidateQueries({ queryKey: [table, merchantId] });
      setForm({}); setEditId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleActive = async (id: string, v: boolean) => {
    await (supabase as any).from(table).update({ is_active: v }).eq("id", id);
    qc.invalidateQueries({ queryKey: [table, merchantId] });
  };
  const del = async (id: string) => {
    const { error } = await (supabase as any).from(table).delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Устгалаа"); qc.invalidateQueries({ queryKey: [table, merchantId] }); }
  };
  return (
    <Card className="rounded-2xl p-5">
      <div className="grid gap-3 md:grid-cols-3">
        {fields.map((f) => (
          <div key={f.k}>
            <Label>{f.l}</Label>
            <Input type={f.type ?? "text"} value={form[f.k] ?? ""} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
          </div>
        ))}
        <div className="flex items-end gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {editId ? <><Pencil className="mr-1 h-4 w-4" /> Шинэчлэх</> : <><Plus className="mr-1 h-4 w-4" /> Нэмэх</>}
          </Button>
          {editId && (
            <Button variant="outline" onClick={() => { setForm({}); setEditId(null); }}><X className="h-4 w-4" /></Button>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {(items as any[]).map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
            <span className="flex-1">{it.name ?? it.title}{it.price ? ` • ${fmtMnt(it.price)}` : ""}</span>
            {hasActiveToggle && (
              <label className="mr-3 flex items-center gap-2 text-xs">
                <Switch checked={it.is_active ?? true} onCheckedChange={(v) => toggleActive(it.id, v)} />
                {it.is_active ?? true ? "Идэвхтэй" : "Хаалттай"}
              </label>
            )}
            <Button size="icon" variant="ghost" onClick={() => { setForm(it); setEditId(it.id); }}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => del(it.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PaymentsTab() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;
  const qc = useQueryClient();
  const emptyForm = { provider_type: "qpay", name: "QPay", icon: "💳", is_active: true, credentials: {} as any, description: "" };
  const [form, setForm] = useState<any>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const loadCreds = useServerFn(getPaymentProviderCredentials);
  const saveProvider = useServerFn(saveMerchantProvider);
  const testProvider = useServerFn(testMerchantProvider);

  const { data: items = [] } = useQuery({
    queryKey: ["payment_providers", merchantId],
    queryFn: async () => (await supabase.from("payment_providers").select("id,merchant_id,provider_type,name,icon,description,is_active,position,logo_url,created_at,updated_at").eq("merchant_id", merchantId)).data ?? [],
  });

  const resetForm = () => { setForm(emptyForm); setEditId(null); };

  const save = useMutation({
    mutationFn: async () => {
      const saved = await saveProvider({
        data: {
          merchantId,
          providerType: form.provider_type,
          isActive: !!form.is_active,
          name: form.name,
          icon: form.icon,
          description: form.description,
          credentials: form.credentials ?? {},
        },
      });
      if (!saved.ok) throw new Error(saved.message);
      if (saved.providerId && form.provider_type !== "cash") {
        const tested = await testProvider({ data: { providerId: saved.providerId } });
        if (!tested.ok) throw new Error(tested.message);
        return tested.message;
      }
      return saved.message;
    },
    onSuccess: (message) => { toast.success(message ?? (editId ? "Шинэчлэгдлээ" : "Нэмэгдлээ")); resetForm(); qc.invalidateQueries({ queryKey: ["payment_providers", merchantId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = async (p: any) => {
    setEditId(p.id);
    let creds: Record<string, string> = {};
    try {
      const res = await loadCreds({ data: { providerId: p.id } });
      if (res.ok) creds = res.credentials ?? {};
    } catch {}
    setForm({
      provider_type: p.provider_type,
      name: p.name,
      icon: p.icon ?? "💳",
      is_active: !!p.is_active,
      credentials: creds,
      description: p.description ?? "",
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const del = async (id: string) => {
    await supabase.from("payment_providers").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["payment_providers", merchantId] });
  };

  const credFields: Record<string, string[]> = {
    qpay: ["username", "password", "invoice_code"],
    storepay: ["username", "password", "app_username", "app_password", "store_id"],
    pocket: ["client_id", "client_secret", "terminal_id"],
    omniway: ["username", "password"],
    hipay: ["entity_id", "client_secret", "base_url"],
    cash: [],
  };
  const fields = credFields[form.provider_type] ?? [];

  return (
    <Card className="rounded-2xl p-5">
      <h3 className="mb-4 font-semibold">{editId ? "Төлбөрийн үйлчилгээ засах" : "Шинэ төлбөрийн үйлчилгээ"}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <div><Label>Үйлчилгээ</Label>
          <Select value={form.provider_type} onValueChange={(v) => setForm({ ...form, provider_type: v, credentials: editId ? (form.credentials ?? {}) : {} })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="qpay">QPay</SelectItem>
              <SelectItem value="storepay">Storepay</SelectItem>
              <SelectItem value="pocket">Pocket</SelectItem>
              <SelectItem value="omniway">Omniway</SelectItem>
              <SelectItem value="hipay">HiPay</SelectItem>
              <SelectItem value="cash">Бэлэн мөнгө</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Харагдах нэр</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div>
          <Label>Icon (emoji эсвэл зураг)</Label>
          <div className="flex items-center gap-2">
            {form.icon && /^https?:\/\//i.test(form.icon) ? (
              <img src={form.icon} alt="icon" className="h-9 w-9 rounded border object-contain" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded border text-xl">{form.icon || "💳"}</span>
            )}
            <Input
              className="flex-1"
              placeholder="💳 эсвэл https://..."
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
            />
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const ext = file.name.split(".").pop() || "png";
                  const path = `${merchantId}/payment-icons/${Date.now()}.${ext}`;
                  const { error: upErr } = await supabase.storage.from("merchant-logos").upload(path, file, { upsert: true, contentType: file.type });
                  if (upErr) { toast.error(upErr.message); return; }
                  const { data: pub } = supabase.storage.from("merchant-logos").getPublicUrl(path);
                  setForm({ ...form, icon: pub.publicUrl });
                  toast.success("Icon байршуулагдлаа");
                  e.target.value = "";
                }}
              />
              <span className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted">Upload</span>
            </label>
          </div>
        </div>
        <div className="md:col-span-3"><Label>Тайлбар</Label><Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

        {fields.length > 0 && (
          <div className="md:col-span-3">
            <div className="mb-2 flex items-center justify-between">
              <Label>{form.provider_type === "qpay" ? "QPay API мэдээлэл" : "API мэдээлэл"}</Label>
              <Button size="sm" variant="ghost" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {form.provider_type === "qpay" && (
              <p className="mb-3 text-sm text-muted-foreground">
                Only Shop шиг QPay-н client_id, client_secret, invoice_code гэсэн 3 тусдаа утгыг оруулна. client_secret/password талбарт invoice_code-г давтаж оруулахгүй.
              </p>
            )}
            <div className="grid gap-2 md:grid-cols-3">
              {fields.map((f) => (
                <Input key={f} type={showSecret ? "text" : "password"} placeholder={f}
                  value={form.credentials?.[f] ?? ""}
                  onChange={(e) => setForm({ ...form, credentials: { ...form.credentials, [f]: e.target.value } })} />
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><span className="text-sm">Идэвхтэй</span></div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{editId ? "Шинэчлэх" : "Хадгалах"}</Button>
        {editId && <Button variant="ghost" onClick={resetForm}><X className="mr-1 h-4 w-4" /> Болих</Button>}
      </div>

      <div className="mt-6 space-y-2">
        {(items as any[]).map((p) => (
          <ProviderRow key={p.id} provider={p} onEdit={() => startEdit(p)} onDelete={() => del(p.id)} />
        ))}
      </div>
    </Card>
  );
}

function ProviderRow({ provider: p, onEdit, onDelete }: { provider: any; onEdit: () => void; onDelete: () => void }) {
  const test = useServerFn(testPaymentConnection);
  const [pending, setPending] = useState(false);
  const hasCreds = p.provider_type !== "cash";
  const runTest = async () => {
    setPending(true);
    try {
      const res = await test({ data: { providerId: p.id } });
      if (res.ok) toast.success(res.message); else toast.error(res.message);
    } catch (e: any) {
      toast.error(e?.message ?? "Алдаа");
    } finally { setPending(false); }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
      <span className="flex items-center gap-2">
        {p.icon && /^https?:\/\//i.test(p.icon) ? (
          <img src={p.icon} alt={p.name} className="h-6 w-6 rounded object-contain" />
        ) : (
          <span className="text-lg">{p.icon}</span>
        )}
        {p.name}
        <span className="text-xs text-muted-foreground">({p.provider_type})</span>
        {p.is_active && <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">Идэвхтэй</span>}
        {hasCreds && <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">🔐 Тохируулагдсан</span>}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={runTest} disabled={pending}>{pending ? "Шалгаж байна..." : "Холболт шалгах"}</Button>
        <Button size="icon" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function DeliveryApiCard() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;
  const qc = useQueryClient();
  const [showKey, setShowKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"local" | "swift">("local");

  const loadDelivery = useServerFn(getMerchantDeliveryConfig);
  const saveDelivery = useServerFn(updateMerchantDeliveryConfig);

  const { data: merchant } = useQuery({
    queryKey: ["merchant-delivery", merchantId],
    queryFn: async () => {
      const data = await loadDelivery({ data: { merchantId } });
      if (data?.ok) {
        setApiKey(data.delivery_api_key);
        setEndpoint(data.delivery_endpoint);
        setWebhookSecret(data.delivery_webhook_secret);
        setDeliveryMode(data.delivery_mode);
      }
      return data;
    },
  });

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/delivery/webhook`
      : "/api/public/delivery/webhook";

  const save = useMutation({
    mutationFn: async () => {
      await saveDelivery({
        data: {
          merchantId,
          delivery_api_key: apiKey,
          delivery_endpoint: endpoint,
          delivery_webhook_secret: webhookSecret,
          delivery_mode: deliveryMode,
        },
      });
    },
    onSuccess: () => {
      toast.success("Хүргэлтийн тохиргоо хадгалагдлаа");
      qc.invalidateQueries({ queryKey: ["merchant-delivery", merchantId] });
    },
    onError: (e: any) => toast.error(e.message),
  });


  const generateSecret = () => {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    setWebhookSecret(`whsec_${hex}`);
  };

  const copy = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    toast.success(`${label} хуулагдлаа`);
  };

  const connected = !!(merchant && (merchant as any).delivery_api_key);

  return (
    <Card className="rounded-2xl border-violet-200/60 bg-violet-50/30 p-5 dark:border-violet-800/30 dark:bg-violet-950/10">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
          <Truck className="h-5 w-5 text-violet-500" />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Хүргэлтийн системийн API холболт</h3>
              {connected && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
                  <CheckCircle className="h-3 w-3" /> Холбогдсон
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Гадаад хүргэлтийн системд (жишээ нь Swift / hurgelt.only.mn) захиалгуудыг автоматаар илгээх боломжтой. Хүргэлтийн системээс олгосон API key, endpoint URL-г оруулна.
            </p>
          </div>

          <div className="rounded-xl border bg-background p-4">
            <Label className="text-sm font-medium">Хүргэлтийн горим</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Local — өөрийн жолоочоор хүргэнэ. Swift — гадаад API руу автоматаар илгээнэ.
            </p>
            <Select value={deliveryMode} onValueChange={(v) => setDeliveryMode(v as any)}>
              <SelectTrigger className="mt-2 w-full md:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local (Өөрийн жолооч)</SelectItem>
                <SelectItem value="swift">Swift / External API</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>

              <Label>Хүргэлтийн API Key</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk_xxxxxxxxxxxxxxxxxx"
                  className="font-mono text-sm"
                />
                <Button type="button" size="icon" variant="outline" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Хүргэлтийн систем дэх Эх сурвалж (Source System)-н API key.
              </p>
            </div>
            <div>
              <Label>API Endpoint URL</Label>
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://hurgelt.only.mn/functions/v1/receive-order"
                className="mt-1 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Хоосон бол default Swift endpoint ашиглана.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-violet-300/50 bg-background p-4">
            <p className="text-sm font-medium">Буцах Webhook (Хүргэлтийн систем → Only)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Хүргэлтийн систем дээр энэ URL болон Secret-г бүртгэнэ. Захиалгын төлөв өөрчлөгдөх болгонд автомат шинэчлэгдэнэ.
            </p>
            <div className="mt-3 space-y-2">
              <div>
                <Label className="text-xs">Webhook URL</Label>
                <div className="mt-1 flex gap-2">
                  <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                  <Button type="button" size="icon" variant="outline" onClick={() => copy(webhookUrl, "URL")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Webhook Secret (X-Webhook-Secret header)</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="whsec_..."
                    className="font-mono text-xs"
                  />
                  <Button type="button" size="icon" variant="outline" onClick={() => setShowSecret(!showSecret)}>
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button type="button" size="icon" variant="outline" onClick={generateSecret} title="Шинэ secret үүсгэх">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  {webhookSecret && (
                    <Button type="button" size="icon" variant="outline" onClick={() => copy(webhookSecret, "Secret")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Хоосон үлдээвэл webhook signature шалгахгүй (зөвхөн туршилтын үед).
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Хадгалж байна..." : "Хадгалах"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ShippingPolicyTab() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId;
  const qc = useQueryClient();

  const { data: m } = useQuery({
    queryKey: ["merchant-policy", merchantId],
    enabled: !!merchantId,
    queryFn: async () =>
      (await supabase.from("merchants").select("shipping_config,policy_shipping,policy_return,can_create_foreign_order_products").eq("id", merchantId!).maybeSingle()).data,
  });

  type ShipItem = { title: string; description?: string; duration?: string; price?: number; free?: boolean; label?: string };
  type ForeignCfg = { show: boolean; min_days: number | null; max_days: number | null; note: string };
  const cfg = (m?.shipping_config ?? {}) as { ub?: ShipItem; local?: ShipItem; extras?: ShipItem[]; foreign?: Partial<ForeignCfg> };
  const canForeign = !!m?.can_create_foreign_order_products;
  const [ub, setUb] = useState<ShipItem>({ title: "Улаанбаатар дотор", duration: "24-48 цаг", price: 0, free: true });
  const [local, setLocal] = useState<ShipItem>({ title: "Орон нутагт", duration: "2-4 хоног", price: 6000 });
  const [foreign, setForeign] = useState<ForeignCfg>({ show: true, min_days: 10, max_days: 14, note: "" });
  const [policyShip, setPolicyShip] = useState("");
  const [policyReturn, setPolicyReturn] = useState("");
  const [hydrated, setHydrated] = useState(false);

  if (m && !hydrated) {
    if (cfg.ub) setUb({ ...ub, ...cfg.ub });
    if (cfg.local) setLocal({ ...local, ...cfg.local });
    if (cfg.foreign) {
      setForeign({
        show: cfg.foreign.show !== false,
        min_days: cfg.foreign.min_days ?? 10,
        max_days: cfg.foreign.max_days ?? 14,
        note: cfg.foreign.note ?? "",
      });
    }
    setPolicyShip(m.policy_shipping ?? "");
    setPolicyReturn(m.policy_return ?? "");
    setHydrated(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!merchantId) throw new Error("merchant байхгүй");
      const payload = {
        shipping_config: {
          ub,
          local,
          extras: cfg.extras ?? [],
          foreign: {
            show: foreign.show,
            min_days: foreign.min_days,
            max_days: foreign.max_days,
            note: foreign.note || null,
          },
        },
        policy_shipping: policyShip || null,
        policy_return: policyReturn || null,
      };
      const { error } = await (supabase as any).from("merchants").update(payload).eq("id", merchantId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Хадгалагдлаа"); qc.invalidateQueries({ queryKey: ["merchant-policy", merchantId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  if (!merchantId) return <Card className="rounded-2xl p-6 text-sm text-muted-foreground">Дэлгүүр олдсонгүй.</Card>;

  const ShipRow = ({ value, onChange, label }: { value: ShipItem; onChange: (v: ShipItem) => void; label: string }) => (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="mb-2 text-sm font-semibold">{label}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><Label>Гарчиг</Label><Input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} /></div>
        <div><Label>Хугацаа</Label><Input value={value.duration ?? ""} onChange={(e) => onChange({ ...value, duration: e.target.value })} /></div>
        <div><Label>Үнэ (₮)</Label><Input type="number" value={value.price ?? 0} onChange={(e) => onChange({ ...value, price: Number(e.target.value) })} disabled={value.free} /></div>
        <label className="flex items-end gap-2 pb-2"><Switch checked={!!value.free} onCheckedChange={(v) => onChange({ ...value, free: v })} /> Үнэгүй</label>
      </div>
    </div>
  );

  return (
    <Card className="rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Хүргэлтийн тохиргоо</h2>
        <p className="mt-1 text-xs text-muted-foreground">Барааны хуудсанд "Хүргэлтийн мэдээлэл" блокт харагдана.</p>
      </div>
      <ShipRow value={ub} onChange={setUb} label="Улаанбаатар" />
      <ShipRow value={local} onChange={setLocal} label="Орон нутаг" />

      {canForeign && (
        <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                <span className="block h-5 w-5 text-center text-sm font-bold">✈</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-indigo-950">Гадаадаас захиалгын ирэх хугацаа</h3>
                <p className="mt-0.5 text-xs text-indigo-700/80">
                  Зөвхөн гадаадаас захиалгат бараа дээр барааны дэлгэрэнгүй хуудсанд харагдана.
                </p>
              </div>
            </div>
            <label className="flex shrink-0 items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium text-indigo-900 shadow-sm">
              <span>{foreign.show ? "Харуулна" : "Нуусан"}</span>
              <Switch checked={foreign.show} onCheckedChange={(v) => setForeign({ ...foreign, show: v })} />
            </label>
          </div>
          <div className={`grid gap-3 transition-opacity md:grid-cols-3 ${foreign.show ? "" : "opacity-50"}`}>
            <div>
              <Label>Хамгийн бага (өдөр)</Label>
              <Input
                type="number"
                min={1}
                value={foreign.min_days ?? ""}
                onChange={(e) => setForeign({ ...foreign, min_days: e.target.value ? Number(e.target.value) : null })}
                disabled={!foreign.show}
              />
            </div>
            <div>
              <Label>Хамгийн их (өдөр)</Label>
              <Input
                type="number"
                min={1}
                value={foreign.max_days ?? ""}
                onChange={(e) => setForeign({ ...foreign, max_days: e.target.value ? Number(e.target.value) : null })}
                disabled={!foreign.show}
              />
            </div>
            <div>
              <Label>Нэмэлт тайлбар</Label>
              <Input
                placeholder="Захиалга баталгаажсанаас хойш ойролцоогоор"
                value={foreign.note}
                onChange={(e) => setForeign({ ...foreign, note: e.target.value })}
                disabled={!foreign.show}
              />
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-white/60 px-3 py-2 text-xs text-indigo-900">
            <span className="font-semibold">Урьдчилсан харагдац:</span>{" "}
            {foreign.show ? (
              <>Гадаадаас ирэх хугацаа · <span className="font-semibold">
                {foreign.min_days && foreign.max_days && foreign.min_days !== foreign.max_days
                  ? `${foreign.min_days}-${foreign.max_days} өдөр`
                  : `${foreign.max_days ?? foreign.min_days ?? "—"} өдөр`}
              </span></>
            ) : (
              <span className="text-muted-foreground">Хэрэглэгчид харагдахгүй.</span>
            )}
          </div>
        </div>
      )}

      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold">Хүргэлтийн нөхцөл</h2>
        <p className="mb-2 mt-1 text-xs text-muted-foreground">Хоосон үед платформын стандарт нөхцөл харагдана.</p>
        <TiptapEditor value={policyShip} onChange={setPolicyShip} minHeight={200} placeholder="Хүргэлтийн нөхцөл бичих..." />
      </div>

      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold">Буцаалтын нөхцөл</h2>
        <p className="mb-2 mt-1 text-xs text-muted-foreground">Хоосон үед платформын стандарт нөхцөл харагдана.</p>
        <TiptapEditor value={policyReturn} onChange={setPolicyReturn} minHeight={200} placeholder="Буцаалтын нөхцөл бичих..." />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Хадгалж байна..." : "Хадгалах"}
        </Button>
      </div>
    </Card>
  );
}
