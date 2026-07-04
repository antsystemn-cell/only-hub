import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listForeignSyncJobs,
  triggerForeignSourceSync,
} from "@/lib/foreign-orders/sync.functions";

export function ForeignSyncView() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId ?? null;
  const qc = useQueryClient();
  const [sourceTab, setSourceTab] = useState<"POIZON_KR" | "TAOBAO">("POIZON_KR");

  const productsQuery = useQuery({
    queryKey: ["foreign-sync-products", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id,name,source_url,foreign_source,sync_enabled,last_source_sync_at,next_sync_at,source_sync_status,source_sync_error,low_stock_warning",
        )
        .eq("merchant_id", merchantId!)
        .eq("product_type", "FOREIGN_ORDER")
        .order("last_source_sync_at", { ascending: false, nullsFirst: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const allProducts = productsQuery.data ?? [];
  const countPoizon = allProducts.filter((p: any) => p.foreign_source === "POIZON_KR").length;
  const countTaobao = allProducts.filter((p: any) => p.foreign_source === "TAOBAO").length;
  const filteredProducts = allProducts.filter((p: any) => p.foreign_source === sourceTab);

  const listJobs = useServerFn(listForeignSyncJobs);
  const jobsQuery = useQuery({
    queryKey: ["foreign-sync-jobs", merchantId],
    enabled: !!merchantId,
    queryFn: () => listJobs({ data: { merchantId: merchantId!, limit: 20 } }),
  });

  const triggerFn = useServerFn(triggerForeignSourceSync);
  const trigger = useMutation({
    mutationFn: (productId: string) => triggerFn({ data: { productId } }),
    onSuccess: (r) => {
      toast.success(
        `Sync: ${r.variantsAvailable} боломжтой / ${r.variantsUnavailable} дууссан / ${r.variantsUnknown} тодорхойгүй`,
      );
      qc.invalidateQueries({ queryKey: ["foreign-sync-products"] });
      qc.invalidateQueries({ queryKey: ["foreign-sync-jobs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync амжилтгүй"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Гадаад эх сурвалжийн sync</h2>
        <p className="text-sm text-muted-foreground">
          Poizon Korea барааны үнэ, боломжит байдлыг тогтмол шинэчилнэ.
        </p>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Бүтээгдэхүүний sync төлөв</h3>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSourceTab("POIZON_KR")}
              className={`rounded-full border px-3 py-1 text-xs ${sourceTab === "POIZON_KR" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
            >
              🇰🇷 Poizon Korea <span className="ml-1 opacity-70">{countPoizon}</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceTab("TAOBAO")}
              className={`rounded-full border px-3 py-1 text-xs ${sourceTab === "TAOBAO" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
            >
              🇨🇳 Taobao <span className="ml-1 opacity-70">{countTaobao}</span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Бараа</th>
                <th className="py-2 pr-3">Sync</th>
                <th className="py-2 pr-3">Сүүлд</th>
                <th className="py-2 pr-3">Дараа</th>
                <th className="py-2 pr-3">Статус</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2 pr-3 max-w-xs">
                    <div className="font-medium break-words whitespace-normal">{p.name}</div>
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-orange-600 hover:underline break-all"
                    >
                      Эх сурвалж →
                    </a>
                  </td>
                  <td className="py-2 pr-3">
                    {p.sync_enabled ? (
                      <Badge variant="secondary">Идэвхтэй</Badge>
                    ) : (
                      <Badge variant="outline">Зогссон</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {p.last_source_sync_at
                      ? new Date(p.last_source_sync_at).toLocaleString("mn-MN")
                      : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {p.next_sync_at
                      ? new Date(p.next_sync_at).toLocaleString("mn-MN")
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {p.source_sync_status === "OK" && (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">OK</Badge>
                    )}
                    {p.source_sync_status === "FAILED" && (
                      <Badge variant="destructive">FAILED</Badge>
                    )}
                    {p.source_sync_status === "NEEDS_REVIEW" && (
                      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Хяналт</Badge>
                    )}
                    {p.low_stock_warning && (
                      <Badge className="ml-1 bg-amber-100 text-amber-700 hover:bg-amber-100">
                        Үлдэгдэл бага
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={trigger.isPending}
                      onClick={() => trigger.mutate(p.id)}
                    >
                      {trigger.isPending && trigger.variables === p.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 h-3 w-3" />
                      )}
                      Одоо шалгах
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    {sourceTab === "POIZON_KR" ? "Poizon Korea" : "Taobao"} бараа алга.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-semibold">Сүүлийн sync лог</h3>
        <div className="space-y-2 text-sm">
          {(jobsQuery.data ?? []).map((j: any) => (
            <div key={j.id} className="flex items-center justify-between rounded border p-2">
              <div>
                <div className="font-medium">{j.products?.name ?? j.product_id.slice(0, 8)}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(j.created_at).toLocaleString("mn-MN")} •{" "}
                  {j.variants_available}/{j.variants_unavailable}/{j.variants_unknown}{" "}
                  (avail/unavail/unknown) • үнэ өөрчлөгдсөн: {j.price_changes_count}
                </div>
                {j.error_message && (
                  <div className="text-xs text-red-600">{j.error_message}</div>
                )}
              </div>
              <Badge
                className={
                  j.status === "SUCCESS"
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                    : "bg-red-100 text-red-700 hover:bg-red-100"
                }
              >
                {j.status}
              </Badge>
            </div>
          ))}
          {jobsQuery.data?.length === 0 && (
            <div className="py-6 text-center text-muted-foreground">Sync лог алга.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
