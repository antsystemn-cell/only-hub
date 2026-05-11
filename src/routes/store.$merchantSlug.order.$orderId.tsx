import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMnt, PAYMENT_STATUS_LABELS, STATUS_LABELS, STATUS_TONE } from "@/lib/format";
import { getOrderStatus } from "@/lib/orders.functions";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";

export const Route = createFileRoute("/store/$merchantSlug/order/$orderId")({
  component: OrderConfirmationPage,
});

function OrderConfirmationPage() {
  const { merchantSlug, orderId } = Route.useParams();
  const getStatusFn = useServerFn(getOrderStatus);

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

          {!paid && order.payment_method === "qpay" && orderDetail?.qpay_invoice_id && (
            <div className="mt-6 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              QPay-р төлбөр төлж дуусмагц энэ хуудас автоматаар шинэчлэгдэнэ.
              <div className="mt-2 font-mono text-xs">Invoice: {orderDetail.qpay_invoice_id}</div>
            </div>
          )}

          {!paid && (
            <Button className="mt-6" variant="outline" onClick={() => refetch()}>
              Төлбөрийн төлөв шалгах
            </Button>
          )}

          <div className="mt-8 flex justify-center gap-3">
            <Link to="/store/$merchantSlug" params={{ merchantSlug }}>
              <Button variant="secondary">Дэлгүүр рүү буцах</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
