import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listPlatformProviders,
  savePlatformProvider,
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
  Loader2, CheckCircle2, AlertCircle, XCircle, Upload,
} from "lucide-react";

export const Route = createFileRoute("/admin/payment-providers")({
  head: () => ({ meta: [{ title: "Платформын төлбөр — Admin" }] }),
  component: AdminPlatformProvidersPage,
});

type ProviderKey = "qpay" | "storepay" | "pocket" | "omniway" | "hipay";

const PROVIDER_FIELDS: Record<
  ProviderKey,
  { key: string; label: string; placeholder: string; secret?: boolean }[]
> = {
  qpay: [
    { key: "username", label: "QPAY_CLIENT_ID", placeholder: "ONLY_PLATFORM" },
    { key: "password", label: "QPAY_CLIENT_SECRET", placeholder: "••••••••", secret: true },
    { key: "invoice_code", label: "QPAY_INVOICE_CODE", placeholder: "ONLY_INVOICE" },
  ],
  storepay: [
    { key: "username", label: "App / Client ID", placeholder: "app username" },
    { key: "password", label: "App / Client SECRET", placeholder: "••••••••", secret: true },
    { key: "app_username", label: "Storepay USERNAME", placeholder: "platform username" },
    { key: "app_password", label: "Storepay PASSWORD", placeholder: "••••••••", secret: true },
    { key: "store_id", label: "Store ID", placeholder: "12345" },
  ],
  pocket: [
    { key: "client_id", label: "Pocket CLIENT_ID", placeholder: "client id" },
    { key: "client_secret", label: "Pocket CLIENT_SECRET", placeholder: "••••••••", secret: true },
    { key: "terminal_id", label: "Terminal ID", placeholder: "12345" },
  ],
  omniway: [
    { key: "username", label: "Omniway USERNAME", placeholder: "platform username" },
    { key: "password", label: "Omniway PASSWORD", placeholder: "••••••••", secret: true },
  ],
  hipay: [
    { key: "entity_id", label: "HiPay ENTITY_ID (Client ID)", placeholder: "entity id" },
    { key: "client_secret", label: "HiPay CLIENT_SECRET", placeholder: "••••••••", secret: true },
    { key: "base_url", label: "Base URL (заавал биш)", placeholder: "https://api.hipay.mn" },
  ],
};

function statusBadge(status: string, isActive: boolean) {
  if (!isActive) return <Badge variant="outline" className="gap-1"><XCircle className="h-3 w-3"/>Идэвхгүй</Badge>;
  if (status === "verified") return <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"><CheckCircle2 className="h-3 w-3"/>Идэвхтэй</Badge>;
  if (status === "failed") return <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive"><XCircle className="h-3 w-3"/>Холболт амжилтгүй</Badge>;
  return <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700"><AlertCircle className="h-3 w-3"/>Тохиргоо дутуу</Badge>;
}

function AdminPlatformProvidersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPlatformProviders);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-platform-providers"],
    queryFn: () => listFn({ data: {} }),
  });

  if (isLoading || !data) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Уншиж байна...
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 md:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Платформын төлбөрийн системүүд</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Манай платформын гэрээт төлбөрийн системүүдийн API мэдээлэл, зураг.
          Мерчантууд өөрсдийн API-аа холбоогүй үед эдгээр данс руу төлбөр шилжих
          сонголтыг ашигладаг.
        </p>
      </div>

      <div className="grid gap-4">
        {data.providers
          .filter((p) => p.providerType !== "cash")
          .map((p) => (
            <ProviderCard
              key={p.providerType}
              provider={p}
              onChanged={() => qc.invalidateQueries({ queryKey: ["admin-platform-providers"] })}
            />
          ))}
      </div>
    </div>
  );
}

type ProviderRow = NonNullable<
  Awaited<ReturnType<typeof listPlatformProviders>>["providers"][number]
>;

function ProviderCard({ provider, onChanged }: { provider: ProviderRow; onChanged: () => void }) {
  const fields = PROVIDER_FIELDS[provider.providerType as ProviderKey] ?? [];
  const [isActive, setIsActive] = useState(provider.isActive);
  const [icon, setIcon] = useState(provider.icon ?? "");
  const [uploading, setUploading] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, ""])),
  );

  useEffect(() => {
    setIsActive(provider.isActive);
    setIcon(provider.icon ?? "");
  }, [provider.isActive, provider.icon]);

  const saveFn = useServerFn(savePlatformProvider);
  const testFn = useServerFn(testMerchantProvider);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          providerType: provider.providerType as ProviderKey,
          isActive,
          icon: icon.trim() || undefined,
          credentials: values,
        },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(r.message ?? "Хадгалагдлаа");
        setValues(Object.fromEntries(fields.map((f) => [f.key, ""])));
        onChanged();
      } else {
        toast.error(r.message ?? "Алдаа");
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

  async function handleIconFile(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `platform/payment-icons/${provider.providerType}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("merchant-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("merchant-logos").getPublicUrl(path);
      setIcon(pub.publicUrl);
      toast.success("Icon байршуулагдлаа. Хадгалах товчийг дарна уу.");
    } catch (e: any) {
      toast.error(e?.message ?? "Байршуулах алдаа");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          {icon && /^https?:\/\//i.test(icon) ? (
            <img src={icon} alt={provider.name} className="h-8 w-8 rounded object-contain" />
          ) : (
            <span className="text-2xl">{icon || provider.icon}</span>
          )}
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

      <div className="mb-4">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Icon (төлбөр төлөх хэсэгт харагдах лого)
        </Label>
        <div className="mt-1 flex items-center gap-2">
          {icon && /^https?:\/\//i.test(icon) ? (
            <img src={icon} alt="icon" className="h-10 w-10 rounded border bg-white object-contain p-1" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded border text-xl">
              {icon || "💳"}
            </span>
          )}
          <Input
            className="flex-1"
            placeholder="💳 emoji эсвэл https://logo.png"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
          />
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleIconFile(f);
                e.target.value = "";
              }}
            />
            <span className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </span>
          </label>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Энэ зураг бүх мерчантын checkout хэсэгт энэ төлбөрийн системийн лого болж харагдана.
        </p>
      </div>

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
