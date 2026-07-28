// Manual foreign-order importer.
// For sources that don't have an automated scraper adapter (e.g. Taobao),
// the merchant pastes the source link and fills the product fields by hand.
// Uses the same createForeignProduct server function as the Poizon importer
// so pricing, RLS, and downstream (cargo/queue) all stay identical.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, Plus, Trash2, X } from "lucide-react";
import { createForeignProduct, findExistingForeignProduct } from "@/lib/foreign-orders/importer.functions";
import {
  getMerchantForeignSettings, upsertMerchantForeignSettings,
} from "@/lib/foreign-orders/settings.functions";
import { FOREIGN_SOURCES } from "@/lib/foreign-orders/sources";
import { calculateVariantPricing, type ForeignPricingSettings } from "@/lib/foreign-orders/pricing";
import { fmtMnt } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type ForeignSource = Database["public"]["Enums"]["foreign_source"];

type VariantDraft = {
  sizeLabel: string;
  colorLabel: string;
  sourcePrice: number;
  isPurchasable: boolean;
};

type Props = {
  merchantId: string;
  source: ForeignSource;
  onClose: () => void;
};

const initialVariantDraft = (): VariantDraft => ({
  sizeLabel: "Үндсэн",
  colorLabel: "",
  sourcePrice: 0,
  isPurchasable: true,
});

export function ManualForeignProductImporter({ merchantId, source, onClose }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sourceDef = FOREIGN_SOURCES[source];

  const [step, setStep] = useState<"url" | "form">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceProductId, setSourceProductId] = useState("");
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [galleryText, setGalleryText] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>([initialVariantDraft()]);

  const fetchSettings = useServerFn(getMerchantForeignSettings);
  const settingsQuery = useQuery({
    queryKey: ["merchant-foreign-settings", merchantId, source],
    queryFn: () => fetchSettings({ data: { merchantId, source } }),
  });
  const settingsRow = settingsQuery.data?.[0] ?? null;

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", merchantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories").select("*").eq("merchant_id", merchantId).order("position");
      return data ?? [];
    },
  });

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

  const gallery = useMemo(
    () =>
      galleryText
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//i.test(s)),
    [galleryText],
  );

  const createFn = useServerFn(createForeignProduct);
  const findDupFn = useServerFn(findExistingForeignProduct);
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const effectiveProductId = sourceProductId.trim() || (sourceUrl ? fallbackProductId(sourceUrl) : "");
  const dupQuery = useQuery({
    queryKey: ["foreign-dup", merchantId, source, effectiveProductId, sourceUrl.trim()],
    enabled: step === "form" && (!!effectiveProductId || !!sourceUrl.trim()),
    queryFn: () =>
      findDupFn({
        data: {
          merchantId,
          source,
          sourceProductId: effectiveProductId || null,
          sourceUrl: sourceUrl.trim() || null,
        },
      }),
  });
  const duplicates = (dupQuery.data?.items ?? []) as Array<{ id: string; name: string; slug: string | null; image_url: string | null; is_active: boolean; created_at: string }>;
  const hasDuplicate = duplicates.length > 0;

  const hasPrice = variants.some((v) => Number(v.sourcePrice) > 0);
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Барааны нэрээ бөглөнө үү.");
      if (!sourceUrl.trim()) throw new Error("Эх сурвалжийн линкээ оруулна уу.");
      const pid = sourceProductId.trim() || fallbackProductId(sourceUrl);
      const validVariants = variants
        .filter((v) => v.sourcePrice > 0)
        .map((v) => ({
          sizeLabel: v.sizeLabel.trim() || "Үндсэн",
          colorLabel: v.colorLabel.trim() || null,
          sourcePrice: Number(v.sourcePrice),
          isPurchasable: v.isPurchasable,
        }));
      if (validVariants.length === 0) {
        throw new Error(`Хамгийн багадаа нэг ${sourceDef.currency} үнэ оруулна уу.`);
      }
      return createFn({
        data: {
          merchantId,
          source,
          sourceUrl: sourceUrl.trim(),
          sourceProductId: pid,
          title: title.trim(),
          brand: brand.trim() || null,
          category: category || null,
          description: description.trim() || null,
          coverImage: coverImage.trim() || null,
          gallery,
          productInfo: [],
          productIntroSections: [],
          variants: validVariants,
          allowDuplicate,
        },
      });
    },
    onSuccess: () => {
      toast.success("Бараа үүсгэлээ");
      qc.invalidateQueries({ queryKey: ["products", merchantId] });
      onClose();
      navigate({ to: "/merchant/dashboard/products" }).catch(() => {});
    },
    onError: (e: any) => {
      if (e?.code === "DUPLICATE_FOREIGN_PRODUCT" || /аль хэдийн бүртгэгдсэн/.test(e?.message ?? "")) {
        dupQuery.refetch();
        toast.warning("Энэ бараа аль хэдийн бүртгэгдсэн байна. Доорх сануулгыг уншаад дахин үүсгэхийг зөвшөөрнө үү.");
        return;
      }
      toast.error(e.message ?? "Үүсгэхэд алдаа гарлаа");
    },
  });

  const goToForm = () => {
    if (!sourceUrl.trim()) {
      toast.error("Эх сурвалжийн линкээ оруулна уу.");
      return;
    }
    const extract = sourceDef.extractProductId?.(sourceUrl.trim()) ?? null;
    if (extract && !sourceProductId) setSourceProductId(extract);
    setAllowDuplicate(false);
    setStep("form");
  };

  useEffect(() => {
    if (!coverImage && gallery.length > 0) setCoverImage(gallery[0]);
  }, [gallery, coverImage]);

  const isCreateDisabled = !hasSettings || createMutation.isPending || (hasDuplicate && !allowDuplicate);


  return (
    <Card className="rounded-2xl p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-base font-semibold">{sourceDef.name}-аас бараа гараар нэмэх</h2>
          <p className="text-xs text-muted-foreground">
            {sourceDef.country} • {sourceDef.currency} • {sourceDef.defaultDeliveryMinDays}–{sourceDef.defaultDeliveryMaxDays} хоног
          </p>
        </div>
      </div>

      {!hasSettings && (
        <Alert className="mb-3 border-amber-300 bg-amber-50 py-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-sm">Үнэ тооцооны тохиргоо дутуу байна</AlertTitle>
          <AlertDescription className="space-y-2 text-xs">
            <p>
              {sourceDef.currency}→MNT ханш болон ашгийн хувь тохируулагдаагүй учир үнэ автомат тооцох боломжгүй.
              Доорх формоор түргэн тохируулна уу.
            </p>
            <QuickSettingsForm merchantId={merchantId} source={source} />
          </AlertDescription>
        </Alert>
      )}

      {step === "url" && (
        <div className="space-y-2">
          <Label className="text-xs">{sourceDef.name} барааны линк</Label>
          <div className="flex gap-2">
            <Input
              className="h-9 text-sm"
              placeholder="https://item.taobao.com/item.htm?id=..."
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
            <Button className="h-9 text-sm" onClick={goToForm} disabled={!sourceUrl.trim()}>
              Үргэлжлүүлэх
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Автомат татагч бэлэн биш тул дараагийн алхамд барааны мэдээллийг гараар оруулна.
          </p>
        </div>
      )}

      {step === "form" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Эх сурвалжийн линк:</span>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 truncate text-orange-600 hover:underline"
            >
              {sourceUrl} <ExternalLink className="h-3 w-3" />
            </a>
            <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setStep("url")}>
              Өөрчлөх
            </Button>
          </div>

          {hasDuplicate && (
            <DuplicateWarning
              duplicates={duplicates}
              allowDuplicate={allowDuplicate}
              onToggle={setAllowDuplicate}
              onCancel={onClose}
            />
          )}


          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-muted">
                {coverImage ? (
                  <img src={coverImage} className="h-full w-full object-contain" alt="cover" />
                ) : (
                  <div className="text-xs text-muted-foreground">Үндсэн зураг алга</div>
                )}
              </div>
              <Input
                className="h-8 text-xs"
                placeholder="Үндсэн зураг URL"
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
              />
            </div>
            <div className="space-y-2.5">
              <div>
                <Label className="text-xs">Барааны нэр *</Label>
                <Input className="h-9" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Бренд</Label>
                  <Input className="h-9" value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Ангилал</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Ангилал сонгох" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.length === 0 && (
                        <SelectItem value="__none__" disabled>Ангилал олдсонгүй</SelectItem>
                      )}
                      {categories.map((c: any) => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Эх сурвалжийн ID</Label>
                  <Input
                    className="h-9"
                    placeholder="autofill"
                    value={sourceProductId}
                    onChange={(e) => setSourceProductId(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Тайлбар</Label>
                <Textarea
                  rows={3}
                  className="min-h-[70px] text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">
                  Нэмэлт зургийн URL-ууд ({gallery.length})
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                    мөр эсвэл зайгаар тусгаарлана
                  </span>
                </Label>
                <Textarea
                  rows={3}
                  className="min-h-[70px] font-mono text-xs"
                  placeholder="https://... https://..."
                  value={galleryText}
                  onChange={(e) => setGalleryText(e.target.value)}
                />
                {gallery.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {gallery.map((g, i) => (
                      <div key={`${g}-${i}`} className="relative h-16 w-16 overflow-hidden rounded border">
                        <img src={g} className="h-full w-full object-cover" alt="" />
                        <button
                          type="button"
                          onClick={() =>
                            setGalleryText(gallery.filter((x) => x !== g).join("\n"))
                          }
                          className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <VariantsEditor
            variants={variants}
            setVariants={setVariants}
            settings={settings}
            hasSettings={hasSettings}
            currency={sourceDef.currency}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setStep("url")}>Буцах</Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={isCreateDisabled}
            >
              {createMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Бараа үүсгэх
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function fallbackProductId(url: string) {
  try {
    const u = new URL(url);
    const id = u.searchParams.get("id");
    if (id) return id;
  } catch {}
  const hash = url.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  return `MANUAL-${Math.abs(hash)}`;
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
    setVariants([...variants, initialVariantDraft()]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="text-xs">Хувилбарууд</Label>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={add}>
          <Plus className="mr-1 h-3 w-3" /> Нэмэх
        </Button>
      </div>
      <div className="space-y-1.5">
        {variants.map((v, i) => {
          const pricing =
            hasSettings && v.sourcePrice > 0
              ? calculateVariantPricing({ sourcePrice: v.sourcePrice }, settings)
              : null;
          return (
            <div key={i} className="grid grid-cols-12 items-center gap-1.5 rounded-lg border p-2 text-xs">
              <Input
                className="col-span-3 h-8 text-xs"
                placeholder="Хэмжээ"
                value={v.sizeLabel}
                onChange={(e) => update(i, { sizeLabel: e.target.value })}
              />
              <Input
                className="col-span-2 h-8 text-xs"
                placeholder="Өнгө"
                value={v.colorLabel}
                onChange={(e) => update(i, { colorLabel: e.target.value })}
              />
              <div className="col-span-3 flex items-center gap-1">
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder={`Үнэ ${currency}`}
                  value={v.sourcePrice || ""}
                  onChange={(e) => update(i, { sourcePrice: Number(e.target.value) || 0 })}
                />
                <span className="text-[10px] text-muted-foreground">{currency}</span>
              </div>
              <label className="col-span-2 flex items-center gap-1 text-[11px]">
                <input
                  type="checkbox"
                  checked={v.isPurchasable}
                  onChange={(e) => update(i, { isPurchasable: e.target.checked })}
                />
                Зарагдана
              </label>
              <div className="col-span-1 text-right text-xs font-semibold">
                {pricing ? (
                  <span className="text-orange-600">{fmtMnt(pricing.roundedCustomerPriceMnt)}</span>
                ) : (
                  <span className="text-muted-foreground text-[10px]">—</span>
                )}
              </div>
              <Button variant="ghost" size="icon" className="col-span-1 h-7 w-7" onClick={() => remove(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
      {!hasSettings && (
        <p className="mt-1.5 text-xs text-amber-700">
          Үнэ тооцоог идэвхжүүлэхийн тулд эхлээд {currency}→MNT ханшийг хадгална уу.
        </p>
      )}
    </div>
  );
}

function QuickSettingsForm({ merchantId, source }: { merchantId: string; source: ForeignSource }) {
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
          defaultProfitPercent: profitPercent,
          defaultCargoCostMnt: cargo,
          defaultLocalDeliveryCostMnt: delivery,
          exchangeRate,
          defaultDeliveryMinDays: sourceDef.defaultDeliveryMinDays,
          defaultDeliveryMaxDays: sourceDef.defaultDeliveryMaxDays,
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
        <Label className="text-xs">{sourceDef.currency}→MNT ханш</Label>
        <Input className="h-8 text-xs" type="number" step="0.01" value={exchangeRate || ""} onChange={(e) => setExchangeRate(Number(e.target.value) || 0)} />
      </div>
      <div>
        <Label className="text-xs">Ашиг %</Label>
        <Input className="h-8 text-xs" type="number" value={profitPercent} onChange={(e) => setProfitPercent(Number(e.target.value) || 0)} />
      </div>
      <div>
        <Label className="text-xs">Карго (MNT)</Label>
        <Input className="h-8 text-xs" type="number" value={cargo} onChange={(e) => setCargo(Number(e.target.value) || 0)} />
      </div>
      <div>
        <Label className="text-xs">Хүргэлт (MNT)</Label>
        <Input className="h-8 text-xs" type="number" value={delivery} onChange={(e) => setDelivery(Number(e.target.value) || 0)} />
      </div>
      <div className="sm:col-span-4">
        <Button size="sm" className="h-8 text-xs" onClick={() => save.mutate()} disabled={save.isPending || exchangeRate <= 0}>
          {save.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
          Тохиргоог хадгалах
        </Button>
      </div>
    </div>
  );
}

function DuplicateWarning({
  duplicates,
  allowDuplicate,
  onToggle,
  onCancel,
}: {
  duplicates: Array<{ id: string; name: string; slug: string | null; image_url: string | null; is_active: boolean; created_at: string }>;
  allowDuplicate: boolean;
  onToggle: (v: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <Alert className="border-amber-400 bg-amber-50 py-3">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-sm font-semibold text-amber-900">
        Энэ бараа өмнө нь оруулагдсан байна
      </AlertTitle>
      <AlertDescription className="space-y-2 text-xs text-amber-900">
        <p>
          Ижил эх сурвалжийн линк/ID-тай {duplicates.length} бараа таны дэлгүүрт олдлоо.
          Давхардаж оруулахаас сэргийлж дараах зүйлсийг шалгана уу:
        </p>
        <ul className="space-y-1">
          {duplicates.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded border border-amber-200 bg-white/60 px-2 py-1">
              {d.image_url ? (
                <img src={d.image_url} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <div className="h-8 w-8 rounded bg-amber-100" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.name}</div>
                <div className="text-[10px] text-amber-700">
                  {new Date(d.created_at).toLocaleDateString("mn-MN")} · {d.is_active ? "Идэвхтэй" : "Идэвхгүй"}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={allowDuplicate}
              onChange={(e) => onToggle(e.target.checked)}
            />
            Мэдсэн, дахин үүсгэхийг зөвшөөрч байна
          </label>
          <Button variant="outline" size="sm" onClick={onCancel} className="h-7 text-xs">
            Оруулахыг болих
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
