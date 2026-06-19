import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe2, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { getOrderForeignTracking } from "@/lib/foreign-orders/tracking.functions";

const STEPS: { key: string; label: string }[] = [
  { key: "WAITING_SOURCE_PURCHASE", label: "Эх сурвалжаас худалдан авах" },
  { key: "SOURCE_PURCHASED", label: "Худалдаж авсан" },
  { key: "KOREA_WAREHOUSE_RECEIVED", label: "Солонгос агуулахад ирсэн" },
  { key: "INTERNATIONAL_TRANSIT", label: "Олон улсын тээвэрт" },
  { key: "UB_ARRIVED", label: "УБ-д ирсэн" },
  { key: "DELIVERY_ASSIGNED", label: "Хүргэлтэд гарсан" },
  { key: "DELIVERED", label: "Хүргэгдсэн" },
];

function stepIndex(status: string): number {
  const i = STEPS.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

export function ForeignOrderTrackingCard({ orderId }: { orderId: string }) {
  const fn = useServerFn(getOrderForeignTracking);
  const { data, refetch } = useQuery({
    queryKey: ["foreign-tracking", orderId],
    queryFn: () => fn({ data: { orderId } }),
    refetchInterval: 30000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`foreign-queue-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "source_purchase_queue", filter: `order_id=eq.${orderId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId, refetch]);

  if (!data?.hasForeign) return null;
  const items = data.items;
  const estimates = data.estimates;

  return (
    <Card className="mt-6 overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 border-b border-indigo-100 bg-gradient-to-r from-indigo-500/10 to-white px-4 py-3">
        <Globe2 className="h-5 w-5 text-indigo-600" />
        <div>
          <h2 className="text-base font-semibold text-indigo-900">Гадаад захиалгын явц</h2>
          <p className="text-xs text-muted-foreground">
            Эх сурвалжаас худалдан авч, Солонгосын агуулахаар дамжуулан Монгол руу хүргэгдэнэ.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {estimates.length > 0 && (
          <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            Ойролцоох хүргэлтийн хугацаа:{" "}
            <b>
              {Math.min(...estimates.map((e) => e.deliveryMinDays ?? e.deliveryMaxDays ?? 14))}-
              {Math.max(...estimates.map((e) => e.deliveryMaxDays ?? e.deliveryMinDays ?? 14))} өдөр
            </b>{" "}
            (төлбөр баталгаажсанаас хойш)
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Төлбөр баталгаажсаны дараа эх сурвалжаас худалдан авах процесс эхэлнэ.
          </p>
        ) : (
          items.map((it: any, idx: number) => {
            const current = stepIndex(it.status);
            return (
              <div key={it.id} className="rounded-lg border border-border bg-card p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium">
                    Бараа #{idx + 1}
                    {it.selected_size_label ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({it.selected_size_label})
                      </span>
                    ) : null}
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {it.source}
                  </Badge>
                </div>
                <ol className="space-y-2">
                  {STEPS.map((s, i) => {
                    const done = i < current;
                    const active = i === current;
                    return (
                      <li key={s.key} className="flex items-center gap-2 text-sm">
                        {done ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        ) : active ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                        )}
                        <span
                          className={
                            active
                              ? "font-semibold text-indigo-900"
                              : done
                                ? "text-foreground"
                                : "text-muted-foreground"
                          }
                        >
                          {s.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
