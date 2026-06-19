import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtMnt } from "@/lib/format";
import { Globe2, ExternalLink, Search, Store } from "lucide-react";
import { FOREIGN_SOURCES } from "@/lib/foreign-orders/sources";
import { adminListForeignQueue } from "@/lib/foreign-orders/admin.functions";

export const Route = createFileRoute("/admin/foreign-orders")({
  component: AdminForeignOrdersPage,
});

const STATUSES = [
  "WAITING_SOURCE_PURCHASE",
  "SOURCE_PURCHASED",
  "KOREA_WAREHOUSE_RECEIVED",
  "INTERNATIONAL_TRANSIT",
  "UB_ARRIVED",
  "DELIVERY_ASSIGNED",
  "DELIVERED",
  "SOURCE_PURCHASE_FAILED",
  "REFUNDED",
  "CANCELLED",
] as const;

const STATUS_LABEL: Record<string, string> = {
  WAITING_SOURCE_PURCHASE: "Худалдан авах хүлээгдэж",
  SOURCE_PURCHASED: "Худалдаж авсан",
  KOREA_WAREHOUSE_RECEIVED: "KR агуулахад",
  INTERNATIONAL_TRANSIT: "Тээвэрт",
  UB_ARRIVED: "УБ-д ирсэн",
  DELIVERY_ASSIGNED: "Хүргэлтэд гарсан",
  DELIVERED: "Хүргэгдсэн",
  SOURCE_PURCHASE_FAILED: "Амжилтгүй",
  REFUNDED: "Буцаалт",
  CANCELLED: "Цуцалсан",
};

const STATUS_COLOR: Record<string, string> = {
  WAITING_SOURCE_PURCHASE: "bg-amber-100 text-amber-700",
  SOURCE_PURCHASED: "bg-blue-100 text-blue-700",
  KOREA_WAREHOUSE_RECEIVED: "bg-indigo-100 text-indigo-700",
  INTERNATIONAL_TRANSIT: "bg-purple-100 text-purple-700",
  UB_ARRIVED: "bg-cyan-100 text-cyan-700",
  DELIVERY_ASSIGNED: "bg-emerald-100 text-emerald-700",
  DELIVERED: "bg-green-100 text-green-700",
};

function AdminForeignOrdersPage() {
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const listFn = useServerFn(adminListForeignQueue);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-foreign-queue", status, source, search],
    queryFn: () =>
      listFn({
        data: {
          status: status || undefined,
          source: source || undefined,
          search: search || undefined,
          limit: 200,
        },
      }),
  });

  const rows = (data?.rows ?? []) as any[];
  const totals = data?.totals ?? { count: 0, gmvMnt: 0, sourceCostMnt: 0, commissionMnt: 0 };
  const profit = totals.gmvMnt - totals.sourceCostMnt;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <Globe2 className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-semibold">Гадаад захиалгууд</h1>
          <p className="text-sm text-muted-foreground">
            Бүх дэлгүүрийн гадаадаас захиалсан барааны нэгдсэн жагсаалт.
          </p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Захиалга" value={totals.count.toLocaleString()} />
        <StatCard label="GMV (хэрэглэгч)" value={fmtMnt(totals.gmvMnt)} />
        <StatCard label="Эх сурвалжийн зардал" value={fmtMnt(totals.sourceCostMnt)} />
        <StatCard label="Хувь" value={fmtMnt(totals.commissionMnt)} sub={`Бохир ашиг: ${fmtMnt(profit)}`} />
      </div>

      <Card className="p-4">
        <form
          className="mb-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Эх сурвалжийн URL / тэмдэглэл хайх…"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Бүх төлөв" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Бүх төлөв</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={(v) => setSource(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Бүх эх сурвалж" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Бүх эх сурвалж</SelectItem>
              {Object.values(FOREIGN_SOURCES).map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="default">
            Хайх
          </Button>
        </form>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Уншиж байна…</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Тохирох захиалга алга байна.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">Захиалга</th>
                  <th className="py-2 pr-3">Дэлгүүр</th>
                  <th className="py-2 pr-3">Эх сурвалж</th>
                  <th className="py-2 pr-3">Төлөв</th>
                  <th className="py-2 pr-3 text-right">Эх үнэ</th>
                  <th className="py-2 pr-3 text-right">Хэрэглэгч</th>
                  <th className="py-2 pr-3 text-right">Хувь</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const src = FOREIGN_SOURCES[r.source as keyof typeof FOREIGN_SOURCES];
                  const commission = r.orders?.platform_commission_amount;
                  return (
                    <tr key={r.id} className="border-b text-sm last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">
                        #{r.orders?.external_ref ?? r.order_id.slice(0, 8)}
                        <div className="text-[10px] text-muted-foreground">
                          {r.orders?.guest_name ?? "—"} · {r.orders?.phone ?? "—"}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1">
                          <Store className="h-3 w-3 text-muted-foreground" />
                          {r.merchants?.name ?? "—"}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="text-[10px]">
                          {src?.name ?? r.source}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge className={STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-700"}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <div>{fmtMnt(Number(r.source_price_mnt ?? 0))}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {r.source_price ?? "—"} {r.source_currency ?? ""}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold">
                        {fmtMnt(Number(r.customer_paid_price_mnt ?? 0))}
                      </td>
                      <td className="py-2 pr-3 text-right text-xs">
                        {commission != null ? fmtMnt(Number(commission)) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {r.source_url ? (
                          <a
                            href={r.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}
