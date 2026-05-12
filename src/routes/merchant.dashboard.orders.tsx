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
import { Plus, FileSpreadsheet, FileText, Printer, Tag, Search, ChevronDown, X, Truck, Trash2 } from "lucide-react";
import { fmtMnt, STATUS_LABELS, STATUS_TONE, PAYMENT_STATUS_LABELS } from "@/lib/format";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

export const Route = createFileRoute("/merchant/dashboard/orders")({
  component: OrdersPage,
});

const STATUSES = ["pending","phone_confirmed","confirmed","preparing","delivering","completed","cancelled"];

function OrdersPage() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showManual, setShowManual] = useState(false);

  const { data: orders = [] } = useQuery({
    queryKey: ["orders", merchantId],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*").eq("merchant_id", merchantId).order("created_at", { ascending: false });
      return data ?? [];
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

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === "completed") patch.payment_status = "confirmed";
      const { error } = await supabase.from("orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders", merchantId] }); toast.success("Шинэчиллээ"); },
  });

  const togglePayment = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("orders").update({ payment_status: status }).eq("id", id);
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
          {active.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">Захиалга алга</p>
          ) : active.map((o: any) => (
            <OrderRow
              key={o.id} order={o}
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
              </Card>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <ManualOrderDialog open={showManual} onOpenChange={setShowManual} merchantId={merchantId} onCreated={() => qc.invalidateQueries({ queryKey: ["orders", merchantId] })} />
    </div>
  );
}

function OrderRow({ order, checked, onCheck, onStatus, onPayment }: {
  order: any; checked: boolean; onCheck: (v: boolean) => void;
  onStatus: (s: string) => void; onPayment: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 p-3">
        <Checkbox checked={checked} onCheckedChange={(v) => onCheck(!!v)} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{order.external_ref ?? order.id.slice(0, 8)}</span>
            <span className={`rounded-md border px-2 py-0.5 text-xs ${STATUS_TONE[order.status] ?? ""}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{order.payment_method}</span>
            <span className={`rounded-md px-2 py-0.5 text-xs ${order.payment_status === "confirmed" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}</span>
          </div>
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
            <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Бараа</div>
            <ul className="space-y-1">
              {(order.items as any[]).map((it, i) => (
                <li key={i} className="flex justify-between">
                  <span>{it.name} × {it.quantity}{it.color ? ` • ${it.color}` : ""}{it.size ? ` • ${it.size}` : ""}</span>
                  <span>{fmtMnt((it.price ?? 0) * (it.quantity ?? 1))}</span>
                </li>
              ))}
            </ul>
          </div>
          {order.shipping_address && <div><span className="text-muted-foreground">Хаяг: </span>{order.shipping_address}</div>}
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
            <Button size="sm" variant="outline"><Truck className="mr-1 h-4 w-4" /> Хүргэлт рүү илгээх</Button>
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
  const [items, setItems] = useState<Array<{ name: string; price: number; quantity: number; sku?: string }>>([]);
  const [itemName, setItemName] = useState(""); const [itemPrice, setItemPrice] = useState(0); const [itemQty, setItemQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [status, setStatus] = useState("pending");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const total = subtotal + (includeDelivery ? deliveryFee : 0);

  const addItem = () => {
    if (!itemName || !itemPrice) return;
    setItems([...items, { name: itemName, price: itemPrice, quantity: itemQty }]);
    setItemName(""); setItemPrice(0); setItemQty(1);
  };

  const submit = async () => {
    if (!phone || items.length === 0) return toast.error("Утас, бараа шаардлагатай");
    setSaving(true);
    const { error } = await supabase.from("orders").insert({
      merchant_id: merchantId, items, total, status, payment_method: paymentMethod, payment_status: paymentStatus,
      phone, guest_name: name || null, shipping_address: address || null, delivery_fee: includeDelivery ? deliveryFee : 0,
      is_guest: true, source: "store", note: note || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Захиалга үүслээ"); onCreated(); onOpenChange(false);
    setItems([]); setPhone(""); setName(""); setAddress(""); setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Гараар захиалга үүсгэх</DialogTitle></DialogHeader>
        <div className="space-y-4">
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
            <div className="grid gap-2 md:grid-cols-[1fr_120px_80px_auto]">
              <Input placeholder="Барааны нэр" value={itemName} onChange={(e) => setItemName(e.target.value)} />
              <Input type="number" placeholder="Үнэ" value={itemPrice || ""} onChange={(e) => setItemPrice(Number(e.target.value))} />
              <Input type="number" placeholder="Тоо" value={itemQty} onChange={(e) => setItemQty(Number(e.target.value))} />
              <Button onClick={addItem}>+</Button>
            </div>
            <div className="mt-2 space-y-1">
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span>{it.name} × {it.quantity}</span>
                  <span className="flex items-center gap-2">{fmtMnt(it.price * it.quantity)}<button onClick={() => setItems(items.filter((_, j) => j !== i))}><X className="h-4 w-4 text-muted-foreground" /></button></span>
                </div>
              ))}
            </div>
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
