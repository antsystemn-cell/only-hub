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
import { Trash2, Plus, Eye, EyeOff, Pencil, X } from "lucide-react";
import { fmtMnt } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { testPaymentConnection } from "@/lib/payments.functions";

export const Route = createFileRoute("/merchant/dashboard/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Тохиргоо</h1>
      <Tabs defaultValue="categories">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="categories">Ангилал</TabsTrigger>
          <TabsTrigger value="brands">Брэнд</TabsTrigger>
          <TabsTrigger value="delivery">Хүргэлт</TabsTrigger>
          <TabsTrigger value="payments">Төлбөр</TabsTrigger>
          <TabsTrigger value="banners">Баннер</TabsTrigger>
        </TabsList>
        <TabsContent value="categories"><CrudList table="categories" fields={[{ k: "name", l: "Нэр" }, { k: "icon", l: "Icon (emoji)" }]} /></TabsContent>
        <TabsContent value="brands"><CrudList table="brands" fields={[{ k: "name", l: "Нэр" }, { k: "logo_url", l: "Лого URL" }]} /></TabsContent>
        <TabsContent value="delivery"><CrudList table="delivery_options" fields={[
          { k: "name", l: "Нэр" },
          { k: "description", l: "Тайлбар" },
          { k: "price", l: "Үнэ ₮", type: "number" },
          { k: "address", l: "Хаяг" },
          { k: "phone", l: "Утас" },
          { k: "payment_terms", l: "Төлбөрийн нөхцөл" },
          { k: "estimated_days_min", l: "Хам. бага хоног", type: "number" },
          { k: "estimated_days_max", l: "Хам. их хоног", type: "number" },
        ]} hasActiveToggle /></TabsContent>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
        <TabsContent value="banners"><CrudList table="promo_banners" fields={[
          { k: "title", l: "Гарчиг" },
          { k: "subtitle", l: "Дэд гарчиг" },
          { k: "button_text", l: "Товчны текст" },
          { k: "button_link", l: "Товчны линк" },
          { k: "banner_image", l: "Зургийн URL" },
        ]} hasActiveToggle /></TabsContent>
      </Tabs>
    </div>
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
  const [form, setForm] = useState<any>({ provider_type: "qpay", name: "QPay", icon: "💳", is_active: true, credentials: {} });
  const [showSecret, setShowSecret] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["payment_providers", merchantId],
    queryFn: async () => (await supabase.from("payment_providers").select("*").eq("merchant_id", merchantId)).data ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payment_providers").insert({ ...form, merchant_id: merchantId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Нэмэгдлээ"); qc.invalidateQueries({ queryKey: ["payment_providers", merchantId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = async (id: string) => {
    await supabase.from("payment_providers").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["payment_providers", merchantId] });
  };

  const credFields: Record<string, string[]> = {
    qpay: ["invoice_code", "username", "password"],
    storepay: ["merchant_id", "api_key"],
    hipay: ["merchant_id", "api_key"],
    cash: [],
  };
  const fields = credFields[form.provider_type] ?? [];

  return (
    <Card className="rounded-2xl p-5">
      <h3 className="mb-4 font-semibold">Шинэ төлбөрийн үйлчилгээ</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <div><Label>Үйлчилгээ</Label>
          <Select value={form.provider_type} onValueChange={(v) => setForm({ ...form, provider_type: v, credentials: {} })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="qpay">QPay</SelectItem><SelectItem value="storepay">StorePay</SelectItem>
              <SelectItem value="hipay">HiPay</SelectItem><SelectItem value="cash">Бэлэн мөнгө</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Харагдах нэр</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Icon</Label><Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></div>
        <div className="md:col-span-3"><Label>Тайлбар</Label><Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

        {fields.length > 0 && (
          <div className="md:col-span-3">
            <div className="mb-2 flex items-center justify-between">
              <Label>API мэдээлэл</Label>
              <Button size="sm" variant="ghost" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
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
        <Button onClick={() => save.mutate()}>Хадгалах</Button>
      </div>

      <div className="mt-6 space-y-2">
        {(items as any[]).map((p) => (
          <ProviderRow key={p.id} provider={p} onDelete={() => del(p.id)} />
        ))}
      </div>
    </Card>
  );
}

function ProviderRow({ provider: p, onDelete }: { provider: any; onDelete: () => void }) {
  const test = useServerFn(testPaymentConnection);
  const [pending, setPending] = useState(false);
  const hasCreds = p.credentials && Object.keys(p.credentials).length > 0;
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
        {p.icon} {p.name}
        <span className="text-xs text-muted-foreground">({p.provider_type})</span>
        {p.is_active && <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">Идэвхтэй</span>}
        {hasCreds && <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">🔐 Тохируулагдсан</span>}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={runTest} disabled={pending}>{pending ? "Шалгаж байна..." : "Холболт шалгах"}</Button>
        <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
