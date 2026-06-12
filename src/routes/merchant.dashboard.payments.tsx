import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  listMerchantProviders,
  saveMerchantProvider,
  testMerchantProvider,
} from "@/lib/payments/providers.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, CheckCircle2, AlertCircle, XCircle, ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/merchant/dashboard/payments")({
  component: PaymentsSettingsPage,
});

type ProviderKey = "qpay" | "storepay" | "pocket" | "omniway" | "hipay";

const PROVIDER_FIELDS: Record<
  ProviderKey,
  { key: string; label: string; placeholder: string; secret?: boolean }[]
> = {
  qpay: [
    { key: "username", label: "QPAY_CLIENT_ID", placeholder: "ONLY_MERCHANT" },
    { key: "password", label: "QPAY_CLIENT_SECRET", placeholder: "••••••••", secret: true },
    { key: "invoice_code", label: "QPAY_INVOICE_CODE", placeholder: "ONLY_MERCHANT_INVOICE" },
  ],
  storepay: [
    { key: "username", label: "App / Client ID", placeholder: "app username" },
    { key: "password", label: "App / Client SECRET", placeholder: "••••••••", secret: true },
    { key: "app_username", label: "Storepay USERNAME", placeholder: "merchant username" },
    { key: "app_password", label: "Storepay PASSWORD", placeholder: "••••••••", secret: true },
    { key: "store_id", label: "Store ID", placeholder: "12345" },
  ],
  pocket: [
    { key: "client_id", label: "Pocket CLIENT_ID", placeholder: "client id" },
    { key: "client_secret", label: "Pocket CLIENT_SECRET", placeholder: "••••••••", secret: true },
    { key: "terminal_id", label: "Terminal ID", placeholder: "12345" },
  ],
  omniway: [
    { key: "username", label: "Omniway USERNAME", placeholder: "merchant username" },
    { key: "password", label: "Omniway PASSWORD", placeholder: "••••••••", secret: true },
  ],
  hipay: [
    { key: "entity_id", label: "HiPay ENTITY_ID (Client ID)", placeholder: "entity id" },
    { key: "client_secret", label: "HiPay CLIENT_SECRET", placeholder: "••••••••", secret: true },
    { key: "base_url", label: "Base URL (заавал биш)", placeholder: "https://api.hipay.mn" },
  ],
};

function statusBadge(status: string, isActive: boolean, useFallback: boolean) {
  if (!isActive) {
    return (
      <Badge variant="outline" className="gap-1">
        <XCircle className="h-3 w-3" /> Идэвхгүй
      </Badge>
    );
  }
  if (useFallback) {
    return (
      <Badge className="gap-1 bg-sky-500/15 text-sky-700 border border-sky-500/30 hover:bg-sky-500/20">
        <ShieldCheck className="h-3 w-3" /> Платформын нөөц
      </Badge>
    );
  }
  if (status === "verified") {
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" /> Идэвхтэй
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
        <XCircle className="h-3 w-3" /> Холболт амжилтгүй
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700">
      <AlertCircle className="h-3 w-3" /> Тохиргоо дутуу
    </Badge>
  );
}

function PaymentsSettingsPage() {
  const { primaryMerchantId } = useAuth();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMerchantProviders);

  const { data, isLoading } = useQuery({
    queryKey: ["merchant-providers", primaryMerchantId],
    enabled: !!primaryMerchantId,
    queryFn: () => listFn({ data: { merchantId: primaryMerchantId! } }),
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Уншиж байна...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Төлбөрийн тохиргоо</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Төлбөрийн систем бүр дээр өөрийн API-аа холбох эсвэл платформын нөөц
          төлбөрийн системийг ашиглахаа сонгоно. Зөвхөн идэвхтэй болгосон систем
          худалдан авагч-ийн төлбөрийн хуудаст харагдана.
        </p>
      </div>

      <div className="grid gap-4">
        {data.providers
          .filter((p) => p.providerType !== "cash")
          .map((p) => (
            <ProviderCard
              key={p.providerType}
              merchantId={primaryMerchantId!}
              provider={p}
              onChanged={() =>
                queryClient.invalidateQueries({ queryKey: ["merchant-providers", primaryMerchantId] })
              }
            />
          ))}
      </div>
    </div>
  );
}

type ProviderRow = NonNullable<
  Awaited<ReturnType<typeof listMerchantProviders>>["providers"][number]
>;

function ProviderCard({
  merchantId,
  provider,
  onChanged,
}: {
  merchantId: string;
  provider: ProviderRow;
  onChanged: () => void;
}) {
  const fields = PROVIDER_FIELDS[provider.providerType as ProviderKey] ?? [];
  const [isActive, setIsActive] = useState(provider.isActive);
  const [mode, setMode] = useState<"own" | "platform">(
    provider.usePlatformFallback ? "platform" : "own",
  );
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, ""])),
  );

  useEffect(() => {
    setIsActive(provider.isActive);
    setMode(provider.usePlatformFallback ? "platform" : "own");
  }, [provider.isActive, provider.usePlatformFallback]);

  const saveFn = useServerFn(saveMerchantProvider);
  const testFn = useServerFn(testMerchantProvider);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          merchantId,
          providerType: provider.providerType as ProviderKey,
          isActive,
          usePlatformFallback: mode === "platform",
          credentials: mode === "own" ? values : {},
        },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(r.message ?? "Хадгалагдлаа");
        setValues(Object.fromEntries(fields.map((f) => [f.key, ""])));
        onChanged();
      } else {
        toast.error(r.message ?? "Хадгалахад алдаа");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Сүлжээний алдаа"),
  });

  const test = useMutation({
    mutationFn: () => {
      if (!provider.id) throw new Error("Эхлээд хадгална уу");
      return testFn({ data: { providerId: provider.id } });
    },
    onSuccess: (r) => {
      if (r.ok) toast.success(r.message ?? "Холболт амжилттай");
      else toast.error(r.message ?? "Холболт амжилтгүй");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Туршихад алдаа"),
  });

  return (
    <Card className="rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          {provider.icon && /^https?:\/\//i.test(provider.icon) ? (
            <img src={provider.icon} alt={provider.name} className="h-8 w-8 rounded object-contain" />
          ) : (
            <span className="text-2xl">{provider.icon}</span>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{provider.name}</span>
              {statusBadge(provider.configStatus, provider.isActive, mode === "platform")}
            </div>
            <p className="text-sm text-muted-foreground">{provider.description}</p>
            {provider.lastTestedAt && mode === "own" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Сүүлд амжилттай туршсан: {new Date(provider.lastTestedAt).toLocaleString("mn-MN")}
              </p>
            )}
            {provider.configStatus === "failed" && provider.testMessage && mode === "own" && (
              <p className="mt-1 text-xs text-destructive">{provider.testMessage}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-sm">Идэвхтэй</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>

      <Separator className="my-4" />

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("own")}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            mode === "own"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-muted"
          }`}
        >
          Өөрийн API холбох
        </button>
        <button
          type="button"
          onClick={() => setMode("platform")}
          disabled={!provider.platformFallbackAvailable}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === "platform"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-muted"
          }`}
        >
          Платформын нөөцийг ашиглах
          {!provider.platformFallbackAvailable && " (боломжгүй)"}
        </button>
      </div>

      {mode === "platform" ? (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-sky-600" />
            <div className="text-sm">
              <div className="font-semibold">Платформын нөөц төлбөрийн систем</div>
              <p className="mt-1 text-muted-foreground">
                Манай платформын гэрээт {provider.name} данс ашиглагдана.
                <br />
                <span className="font-medium text-foreground">Тооцоо:</span> нийт орлогоос
                комисс хасагдсаны дараа таны дансанд шилжүүлэгдэнэ.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key}>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{f.label}</Label>
                <Input
                  type={f.secret ? "password" : "text"}
                  placeholder={
                    provider.credentialsMasked[f.key]
                      ? `Хадгалагдсан: ${provider.credentialsMasked[f.key]}`
                      : f.placeholder
                  }
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Аль нэг талбарыг хоосон үлдээвэл өмнө хадгалагдсан утга нь хадгалагдсаар үлдэнэ.
            Нууц утгуудыг бид зөвхөн серверт хадгалдаг — энэ хуудсанд буцааж харуулагдахгүй.
          </p>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Хадгалах
        </Button>
        {mode === "own" && (
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={test.isPending || !provider.id}
          >
            {test.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Холболт шалгах
          </Button>
        )}
      </div>
    </Card>
  );
}
