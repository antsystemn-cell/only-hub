import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Plus, FileSpreadsheet, FileText, Printer, Tag, Search, ChevronDown, X, Truck, Trash2, Pencil, Minus, CheckCircle, Loader2 } from "lucide-react";
import { fmtMnt, STATUS_LABELS, STATUS_TONE, PAYMENT_STATUS_LABELS } from "@/lib/format";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { useServerFn } from "@tanstack/react-start";
import { sendOrderToDelivery } from "@/lib/delivery.functions";
import { bulkUpdateOrderStatus, bulkMarkPaid, bulkCreateDelivery, bulkDeleteOrders, markOrderPaid } from "@/lib/orders-bulk.functions";
import { createManualOrder, updateOrderShipping } from "@/lib/orders.functions";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  submitted: "Илгээгдсэн",
  confirmed: "Баталгаажсан",
  phone_confirmed: "Утсаар баталгаажсан",
  preparing: "Бэлдэж буй",
  out_for_delivery: "Хүргэлтэнд гарсан",
  delivering: "Хүргэлтэнд",
  delivered: "Хүргэгдсэн",
  completed: "Хүргэгдсэн",
  cancelled: "Цуцлагдсан",
};

export const DELIVERY_STATUS_TONE: Record<string, string> = {
  submitted: "bg-violet-500/10 text-violet-600",
  confirmed: "bg-blue-500/10 text-blue-600",
  phone_confirmed: "bg-blue-500/10 text-blue-600",
  preparing: "bg-blue-500/10 text-blue-600",
  out_for_delivery: "bg-violet-500/10 text-violet-600",
  delivering: "bg-violet-500/10 text-violet-600",
  delivered: "bg-emerald-500/10 text-emerald-600",
  completed: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-red-500/10 text-red-600",
};

export const Route = createFileRoute("/merchant/dashboard/orders")({
  component: OrdersPage,
});

const STATUSES = ["pending","phone_confirmed","confirmed","preparing","delivering","completed","cancelled"];

function OrdersPage() {
  const { primaryMerchantId, loading: authLoading } = useAuth();
  const merchantId = primaryMerchantId ?? "";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showManual, setShowManual] = useState(false);
  const bulkStatusFn = useServerFn(bulkUpdateOrderStatus);
  const bulkPaidFn = useServerFn(bulkMarkPaid);
  const bulkDeliveryFn = useServerFn(bulkCreateDelivery);
  const bulkDeleteFn = useServerFn(bulkDeleteOrders);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["orders", merchantId],
    // Don't fire the query with an empty merchantId — it would return zero
    // rows and cache that empty result, briefly blanking the dashboard
    // during auth/role hydration.
    enabled: !!merchantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  useRealtimeSync({
    tables: ["orders", "delivery_requests"],
    queryKeys: [["orders", merchantId]],
    merchantId,
    enabled: !!merchantId,
  });

  // Collect unique product_ids across all visible orders to fetch thumbnails
  // in a single query. Results are cached aggressively (30min staleTime) so
  // re-renders/refetches don't re-download images and CDN bandwidth is saved.
  const productIds = useMemo(() => {
    const set = new Set<string>();
    (orders as any[]).forEach((o) => {
      (o.items as any[] | null)?.forEach((it) => {
        if (it?.product_id) set.add(String(it.product_id));
      });
    });
    return Array.from(set).sort();
  }, [orders]);

  const { data: productImages = {} } = useQuery<Record<string, string>>({
    queryKey: ["order-product-images", merchantId, productIds.join(",")],
    enabled: productIds.length > 0,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60 * 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,thumbnail_url,image_url")
        .in("id", productIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => {
        const url = p.thumbnail_url || p.image_url;
        if (url) map[p.id] = url;
      });
      return map;
    },
  });

  const filtered = useMemo(() => orders.filter((o: any) => {
    if (search && !((o.phone ?? "").includes(search) || (o.external_ref ?? "").toLowerCase().includes(search.toLowerCase()))) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (paymentFilter !== "all" && o.payment_status !== paymentFilter) return false;
    if (dateFrom && new Date(o.created_at) < new Date(dateFrom)) return false;
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      if (new Date(o.created_at) > end) return false;
    }
    return true;
  }), [orders, search, statusFilter, paymentFilter, dateFrom, dateTo]);
  const active = filtered.filter((o: any) => o.status !== "cancelled");
  const cancelled = filtered.filter((o: any) => o.status === "cancelled").slice(0, 5);

  const totals = useMemo(() => ({
    count: filtered.length,
    sum: filtered.reduce((s: number, o: any) => s + Number(o.total ?? 0), 0),
    paid: filtered.filter((o: any) => o.payment_status === "confirmed").reduce((s: number, o: any) => s + Number(o.total ?? 0), 0),
  }), [filtered]);

  const markPaidFn = useServerFn(markOrderPaid);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
      // When marking as completed, route payment confirmation through the
      // centralized service (handles paid_at, delivery creation, idempotency).
      if (status === "completed") {
        const res = await markPaidFn({ data: { orderId: id } });
        if (!res.ok) throw new Error(res.error);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders", merchantId] }); toast.success("Шинэчиллээ"); },
  });

  const togglePayment = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (status === "confirmed") {
        const res = await markPaidFn({ data: { orderId: id } });
        if (!res.ok) throw new Error(res.error);
        return;
      }
      // Reverting to unpaid is not a confirmation event — direct update.
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: status, paid_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders", merchantId] }); toast.success("Төлбөр шинэчлэгдлээ"); },
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").update({ status: "pending" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders", merchantId] }); toast.success("Сэргээлээ"); },
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders", merchantId] }); toast.success("Устгалаа"); },
  });

  const exportExcel = () => {
    const rows = (selected.size ? filtered.filter((o: any) => selected.has(o.id)) : filtered).map((o: any) => ({
      Дугаар: o.external_ref, Огноо: o.created_at, Утас: o.phone, Хаяг: o.shipping_address, Дүн: o.total,
      Төлөв: STATUS_LABELS[o.status] ?? o.status, Төлбөр: PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Захиалга");
    XLSX.writeFile(wb, `orders-${Date.now()}.xlsx`);
  };

  const exportLabels = () => {
    const list = selected.size ? filtered.filter((o: any) => selected.has(o.id)) : filtered;
    if (!list.length) return;
    const pdf = new jsPDF({ unit: "mm", format: [70, 80] });
    list.forEach((o: any, i: number) => {
      if (i > 0) pdf.addPage([70, 80]);
      pdf.setFontSize(10); pdf.text(o.external_ref ?? "", 5, 8);
      pdf.setFontSize(8);
      pdf.text(`Утас: ${o.phone ?? ""}`, 5, 16);
      pdf.text(`Хаяг: ${(o.shipping_address ?? "").slice(0, 60)}`, 5, 22, { maxWidth: 60 });
      pdf.text(`Дүн: ${fmtMnt(o.total)}`, 5, 50);
    });
    pdf.save(`labels-${Date.now()}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Захиалга</h1>
          <p className="text-sm text-muted-foreground">
            Нийт {orders.length} • Шүүлтийн дүн: {fmtMnt(totals.sum)} ({totals.count}) • Төлөгдсөн: {fmtMnt(totals.paid)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowManual(true)}><Plus className="mr-2 h-4 w-4" /> Гараар оруулах</Button>
        </div>
      </div>

      <Card className="rounded-2xl p-4">
        <div className="mb-4 grid gap-2 md:grid-cols-[1fr_180px_180px_140px_140px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Утас эсвэл захиалгын дугаар..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Төлөв" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Бүх төлөв</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger><SelectValue placeholder="Төлбөр" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Бүх төлбөр</SelectItem>
              <SelectItem value="unpaid">Төлөгдөөгүй</SelectItem>
              <SelectItem value="confirmed">Төлөгдсөн</SelectItem>
              <SelectItem value="refunded">Буцаагдсан</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Сонгосон: {selected.size}</Badge>
          {selected.size > 0 && (
            <>
              <Select onValueChange={async (s) => {
                const ids = Array.from(selected);
                try { await bulkStatusFn({ data: { ids, status: s as any } }); toast.success(`${ids.length} захиалга шинэчиллээ`); qc.invalidateQueries({ queryKey: ["orders", merchantId] }); setSelected(new Set()); }
                catch (e: any) { toast.error(e?.message ?? "Алдаа"); }
              }}>
                <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Төлөв өөрчлөх" /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={async () => {
                const ids = Array.from(selected);
                try { const r = await bulkPaidFn({ data: { ids } }); toast.success(`${r.count} төлөгдсөн, ${r.deliveryCreated} хүргэлт үүсгэв`); qc.invalidateQueries({ queryKey: ["orders", merchantId] }); setSelected(new Set()); }
                catch (e: any) { toast.error(e?.message ?? "Алдаа"); }
              }}><CheckCircle className="mr-1 h-4 w-4" /> Төлсөн</Button>
              <Button size="sm" variant="outline" onClick={async () => {
                const ids = Array.from(selected);
                try {
                  const r = await bulkDeliveryFn({ data: { ids } });
                  const parts: string[] = [];
                  if (r.count > 0) parts.push(`${r.count} хүргэлт үүсгэв`);
                  if (r.skipped > 0) parts.push(`${r.skipped} аль хэдийн үүсгэсэн тул алгассан`);
                  if (r.count === 0 && r.skipped > 0) toast.info(parts.join(", "));
                  else toast.success(parts.join(", ") || "Шинээр үүсгэх захиалга байхгүй");
                  qc.invalidateQueries({ queryKey: ["orders", merchantId] });
                  setSelected(new Set());
                }
                catch (e: any) { toast.error(e?.message ?? "Алдаа"); }
              }}><Truck className="mr-1 h-4 w-4" /> Хүргэлт үүсгэх</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="mr-1 h-4 w-4" /> Устгах</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Сонгосон {selected.size} захиалгыг устгах уу?</AlertDialogTitle>
                    <AlertDialogDescription>Энэ үйлдлийг буцаах боломжгүй. Холбогдох хүргэлт, төлбөрийн хүсэлтүүд хамт устана.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Болих</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => {
                      const ids = Array.from(selected);
                      try { const r = await bulkDeleteFn({ data: { ids } }); toast.success(`${r.count} захиалга устгалаа`); qc.invalidateQueries({ queryKey: ["orders", merchantId] }); setSelected(new Set()); }
                      catch (e: any) { toast.error(e?.message ?? "Алдаа"); }
                    }}>Устгах</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X className="mr-1 h-3 w-3" /> Цуцлах</Button>
            </>
          )}
          {(statusFilter !== "all" || paymentFilter !== "all" || dateFrom || dateTo || search) && (
            <Button size="sm" variant="ghost" onClick={() => { setStatusFilter("all"); setPaymentFilter("all"); setDateFrom(""); setDateTo(""); setSearch(""); }}>
              <X className="mr-1 h-3 w-3" /> Шүүлт цэвэрлэх
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportExcel}><FileSpreadsheet className="mr-1 h-4 w-4" /> Excel</Button>
            <Button size="sm" variant="outline" onClick={exportLabels}><Tag className="mr-1 h-4 w-4" /> Шошго</Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Хэвлэх</Button>
          </div>
        </div>

        <div className="space-y-2">
          {(authLoading || (!merchantId) || ordersLoading) ? (
            <p className="py-10 text-center text-muted-foreground">Ачааллаж байна...</p>
          ) : active.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">Захиалга алга</p>
          ) : active.map((o: any) => (
            <OrderRow
              key={o.id} order={o}
              productImages={productImages}
              checked={selected.has(o.id)}
              onCheck={(v) => {
                const next = new Set(selected); v ? next.add(o.id) : next.delete(o.id); setSelected(next);
              }}
              onStatus={(s) => updateStatus.mutate({ id: o.id, status: s })}
              onPayment={(s) => togglePayment.mutate({ id: o.id, status: s })}
            />
          ))}
        </div>
      </Card>

      {cancelled.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              Сүүлд цуцлагдсан ({cancelled.length})
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {cancelled.map((o: any) => (
              <Card key={o.id} className="flex items-center gap-3 rounded-xl p-3">
                <span className="text-sm font-medium">{o.external_ref}</span>
                <span className="text-sm text-muted-foreground">{o.phone}</span>
                <span className="ml-auto text-sm font-semibold">{fmtMnt(o.total)}</span>
                <Button size="sm" variant="outline" onClick={() => restore.mutate(o.id)}>Сэргээх</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Захиалга устгах уу?</AlertDialogTitle>
                      <AlertDialogDescription>Энэ үйлдлийг буцаах боломжгүй.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Болих</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteOrder.mutate(o.id)}>Устгах</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Card>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <ManualOrderDialog open={showManual} onOpenChange={setShowManual} merchantId={merchantId} onCreated={() => qc.invalidateQueries({ queryKey: ["orders", merchantId] })} />
    </div>
  );
}

function OrderRow({ order, checked, onCheck, onStatus, onPayment, productImages }: {
  order: any; checked: boolean; onCheck: (v: boolean) => void;
  onStatus: (s: string) => void; onPayment: (s: string) => void;
  productImages: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [editingItems, setEditingItems] = useState(false);
  const [localItems, setLocalItems] = useState<any[]>([]);
  const [sendingDelivery, setSendingDelivery] = useState(false);
  const qc = useQueryClient();
  const { primaryMerchantId } = useAuth();
  const sendDeliveryFn = useServerFn(sendOrderToDelivery);

  const startEdit = () => {
    setLocalItems(JSON.parse(JSON.stringify(order.items ?? [])));
    setEditingItems(true);
  };
  const saveItems = async () => {
    const itemsTotal = localItems.reduce((s, it: any) => s + Number(it.price ?? 0) * Number(it.quantity ?? 1), 0);
    const newTotal = itemsTotal + Number(order.delivery_fee ?? 0) - Number(order.coupon_discount ?? 0);
    const { error } = await supabase.from("orders").update({ items: localItems, total: newTotal }).eq("id", order.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Бараа шинэчлэгдлээ");
    setEditingItems(false);
    qc.invalidateQueries({ queryKey: ["orders", primaryMerchantId] });
  };

  const itemList = (order.items as any[] | null) ?? [];
  const itemImageUrl = (it: any): string | null =>
    it?.image_url || it?.thumbnail_url || (it?.product_id ? productImages[it.product_id] : null) || null;
  const previewItems = itemList.slice(0, 3);
  const extraCount = Math.max(0, itemList.length - previewItems.length);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 p-3 sm:items-center">
        <Checkbox className="mt-1 sm:mt-0" checked={checked} onCheckedChange={(v) => onCheck(!!v)} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{order.external_ref ?? order.id.slice(0, 8)}</span>
            <span className={`rounded-md border px-2 py-0.5 text-xs ${STATUS_TONE[order.status] ?? ""}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{order.payment_method}</span>
            <span className={`rounded-md px-2 py-0.5 text-xs ${order.payment_status === "confirmed" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}</span>
            {order.delivery_order_id && (
              <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${DELIVERY_STATUS_TONE[order.delivery_status ?? "submitted"] ?? "bg-muted text-muted-foreground"}`}>
                <Truck className="h-3 w-3" />
                {DELIVERY_STATUS_LABELS[order.delivery_status ?? "submitted"] ?? order.delivery_status}
                <span className="opacity-70">• {order.delivery_order_id}</span>
              </span>
            )}
          </div>
          {itemList.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex -space-x-2">
                {previewItems.map((it: any, i: number) => {
                  const url = itemImageUrl(it);
                  return (
                    <div
                      key={i}
                      className="h-8 w-8 overflow-hidden rounded-md border-2 border-card bg-muted ring-0"
                      title={it?.name}
                    >
                      {url ? (
                        <img
                          src={url}
                          alt={it?.name ?? ""}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                  );
                })}
                {extraCount > 0 && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-md border-2 border-card bg-muted text-[10px] font-medium text-muted-foreground">
                    +{extraCount}
                  </div>
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {previewItems.map((it: any) => it?.name).filter(Boolean).join(", ")}
                {extraCount > 0 ? ` …` : ""}
              </span>
            </div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">{order.phone} • {new Date(order.created_at).toLocaleString("mn-MN")}</div>
        </div>
        <div className="text-right">
          <div className="font-semibold">{fmtMnt(order.total)}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}><ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></Button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border p-3 text-sm">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase text-muted-foreground">Захиалсан бараа</span>
              {!editingItems ? (
                <Button size="sm" variant="outline" onClick={startEdit}>
                  <Pencil className="mr-1 h-3 w-3" /> Засах
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button size="sm" onClick={saveItems}>Хадгалах</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingItems(false)}>Болих</Button>
                </div>
              )}
            </div>
            {editingItems ? (
              <div className="space-y-2">
                {localItems.map((it: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-2">
                    <div className="flex-1 text-sm">{it.name}</div>
                    <Input type="number" className="h-8 w-24" value={it.price}
                      onChange={(e) => {
                        const next = [...localItems]; next[i] = { ...next[i], price: Number(e.target.value) };
                        setLocalItems(next);
                      }} />
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => { const n = [...localItems]; n[i] = { ...n[i], quantity: Math.max(1, n[i].quantity - 1) }; setLocalItems(n); }}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm">{it.quantity}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => { const n = [...localItems]; n[i] = { ...n[i], quantity: n[i].quantity + 1 }; setLocalItems(n); }}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="w-24 text-right text-sm font-medium">{fmtMnt((it.price ?? 0) * (it.quantity ?? 1))}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => setLocalItems(localItems.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="text-right text-sm font-semibold">
                  Нийт: {fmtMnt(localItems.reduce((s: number, it: any) => s + (it.price ?? 0) * (it.quantity ?? 1), 0) + Number(order.delivery_fee ?? 0) - Number(order.coupon_discount ?? 0))}
                </div>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {itemList.map((it: any, i: number) => {
                  const url = itemImageUrl(it);
                  return (
                    <li key={i} className="flex items-center gap-2.5">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                        {url ? (
                          <img
                            src={url}
                            alt={it?.name ?? ""}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <span className="flex-1 min-w-0 truncate">
                        {it.name} × {it.quantity}{it.color ? ` • ${it.color}` : ""}{it.size ? ` • ${it.size}` : ""}
                      </span>
                      <span className="shrink-0 tabular-nums">{fmtMnt((it.price ?? 0) * (it.quantity ?? 1))}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <AddressEditor order={order} />
          {order.note && <div><span className="text-muted-foreground">Тэмдэглэл: </span>{order.note}</div>}
          {order.note && <div><span className="text-muted-foreground">Тэмдэглэл: </span>{order.note}</div>}
          <div className="flex flex-wrap gap-2">
            <Select value={order.status} onValueChange={onStatus}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => onPayment(order.payment_status === "confirmed" ? "unpaid" : "confirmed")}>
              {order.payment_status === "confirmed" ? "Төлөгдөөгүй болгох" : "Төлөгдсөн болгох"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!order.delivery_order_id || sendingDelivery}
              onClick={async () => {
                setSendingDelivery(true);
                try {
                  const res = await sendDeliveryFn({ data: { orderId: order.id } });
                  if (res.ok) {
                    toast.success(res.message);
                    qc.invalidateQueries({ queryKey: ["orders", primaryMerchantId] });
                  } else {
                    toast.error(res.error);
                  }
                } catch (e: any) {
                  toast.error(e?.message ?? "Алдаа");
                } finally {
                  setSendingDelivery(false);
                }
              }}
            >
              {sendingDelivery ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Илгээж байна...</>
              ) : order.delivery_order_id ? (
                <><CheckCircle className="mr-1 h-4 w-4 text-emerald-600" /> {order.delivery_order_id}</>
              ) : (
                <><Truck className="mr-1 h-4 w-4" /> Хүргэлт рүү илгээх</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualOrderDialog({ open, onOpenChange, merchantId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; merchantId: string; onCreated: () => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(8000);
  const [includeDelivery, setIncludeDelivery] = useState(true);
  const [items, setItems] = useState<Array<{ name: string; price: number; quantity: number; sku?: string; product_id?: string }>>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [status, setStatus] = useState("confirmed");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saleDate, setSaleDate] = useState("");
  const [branch, setBranch] = useState("");
  const [source, setSource] = useState("store");
  const [productSearch, setProductSearch] = useState("");
  const createManualOrderFn = useServerFn(createManualOrder);

  const { data: allProducts = [] } = useQuery({
    queryKey: ["modal-products", merchantId],
    enabled: open,
    queryFn: async () => (await supabase.from("products").select("id,name,product_code,price,thumbnail_url").eq("merchant_id", merchantId).eq("is_active", true)).data ?? [],
  });

  const searchResults = productSearch.length > 0
    ? (allProducts as any[]).filter((p) =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.product_code ?? "").toLowerCase().includes(productSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const total = subtotal + (includeDelivery ? deliveryFee : 0);

  const submit = async () => {
    if (!phone || items.length === 0) return toast.error("Утас, бараа шаардлагатай");
    setSaving(true);
    try {
      const res = await createManualOrderFn({
        data: {
          merchantId,
          phone,
          name: name || null,
          address: address || null,
          items,
          deliveryFee: includeDelivery ? deliveryFee : 0,
          paymentMethod,
          paymentStatus: paymentStatus as "unpaid" | "confirmed",
          status,
          note: note || null,
          saleDate: saleDate || null,
          branch: branch || null,
          source,
        },
      });
      if (!res.ok) {
        setSaving(false);
        return toast.error(res.error ?? "Алдаа гарлаа");
      }
      toast.success("Захиалга үүслээ");
      onCreated();
      onOpenChange(false);
      setItems([]); setPhone(""); setName(""); setAddress(""); setNote(""); setSaleDate(""); setBranch(""); setSource("store");
      setPaymentStatus("unpaid"); setStatus("confirmed");
    } catch (e: any) {
      toast.error(e?.message ?? "Алдаа гарлаа");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Гараар захиалга үүсгэх</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <section>
            <h4 className="mb-2 font-medium">📅 Борлуулалтын мэдээлэл</h4>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Огноо цаг</Label>
                <Input type="datetime-local" value={saleDate}
                  max={new Date().toISOString().slice(0, 16)}
                  onChange={(e) => setSaleDate(e.target.value)} />
              </div>
              <div>
                <Label>Гарах байршил</Label>
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger><SelectValue placeholder="Сонгох" /></SelectTrigger>
                  <SelectContent>
                    {["Лавай", "Их наяд", "Агуулах", "Бусад"].map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Эх сурвалж</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">🏬 Дэлгүүр</SelectItem>
                    <SelectItem value="facebook">📘 Facebook</SelectItem>
                    <SelectItem value="instagram">📷 Instagram</SelectItem>
                    <SelectItem value="phone">📞 Утас</SelectItem>
                    <SelectItem value="web">🌐 Вэб</SelectItem>
                    <SelectItem value="other">Бусад</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section>
            <h4 className="mb-2 font-medium">Үйлчлүүлэгч</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Утас *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div><Label>Нэр</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Хүргэлтийн хаяг</Label><Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={includeDelivery} onCheckedChange={(v) => setIncludeDelivery(!!v)} /> Хүргэлт оруулах</label>
              <div><Label>Хүргэлтийн төлбөр</Label><Input type="number" value={deliveryFee} onChange={(e) => setDeliveryFee(Number(e.target.value))} /></div>
            </div>
          </section>

          <section>
            <h4 className="mb-2 font-medium">Бараа</h4>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="🔍 Бараа хайх (нэр эсвэл SKU)..."
                value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-lg max-h-64 overflow-y-auto">
                  {searchResults.map((p: any) => (
                    <button type="button" key={p.id}
                      className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted"
                      onClick={() => {
                        setItems([...items, { name: p.name, price: Number(p.price), quantity: 1, sku: p.product_code ?? undefined, product_id: p.id }]);
                        setProductSearch("");
                      }}>
                      {p.thumbnail_url
                        ? <img src={p.thumbnail_url} className="h-10 w-10 rounded-lg object-cover" />
                        : <div className="h-10 w-10 rounded-lg bg-muted" />}
                      <div className="flex-1">
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.product_code ?? ""} • {fmtMnt(p.price)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 space-y-1">
              {items.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Бараа сонгоогүй байна</p>}
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                  <span className="flex-1 truncate">{it.name}</span>
                  <Input type="number" min={1} className="h-8 w-16 text-center" value={it.quantity}
                    onChange={(e) => {
                      const next = [...items]; next[i] = { ...next[i], quantity: Math.max(1, Number(e.target.value)) };
                      setItems(next);
                    }} />
                  <span className="w-24 text-right">{fmtMnt(it.price * it.quantity)}</span>
                  <button onClick={() => setItems(items.filter((_, j) => j !== i))}><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
              ))}
            </div>
            {items.length > 0 && (
              <div className="mt-2 flex justify-end">
                <Button type="button" size="sm" variant="outline"
                  onClick={() => {
                    const pdf = new jsPDF({ unit: "mm", format: [70, 80] });
                    pdf.setFontSize(9); pdf.text("Барааны жагсаалт", 5, 8);
                    pdf.setFontSize(8);
                    let y = 15;
                    items.forEach((it) => {
                      const line = `${it.name} x${it.quantity} = ${fmtMnt(it.price * it.quantity)}`;
                      pdf.text(line.slice(0, 45), 5, y, { maxWidth: 60 });
                      y += 7;
                      if (y > 72) { pdf.addPage([70, 80]); y = 10; }
                    });
                    pdf.setFontSize(9);
                    pdf.text(`Niit: ${fmtMnt(subtotal)}`, 5, y + 3);
                    pdf.save(`items-${Date.now()}.pdf`);
                  }}>
                  <FileText className="mr-1 h-4 w-4" /> PDF татах
                </Button>
              </div>
            )}
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <div><Label>Төлбөрийн арга</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Бэлэн</SelectItem><SelectItem value="qpay">QPay</SelectItem><SelectItem value="storepay">StorePay</SelectItem>
                </SelectContent></Select></div>
            <div><Label>Төлбөрийн төлөв</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Төлөгдөөгүй</SelectItem><SelectItem value="confirmed">Төлөгдсөн</SelectItem>
                </SelectContent></Select></div>
            <div><Label>Захиалгын төлөв</Label>
              <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent></Select></div>
          </section>

          <section>
            <Label>Тэмдэглэл</Label>
            <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </section>

          <div className="flex items-center justify-between rounded-xl bg-muted p-3">
            <div className="text-sm text-muted-foreground">Дэд дүн: {fmtMnt(subtotal)}{includeDelivery ? ` • Хүргэлт: ${fmtMnt(deliveryFee)}` : ""}</div>
            <div className="text-xl font-bold">{fmtMnt(total)}</div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Болих</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Хадгалж байна..." : "Үүсгэх"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
