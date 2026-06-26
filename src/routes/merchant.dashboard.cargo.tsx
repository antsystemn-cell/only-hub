import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";

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
import { Loader2, RefreshCw, Search, Package, MapPin, Image as ImageIcon, Scale, Ruler, FileText, CheckCircle2, Circle } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  listMerchantCargo,
  getMerchantCargoDetail,
  getMerchantCargoCounts,
  markMerchantCargoNotificationsRead,
} from "@/lib/onlycargo/cargo.functions";
import {
  requestCargoPhoneOtp,
  verifyCargoPhoneOtp,
  getCargoPhoneStatus,
} from "@/lib/onlycargo/otp.functions";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/merchant/dashboard/cargo")({
  component: CargoPage,
});

function parseMoneyClient(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[₮,\s]/g, "").replace(/[^\d.\-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function formatMoney(value: unknown): string {
  const n = parseMoneyClient(value);
  return n == null ? "-" : n.toLocaleString("mn-MN");
}
function formatWeight(value: unknown): string {
  const n = parseMoneyClient(value);
  return n == null ? "-" : n.toFixed(2);
}


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

  // Mark cargo notifications as read on page open → clears the sidebar badge.
  const markReadFn = useServerFn(markMerchantCargoNotificationsRead);
  useEffect(() => {
    markReadFn({ data: { merchantId } })
      .then((res) => {
        if (res?.marked && res.marked > 0) {
          qc.invalidateQueries({ queryKey: ["dashboard-cargo-unread", merchantId] });
        }
      })
      .catch(() => {});
  }, [merchantId, markReadFn, qc]);

  const statusFn = useServerFn(getCargoPhoneStatus);
  const phoneStatusQuery = useQuery({
    queryKey: ["merchant-cargo-phone-status", merchantId],
    queryFn: () => statusFn({ data: { merchantId } }),
    staleTime: 30_000,
  });
  const status = phoneStatusQuery.data;
  const cargoPhone = status?.phone ?? "";
  const isVerified = !!status?.verifiedAt;
  const hasCargoPhone = !!cargoPhone && isVerified;

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
    enabled: hasCargoPhone,
    staleTime: 30_000,
  });

  const countsQuery = useQuery({
    queryKey: ["onlycargo-counts", merchantId],
    queryFn: () => countsFn({ data: { merchantId } }),
    enabled: hasCargoPhone,
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

      {!hasCargoPhone ? (
        <CargoPhoneVerification merchantId={merchantId} status={status} />
      ) : (
        <>
          <Card className="p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Карго холболт идэвхтэй
              </div>
              <p className="text-sm text-muted-foreground">
                Карго систем дээр ачаа энэ утсаар бүртгэгдэхэд танай дэлгүүртэй автоматаар холбогдоно.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Баталгаажсан: {status?.verifiedAt ? new Date(status.verifiedAt).toLocaleString("mn-MN") : "-"}
              </p>
              {status?.syncError && (
                <p className="text-xs text-destructive mt-1">
                  Сүүлийн синк алдаа: {status.syncError}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono">{cargoPhone}</Badge>
              <CargoPhoneVerification merchantId={merchantId} status={status} compact />
            </div>
          </Card>
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
                                {formatWeight(r.weight)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {formatMoney(r.price ?? r.fee)}
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

    </div>
  );
}

type PhoneStatus = {
  phone: string | null;
  verifiedAt: string | null;
  pendingPhone: string | null;
  pendingAt: string | null;
  syncError: string | null;
  lastSyncedAt: string | null;
} | undefined;

function CargoPhoneVerification({
  merchantId,
  status,
  compact = false,
}: {
  merchantId: string;
  status: PhoneStatus;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inline = !compact;
  const isVerified = !!status?.verifiedAt;

  if (compact) {
    return (
      <>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Утас солих
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Каргоны утас солих</DialogTitle>
              <DialogDescription>
                Шинэ утсаа OTP-ээр баталгаажуулна уу. Хуучин утас баталгаажих хүртэл идэвхтэй хэвээр.
              </DialogDescription>
            </DialogHeader>
            <OtpFlow merchantId={merchantId} onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card className="p-6 space-y-4 max-w-xl">
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          {isVerified ? (
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          )}
          Каргоны утас баталгаажуулах
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Карго систем дээр ачаагаа бүртгүүлэх утасны дугаараа оруулаад OTP-ээр баталгаажуулна уу.
          Баталгаажсан утсан дээрх ачаа л Only Hub-д харагдана.
        </p>
        {status?.pendingPhone && !isVerified && (
          <p className="text-xs text-muted-foreground mt-2">
            Хүлээгдэж буй: <span className="font-mono">{status.pendingPhone}</span>
          </p>
        )}
      </div>
      <OtpFlow merchantId={merchantId} inline={inline} />
    </Card>
  );
}

function OtpFlow({
  merchantId,
  onDone,
  inline = false,
}: {
  merchantId: string;
  onDone?: () => void;
  inline?: boolean;
}) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestFn = useServerFn(requestCargoPhoneOtp);
  const verifyFn = useServerFn(verifyCargoPhoneOtp);

  const requestMut = useMutation({
    mutationFn: (p: string) => requestFn({ data: { merchantId, phone: p } }),
    onSuccess: (res: any) => {
      toast.success("OTP илгээлээ");
      setStage("code");
      setCooldown(res?.cooldownSec ?? 60);
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const verifyMut = useMutation({
    mutationFn: () => verifyFn({ data: { merchantId, phone, code } }),
    onSuccess: () => {
      toast.success("Утас баталгаажлаа");
      qc.invalidateQueries({ queryKey: ["merchant-cargo-phone-status", merchantId] });
      qc.invalidateQueries({ queryKey: ["onlycargo-list", merchantId] });
      qc.invalidateQueries({ queryKey: ["onlycargo-counts", merchantId] });
      setCode("");
      setStage("phone");
      onDone?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Код буруу байна"),
  });

  return (
    <div className={inline ? "space-y-3" : "space-y-3"}>
      {stage === "phone" ? (
        <>
          <Label className="text-sm">Утасны дугаар</Label>
          <div className="flex gap-2">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="жишээ нь: 88660000"
              inputMode="tel"
              maxLength={30}
            />
            <Button
              disabled={phone.trim().length < 6 || requestMut.isPending || cooldown > 0}
              onClick={() => requestMut.mutate(phone.trim())}
            >
              {requestMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {cooldown > 0 ? `${cooldown}s` : "OTP код авах"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Label className="text-sm">
            <span className="font-mono">{phone}</span> руу ирсэн 6 оронтой код
          </Label>
          <div className="flex flex-wrap items-center gap-3">
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button
              disabled={code.length !== 6 || verifyMut.isPending}
              onClick={() => verifyMut.mutate()}
            >
              {verifyMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Баталгаажуулах
            </Button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <button
              type="button"
              className="underline disabled:opacity-50"
              disabled={cooldown > 0 || requestMut.isPending}
              onClick={() => requestMut.mutate(phone.trim())}
            >
              {cooldown > 0 ? `Дахин код илгээх (${cooldown}s)` : "Дахин код илгээх"}
            </button>
            <button
              type="button"
              className="underline"
              onClick={() => { setStage("phone"); setCode(""); }}
            >
              Утас солих
            </button>
          </div>
        </>
      )}
    </div>
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
                <span className="text-xs text-muted-foreground">Утасны дугаараар холбогдсон</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <Info label="Утас" value={detail.phone ?? "-"} />
                <Info
                  label="Жин"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                      {(() => { const w = parseMoneyClient(detail.weight); return w == null ? "-" : `${w.toFixed(2)} кг`; })()}
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

