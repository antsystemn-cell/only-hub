import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
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
import { Loader2, RefreshCw, Search, Package, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  listMerchantCargo,
  getMerchantCargoDetail,
  getMerchantCargoCounts,
  updateMerchantCargoCode,
  createMerchantCargo,
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

  const history = useMemo(() => {
    if (!data?.history) return [];
    if (Array.isArray(data.history)) return data.history as any[];
    if (Array.isArray((data.history as any).history)) return (data.history as any).history;
    return [];
  }, [data]);

  return (
    <Dialog open={!!trackNumber} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{trackNumber}</DialogTitle>
          <DialogDescription>Ачааны дэлгэрэнгүй</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">{String((error as any)?.message ?? "Алдаа")}</p>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Статус" value={<StatusBadge status={String(data.detail.status ?? "")} />} />
              <Info label="Утас" value={(data.detail as any).phone ?? "-"} />
              <Info label="Жин" value={(data.detail as any).weight ?? "-"} />
              <Info label="Үнэ" value={(data.detail as any).price ?? "-"} />
              <Info label="Үүсгэсэн" value={fmtDate((data.detail as any).created_at)} />
              <Info label="Ирсэн" value={fmtDate((data.detail as any).arrived_at)} />
            </div>
            {history.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Түүх</h3>
                <ul className="space-y-1.5 text-sm">
                  {history.map((h: any, i: number) => (
                    <li key={i} className="flex items-center gap-3">
                      <StatusBadge status={String(h.status ?? "")} />
                      <span className="text-muted-foreground">{fmtDate(h.at ?? h.created_at)}</span>
                      {h.note && <span>— {h.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
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
