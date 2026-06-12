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
  setMerchantPlatformFallback,
} from "@/lib/payments/providers.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, AlertCircle, XCircle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/merchant/dashboard/payments")({
  component: PaymentsSettingsPage,
});

type ProviderKey = "qpay" | "storepay" | "pocket" | "omniway";

const PROVIDER_FIELDS: Record<
  ProviderKey,
  { key: string; label: string; placeholder: string; secret?: boolean; helper?: string }[]
> = {
  qpay: [
    { key: "username", label: "QPAY_CLIENT_ID", placeholder: "ONLY_MERCHANT" },
    { key: "password", label: "QPAY_CLIENT_SECRET", placeholder: "••••••••", secret: true },
    { key: "invoice_code", label: "QPAY_INVOICE_CODE", placeholder: "ONLY_MERCHANT_INVOICE" },
  ],
  storepay: [
    { key: "username", label: "Storepay USERNAME", placeholder: "merchant username" },
    { key: "password", label: "Storepay PASSWORD", placeholder: "••••••••", secret: true },
    { key: "app_username", label: "App / Client ID", placeholder: "app username" },
    { key: "app_password", label: "App / Client SECRET", placeholder: "••••••••", secret: true },
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
};

function statusBadge(status: string, isActive: boolean) {
  if (!isActive) {
    return (
      <Badge variant="outline" className="gap-1">
        <XCircle className="h-3 w-3" /> Идэвхгүй
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

  const fallbackFn = useServerFn(setMerchantPlatformFallback);
  const toggleFallback = useMutation({
    mutationFn: (enabled: boolean) =>
      fallbackFn({ data: { merchantId: primaryMerchantId!, enabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchant-providers", primaryMerchantId] });
      toast.success("Хадгалагдлаа");
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа гарлаа"),
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
          Та өөрийн дэлгүүрийн төлбөрийн системүүдийн API мэдээллийг энд оруулна. Зөвхөн амжилттай
          холболтоо хийсэн систем тань худалдан авагч-ийн төлбөрийн хуудаст харагдана.
        </p>
      </div>

      <Card className="rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <div className="font-semibold">Платформын нөөц төлбөрийн систем</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Хэрэв та QPay/Storepay/Pocket/Omniway-тэй өөрөө гэрээ хийгээгүй бол манай
                платформын үндсэн гэрээт төлбөрийн системээр түр ашиглаж болно. Тооцоо: нийт орлогоос
                комисс хасагдсаны дараа таны дансанд шилжүүлэгдэнэ.
              </p>
            </div>
          </div>
          <Switch
            checked={data.merchant.usePlatformFallback}
            onCheckedChange={(v) => toggleFallback.mutate(!!v)}
            disabled={toggleFallback.isPending}
          />
        </div>
        {data.merchant.usePlatformFallback && data.platformAvailableTypes.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Боломжтой: {data.platformAvailableTypes.join(", ")}
          </p>
        )}
      </Card>

      <div className="grid gap-4">
        {data.providers.map((p) => (
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
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, ""])),
  );

  // Reset values when server data refreshes.
  useEffect(() => {
    setIsActive(provider.isActive);
  }, [provider.isActive]);

  const saveFn = useServerFn(saveMerchantProvider);
  const testFn = useServerFn(testMerchantProvider);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          merchantId,
          providerType: provider.providerType as ProviderKey,
          isActive,
          credentials: values,
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
          <span className="text-2xl">{provider.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{provider.name}</span>
              {statusBadge(provider.configStatus, provider.isActive)}
            </div>
            <p className="text-sm text-muted-foreground">{provider.description}</p>
            {provider.lastTestedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Сүүлд амжилттай туршсан: {new Date(provider.lastTestedAt).toLocaleString("mn-MN")}
              </p>
            )}
            {provider.configStatus === "failed" && provider.testMessage && (
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
        Аль нэг талбарыг хоосон үлдээвэл өмнө хадгалагдсан утга нь хадгалагдсаар үлдэнэ. Нууц
        утгуудыг бид зөвхөн серверт хадгалдаг — энэ хуудсанд буцааж харуулагдахгүй.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Хадгалах
        </Button>
        <Button
          variant="outline"
          onClick={() => test.mutate()}
          disabled={test.isPending || !provider.id}
        >
          {test.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Холболт шалгах
        </Button>
      </div>
    </Card>
  );
}
