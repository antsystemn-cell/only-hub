import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  Phone,
  RefreshCw,
  Truck,
} from "lucide-react";
import { fmtMnt } from "@/lib/format";
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_TONE,
} from "@/lib/delivery/delivery.types";
import { DeliveryTimeline } from "@/components/DeliveryTimeline";
import {
  getPublicOrderByTokenFn,
  createPublicPaymentIntentFn,
} from "@/lib/tracking/tracking.functions";
import { checkPaymentIntent } from "@/lib/payments/payment-intents.functions";

export const Route = createFileRoute("/track/$token")({
  head: () => ({
    meta: [
      { title: "Захиалга хянах — Only Hub" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Захиалга хүргэлтийн төлөв, төлбөр." },
    ],
  }),
  component: TrackPage,
});

type ProviderType = "qpay" | "storepay" | "pocket" | "omniway";

function TrackPage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const fetchFn = useServerFn(getPublicOrderByTokenFn);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["public-track", token],
    queryFn: () => fetchFn({ data: { token } }),
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorScreen title="Алдаа гарлаа" body="Дахин оролдоно уу." />;
  }

  if (!data.ok) {
    if (data.reason === "expired") {
      return (
        <ErrorScreen
          title="Хугацаа дууссан"
          body="Энэхүү холбоосын хүчинтэй хугацаа дууссан байна."
        />
      );
    }
    if (data.reason === "disabled") {
      return (
        <ErrorScreen
          title="Холбоос идэвхгүй"
          body="Энэхүү холбоос идэвхгүй болсон байна. Дэлгүүртэйгээ холбогдоно уу."
        />
      );
    }
    return (
      <ErrorScreen
        title="Захиалга олдсонгүй"
        body="Холбоос буруу эсвэл устгагдсан байна."
      />
    );
  }

  const v = data.data;
  const isPaid = v.order.payment_status === "confirmed";
  const isDelivered = v.delivery?.status === "delivered";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center gap-3">
          {v.merchant.logo ? (
            <img
              src={v.merchant.logo}
              alt={v.merchant.name}
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded bg-muted grid place-items-center">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{v.merchant.name}</p>
            <p className="text-xs text-muted-foreground">
              Захиалга #{v.order.external_ref ?? v.order.id.slice(0, 8)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Шинэчлэх">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        {/* Status banner */}
        {isPaid ? (
          <Card className="p-4 bg-emerald-50 border-emerald-200 text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-semibold">Төлбөр төлөгдсөн</p>
            </div>
            {v.order.paid_at && (
              <p className="mt-1 text-xs">
                {new Date(v.order.paid_at).toLocaleString("mn-MN")}
              </p>
            )}
          </Card>
        ) : isDelivered ? (
          <Card className="p-4 bg-amber-50 border-amber-200 text-amber-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              <p className="font-semibold">Төлбөр хүлээгдэж байна</p>
            </div>
            <p className="mt-1 text-sm">
              Та доорх товчийг ашиглан төлбөрөө төлнө үү.
            </p>
          </Card>
        ) : null}

        {/* Delivery status */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Хүргэлтийн төлөв</p>
            <Badge
              variant="outline"
              className={
                DELIVERY_STATUS_TONE[
                  (v.delivery?.status as keyof typeof DELIVERY_STATUS_TONE) ?? "pending"
                ]
              }
            >
              {
                DELIVERY_STATUS_LABELS[
                  (v.delivery?.status as keyof typeof DELIVERY_STATUS_LABELS) ?? "pending"
                ]
              }
            </Badge>
          </div>
          {v.delivery?.external_ref && (
            <p className="text-xs text-muted-foreground">
              Хяналтын код: <span className="font-mono">{v.delivery.external_ref}</span>
            </p>
          )}
          <DeliveryTimeline
            items={
              v.timeline.length
                ? v.timeline
                : [
                    {
                      id: "ord",
                      status: "requested",
                      note: null,
                      created_at: v.order.created_at,
                    },
                  ]
            }
          />
        </Card>

        {/* Driver */}
        {v.driver && (v.driver.name || v.driver.phone) && (
          <Card className="p-4 space-y-2">
            <p className="font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4" /> Жолооч
            </p>
            {v.driver.name && <p className="text-sm">{v.driver.name}</p>}
            {v.driver.vehicle && (
              <p className="text-xs text-muted-foreground">{v.driver.vehicle}</p>
            )}
            {v.driver.phone && (
              <a href={`tel:${v.driver.phone}`}>
                <Button variant="outline" size="sm" className="w-full">
                  <Phone className="h-4 w-4 mr-2" /> {v.driver.phone}
                </Button>
              </a>
            )}
          </Card>
        )}

        {/* Order summary */}
        <Card className="p-4 space-y-3">
          <p className="font-semibold">Захиалгын дэлгэрэнгүй</p>
          <div className="space-y-2">
            {v.order.items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-3 text-sm">
                {it.image ? (
                  <img
                    src={it.image}
                    alt={it.name}
                    className="h-12 w-12 rounded object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate">{it.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.qty} × {fmtMnt(it.price)}
                  </p>
                </div>
                <p className="font-medium">{fmtMnt(it.qty * it.price)}</p>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Барааны дүн</span>
              <span>{fmtMnt(v.order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Хүргэлт</span>
              <span>{fmtMnt(v.order.delivery_fee)}</span>
            </div>
            <div className="flex justify-between font-semibold pt-1">
              <span>Нийт</span>
              <span>{fmtMnt(v.order.total)}</span>
            </div>
          </div>
          {v.order.shipping_address && (
            <p className="text-xs text-muted-foreground">
              Хүргэх хаяг: {v.order.shipping_address}
            </p>
          )}
        </Card>

        {/* Payment */}
        {!isPaid && (
          <PaymentSection
            token={token}
            amount={v.order.total}
            currentPhone={v.order.phone ?? ""}
            onPaid={() => qc.invalidateQueries({ queryKey: ["public-track", token] })}
          />
        )}

        <p className="text-center text-xs text-muted-foreground">
          Сүүлд шинэчилсэн: {new Date(v.refreshed_at).toLocaleString("mn-MN")}
        </p>
      </main>
    </div>
  );
}

function ErrorScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <Card className="p-8 max-w-md w-full text-center space-y-3">
        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </Card>
    </div>
  );
}

const PROVIDERS: Array<{ id: ProviderType; label: string }> = [
  { id: "qpay", label: "QPay" },
  { id: "storepay", label: "Storepay" },
  { id: "pocket", label: "Pocket" },
  { id: "omniway", label: "Omniway" },
];

function PaymentSection({
  token,
  amount,
  currentPhone,
  onPaid,
}: {
  token: string;
  amount: number;
  currentPhone: string;
  onPaid: () => void;
}) {
  const createFn = useServerFn(createPublicPaymentIntentFn);
  const checkFn = useServerFn(checkPaymentIntent);
  const [provider, setProvider] = useState<ProviderType | null>(null);
  const [phone, setPhone] = useState(currentPhone);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<any>(null);

  async function startPayment(p: ProviderType) {
    setProvider(p);
    setBusy(true);
    setIntent(null);
    try {
      const r: any = await createFn({
        data: { token, providerType: p, phone: phone || null },
      });
      if (!r.ok) {
        toast.error(r.error ?? "Алдаа");
        return;
      }
      setIntent(r.intent);
    } catch (e: any) {
      toast.error(e?.message ?? "Алдаа");
    } finally {
      setBusy(false);
    }
  }

  // Poll
  useQuery({
    queryKey: ["public-intent", intent?.id],
    enabled: !!intent?.id && intent?.status !== "paid",
    refetchInterval: 4000,
    queryFn: async () => {
      const r: any = await checkFn({ data: { intentId: intent.id } });
      if (r.ok && r.status === "paid") {
        toast.success("Төлбөр төлөгдлөө");
        onPaid();
        setIntent({ ...intent, status: "paid" });
      }
      return r;
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Төлбөр төлөх</p>
        <p className="text-sm font-semibold">{fmtMnt(amount)}</p>
      </div>

      {!provider && (
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              onClick={() => startPayment(p.id)}
              disabled={busy}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}

      {provider && busy && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {provider && intent && (
        <div className="space-y-3">
          <p className="text-sm">
            Төлбөрийн арга: <span className="font-semibold">{provider.toUpperCase()}</span>
          </p>
          {provider === "storepay" && !intent.invoiceId && (
            <div className="space-y-2">
              <Label>Утасны дугаар</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9999...."
              />
              <Button onClick={() => startPayment("storepay")} disabled={busy}>
                Үргэлжлүүлэх
              </Button>
            </div>
          )}
          {intent.qrImage && (
            <div className="grid place-items-center">
              <img
                src={
                  intent.qrImage.startsWith("data:")
                    ? intent.qrImage
                    : `data:image/png;base64,${intent.qrImage}`
                }
                alt="QR"
                className="h-48 w-48"
              />
            </div>
          )}
          {Array.isArray(intent.urls) && intent.urls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {intent.urls.map((u: any, i: number) => (
                <a
                  key={i}
                  href={u.link ?? u.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline"
                >
                  {u.name ?? u.description ?? `Холбоос ${i + 1}`}
                </a>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Төлбөр баталгаажихыг хүлээж байна…
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIntent(null);
              setProvider(null);
            }}
          >
            Өөр арга сонгох
          </Button>
        </div>
      )}
    </Card>
  );
}

// Keep TS from complaining if helpers are unused in some build paths
useEffect;
notFound;
