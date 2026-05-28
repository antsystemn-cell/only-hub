import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2 } from "lucide-react";

const SETTING_KEYS = ["default_delivery_fee", "delivery_fee_rules", "default_commission_rate"] as const;

const getPlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", { _user_id: userId });
    if (!isAdmin) return { ok: false as const, error: "Эрх хүрэхгүй", settings: {} as Record<string, any> };
    const { data } = await supabaseAdmin
      .from("platform_settings")
      .select("key,value")
      .in("key", SETTING_KEYS as unknown as string[]);
    const settings: Record<string, any> = {};
    for (const r of data ?? []) settings[(r as any).key] = (r as any).value;
    return { ok: true as const, settings };
  });

const savePlatformSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      key: z.enum(SETTING_KEYS as unknown as [string, ...string[]]),
      value: z.any(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", { _user_id: userId });
    if (!isAdmin) return { ok: false as const, error: "Эрх хүрэхгүй" };
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ key: data.key, value: data.value, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Платформ тохиргоо — Admin" }] }),
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const getFn = useServerFn(getPlatformSettings);
  const saveFn = useServerFn(savePlatformSetting);
  const { data, refetch } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => getFn({ data: {} as any }),
  });

  const settings = (data?.ok ? data.settings : {}) as Record<string, any>;

  const [flat, setFlat] = useState<string>("5000");
  const [freeOver, setFreeOver] = useState<string>("0");
  const [commission, setCommission] = useState<string>("3");

  useEffect(() => {
    const rules = settings.delivery_fee_rules ?? {};
    setFlat(String(rules.flat ?? settings.default_delivery_fee ?? 5000));
    setFreeOver(String(rules.free_over ?? 0));
    setCommission(String(settings.default_commission_rate ?? 3));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      await saveFn({
        data: {
          key: "delivery_fee_rules",
          value: { flat: Number(flat) || 0, free_over: Number(freeOver) || 0 },
        },
      });
      await saveFn({
        data: { key: "default_delivery_fee", value: Number(flat) || 0 },
      });
      await saveFn({
        data: { key: "default_commission_rate", value: Number(commission) || 0 },
      });
    },
    onSuccess: () => { toast.success("Хадгалагдлаа"); refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-8">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Платформын тохиргоо</h1>
          <p className="text-sm text-muted-foreground">Хүргэлтийн төлбөр, комисс</p>
        </div>
      </div>

      <Card className="mt-6 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Хүргэлтийн стандарт төлбөр</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Дэлгүүр өөрийн delivery option бүртгээгүй үед энэ хэрэглэгдэнэ.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label>Үндсэн төлбөр (₮)</Label>
            <Input type="number" value={flat} onChange={(e) => setFlat(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Үнэгүй хүргэлт босго (₮)</Label>
            <Input type="number" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">0 = идэвхгүй</p>
          </div>
        </div>
      </Card>

      <Card className="mt-4 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Үндсэн комисс (%)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Шинэ дэлгүүр үүсэхэд default commission rate.
        </p>
        <Input
          type="number"
          step="0.1"
          value={commission}
          onChange={(e) => setCommission(e.target.value)}
          className="mt-3 max-w-xs"
        />
      </Card>

      <div className="mt-6 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Хадгалж байна..." : "Хадгалах"}
        </Button>
      </div>
    </div>
  );
}
