import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  CheckCheck,
  Copy,
  ExternalLink,
} from "lucide-react";
import {
  listPaymentRequestsFn,
  getCollectionStatsFn,
  resendCollectionSmsFn,
  markRequestPaidFn,
} from "@/lib/payment-collection/collection.functions";
import { fmtMnt } from "@/lib/format";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({ meta: [{ title: "Төлбөр цуглуулалт — Admin" }] }),
  component: AdminPaymentsPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Хүлээгдэж",
  requested: "SMS илгээсэн",
  paid: "Төлөгдсөн",
  expired: "Хугацаа дууссан",
  cancelled: "Цуцлагдсан",
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-muted text-foreground",
  requested: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  paid: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  expired: "bg-red-500/15 text-red-700 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground",
};

function AdminPaymentsPage() {
  const listFn = useServerFn(listPaymentRequestsFn);
  const statsFn = useServerFn(getCollectionStatsFn);
  const resendFn = useServerFn(resendCollectionSmsFn);
  const markFn = useServerFn(markRequestPaidFn);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: statsRes, refetch: refetchStats } = useQuery({
    queryKey: ["admin-collection-stats"],
    queryFn: () => statsFn({ data: {} }),
    refetchInterval: 30_000,
  });
  const stats = (statsRes as any)?.stats;

  const { data: listRes, refetch } = useQuery({
    queryKey: ["admin-payment-requests", statusFilter],
    queryFn: () => listFn({ data: statusFilter ? { status: statusFilter } : {} }),
    refetchInterval: 15_000,
  });
  const items = ((listRes as any)?.items ?? []) as any[];

  const filtered = items.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.orders?.external_ref ?? "").toLowerCase().includes(q) ||
      (r.customer_phone ?? "").toLowerCase().includes(q) ||
      (r.orders?.guest_name ?? "").toLowerCase().includes(q)
    );
  });

  const resendMut = useMutation({
    mutationFn: (orderId: string) => resendFn({ data: { orderId } }),
    onSuccess: (r: any) => {
      if (r?.ok) {
        toast.success("SMS дахин илгээгдлээ");
        refetch();
      } else toast.error(r?.error ?? "SMS алдаа");
    },
  });
  const markMut = useMutation({
    mutationFn: (orderId: string) => markFn({ data: { orderId } }),
    onSuccess: (r: any) => {
      if (r?.ok) {
        toast.success("Төлөгдсөн гэж тэмдэглэв");
        refetch();
        refetchStats();
      } else toast.error(r?.error ?? "Алдаа");
    },
  });

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 md:py-8">
      <div className="mb-6 flex items-center gap-3">
        <Wallet className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Төлбөр цуглуулалт</h1>
          <p className="text-sm text-muted-foreground">
            Хүргэгдсний дараах автомат төлбөрийн хүсэлтүүд
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Хүлээгдэж буй"
          value={stats?.pendingCount ?? 0}
          sub={stats ? fmtMnt(stats.pendingAmount) : "—"}
          icon={Clock}
          tone="text-amber-600"
        />
        <StatCard
          label="Өнөөдөр төлсөн"
          value={stats?.paidTodayCount ?? 0}
          sub={stats ? fmtMnt(stats.paidTodayAmount) : "—"}
          icon={CheckCircle2}
          tone="text-emerald-600"
        />
        <StatCard
          label="Цуглуулалтын хувь"
          value={`${stats?.collectionRate ?? 0}%`}
          sub="Нийт SMS илгээсний"
          icon={Wallet}
          tone="text-primary"
        />
        <StatCard
          label="Хугацаа хэтэрсэн"
          value={stats?.overdueCount ?? 0}
          sub="Дахин SMS илгээх"
          icon={AlertTriangle}
          tone="text-red-600"
        />
      </div>

      <Card className="mt-6 rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <Input
            placeholder="Захиалга, утас, нэрээр хайх..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-1">
            {["", "pending", "requested", "paid", "expired"].map((s) => (
              <Button
                key={s || "all"}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {s ? STATUS_LABEL[s] : "Бүгд"}
              </Button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Шинэчлэх
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Захиалга</TableHead>
                <TableHead>Хэрэглэгч</TableHead>
                <TableHead>Дүн</TableHead>
                <TableHead>Аргa</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead>SMS</TableHead>
                <TableHead className="text-right">Үйлдэл</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    Хүсэлт байхгүй
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.orders?.external_ref ?? r.order_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {r.orders?.guest_name ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.customer_phone ?? r.orders?.phone ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {fmtMnt(Number(r.amount ?? 0))}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">
                        {r.payment_provider === "qpay" ? "QPay" : "Банк"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.sms_sent_at
                        ? new Date(r.sms_sent_at).toLocaleString("mn-MN")
                        : "—"}
                      {r.sms_attempts > 1 && ` (${r.sms_attempts})`}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {r.invoice_url && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Холбоос хуулах"
                              onClick={() => {
                                navigator.clipboard.writeText(r.invoice_url);
                                toast.success("Хуулагдлаа");
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <a href={r.invoice_url} target="_blank" rel="noreferrer">
                              <Button size="icon" variant="ghost" title="Invoice үзэх">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </a>
                          </>
                        )}
                        {r.status !== "paid" && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="SMS дахин илгээх"
                              disabled={resendMut.isPending}
                              onClick={() => resendMut.mutate(r.order_id)}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Гараар төлсөн гэж тэмдэглэх"
                              disabled={markMut.isPending}
                              onClick={() => {
                                if (confirm("Энэ захиалгыг төлөгдсөн гэж тэмдэглэх үү?"))
                                  markMut.mutate(r.order_id);
                              }}
                            >
                              <CheckCheck className="h-4 w-4 text-emerald-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: any;
  tone: string;
}) {
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <Icon className={`h-6 w-6 ${tone}`} />
      </div>
    </Card>
  );
}
