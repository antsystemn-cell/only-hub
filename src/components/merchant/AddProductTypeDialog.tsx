import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, Globe2, ShoppingBag, Sparkles } from "lucide-react";
import { FOREIGN_SOURCES } from "@/lib/foreign-orders/sources";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type ForeignSource = Database["public"]["Enums"]["foreign_source"];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  merchantId: string;
  onPickReadyStock: () => void;
  onPickForeignSource: (source: ForeignSource) => void;
};

export function AddProductTypeDialog({
  open, onOpenChange, merchantId, onPickReadyStock, onPickForeignSource,
}: Props) {
  const [step, setStep] = useState<"type" | "source">("type");

  const { data: merchant } = useQuery({
    queryKey: ["merchant-foreign-perm", merchantId],
    enabled: !!merchantId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchants")
        .select("can_create_foreign_order_products, allowed_foreign_sources")
        .eq("id", merchantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const canForeign = !!merchant?.can_create_foreign_order_products;
  const allowed: ForeignSource[] = (merchant?.allowed_foreign_sources as ForeignSource[] | null) ?? [];

  const handleClose = (v: boolean) => {
    if (!v) setStep("type");
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        {step === "type" && (
          <>
            <DialogHeader>
              <DialogTitle>Шинэ бараа нэмэх</DialogTitle>
              <DialogDescription>Бараагаа аль аргаар нэмэхээ сонгоно уу.</DialogDescription>
            </DialogHeader>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => { onPickReadyStock(); handleClose(false); }}
                className="group flex flex-col items-start gap-3 rounded-2xl border-2 border-border bg-white p-5 text-left transition hover:border-primary hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-105 transition">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">Бэлэн бараа оруулах</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Монголд байгаа агуулахын бараа. Нөөц, үнэ, хүргэлтээ өөрөө удирдана.
                  </p>
                </div>
                <Badge variant="secondary" className="mt-auto">24–48 цагт хүргэлт</Badge>
              </button>

              <button
                type="button"
                disabled={!canForeign}
                onClick={() => canForeign && setStep("source")}
                className="group relative flex flex-col items-start gap-3 rounded-2xl border-2 border-border bg-white p-5 text-left transition hover:border-primary hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:shadow-none"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600 group-hover:scale-105 transition">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    Гадаадаас захиалах бараа оруулах
                    <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Гадаад эх сурвалжийн линкээр бараа үүсгэж, үнэ, карго, хүргэлт, ашгаа автоматаар тооцно.
                  </p>
                </div>
                {canForeign ? (
                  <Badge variant="secondary" className="mt-auto">10–14 хоногт ирнэ</Badge>
                ) : (
                  <Badge variant="outline" className="mt-auto text-muted-foreground">
                    Энэ эрх олгогдоогүй
                  </Badge>
                )}
              </button>
            </div>
            {!canForeign && (
              <p className="mt-2 text-xs text-muted-foreground">
                Гадаадаас захиалах бараа оруулах эрх авахыг хүсвэл платформын админтай холбогдоно уу.
              </p>
            )}
          </>
        )}

        {step === "source" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setStep("type")}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle>Эх сурвалж сонгох</DialogTitle>
              </div>
              <DialogDescription>
                Аль гадаад эх сурвалжаас бараа татах вэ? Зөвхөн идэвхтэй сонголтыг ашиглах боломжтой.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {Object.values(FOREIGN_SOURCES).map((src) => {
                const merchantAllowed = allowed.includes(src.key);
                const enabled = src.active && merchantAllowed;
                return (
                  <button
                    key={src.key}
                    type="button"
                    disabled={!enabled}
                    onClick={() => {
                      if (!enabled) return;
                      onPickForeignSource(src.key);
                      handleClose(false);
                    }}
                    className="group flex items-start gap-3 rounded-xl border bg-white p-3.5 text-left transition hover:border-primary hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:shadow-none"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <ShoppingBag className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate font-medium">{src.name}</div>
                        {!src.active ? (
                          <Badge variant="outline" className="shrink-0 text-[10px]">Удахгүй</Badge>
                        ) : !merchantAllowed ? (
                          <Badge variant="outline" className="shrink-0 text-[10px]">Идэвхгүй</Badge>
                        ) : (
                          <Badge className="shrink-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Идэвхтэй</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {src.country} • {src.currency} • {src.defaultDeliveryMinDays}–{src.defaultDeliveryMaxDays} хоног
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Эх сурвалжийг идэвхжүүлэх эсвэл нэмэлт сурвалж нээх бол админтай холбогдоно уу.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Helper to show a placeholder action until Phase 2 importer is built.
export function notifyImporterComingSoon(source: ForeignSource) {
  const def = FOREIGN_SOURCES[source];
  toast.info(`${def.name} импортлогч удахгүй нэмэгдэнэ`, {
    description: "Дараагийн алхамд линкээр бараа татах функц идэвхжинэ.",
  });
}
