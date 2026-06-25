import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, Package, Plus, MapPin, Image as ImageIcon, Scale, Ruler, FileText, CheckCircle2, Circle } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  listMerchantCargo,
  getMerchantCargoDetail,
  getMerchantCargoCounts,
  updateMerchantCargoCode,
  createMerchantCargo,
  markMerchantCargoNotificationsRead,
} from "@/lib/onlycargo/cargo.functions";

export const Route = createFileRoute("/merchant/dashboard/cargo")({
  component: CargoPage,
});

const TAB_STATUSES = [
  { value: "all", label: "Бүгд", apiStatus: undefined },
  { value: "created", label: "Шинэ ачаа", apiStatus: "created" },
  { value: "in_transit", label: "Замд яваа", apiStatus: "in_transit" },
  { value: "arrived", label: "Ирсэн", apiStatus: "arrived" },
  { value: "ready_for_pickup", label: "Хүлээн авахад бэлэн", apiStatus: "ready_for_pickup" },
] as const;

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  created: { label: "Шинэ", variant: "secondary" },
  received: { label: "Эрээнд", variant: "secondary" },
  in_transit: { label: "Замд", variant: "default" },
  processing: { label: "Боловсруулж", variant: "secondary" },
  ready_for_pickup: { label: "Бэлэн", variant: "default" },
  arrived: { label: "Ирсэн", variant: "default" },
  completed: { label: "Хүлээлгэсэн", variant: "outline" },
  archived: { label: "Архив", variant: "outline" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function CargoPage() {
  const { primaryMerchantId } = useAuth();
  if (!primaryMerchantId) {
    return <div className="text-muted-foreground">Дэлгүүр сонгоно уу.</div>;
  }
  return <CargoView merchantId={primaryMerchantId} />;
}

function CargoView({ merchantId }: { merchantId: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TAB_STATUSES)[number]["value"]>("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [openTrack, setOpenTrack] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: merchant } = useQuery({
    queryKey: ["merchant-onlycargo", merchantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("id,name,onlycargo_customer_code")
        .eq("id", merchantId)
        .maybeSingle();
      return data;
    },
  });

  const hasCode = !!merchant?.onlycargo_customer_code?.trim();

  const listFn = useServerFn(listMerchantCargo);
  const countsFn = useServerFn(getMerchantCargoCounts);

  const apiStatus = TAB_STATUSES.find((t) => t.value === tab)?.apiStatus;

  const cargoQuery = useQuery({
    queryKey: ["onlycargo-list", merchantId, apiStatus, search, page],
    queryFn: () =>
      listFn({
        data: {
          merchantId,
          page,
          pageSize,
          status: apiStatus,
          q: search || undefined,
        },
      }),
    enabled: hasCode,
    staleTime: 30_000,
  });

  const countsQuery = useQuery({
    queryKey: ["onlycargo-counts", merchantId],
    queryFn: () => countsFn({ data: { merchantId } }),
    enabled: hasCode,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const rows = cargoQuery.data?.data ?? [];
  const total = cargoQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="h-7 w-7" /> Карго
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            OnlyCargo системээс таны дэлгүүрийн ачаа.
          </p>
        </div>
        <div className="flex gap-2">
          {hasCode && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Шинэ ачаа бүртгэх
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["onlycargo-list", merchantId] });
              qc.invalidateQueries({ queryKey: ["onlycargo-counts", merchantId] });
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Шинэчлэх
          </Button>
        </div>
      </div>

      {!hasCode ? (
        <SetupCustomerCode merchantId={merchantId} />
      ) : (
        <>
          <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setPage(1); }}>
            <TabsList className="flex flex-wrap">
              {TAB_STATUSES.map((t) => {
                const count = t.apiStatus ? countsQuery.data?.[t.apiStatus] : undefined;
                return (
                  <TabsTrigger key={t.value} value={t.value} className="gap-2">
                    {t.label}
                    {typeof count === "number" && count > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {count}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value={tab} className="mt-4">
              <Card className="p-4 space-y-4">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSearch(q.trim());
                    setPage(1);
                  }}
                >
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Track дугаар, утас, нэр..."
                      className="pl-8"
                    />
                  </div>
                  <Button type="submit" variant="secondary">Хайх</Button>
                </form>

                {cargoQuery.isLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : cargoQuery.isError ? (
                  <div className="text-sm text-destructive py-6 text-center">
                    {String((cargoQuery.error as any)?.message ?? "Алдаа гарлаа")}
                  </div>
                ) : rows.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-10 text-center">
                    Энэ ангилалд ачаа алга.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Track №</TableHead>
                            <TableHead>Статус</TableHead>
                            <TableHead>Утас</TableHead>
                            <TableHead className="text-right">Жин (кг)</TableHead>
                            <TableHead className="text-right">Үнэ ₮</TableHead>
                            <TableHead>Огноо</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r: any) => (
                            <TableRow
                              key={r.track_number}
                              className="cursor-pointer"
                              onClick={() => setOpenTrack(r.track_number)}
                            >
                              <TableCell className="font-mono text-sm">{r.track_number}</TableCell>
                              <TableCell><StatusBadge status={String(r.status ?? "")} /></TableCell>
                              <TableCell className="text-sm">{r.phone ?? "-"}</TableCell>
                              <TableCell className="text-right text-sm">
                                {r.weight != null ? Number(r.weight).toFixed(2) : "-"}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {r.price != null ? Number(r.price).toLocaleString("mn-MN") : "-"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {r.created_at ? new Date(r.created_at).toLocaleString("mn-MN") : "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-sm text-muted-foreground">
                          Нийт: {total.toLocaleString("mn-MN")}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            Өмнөх
                          </Button>
                          <span className="text-sm self-center">{page} / {totalPages}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                          >
                            Дараах
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <CargoDetailDialog
        merchantId={merchantId}
        trackNumber={openTrack}
        onClose={() => setOpenTrack(null)}
      />

      <CreateCargoDialog
        merchantId={merchantId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}

function SetupCustomerCode({ merchantId }: { merchantId: string }) {
  const [code, setCode] = useState("");
  const qc = useQueryClient();
  const updateFn = useServerFn(updateMerchantCargoCode);
  const mut = useMutation({
    mutationFn: (customerCode: string) => updateFn({ data: { merchantId, customerCode } }),
    onSuccess: () => {
      toast.success("Хадгалагдлаа");
      qc.invalidateQueries({ queryKey: ["merchant-onlycargo", merchantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });
  return (
    <Card className="p-6 space-y-4 max-w-xl">
      <div>
        <h2 className="font-semibold">OnlyCargo customer code тохируулах</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Танай дэлгүүрийн OnlyCargo дээрх customer code-ыг оруулна уу. Зөвхөн дэлгүүрийн эзэн
          тохируулах боломжтой.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="жишээ нь: ONLY-001"
        />
        <Button
          disabled={!code.trim() || mut.isPending}
          onClick={() => mut.mutate(code.trim())}
        >
          {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Хадгалах
        </Button>
      </div>
    </Card>
  );
}

const TIMELINE_STEPS = [
  { key: "created", label: "Үүсгэсэн" },
  { key: "received", label: "Эрээнд" },
  { key: "processing", label: "Боловсруулж" },
  { key: "in_transit", label: "Замд" },
  { key: "arrived", label: "Ирсэн" },
  { key: "ready_for_pickup", label: "Бэлэн" },
  { key: "completed", label: "Хүлээлгэсэн" },
  { key: "archived", label: "Архив" },
] as const;

function CargoDetailDialog({
  merchantId,
  trackNumber,
  onClose,
}: {
  merchantId: string;
  trackNumber: string | null;
  onClose: () => void;
}) {
  const detailFn = useServerFn(getMerchantCargoDetail);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["onlycargo-detail", merchantId, trackNumber],
    queryFn: () => detailFn({ data: { merchantId, trackNumber: trackNumber! } }),
    enabled: !!trackNumber,
  });

  const detail: any = (data as any)?.detail ?? {};
  const historyRaw = (data as any)?.history;
  const locationData: any = (data as any)?.location ?? {};

  const history = useMemo(() => {
    if (!historyRaw) return [] as any[];
    if (Array.isArray(historyRaw)) return historyRaw;
    if (Array.isArray(historyRaw.history)) return historyRaw.history;
    if (Array.isArray(historyRaw.data)) return historyRaw.data;
    return [];
  }, [historyRaw]);

  // Sort newest-first for the timeline list
  const historySorted = useMemo(() => {
    return [...history].sort((a, b) => {
      const ta = new Date(a.at ?? a.created_at ?? a.timestamp ?? 0).getTime();
      const tb = new Date(b.at ?? b.created_at ?? b.timestamp ?? 0).getTime();
      return tb - ta;
    });
  }, [history]);

  const currentStatus = String(detail.status ?? "");
  const reachedStatuses = useMemo(() => {
    const set = new Set<string>(history.map((h: any) => String(h.status ?? "")));
    if (currentStatus) set.add(currentStatus);
    return set;
  }, [history, currentStatus]);

  const images: string[] = Array.isArray(detail.images) ? detail.images : [];
  const currentLocation = detail.location ?? locationData.location ?? null;
  const fee = detail.fee ?? detail.price ?? null;

  return (
    <Dialog open={!!trackNumber} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{trackNumber}</DialogTitle>
          <DialogDescription>Ачааны дэлгэрэнгүй мэдээлэл</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">{String((error as any)?.message ?? "Алдаа")}</p>
        ) : data ? (
          <div className="space-y-5">
            {/* Status + key facts */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <StatusBadge status={currentStatus} />
                {detail.customer_code && (
                  <span className="text-xs text-muted-foreground font-mono">
                    Code: {detail.customer_code}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <Info label="Утас" value={detail.phone ?? "-"} />
                <Info
                  label="Жин"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                      {detail.weight != null ? `${Number(detail.weight).toFixed(2)} кг` : "-"}
                    </span>
                  }
                />
                <Info
                  label="Эзлэхүүн"
                  value={detail.volume != null ? `${Number(detail.volume).toFixed(3)} м³` : "-"}
                />
                <Info
                  label="Хэмжээ (см)"
                  value={
                    detail.length || detail.width || detail.height ? (
                      <span className="inline-flex items-center gap-1">
                        <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                        {detail.length ?? "?"}×{detail.width ?? "?"}×{detail.height ?? "?"}
                      </span>
                    ) : "-"
                  }
                />
                <Info
                  label="Үнэ"
                  value={fee != null ? `${Number(fee).toLocaleString("mn-MN")}₮` : "-"}
                />
                <Info
                  label="Байршил"
                  value={
                    currentLocation ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {currentLocation}
                      </span>
                    ) : "-"
                  }
                />
                <Info label="Үүсгэсэн" value={fmtDate(detail.created_at)} />
                <Info label="Шинэчилсэн" value={fmtDate(detail.updated_at)} />
                <Info label="Ирсэн" value={fmtDate(detail.arrived_at)} />
              </div>
              {detail.description && (
                <div className="border-t pt-3">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Тайлбар
                  </div>
                  <p className="text-sm">{detail.description}</p>
                </div>
              )}
              {detail.notes && (
                <div className="border-t pt-3">
                  <div className="text-xs text-muted-foreground mb-1">Тэмдэглэл</div>
                  <p className="text-sm">{detail.notes}</p>
                </div>
              )}
            </Card>

            {/* Step indicator */}
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3">Явц</h3>
              <ol className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {TIMELINE_STEPS.map((step) => {
                  const reached = reachedStatuses.has(step.key);
                  const isCurrent = step.key === currentStatus;
                  return (
                    <li
                      key={step.key}
                      className={cn(
                        "flex flex-col items-center gap-1 text-center text-[10px]",
                        isCurrent ? "text-primary font-semibold" : reached ? "text-foreground" : "text-muted-foreground/60",
                      )}
                    >
                      {reached ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                      <span className="leading-tight">{step.label}</span>
                    </li>
                  );
                })}
              </ol>
            </Card>

            {/* History timeline */}
            {historySorted.length > 0 && (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-3">Түүх</h3>
                <ul className="space-y-3">
                  {historySorted.map((h: any, i: number) => (
                    <li key={i} className="flex gap-3 text-sm border-l-2 border-border pl-3 relative">
                      <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={String(h.status ?? "")} />
                          <span className="text-xs text-muted-foreground">
                            {fmtDate(h.at ?? h.created_at ?? h.timestamp)}
                          </span>
                        </div>
                        {h.location && (
                          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {h.location}
                          </p>
                        )}
                        {h.note && <p className="text-xs">{h.note}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Images */}
            {images.length > 0 && (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1">
                  <ImageIcon className="h-4 w-4" /> Зураг ({images.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {images.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={url}
                        alt={`cargo-${i}`}
                        className="aspect-square w-full rounded-md object-cover border"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              </Card>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function fmtDate(d: any) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("mn-MN");
  } catch {
    return String(d);
  }
}

function CreateCargoDialog({
  merchantId,
  open,
  onClose,
}: {
  merchantId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createMerchantCargo);
  const [form, setForm] = useState({
    trackNumber: "",
    phone: "",
    description: "",
    weight: "",
    length: "",
    width: "",
    height: "",
  });

  const reset = () =>
    setForm({
      trackNumber: "",
      phone: "",
      description: "",
      weight: "",
      length: "",
      width: "",
      height: "",
    });

  const mut = useMutation({
    mutationFn: () => {
      const num = (v: string) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      return createFn({
        data: {
          merchantId,
          trackNumber: form.trackNumber.trim(),
          phone: form.phone.trim(),
          description: form.description.trim() || undefined,
          weight: num(form.weight),
          length: num(form.length),
          width: num(form.width),
          height: num(form.height),
        },
      });
    },
    onSuccess: () => {
      toast.success("Ачаа амжилттай бүртгэгдлээ");
      qc.invalidateQueries({ queryKey: ["onlycargo-list", merchantId] });
      qc.invalidateQueries({ queryKey: ["onlycargo-counts", merchantId] });
      reset();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Бүртгэхэд алдаа гарлаа"),
  });

  const canSubmit =
    form.trackNumber.trim().length >= 3 && form.phone.trim().length >= 6 && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Шинэ ачаа бүртгэх</DialogTitle>
          <DialogDescription>
            OnlyCargo систем дээр трак дугаараа бүртгэнэ.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mut.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="trackNumber">Трак дугаар *</Label>
              <Input
                id="trackNumber"
                value={form.trackNumber}
                onChange={(e) => setForm((f) => ({ ...f, trackNumber: e.target.value }))}
                placeholder="ONLY12345"
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Утас *</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="88660000"
                inputMode="tel"
                maxLength={20}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight">Жин (кг)</Label>
              <Input
                id="weight"
                value={form.weight}
                onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                placeholder="1.2"
                inputMode="decimal"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="description">Тайлбар</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Гутал 2ш"
                maxLength={500}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Хэмжээ (см)</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                <Input
                  value={form.length}
                  onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
                  placeholder="Урт"
                  inputMode="decimal"
                />
                <Input
                  value={form.width}
                  onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
                  placeholder="Өргөн"
                  inputMode="decimal"
                />
                <Input
                  value={form.height}
                  onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
                  placeholder="Өндөр"
                  inputMode="decimal"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mut.isPending}>
              Болих
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Бүртгэх
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
