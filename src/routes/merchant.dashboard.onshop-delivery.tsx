import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { getOnshopPortalUrl } from "@/lib/delivery/onshop-portal.functions";
import { Truck } from "lucide-react";

export const Route = createFileRoute("/merchant/dashboard/onshop-delivery")({
  component: MerchantOnshopDeliveryPage,
});

function MerchantOnshopDeliveryPage() {
  const { primaryMerchantId } = useAuth();
  const fn = useServerFn(getOnshopPortalUrl);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["onshop-portal", "merchant", primaryMerchantId],
    enabled: !!primaryMerchantId,
    queryFn: () => fn({ data: { merchantCode: primaryMerchantId! } }),
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  return (
    <DashboardLayout>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Truck className="h-6 w-6" /> ON Shop хүргэлт
        </h1>
        <button
          onClick={() => refetch()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
          disabled={isFetching}
        >
          {isFetching ? "Шинэчилж байна..." : "Сэргээх"}
        </button>
      </div>

      {!primaryMerchantId && (
        <div className="rounded-xl border border-border p-6 text-muted-foreground">
          Дэлгүүртэй холбогдоогүй байна.
        </div>
      )}
      {isLoading && (
        <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
          Самбар бэлдэж байна...
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          {(error as Error).message}
        </div>
      )}
      {data && !data.ok && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          {data.error}
        </div>
      )}
      {data && data.ok && (
        <iframe
          src={data.portalUrl}
          className="w-full h-[calc(100vh-8rem)] rounded-xl border border-border bg-card"
          title="ON Shop Delivery Portal"
        />
      )}
    </DashboardLayout>
  );
}
