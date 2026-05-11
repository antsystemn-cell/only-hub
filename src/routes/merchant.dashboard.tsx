import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export const Route = createFileRoute("/merchant/dashboard")({
  component: DashboardShell,
});

function DashboardShell() {
  const { user, loading, primaryMerchantId } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/merchant/login" });
    else if (!loading && user && !primaryMerchantId) navigate({ to: "/merchant/login" });
  }, [user, loading, primaryMerchantId, navigate]);

  if (loading || !user || !primaryMerchantId) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Уншиж байна...</div>;
  }

  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}
