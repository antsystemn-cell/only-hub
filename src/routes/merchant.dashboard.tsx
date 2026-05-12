import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

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

  if (loading || !user || !primaryMerchantId) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Уншиж байна...</div>;
  }

  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}
