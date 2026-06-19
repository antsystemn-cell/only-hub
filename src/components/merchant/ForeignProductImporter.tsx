import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertCircle, ArrowLeft, CheckCircle2, Download, ExternalLink, Loader2, Plus, Trash2, X,
} from "lucide-react";
import {
  previewForeignImport,
  createForeignProduct,
} from "@/lib/foreign-orders/importer.functions";
import {
  getMerchantForeignSettings,
  upsertMerchantForeignSettings,
} from "@/lib/foreign-orders/settings.functions";
import { FOREIGN_SOURCES } from "@/lib/foreign-orders/sources";
import {
  calculateVariantPricing,
  DEFAULT_POIZON_KR_SETTINGS,
  type ForeignPricingSettings,
} from "@/lib/foreign-orders/pricing";
import { fmtMnt } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type ForeignSource = Database["public"]["Enums"]["foreign_source"];

type VariantDraft = {
  sourceVariantId?: string | null;
  sizeLabel: string;
  colorLabel?: string | null;
  sourcePrice: number;
  isPurchasable: boolean;
};

type ParsedPreview = {
  status: string;
  warnings: string[];
  sourceUrl: string;
  sourceProductId: string;
  title: string;
  brand: string;
  description: string;
  coverImage: string;
  gallery: string[];
};

type Props = {
  merchantId: string;
  source: ForeignSource;
  onClose: () => void;
};

export function ForeignProductImporter({ merchantId, source, onClose }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sourceDef = FOREIGN_SOURCES[source];

  const [url, setUrl] = useState("");
  const [step, setStep] = useState<"url" | "preview">("url");
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // ----- Settings -----
  const fetchSettings = useServerFn(getMerchantForeignSettings);
  const settingsQuery = useQuery({
    queryKey: ["merchant-foreign-settings", merchantId, source],
    queryFn: () => fetchSettings({ data: { merchantId, source } }),
  });
  const settingsRow = settingsQuery.data?.[0] ?? null;

  const settings: ForeignPricingSettings = {
    defaultProfitPercent: Number(settingsRow?.default_profit_percent ?? 25),
    minimumProfitMnt: Number(settingsRow?.minimum_profit_mnt ?? 0),
    defaultCargoCostMnt: Number(settingsRow?.default_cargo_cost_mnt ?? 0),
    defaultLocalDeliveryCostMnt: Number(settingsRow?.default_local_delivery_cost_mnt ?? 0),
    defaultKoreaDomesticShippingKrw: Number(settingsRow?.default_korea_domestic_shipping_krw ?? 0),
    defaultKoreaDomesticShippingMnt: Number(settingsRow?.default_korea_domestic_shipping_mnt ?? 0),
    paymentFeeReservePercent: Number(settingsRow?.payment_fee_reserve_percent ?? 0),
    paymentFeeReserveFixedMnt: Number(settingsRow?.payment_fee_reserve_fixed_mnt ?? 0),
    riskBufferPercent: Number(settingsRow?.risk_buffer_percent ?? 0),
    riskBufferFixedMnt: Number(settingsRow?.risk_buffer_fixed_mnt ?? 0),
    roundingRule: Number(settingsRow?.rounding_rule ?? 1000),
    profitBase: (settingsRow?.profit_base as any) ?? "TOTAL_COST",
    exchangeRate: Number(settingsRow?.exchange_rate ?? 0),
  };

  const hasSettings = !!settingsRow && settings.exchangeRate > 0;

  const previewFn = useServerFn(previewForeignImport);
  const createFn = useServerFn(createForeignProduct);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await previewFn({ data: { merchantId, source, url: url.trim() } });
      return res;
    },
    onSuccess: (res) => {
      setWarnings(res.warnings ?? []);
      if (!res.parsed) {
        toast.error("Татаж чадсангүй", { description: res.warnings?.[0] });
        return;
      }
      const p = res.parsed;
      setPreview({
        status: res.status,
        warnings: res.warnings ?? [],
        sourceUrl: p.sourceUrl,
        sourceProductId: p.sourceProductId ?? "",
        title: p.title ?? "",
        brand: p.brand ?? "",
        description: p.description ?? "",
        coverImage: p.coverImage ?? "",
        gallery: p.gallery ?? [],
      });
      const seeded: VariantDraft[] = (p.variants ?? []).map((v: any) => ({
        sourceVariantId: v.sourceVariantId ?? null,
        sizeLabel: v.sizeLabel ?? "",
        colorLabel: v.colorLabel ?? null,
        sourcePrice: Number(v.sourcePrice ?? 0),
        isPurchasable: !!v.sourcePrice,
      }));
      if (seeded.length === 0) {
        seeded.push({ sizeLabel: "", sourcePrice: 0, isPurchasable: false });
      }
      setVariants(seeded);
      setStep("preview");
      toast.success(
        res.status === "SUCCESS"
          ? "Бүх мэдээлэл амжилттай татагдлаа"
          : "Мэдээлэл хэсэгчлэн татагдлаа. Гараар засна уу.",
      );
    },
    onError: (e: any) => toast.error(e.message ?? "Татах үед алдаа гарлаа"),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Урьдчилсан мэдээлэл байхгүй байна.");
      return createFn({
        data: {
          merchantId,
          source,
          sourceUrl: preview.sourceUrl,
          sourceProductId: preview.sourceProductId,
          title: preview.title.trim(),
          brand: preview.brand || null,
          description: preview.description || null,
          coverImage: preview.coverImage || null,
          gallery: preview.gallery,
          variants: variants
            .filter((v) => v.sizeLabel.trim() && v.sourcePrice > 0)
            .map((v) => ({
              sourceVariantId: v.sourceVariantId ?? null,
              sizeLabel: v.sizeLabel.trim(),
              colorLabel: v.colorLabel ?? null,
              sourcePrice: Number(v.sourcePrice),
              isPurchasable: v.isPurchasable,
            })),
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Бараа үүсгэлээ");
      qc.invalidateQueries({ queryKey: ["products", merchantId] });
      onClose();
      navigate({ to: "/merchant/dashboard/products" }).catch(() => {});
    },
    onError: (e: any) => toast.error(e.message ?? "Үүсгэхэд алдаа"),
  });

  return (
    <Card className="rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">{sourceDef.name}-аас бараа татах</h2>
          <p className="text-sm text-muted-foreground">
            {sourceDef.country} • {sourceDef.currency} • {sourceDef.defaultDeliveryMinDays}–{sourceDef.defaultDeliveryMaxDays} хоног
          </p>
        </div>
      </div>

      {!hasSettings && (
        <Alert className="mb-4 border-amber-300 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Үнэ тооцооны тохиргоо дутуу байна</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              KRW→MNT ханш болон ашгийн хувь тохируулагдаагүй учир үнэ автомат тооцох боломжгүй.
              Доорх форм-оор хурдан тохируулна уу.
            </p>
            <SettingsQuickForm merchantId={merchantId} source={source} />
          </AlertDescription>
        </Alert>
      )}

      {step === "url" && (
        <div className="space-y-3">
          <Label>{sourceDef.name} барааны линк</Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://kr.poizon.com/product/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={!url.trim() || previewMutation.isPending}
            >
              {previewMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Мэдээлэл татах
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Жишээ: https://kr.poizon.com/product/new-balance-530-...-60886973
          </p>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="space-y-5">
          <ImportStatusBadge status={preview.status} />
          {warnings.length > 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle>Анхааруулга</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 text-sm">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div>
              {preview.coverImage ? (
                <img src={preview.coverImage} className="aspect-square w-full rounded-xl object-cover" />
              ) : (
                <div className="aspect-square w-full rounded-xl border-2 border-dashed bg-muted" />
              )}
              <Input
                className="mt-2 text-xs"
                placeholder="Үндсэн зураг URL"
                value={preview.coverImage}
                onChange={(e) => setPreview({ ...preview, coverImage: e.target.value })}
              />
            </div>
            <div className="space-y-3">
              <div>
                <Label>Барааны нэр</Label>
                <Input value={preview.title} onChange={(e) => setPreview({ ...preview, title: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Бренд</Label>
                  <Input value={preview.brand} onChange={(e) => setPreview({ ...preview, brand: e.target.value })} />
                </div>
                <div>
                  <Label>Эх сурвалжийн линк</Label>
                  <a
                    href={preview.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex items-center gap-1 truncate text-xs text-orange-600 hover:underline"
                  >
                    {preview.sourceUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div>
                <Label>Тайлбар</Label>
                <Textarea
                  rows={3}
                  value={preview.description}
                  onChange={(e) => setPreview({ ...preview, description: e.target.value })}
                />
              </div>
            </div>
          </div>

          {preview.gallery.length > 0 && (
            <div>
              <Label>Галерей ({preview.gallery.length})</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {preview.gallery.map((g, i) => (
                  <div key={i} className="relative">
                    <img src={g} className="h-16 w-16 rounded-lg object-cover" />
                    <button
                      onClick={() =>
                        setPreview({ ...preview, gallery: preview.gallery.filter((_, j) => j !== i) })
                      }
                      className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <VariantsEditor
            variants={variants}
            setVariants={setVariants}
            settings={settings}
            hasSettings={hasSettings}
            currency={sourceDef.currency}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep("url")}>Буцах</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!hasSettings || createMutation.isPending || !preview.title.trim()}
            >
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Бараа үүсгэх
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ImportStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    SUCCESS: { label: "Амжилттай", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
    PARTIAL_IMPORT: { label: "Хэсэгчилсэн", cls: "bg-amber-100 text-amber-700", icon: AlertCircle },
    IMPORT_FAILED: { label: "Татаж чадсангүй", cls: "bg-red-100 text-red-700", icon: AlertCircle },
    MANUAL_REVIEW_REQUIRED: { label: "Гараар бөглөнө", cls: "bg-orange-100 text-orange-700", icon: AlertCircle },
  };
  const m = map[status] ?? map.MANUAL_REVIEW_REQUIRED;
  const Icon = m.icon;
  return (
    <Badge className={`${m.cls} hover:${m.cls} gap-1`}>
      <Icon className="h-3 w-3" /> {m.label}
    </Badge>
  );
}

function VariantsEditor({
  variants, setVariants, settings, hasSettings, currency,
}: {
  variants: VariantDraft[];
  setVariants: (v: VariantDraft[]) => void;
  settings: ForeignPricingSettings;
  hasSettings: boolean;
  currency: string;
}) {
  const update = (i: number, patch: Partial<VariantDraft>) =>
    setVariants(variants.map((v, j) => (i === j ? { ...v, ...patch } : v)));

  const remove = (i: number) => setVariants(variants.filter((_, j) => j !== i));
  const add = () =>
    setVariants([...variants, { sizeLabel: "", sourcePrice: 0, isPurchasable: false }]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label>Хувилбарууд</Label>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="mr-1 h-3 w-3" /> Нэмэх
        </Button>
      </div>
      <div className="space-y-2">
        {variants.map((v, i) => {
          const pricing =
            hasSettings && v.sourcePrice > 0
              ? calculateVariantPricing({ sourcePrice: v.sourcePrice }, settings)
              : null;
          return (
            <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-xl border p-2.5">
              <Input
                className="col-span-3"
                placeholder="Хэмжээ (e.g. 250)"
                value={v.sizeLabel}
                onChange={(e) => update(i, { sizeLabel: e.target.value })}
              />
              <Input
                className="col-span-2"
                placeholder="Өнгө"
                value={v.colorLabel ?? ""}
                onChange={(e) => update(i, { colorLabel: e.target.value || null })}
              />
              <div className="col-span-3 flex items-center gap-1">
                <Input
                  type="number"
                  placeholder={`Үнэ ${currency}`}
                  value={v.sourcePrice || ""}
                  onChange={(e) => update(i, { sourcePrice: Number(e.target.value) || 0 })}
                />
                <span className="text-xs text-muted-foreground">{currency}</span>
              </div>
              <div className="col-span-3 text-right text-sm font-semibold">
                {pricing ? (
                  <span className="text-orange-600">{fmtMnt(pricing.roundedCustomerPriceMnt)}</span>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </div>
              <Button variant="ghost" size="icon" className="col-span-1" onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
      {!hasSettings && (
        <p className="mt-2 text-xs text-amber-700">
          Үнэ тооцоог идэвхжүүлэхийн тулд эхлээд тохиргоог хадгална уу.
        </p>
      )}
    </div>
  );
}

function SettingsQuickForm({
  merchantId, source,
}: { merchantId: string; source: ForeignSource }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertMerchantForeignSettings);
  const sourceDef = FOREIGN_SOURCES[source];
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [profitPercent, setProfitPercent] = useState<number>(25);
  const [cargo, setCargo] = useState<number>(0);
  const [delivery, setDelivery] = useState<number>(0);

  const save = useMutation({
    mutationFn: async () =>
      upsertFn({
        data: {
          merchantId,
          source,
          enabled: true,
          ...DEFAULT_POIZON_KR_SETTINGS,
          defaultProfitPercent: profitPercent,
          defaultCargoCostMnt: cargo,
          defaultLocalDeliveryCostMnt: delivery,
          exchangeRate,
          defaultDeliveryMinDays: sourceDef.defaultDeliveryMinDays,
          defaultDeliveryMaxDays: sourceDef.defaultDeliveryMaxDays,
          // explicit zeros to satisfy zod defaults
          minimumProfitMnt: 0,
          defaultKoreaDomesticShippingKrw: 0,
          defaultKoreaDomesticShippingMnt: 0,
          paymentFeeReservePercent: 0,
          paymentFeeReserveFixedMnt: 0,
          riskBufferPercent: 0,
          riskBufferFixedMnt: 0,
          roundingRule: 1000,
          profitBase: "TOTAL_COST",
          priceSyncMode: "REVIEW_BEFORE_UPDATE",
          priceChangeThresholdPercent: 5,
          priceChangeThresholdMnt: 5000,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Тохиргоог хадгаллаа");
      qc.invalidateQueries({ queryKey: ["merchant-foreign-settings", merchantId, source] });
    },
    onError: (e: any) => toast.error(e.message ?? "Алдаа"),
  });

  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-4">
      <div>
        <Label className="text-xs">KRW→MNT ханш</Label>
        <Input type="number" step="0.01" value={exchangeRate || ""} onChange={(e) => setExchangeRate(Number(e.target.value) || 0)} />
      </div>
      <div>
        <Label className="text-xs">Ашиг %</Label>
        <Input type="number" value={profitPercent} onChange={(e) => setProfitPercent(Number(e.target.value) || 0)} />
      </div>
      <div>
        <Label className="text-xs">Карго (MNT)</Label>
        <Input type="number" value={cargo} onChange={(e) => setCargo(Number(e.target.value) || 0)} />
      </div>
      <div>
        <Label className="text-xs">Хүргэлт (MNT)</Label>
        <Input type="number" value={delivery} onChange={(e) => setDelivery(Number(e.target.value) || 0)} />
      </div>
      <div className="sm:col-span-4">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || exchangeRate <= 0}>
          {save.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
          Тохиргоог хадгалах
        </Button>
      </div>
    </div>
  );
}

// Tiny helper because TanStack's useServerFn returns a function-of-options;
// we want the loaded settings inline without wrapping in another hook.
function useServerFnFetch<TFn extends (...args: any) => Promise<any>>(
  fn: TFn,
  args: Parameters<TFn>[0] extends { data: infer D } ? D : never,
): ReturnType<TFn> {
  const f = useServerFn(fn as any);
  return f({ data: args } as any);
}
