import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, Send, Download } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { importEasyshopProducts } from "@/lib/import-easyshop.functions";

const SETTING_KEYS = ["default_delivery_fee", "delivery_fee_rules", "default_commission_rate"] as const;

const getPlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", { _user_id: userId });
    if (!isAdmin) return { ok: false as const, error: "Эрх хүрэхгүй", settings: {} as Record<string, any> };
    const { data } = await supabaseAdmin
      .from("platform_settings")
      .select("key,value")
      .in("key", SETTING_KEYS as unknown as string[]);
    const settings: Record<string, any> = {};
    for (const r of data ?? []) settings[(r as any).key] = (r as any).value;
    return { ok: true as const, settings };
  });

const savePlatformSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      key: z.enum(SETTING_KEYS as unknown as [string, ...string[]]),
      value: z.any(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", { _user_id: userId });
    if (!isAdmin) return { ok: false as const, error: "Эрх хүрэхгүй" };
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ key: data.key, value: data.value, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
const sendSwiftTestOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      customerName: z.string().min(1).max(100).optional(),
      phone: z.string().min(6).max(20).optional(),
      address: z.string().min(3).max(300).optional(),
      note: z.string().max(300).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", { _user_id: userId });
    if (!isAdmin) return { ok: false as const, error: "Эрх хүрэхгүй" };

    const API_URL = (process.env.SWIFT_DELIVERY_API_URL || "").replace(/\/$/, "");
    const API_KEY = process.env.SWIFT_DELIVERY_API_KEY || "";
    if (!API_URL || !API_KEY) {
      return { ok: false as const, error: "SWIFT_DELIVERY_API_URL эсвэл SWIFT_DELIVERY_API_KEY тохируулаагүй байна" };
    }

    const testId = `TEST-${Date.now()}`;
    const payload = {
      external_order_id: `OMH-${testId}`,
      source_system: "only_merchants_hub",
      merchant_name: "Only Hub Test Merchant",
      customer_name: data.customerName || "Тест Хэрэглэгч",
      phone: data.phone || "99999999",
      district: "Тест дүүрэг",
      address_text: data.address || "Тест хаяг, Улаанбаатар",
      delivery_note: data.note || "Энэ бол admin тохиргооноос илгээсэн тест захиалга",
      payment_method: "cash",
      payment_status: "unpaid",
      items: [
        { product_name: "Тест бараа", quantity: 1, unit_price: 10000, sku: "TEST-SKU" },
      ],
      subtotal: 10000,
      total_amount: 15000,
      delivery_fee: 5000,
    };

    const startedAt = Date.now();
    try {
      const resp = await fetch(`${API_URL}/order-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify(payload),
      });
      const raw = await resp.json().catch(() => ({}));
      const elapsedMs = Date.now() - startedAt;
      if (!resp.ok) {
        return {
          ok: false as const,
          error: (raw as any)?.error ?? (raw as any)?.message ?? `HTTP ${resp.status}`,
          status: resp.status,
          elapsedMs,
          payload,
          raw,
        };
      }
      return {
        ok: true as const,
        status: resp.status,
        elapsedMs,
        externalOrderId: payload.external_order_id,
        payload,
        raw,
      };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Холбогдох үед алдаа гарлаа", payload };
    }
  });


export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Платформ тохиргоо — Admin" }] }),
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const getFn = useServerFn(getPlatformSettings);
  const saveFn = useServerFn(savePlatformSetting);
  const { data, refetch } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => getFn({ data: {} as any }),
  });

  const settings = (data?.ok ? data.settings : {}) as Record<string, any>;

  const [flat, setFlat] = useState<string>("5000");
  const [freeOver, setFreeOver] = useState<string>("0");
  const [commission, setCommission] = useState<string>("3");

  useEffect(() => {
    const rules = settings.delivery_fee_rules ?? {};
    setFlat(String(rules.flat ?? settings.default_delivery_fee ?? 5000));
    setFreeOver(String(rules.free_over ?? 0));
    setCommission(String(settings.default_commission_rate ?? 3));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      await saveFn({
        data: {
          key: "delivery_fee_rules",
          value: { flat: Number(flat) || 0, free_over: Number(freeOver) || 0 },
        },
      });
      await saveFn({
        data: { key: "default_delivery_fee", value: Number(flat) || 0 },
      });
      await saveFn({
        data: { key: "default_commission_rate", value: Number(commission) || 0 },
      });
    },
    onSuccess: () => { toast.success("Хадгалагдлаа"); refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-8">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Платформын тохиргоо</h1>
          <p className="text-sm text-muted-foreground">Хүргэлтийн төлбөр, комисс</p>
        </div>
      </div>

      <Card className="mt-6 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Хүргэлтийн стандарт төлбөр</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Дэлгүүр өөрийн delivery option бүртгээгүй үед энэ хэрэглэгдэнэ.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label>Үндсэн төлбөр (₮)</Label>
            <Input type="number" value={flat} onChange={(e) => setFlat(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Үнэгүй хүргэлт босго (₮)</Label>
            <Input type="number" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">0 = идэвхгүй</p>
          </div>
        </div>
      </Card>

      <Card className="mt-4 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Үндсэн комисс (%)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Шинэ дэлгүүр үүсэхэд default commission rate.
        </p>
        <Input
          type="number"
          step="0.1"
          value={commission}
          onChange={(e) => setCommission(e.target.value)}
          className="mt-3 max-w-xs"
        />
      </Card>

      <div className="mt-6 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Хадгалж байна..." : "Хадгалах"}
        </Button>
      </div>

      <SwiftTestOrderCard />
      <EasyshopImportCard />
    </div>
  );
}

function EasyshopImportCard() {
  const importFn = useServerFn(importEasyshopProducts);
  const [result, setResult] = useState<any>(null);
  const mut = useMutation({
    mutationFn: async () => importFn({ data: { onlyDiscounted: true } }),
    onSuccess: (res: any) => {
      setResult(res);
      if (res?.ok) toast.success(`Импорт амжилттай: ${res.upserted}/${res.fetched}`);
      else toast.error(res?.error ?? "Алдаа");
    },
    onError: (e: any) => { setResult({ ok: false, error: e?.message }); toast.error(e?.message ?? "Алдаа"); },
  });
  const mutAll = useMutation({
    mutationFn: async () => importFn({ data: { onlyDiscounted: false } }),
    onSuccess: (res: any) => {
      setResult(res);
      if (res?.ok) toast.success(`Импорт амжилттай: ${res.upserted}/${res.fetched}`);
      else toast.error(res?.error ?? "Алдаа");
    },
    onError: (e: any) => { setResult({ ok: false, error: e?.message }); toast.error(e?.message ?? "Алдаа"); },
  });

  return (
    <Card className="mt-4 rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <Download className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Easyshop импорт</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Easyshop (Homestore Mongolia) дэлгүүрээс шинэ болон хямдралтай бүтээгдэхүүнүүдийг
        татаж <code className="font-mono">easyshop</code> мерчант руу нэмнэ. Давхцал үүсэхгүй —
        ижил бүтээгдэхүүнийг дахин дарж шинэчилнэ. Үлдэгдлийг Easyshop-той ижил утгаар тохируулна.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || mutAll.isPending} variant="secondary">
          <Download className="mr-2 h-4 w-4" />
          {mut.isPending ? "Татаж байна..." : "Шинэ + хямдралтай импорт"}
        </Button>
        <Button onClick={() => mutAll.mutate()} disabled={mut.isPending || mutAll.isPending} variant="outline">
          {mutAll.isPending ? "Татаж байна..." : "Бүх идэвхтэй импорт"}
        </Button>
      </div>
      {result && (
        <div className="mt-4 rounded-lg border p-3 text-xs">
          <div className={result.ok ? "font-semibold text-green-600" : "font-semibold text-destructive"}>
            {result.ok ? `Амжилттай: татсан ${result.fetched}, шинэчилсэн ${result.upserted}` : `Алдаа: ${result.error}`}
          </div>
        </div>
      )}
    </Card>
  );
}

function SwiftTestOrderCard() {
  const sendFn = useServerFn(sendSwiftTestOrder);
  const [customerName, setCustomerName] = useState("Тест Хэрэглэгч");
  const [phone, setPhone] = useState("99999999");
  const [address, setAddress] = useState("Тест хаяг, Улаанбаатар");
  const [note, setNote] = useState("Admin тохиргооноос илгээсэн тест");
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: async () =>
      sendFn({ data: { customerName, phone, address, note } }),
    onSuccess: (res: any) => {
      setResult(res);
      if (res?.ok) toast.success(`Амжилттай (${res.elapsedMs}ms)`);
      else toast.error(res?.error ?? "Алдаа");
    },
    onError: (e: any) => {
      setResult({ ok: false, error: e?.message });
      toast.error(e?.message ?? "Алдаа");
    },
  });

  return (
    <Card className="mt-4 rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Swift Delivery Hub — тест захиалга</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Гадаад хүргэлтийн API руу бодит дуудлага илгээж холболтыг шалгана.
        external_order_id нь <code className="font-mono">OMH-TEST-…</code> prefix-тэй
        тул бодит захиалгатай хольж андуурахгүй.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <Label>Хэрэглэгчийн нэр</Label>
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Утас</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label>Хаяг</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label>Тэмдэглэл</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" rows={2} />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} variant="secondary">
          <Send className="mr-2 h-4 w-4" />
          {mut.isPending ? "Илгээж байна..." : "Тест захиалга илгээх"}
        </Button>
      </div>

      {result && (
        <div className="mt-4 rounded-lg border p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className={result.ok ? "font-semibold text-green-600" : "font-semibold text-destructive"}>
              {result.ok ? "Амжилттай" : "Амжилтгүй"}
            </span>
            <span className="text-muted-foreground">
              {result.status ? `HTTP ${result.status}` : ""} {result.elapsedMs ? `· ${result.elapsedMs}ms` : ""}
            </span>
          </div>
          {result.externalOrderId && (
            <div className="mt-2 font-mono">external_order_id: {result.externalOrderId}</div>
          )}
          {result.error && <div className="mt-2 text-destructive">{result.error}</div>}
          {result.raw && (
            <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
{JSON.stringify(result.raw, null, 2)}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}
