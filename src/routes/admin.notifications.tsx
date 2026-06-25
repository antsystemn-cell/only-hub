import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Bell, RefreshCw, Send, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  listNotificationsFn,
  resendNotificationFn,
  retryFailedCollectionsFn,
  getNotificationStatsFn,
} from "@/lib/notifications/notifications.functions";
import { listOnlycargoWebhookEventsFn } from "@/lib/onlycargo/admin.functions";

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({ meta: [{ title: "Мэдэгдлийн лог — Admin" }] }),
  component: AdminNotificationsPage,
});

const STATUS_TONE: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-700",
};

function AdminNotificationsPage() {
  const list = useServerFn(listNotificationsFn);
  const stats = useServerFn(getNotificationStatsFn);
  const resend = useServerFn(resendNotificationFn);
  const retry = useServerFn(retryFailedCollectionsFn);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const qNotif = useQuery({
    queryKey: ["admin-notifications", statusFilter],
    queryFn: () => list({ data: { status: statusFilter, limit: 200 } }),
  });
  const qStats = useQuery({
    queryKey: ["admin-notif-stats"],
    queryFn: () => stats({ data: {} }),
  });
  const listCargoHooks = useServerFn(listOnlycargoWebhookEventsFn);
  const qCargoHooks = useQuery({
    queryKey: ["admin-onlycargo-webhooks"],
    queryFn: () => listCargoHooks({ data: { limit: 50 } }),
  });

  const mResend = useMutation({
    mutationFn: (id: string) => resend({ data: { notificationId: id } }),
    onSuccess: (r: any) => {
      if (r?.ok) {
        toast.success(r.message ?? "Дахин илгээлээ");
        qNotif.refetch();
      } else toast.error(r?.error ?? "Алдаа гарлаа");
    },
  });

  const mRetry = useMutation({
    mutationFn: () => retry({ data: {} }),
    onSuccess: (r: any) => {
      if (r?.ok)
        toast.success(`Шалгасан: ${r.scanned}, амжилттай: ${r.retried}, алдаа: ${r.failed}`);
      else toast.error(r?.error ?? "Алдаа гарлаа");
      qNotif.refetch();
      qStats.refetch();
    },
  });

  const items = (qNotif.data as any)?.items ?? [];
  const s = (qStats.data as any)?.stats;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6" /> Мэдэгдлийн лог
          </h1>
          <p className="text-sm text-muted-foreground">
            Сүүлийн 7 хоногийн SMS, систем, webhook мэдэгдлүүд
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { qNotif.refetch(); qStats.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Сэргээх
          </Button>
          <Button onClick={() => mRetry.mutate()} disabled={mRetry.isPending}>
            <Send className="w-4 h-4 mr-2" />
            Бүтэлгүйтсэнийг дахин илгээх
          </Button>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Нийт</div>
            <div className="text-2xl font-bold">{s.total}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Амжилттай
            </div>
            <div className="text-2xl font-bold text-green-600">{s.sent}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Бүтэлгүйтсэн
            </div>
            <div className="text-2xl font-bold text-red-600">{s.failed}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Амжилтын хувь</div>
            <div className="text-2xl font-bold">{s.successRate}%</div>
          </Card>
        </div>
      )}

      <div className="flex gap-2">
        {[undefined, "sent", "failed", "skipped"].map((st) => (
          <Button
            key={st ?? "all"}
            size="sm"
            variant={statusFilter === st ? "default" : "outline"}
            onClick={() => setStatusFilter(st)}
          >
            {st ?? "Бүгд"}
          </Button>
        ))}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Огноо</TableHead>
              <TableHead>Эвент</TableHead>
              <TableHead>Суваг</TableHead>
              <TableHead>Хүлээн авагч</TableHead>
              <TableHead>Захиалга</TableHead>
              <TableHead>Төлөв</TableHead>
              <TableHead>Алдаа</TableHead>
              <TableHead className="text-right">Үйлдэл</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((n: any) => (
              <TableRow key={n.id}>
                <TableCell className="text-xs">
                  {new Date(n.created_at).toLocaleString("mn-MN")}
                </TableCell>
                <TableCell>{n.event_type}</TableCell>
                <TableCell>{n.channel}</TableCell>
                <TableCell className="text-xs">{n.recipient ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  {n.orders?.external_ref ?? n.order_id?.slice(0, 8) ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_TONE[n.status] ?? ""}>{n.status}</Badge>
                </TableCell>
                <TableCell className="text-xs max-w-[260px] truncate text-red-600">
                  {n.error ?? ""}
                </TableCell>
                <TableCell className="text-right">
                  {n.status === "failed" &&
                  n.channel === "sms" &&
                  n.event_type === "payment_requested" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mResend.isPending}
                      onClick={() => mResend.mutate(n.id)}
                    >
                      Дахин
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Мэдэгдэл алга
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">OnlyCargo webhook лог</h2>
            <p className="text-xs text-muted-foreground">
              Сүүлийн 50 webhook эвент — debug зориулалттай
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => qCargoHooks.refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Сэргээх
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Огноо</TableHead>
              <TableHead>Эвент</TableHead>
              <TableHead>Track</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Төлөв</TableHead>
              <TableHead>Анхааруулга</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {((qCargoHooks.data as any)?.items ?? []).map((e: any) => {
              const r = e.result ?? {};
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">
                    {new Date(e.processed_at).toLocaleString("mn-MN")}
                  </TableCell>
                  <TableCell className="text-xs">{r.event ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{r.trackNumber ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{r.customerCode ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        e.processing_status === "ok"
                          ? "bg-green-100 text-green-700"
                          : e.processing_status === "processed_with_warning"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }
                    >
                      {e.processing_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[280px] truncate text-amber-700">
                    {e.error_message ?? ""}
                  </TableCell>
                </TableRow>
              );
            })}
            {!((qCargoHooks.data as any)?.items ?? []).length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Webhook эвент алга
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
