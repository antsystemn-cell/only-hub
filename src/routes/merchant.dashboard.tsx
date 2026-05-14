import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, XCircle } from "lucide-react";

export const Route = createFileRoute("/merchant/dashboard")({
  component: DashboardShell,
});

function DashboardShell() {
  const { user, loading, primaryMerchantId, isPlatformAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/merchant/login" });
    else if (!primaryMerchantId && isPlatformAdmin) navigate({ to: "/admin" });
    else if (!primaryMerchantId) navigate({ to: "/merchant/login" });
  }, [user, loading, primaryMerchantId, isPlatformAdmin, navigate]);

  const { data: merchantInfo } = useQuery({
    queryKey: ["merchant-info", primaryMerchantId],
    enabled: !!primaryMerchantId,
    queryFn: async () => (await supabase.from("merchants")
      .select("id,name,approval_status,rejection_reason")
      .eq("id", primaryMerchantId!)
      .maybeSingle()).data as any,
  });

  if (loading || !user || !primaryMerchantId) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Уншиж байна...</div>;
  }

  if (merchantInfo && merchantInfo.approval_status === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md rounded-2xl p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <Clock className="h-8 w-8 text-amber-500" />
            </div>
          </div>
          <h2 className="text-xl font-bold">Баталгаажуулалт хүлээгдэж байна</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Таны дэлгүүрийн бүртгэл хүлээн авагдлаа. Манай баг 1-2 ажлын өдрийн дотор тантай холбогдоно.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => supabase.auth.signOut().then(() => window.location.href = "/")}>
            Гарах
          </Button>
        </Card>
      </div>
    );
  }

  if (merchantInfo && merchantInfo.approval_status === "rejected") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md rounded-2xl p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </div>
          <h2 className="text-xl font-bold">Бүртгэл татгалзагдсан</h2>
          {merchantInfo.rejection_reason && (
            <p className="mt-3 text-sm text-muted-foreground">Шалтгаан: {merchantInfo.rejection_reason}</p>
          )}
          <Button variant="outline" className="mt-6" onClick={() => supabase.auth.signOut().then(() => window.location.href = "/")}>
            Гарах
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}
