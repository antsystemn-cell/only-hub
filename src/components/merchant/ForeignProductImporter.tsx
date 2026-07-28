import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import {
  AlertCircle, ArrowLeft, CheckCircle2, Crop, Download, ExternalLink, Loader2, Maximize, Plus, Trash2, X,
} from "lucide-react";
import {
  previewForeignImport,
  createForeignProduct,
  findExistingForeignProduct,
} from "@/lib/foreign-orders/importer.functions";

import { translateForeignPreview } from "@/lib/foreign-orders/translate.functions";
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

type AvailabilityStatus = "AVAILABLE" | "LOW_STOCK" | "UNAVAILABLE" | "UNKNOWN" | "NEEDS_REVIEW";

type VariantDraft = {
  sourceVariantId?: string | null;
  sizeLabel: string;
  colorLabel?: string | null;
  sourcePrice: number;
  isPurchasable: boolean;
  availabilityStatus: AvailabilityStatus;
  unavailableReason?: string | null;
  sourceAvailabilityRawText?: string | null;
  optionSignature?: string | null;
};

type OptionGroupPreview = {
  name: string;
  level: number;
  prefix?: string | null;
  values: Array<{ propertyValueId: string; value: string; sizeHint?: string | null }>;
};

type DeliveryOptionPreview = {
  type: string;
  estimatedDays: string | null;
  displayedPrice: number | null;
  domesticDeliveryFee: number | null;
};

type ParsedPreview = {
  status: string;
  warnings: string[];
  sourceUrl: string;
  sourceProductId: string;
  title: string;
  brand: string;
  category: string;
  description: string;
  coverImage: string;
  gallery: string[];
  baseSourcePrice: number | null;
  productInfo: Array<{ label: string; value: string }>;
  productIntroSections: Array<{ title: string; content: string }>;
  optionGroups: OptionGroupPreview[];
  deliveryOptions: DeliveryOptionPreview[];
  extractionMethod: string;
  lowStockWarning: boolean;
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
  const [imageFit, setImageFit] = useState<"contain" | "cover">("contain");
  // Auto AI translation is OFF by default. Admins translate manually for now;
  // toggle this to re-enable the background Mongolian translation on preview.
  const [autoTranslate, setAutoTranslate] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("foreign-importer-auto-translate") === "1";
  });
  const toggleAutoTranslate = (v: boolean) => {
    setAutoTranslate(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("foreign-importer-auto-translate", v ? "1" : "0");
    }
  };

  // ----- Settings -----
  const fetchSettings = useServerFn(getMerchantForeignSettings);
  const settingsQuery = useQuery({
    queryKey: ["merchant-foreign-settings", merchantId, source],
    queryFn: () => fetchSettings({ data: { merchantId, source } }),
  });
  const settingsRow = settingsQuery.data?.[0] ?? null;

  // ----- Categories -----
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", merchantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("position");
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

  const previewFn = useServerFn(previewForeignImport);
  const createFn = useServerFn(createForeignProduct);
  const translateFn = useServerFn(translateForeignPreview);
  const [isTranslating, setIsTranslating] = useState(false);

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
      const introDesc = (p as any).productIntroSections?.[0]?.content as string | undefined;
      setPreview({
        status: res.status,
        warnings: res.warnings ?? [],
        sourceUrl: p.sourceUrl,
        sourceProductId: p.sourceProductId ?? "",
        title: p.title ?? "",
        brand: (p as any).brand ?? "",
        category: (p as any).category ?? "",
        description: p.description ?? introDesc ?? "",
        coverImage: p.coverImage ?? "",
        gallery: p.gallery ?? [],
        baseSourcePrice: (p as any).baseSourcePrice ?? null,
        productInfo: (p as any).productInfo ?? [],
        productIntroSections: (p as any).productIntroSections ?? [],
        optionGroups: (p as any).optionGroups ?? [],
        deliveryOptions: (p as any).deliveryOptions ?? [],
        extractionMethod: (p as any).extractionMethod ?? "META_FALLBACK",
        lowStockWarning: !!(p as any).lowStockWarning,
      });
      const seeded: VariantDraft[] = (p.variants ?? []).map((v: any) => ({
        sourceVariantId: v.sourceVariantId ?? null,
        sizeLabel: v.sizeLabel ?? "",
        colorLabel: v.colorLabel ?? null,
        sourcePrice: Number(v.sourcePrice ?? 0),
        isPurchasable: typeof v.isPurchasable === "boolean" ? v.isPurchasable : !!v.sourcePrice,
        availabilityStatus: (v.availabilityStatus as AvailabilityStatus) ?? "UNKNOWN",
        unavailableReason: v.unavailableReason ?? null,
        sourceAvailabilityRawText: v.sourceAvailabilityRawText ?? null,
        optionSignature: v.optionSignature ?? null,
      }));
      if (seeded.length === 0) {
        seeded.push({
          sizeLabel: "", sourcePrice: 0, isPurchasable: false,
          availabilityStatus: "UNKNOWN",
        });
      }
      setVariants(seeded);
      setStep("preview");
      toast.success(
        res.status === "SUCCESS"
          ? "Бүх мэдээлэл амжилттай татагдлаа"
          : "Мэдээлэл хэсэгчлэн татагдлаа. Гараар засна уу.",
      );

      // Auto-translate all foreign text → Mongolian in the background.
      // Гарал үүсэл: админ автомат орчуулгыг toggle-оор асаасан үед л ажиллана.
      if (!autoTranslate) return;
      const p2 = res.parsed!;
      const intro2 = (p2 as any).productIntroSections?.[0]?.content as string | undefined;
      const payload = {
        title: p2.title ?? "",
        brand: (p2 as any).brand ?? "",
        category: (p2 as any).category ?? "",
        description: p2.description ?? intro2 ?? "",
        productInfo: ((p2 as any).productInfo ?? []) as Array<{ label: string; value: string }>,
        productIntroSections: ((p2 as any).productIntroSections ?? []) as Array<{ title: string; content: string }>,
        optionGroups: ((p2 as any).optionGroups ?? []) as OptionGroupPreview[],
        variants: (p2.variants ?? []).map((v: any) => ({
          sizeLabel: v.sizeLabel ?? "",
          colorLabel: v.colorLabel ?? null,
        })),
      };
      const tToast = toast.loading("Монгол хэл рүү орчуулж байна...");
      setIsTranslating(true);
      translateFn({ data: payload })
        .then((r) => {
          if (!r.ok || !r.data) {
            toast.error(r.message ?? "Орчуулга амжилтгүй", { id: tToast });
            return;
          }
          const t = r.data;
          setPreview((cur) =>
            cur
              ? {
                  ...cur,
                  title: t.title || cur.title,
                  brand: t.brand || cur.brand,
                  category: t.category || cur.category,
                  description: t.description || cur.description,
                  productInfo: t.productInfo?.length ? t.productInfo : cur.productInfo,
                  productIntroSections: t.productIntroSections?.length
                    ? t.productIntroSections
                    : cur.productIntroSections,
                  optionGroups: t.optionGroups?.length
                    ? (t.optionGroups as OptionGroupPreview[])
                    : cur.optionGroups,
                }
              : cur,
          );
          setVariants((cur) =>
            cur.map((v, i) => {
              const tv = t.variants?.[i];
              if (!tv) return v;
              return {
                ...v,
                sizeLabel: tv.sizeLabel || v.sizeLabel,
                colorLabel: tv.colorLabel ?? v.colorLabel,
              };
            }),
          );
          toast.success("Монгол хэл рүү орчууллаа", { id: tToast });
        })
        .catch((e: any) => {
          toast.error(e?.message ?? "Орчуулгын алдаа", { id: tToast });
        })
        .finally(() => setIsTranslating(false));
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
          category: preview.category || null,
          description: preview.description || null,
          coverImage: preview.coverImage || null,
          gallery: preview.gallery,
          productInfo: preview.productInfo ?? [],
          productIntroSections: preview.productIntroSections ?? [],
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
    <Card className="rounded-2xl p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-base font-semibold">{sourceDef.name}-аас бараа татах</h2>
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
              KRW→MNT ханш болон ашгийн хувь тохируулагдаагүй учир үнэ автомат тооцох боломжгүй.
              Доорх форм-оор хурдан тохируулна уу.
            </p>
            <SettingsQuickForm merchantId={merchantId} source={source} />
          </AlertDescription>
        </Alert>
      )}

      {step === "url" && (
        <div className="space-y-2">
          <Label className="text-xs">{sourceDef.name} барааны линк</Label>
          <div className="flex gap-2">
            <Input
              className="h-9 text-sm"
              placeholder={
                source === "TAOBAO"
                  ? "https://item.taobao.com/item.htm?id=..."
                  : "https://kr.poizon.com/product/..."
              }
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button
              className="h-9 text-sm"
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
          <p className="text-[11px] text-muted-foreground">
            {source === "TAOBAO"
              ? "Жишээ: https://item.taobao.com/item.htm?id=1234567890"
              : "Жишээ: https://kr.poizon.com/product/new-balance-530-...-60886973"}
          </p>
          <div className="mt-2 flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="auto-translate-toggle" className="text-xs font-medium">
                AI автомат орчуулга (Монгол хэл рүү)
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {autoTranslate
                  ? "Идэвхтэй. Мэдээлэл татсаны дараа AI автоматаар орчуулна."
                  : "Идэвхгүй. Орчуулгыг гараар хийнэ. Шаардлагатай үед эндээс асаана уу."}
              </p>
            </div>
            <Switch
              id="auto-translate-toggle"
              checked={autoTranslate}
              onCheckedChange={toggleAutoTranslate}
            />
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <ImportStatusBadge status={preview.status} />
            {preview.lowStockWarning && (
              <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100 text-[11px]">
                <AlertCircle className="h-3 w-3" /> Үлдэгдэл бага (품절 임박)
              </Badge>
            )}
            {isTranslating && (
              <Badge className="gap-1 bg-sky-100 text-sky-800 hover:bg-sky-100 text-[11px]">
                <Loader2 className="h-3 w-3 animate-spin" /> Монгол хэл рүү орчуулж байна...
              </Badge>
            )}
          </div>
          {warnings.length > 0 && (
            <Alert className="border-amber-300 bg-amber-50 py-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-sm">Анхааруулга</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 text-xs">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <ToggleGroup
                type="single"
                value={imageFit}
                onValueChange={(v) => v && setImageFit(v as "contain" | "cover")}
                className="justify-start"
                size="sm"
              >
                <ToggleGroupItem value="contain" aria-label="Бүтэн харуулах" className="text-xs">
                  <Maximize className="mr-1 h-3 w-3" /> Бүтэн
                </ToggleGroupItem>
                <ToggleGroupItem value="cover" aria-label="Crop харуулах" className="text-xs">
                  <Crop className="mr-1 h-3 w-3" /> Crop
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-muted">
                {preview.coverImage ? (
                  <img src={preview.coverImage} className={`h-full w-full object-${imageFit}`} />
                ) : (
                  <div className="flex w-full items-center justify-center text-xs text-muted-foreground">
                    Зураг алга
                  </div>
                )}
              </div>
              <Input
                className="text-xs h-8"
                placeholder="Үндсэн зураг URL"
                value={preview.coverImage}
                onChange={(e) => setPreview({ ...preview, coverImage: e.target.value })}
              />
            </div>
            <div className="space-y-2.5">
              <div>
                <Label className="text-xs">Барааны нэр</Label>
                <Input className="h-9" value={preview.title} onChange={(e) => setPreview({ ...preview, title: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Бренд</Label>
                  <Input className="h-9" value={preview.brand} onChange={(e) => setPreview({ ...preview, brand: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Ангилал</Label>
                  <Select
                    value={preview.category}
                    onValueChange={(v) => setPreview({ ...preview, category: v })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Ангилал сонгох" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.length === 0 && (
                        <SelectItem value="__none__" disabled>
                          Ангилал олдсонгүй
                        </SelectItem>
                      )}
                      {categories.map((c: any) => (
                        <SelectItem key={c.id} value={c.name}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Эх сурвалжийн линк</Label>
                  <a
                    href={preview.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 flex items-center gap-1 truncate text-xs text-orange-600 hover:underline"
                  >
                    {preview.sourceUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div>
                <Label className="text-xs">Тайлбар</Label>
                <Textarea
                  rows={2}
                  className="min-h-[60px] text-sm"
                  value={preview.description}
                  onChange={(e) => setPreview({ ...preview, description: e.target.value })}
                />
              </div>
            </div>
          </div>

          {(preview.coverImage || preview.gallery.length > 0) && (() => {
            const all = [
              ...(preview.coverImage ? [preview.coverImage] : []),
              ...preview.gallery.filter((g) => g && g !== preview.coverImage),
            ];
            return (
              <div>
                <Label className="text-xs">
                  Зургууд ({all.length})
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    Үндсэн зураг сонгохдоо доорх зураг дээр дарна уу
                  </span>
                </Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {all.map((g, i) => {
                    const isCover = g === preview.coverImage;
                    return (
                      <div key={`${g}-${i}`} className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (isCover) return;
                            const newGallery = [
                              ...(preview.coverImage ? [preview.coverImage] : []),
                              ...preview.gallery.filter((x) => x && x !== g && x !== preview.coverImage),
                            ];
                            setPreview({ ...preview, coverImage: g, gallery: newGallery });
                          }}
                          className={`relative block h-20 w-20 overflow-hidden rounded-lg border-2 transition ${
                            isCover
                              ? "border-orange-500 ring-2 ring-orange-200"
                              : "border-transparent hover:border-orange-300"
                          }`}
                          title={isCover ? "Үндсэн зураг" : "Үндсэн зураг болгох"}
                        >
                          <img src={g} className={`h-full w-full object-${imageFit}`} />
                          {isCover && (
                            <span className="absolute bottom-0 left-0 right-0 bg-orange-500/90 py-0.5 text-center text-[10px] font-medium text-white">
                              Үндсэн
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (isCover) {
                              const next = preview.gallery.filter((x) => x && x !== g);
                              const [newCover, ...rest] = next;
                              setPreview({
                                ...preview,
                                coverImage: newCover ?? "",
                                gallery: rest,
                              });
                            } else {
                              setPreview({
                                ...preview,
                                gallery: preview.gallery.filter((x) => x !== g),
                              });
                            }
                          }}
                          className="absolute -right-1 -top-1 z-10 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow"
                          title="Устгах"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {preview.baseSourcePrice != null && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2 text-xs">
              <Badge variant="secondary" className="text-xs">
                Үндсэн үнэ: {preview.baseSourcePrice.toLocaleString()} {sourceDef.currency}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                Эх сурвалж: {preview.extractionMethod}
              </Badge>
            </div>
          )}

          {preview.optionGroups.length > 0 && (
            <div className="rounded-lg border p-2.5">
              <Label className="mb-1.5 block text-xs">Сонголтын бүлгүүд</Label>
              <div className="space-y-1.5">
                {preview.optionGroups.map((g, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1">
                    <span className="text-xs font-medium">
                      {g.name}
                      {g.prefix ? `: ${g.prefix}` : ""}
                    </span>
                    {g.values.map((v) => (
                      <Badge key={v.propertyValueId} variant="outline" className="text-[11px]">
                        {v.value}
                        {v.sizeHint ? ` (${v.sizeHint})` : ""}
                      </Badge>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.productInfo.length > 0 && (
            <div className="rounded-lg border p-2.5">
              <Label className="mb-1.5 block text-xs">Барааны мэдээлэл</Label>
              <div className="grid gap-1 sm:grid-cols-2 text-xs">
                {preview.productInfo.map((row, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.productIntroSections.length > 0 && (
            <div className="rounded-lg border p-2.5">
              <Label className="mb-1.5 block text-xs">Танилцуулга</Label>
              <div className="space-y-2">
                {preview.productIntroSections.map((s, i) => (
                  <div key={i}>
                    <div className="text-xs font-semibold">{s.title}</div>
                    <p className="whitespace-pre-line text-xs text-muted-foreground">
                      {s.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.deliveryOptions.length > 0 && (
            <div className="rounded-lg border p-2.5">
              <Label className="mb-1.5 block text-xs">Эх сурвалжийн хүргэлт</Label>
              <div className="space-y-1">
                {preview.deliveryOptions.map((d, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary" className="text-[11px]">{d.type}</Badge>
                    {d.estimatedDays && (
                      <span className="text-muted-foreground">{d.estimatedDays}</span>
                    )}
                    {d.displayedPrice != null && (
                      <span>{d.displayedPrice.toLocaleString()} {sourceDef.currency}</span>
                    )}
                    {d.domesticDeliveryFee != null && (
                      <span className="text-[11px] text-muted-foreground">
                        Дотоодын хүргэлт: {d.domesticDeliveryFee.toLocaleString()} {sourceDef.currency}
                      </span>
                    )}
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

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setStep("url")}>Буцах</Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={!hasSettings || createMutation.isPending || !preview.title.trim()}
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
    setVariants([
      ...variants,
      { sizeLabel: "", sourcePrice: 0, isPurchasable: false, availabilityStatus: "UNKNOWN" },
    ]);

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
            <div
              key={i}
              className={`grid grid-cols-12 items-center gap-1.5 rounded-lg border p-2 text-xs ${
                v.availabilityStatus === "UNAVAILABLE" ? "bg-red-50/50 border-red-200" :
                v.availabilityStatus === "LOW_STOCK" ? "bg-amber-50/50 border-amber-200" :
                v.availabilityStatus === "UNKNOWN" ? "bg-muted/40" : ""
              }`}
            >
              <Input
                className="col-span-3 h-8 text-xs"
                placeholder="Хэмжээ (e.g. 250)"
                value={v.sizeLabel}
                onChange={(e) => update(i, { sizeLabel: e.target.value })}
              />
              <Input
                className="col-span-2 h-8 text-xs"
                placeholder="Өнгө"
                value={v.colorLabel ?? ""}
                onChange={(e) => update(i, { colorLabel: e.target.value || null })}
              />
              <div className="col-span-2 flex items-center gap-1">
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder={`Үнэ ${currency}`}
                  value={v.sourcePrice || ""}
                  onChange={(e) => update(i, { sourcePrice: Number(e.target.value) || 0 })}
                />
                <span className="text-[10px] text-muted-foreground">{currency}</span>
              </div>
              <div className="col-span-2 flex flex-col items-start gap-0.5">
                <AvailabilityBadge status={v.availabilityStatus} />
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={v.isPurchasable}
                    onChange={(e) => {
                      const next = e.target.checked;
                      if (next && v.availabilityStatus === "UNAVAILABLE") {
                        const ok = window.confirm(
                          "Энэ сонголт Poizon Korea дээр боломжгүй гэж уншигдсан. Гараар идэвхжүүлэх үү?",
                        );
                        if (!ok) return;
                      }
                      update(i, { isPurchasable: next });
                    }}
                  />
                  Зарагдана
                </label>
              </div>
              <div className="col-span-2 text-right text-xs font-semibold">
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
          Үнэ тооцоог идэвхжүүлэхийн тулд эхлээд тохиргоог хадгална уу.
        </p>
      )}
    </div>
  );
}

function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  const map: Record<AvailabilityStatus, { label: string; cls: string }> = {
    AVAILABLE: { label: "Боломжтой", cls: "bg-emerald-100 text-emerald-700" },
    LOW_STOCK: { label: "Үлдэгдэл бага", cls: "bg-amber-100 text-amber-800" },
    UNAVAILABLE: { label: "Түр дууссан", cls: "bg-red-100 text-red-700" },
    UNKNOWN: { label: "Шалгах", cls: "bg-slate-100 text-slate-700" },
    NEEDS_REVIEW: { label: "Хяналт", cls: "bg-orange-100 text-orange-700" },
  };
  const m = map[status] ?? map.UNKNOWN;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${m.cls}`}>{m.label}</span>;
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

