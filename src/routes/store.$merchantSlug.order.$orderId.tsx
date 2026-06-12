import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMnt, PAYMENT_STATUS_LABELS, STATUS_LABELS, STATUS_TONE } from "@/lib/format";
import { getOrderStatus, retryQpayInvoice } from "@/lib/orders.functions";
import { getDeliveryHistoryByOrder } from "@/lib/delivery/delivery.functions";
import { getPaymentRequestByOrderFn } from "@/lib/payment-collection/collection.functions";
import { DeliveryTimeline } from "@/components/DeliveryTimeline";
import { PaymentIntentPanel } from "@/components/checkout/PaymentIntentPanel";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Banknote } from "lucide-react";

export const Route = createFileRoute("/store/$merchantSlug/order/$orderId")({
  component: OrderConfirmationPage,
});

function OrderConfirmationPage() {
  const { merchantSlug, orderId } = Route.useParams();
  const getStatusFn = useServerFn(getOrderStatus);
  const retryFn = useServerFn(retryQpayInvoice);
  const [retrying, setRetrying] = useState(false);

  const { data: order, refetch } = useQuery({
    queryKey: ["order-status", orderId],
    queryFn: async () => {
      const r = await getStatusFn({ data: { orderId } });
      return r.ok ? r.order : null;
    },
    refetchInterval: (q) => (q.state.data?.payment_status === "confirmed" ? false : 4000),
  });

  // Realtime push
  useEffect(() => {
    const ch = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId, refetch]);

  // Fetch QPay invoice details from order
  const { data: orderDetail } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: async () =>
      (await supabase.from("orders").select("*").eq("id", orderId).maybeSingle()).data,
  });

  const getPaymentReqFn = useServerFn(getPaymentRequestByOrderFn);
  const { data: prRes } = useQuery({
    queryKey: ["payment-request", orderId],
    queryFn: () => getPaymentReqFn({ data: { orderId } }),
    refetchInterval: (q) => ((q.state.data as any)?.request?.status === "paid" ? false : 6000),
  });
  const paymentReq: any = (prRes as any)?.request;

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const paid = order.payment_status === "confirmed";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center gap-3 px-4">
          <Link to="/" className="text-xl font-bold">Only</Link>
          <span className="text-muted-foreground">/</span>
          <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="font-semibold hover:underline">
            Дэлгүүр
          </Link>
        </div>
      </header>

      <div className="container mx-auto max-w-2xl px-4 py-10">
        <Card className="rounded-2xl p-8 text-center">
          {paid ? (
            <CheckCircle2 className="mx-auto mb-3 h-16 w-16 text-emerald-500" />
          ) : (
            <Clock className="mx-auto mb-3 h-16 w-16 text-amber-500" />
          )}
          <h1 className="text-2xl font-bold">
            {paid ? "Төлбөр баталгаажлаа" : "Төлбөр хүлээгдэж байна"}
          </h1>
          <p className="mt-2 text-muted-foreground">Захиалгын дугаар: <span className="font-mono font-semibold text-foreground">{order.external_ref ?? order.id.slice(0, 8)}</span></p>

          <div className="mt-6 flex justify-center gap-2">
            <Badge variant="outline" className={STATUS_TONE[order.status] ?? ""}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
            <Badge variant="outline" className={paid ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-amber-500/15 text-amber-600 border-amber-500/30"}>
              {PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}
            </Badge>
          </div>

          <div className="mt-6 text-3xl font-bold">{fmtMnt(Number(order.total))}</div>

          {!paid && order.payment_method === "qpay" && orderDetail?.qpay_invoice_id && !order.payment_error && (
            <div className="mt-6 space-y-4">
              {(orderDetail.qpay_qr_image || orderDetail.qpay_qr_text) && (
                <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-5">
                  {orderDetail.qpay_qr_image ? (
                    <img
                      src={
                        orderDetail.qpay_qr_image.startsWith("data:")
                          ? orderDetail.qpay_qr_image
                          : `data:image/png;base64,${orderDetail.qpay_qr_image}`
                      }
                      alt="QPay QR код"
                      className="h-56 w-56 rounded-lg bg-white p-2"
                    />
                  ) : (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(orderDetail.qpay_qr_text ?? "")}`}
                      alt="QPay QR код"
                      className="h-56 w-56 rounded-lg bg-white p-2"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    QPay апп эсвэл аль ч банкны апп-аар уншуулж төлбөрөө төлнө үү
                  </p>
                </div>
              )}

              {Array.isArray(orderDetail.qpay_urls) && orderDetail.qpay_urls.length > 0 && (
                <div>
                  <p className="mb-3 text-sm font-medium text-left">Банкны апп-аар төлөх</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {(orderDetail.qpay_urls as any[]).map((u, idx) => (
                      <a
                        key={idx}
                        href={u.link}
                        className="flex flex-col items-center gap-2 rounded-lg border bg-card p-3 text-xs hover:border-primary/50 hover:bg-accent/50"
                      >
                        {u.logo ? (
                          <img src={u.logo} alt={u.name ?? "bank"} className="h-10 w-10 rounded object-contain" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted" />
                        )}
                        <span className="line-clamp-1">{u.name ?? u.description ?? "Bank"}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {orderDetail.qpay_short_url && (
                <a
                  href={orderDetail.qpay_short_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-primary underline"
                >
                  QPay вэб хуудсаар нээх
                </a>
              )}

              <p className="text-xs text-muted-foreground">
                Төлбөр төлөгдмөгц энэ хуудас автоматаар шинэчлэгдэнэ.
              </p>
            </div>
          )}

          {!paid && paymentReq?.payment_provider === "bank_transfer" && paymentReq?.bank_account && (
            <div className="mt-6 rounded-xl border bg-card p-5 text-left text-sm">
              <div className="mb-3 flex items-center gap-2 font-semibold">
                <Banknote className="h-4 w-4 text-emerald-600" /> Банкаар төлөх
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Банк:</span><span className="font-medium">{paymentReq.bank_account.bank ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Дансны дугаар:</span><span className="font-mono font-semibold">{paymentReq.bank_account.account_number ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Хүлээн авагч:</span><span className="font-medium">{paymentReq.bank_account.account_name ?? "Only Hub"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Гүйлгээний утга:</span><span className="font-mono font-semibold">{order.external_ref ?? order.id.slice(0, 8)}</span></div>
              </div>
            </div>
          )}

          {!paid && order.payment_error && (
            <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-left text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" /> Төлбөр үүсгэхэд алдаа гарлаа
              </div>
              <p className="mt-2 text-destructive/90 break-words">{order.payment_error}</p>
            </div>
          )}

          {!paid && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Төлбөрийн төлөв шалгах
              </Button>
              {order.payment_method === "qpay" && (
                <Button
                  disabled={retrying}
                  onClick={async () => {
                    setRetrying(true);
                    try {
                      const r = await retryFn({ data: { orderId } });
                      if (r.ok) {
                        toast.success("QPay invoice дахин үүслээ");
                        refetch();
                      } else {
                        toast.error(r.error);
                        refetch();
                      }
                    } catch (e: any) {
                      toast.error(e?.message ?? "Алдаа гарлаа");
                    } finally {
                      setRetrying(false);
                    }
                  }}
                >
                  {retrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  QPay дахин оролдох
                </Button>
              )}
            </div>
          )}

          <div className="mt-8 flex justify-center gap-3">
            <Link to="/store/$merchantSlug" params={{ merchantSlug }}>
              <Button variant="secondary">Дэлгүүр рүү буцах</Button>
            </Link>
          </div>
        </Card>

        {paid && <DeliveryTrackingCard orderId={orderId} />}
      </div>
    </div>
  );
}

function DeliveryTrackingCard({ orderId }: { orderId: string }) {
  const historyFn = useServerFn(getDeliveryHistoryByOrder);
  const { data, refetch } = useQuery({
    queryKey: ["delivery-history", orderId],
    queryFn: () => historyFn({ data: { orderId } }),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`delivery-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_status_history" },
        () => refetch(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, refetch]);

  const dr: any = (data as any)?.deliveryRequest;
  const history = ((data as any)?.history ?? []) as any[];

  return (
    <Card className="mt-6 rounded-2xl p-6">
      <h2 className="text-lg font-semibold">Хүргэлтийн төлөв</h2>
      {!dr ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Хүргэлт үүсгэгдэхийг хүлээж байна...
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {dr.external_ref && (
            <p className="text-sm">
              Дугаар: <span className="font-mono font-semibold">{dr.external_ref}</span>
            </p>
          )}
          <DeliveryTimeline items={history} />
        </div>
      )}
    </Card>
  );
}
