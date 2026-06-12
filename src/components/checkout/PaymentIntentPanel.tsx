import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Smartphone } from "lucide-react";
import { createPaymentIntent, checkPaymentIntent } from "@/lib/payments/payment-intents.functions";

type Props = {
  orderId: string;
  providerType: "storepay" | "pocket" | "omniway";
  providerLabel: string;
  defaultPhone?: string | null;
};

export function PaymentIntentPanel({ orderId, providerType, providerLabel, defaultPhone }: Props) {
  const qc = useQueryClient();
  const createFn = useServerFn(createPaymentIntent);
  const checkFn = useServerFn(checkPaymentIntent);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<any>(null);
  const [phoneSubmitted, setPhoneSubmitted] = useState(providerType !== "storepay");

  // For pocket / omniway, auto-create on mount.
  useEffect(() => {
    if (providerType === "storepay") return;
    if (intent) return;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start(p?: string) {
    setBusy(true);
    try {
      const r: any = await createFn({
        data: { orderId, providerType, phone: p ?? phone ?? null },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setIntent(r.intent);
    } catch (e: any) {
      toast.error(e?.message ?? "Алдаа");
    } finally {
      setBusy(false);
    }
  }

  // Poll status
  useQuery({
    queryKey: ["payment-intent-check", intent?.id],
    enabled: !!intent?.id && intent?.status !== "paid",
    refetchInterval: 4000,
    queryFn: async () => {
      const r: any = await checkFn({ data: { intentId: intent.id } });
      if (r.ok && r.status === "paid") {
        toast.success("Төлбөр баталгаажлаа");
        qc.invalidateQueries({ queryKey: ["order-status", orderId] });
      }
      if (r.ok) setIntent((prev: any) => prev ? { ...prev, status: r.status } : prev);
      return r;
    },
  });

  if (providerType === "storepay" && !phoneSubmitted) {
    return (
      <div className="mt-6 space-y-3 rounded-xl border bg-card p-5 text-left">
        <div className="flex items-center gap-2 font-semibold">
          <Smartphone className="h-4 w-4" /> Storepay — утасны дугаар
        </div>
        <p className="text-xs text-muted-foreground">
          Storepay апп-д бүртгэлтэй 8 оронтой утасны дугаараа оруулна уу.
        </p>
        <div>
          <Label className="text-xs">Утас</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="9911...."
            maxLength={8}
          />
        </div>
        <Button
          disabled={busy || phone.length !== 8}
          onClick={async () => { await start(phone); setPhoneSubmitted(true); }}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Storepay-р төлөх хүсэлт илгээх
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {busy && !intent && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {providerLabel} нэхэмжлэл үүсгэж байна...
        </div>
      )}

      {intent && (intent.qrImage || intent.qrText) && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-5">
          {intent.qrImage ? (
            <img
              src={intent.qrImage}
              alt={`${providerLabel} QR`}
              className="h-56 w-56 rounded-lg bg-white p-2"
            />
          ) : (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(intent.qrText)}`}
              alt={`${providerLabel} QR`}
              className="h-56 w-56 rounded-lg bg-white p-2"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {providerLabel} апп эсвэл аль ч банкны апп-аар уншуулж төлбөрөө төлнө үү
          </p>
        </div>
      )}

      {intent?.deeplink && (
        <a
          href={intent.deeplink}
          className="inline-block text-sm text-primary underline"
        >
          {providerLabel} апп-аар нээх
        </a>
      )}

      {intent && providerType === "storepay" && (
        <p className="text-sm text-muted-foreground">
          Storepay апп-даа ороод хүсэлтээ батлана уу. Төлбөр баталгаажмагц энэ хуудас шинэчлэгдэнэ.
        </p>
      )}

      {intent && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void start()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Дахин үүсгэх
        </Button>
      )}
    </div>
  );
}
