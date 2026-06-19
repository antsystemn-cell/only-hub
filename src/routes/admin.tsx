import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Store, BarChart3, ShoppingCart,
  Users, Image as ImageIcon, FileText, LogOut, Truck, Settings2, Wallet, Bell, MessageSquare, Globe2, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };
const NAV: NavItem[] = [
  { to: "/admin", label: "Тойм", icon: LayoutDashboard, end: true },
  { to: "/admin/merchants", label: "Мерчантууд", icon: Store },
  { to: "/admin/analytics", label: "Аналитик", icon: BarChart3 },
  { to: "/admin/orders", label: "Захиалга", icon: ShoppingCart },
  { to: "/admin/foreign-orders", label: "Гадаад захиалга", icon: Globe2 },
  { to: "/admin/foreign-sync", label: "Гадаад sync", icon: RefreshCw },
  { to: "/admin/delivery", label: "Хүргэлт Удирдах", icon: Truck },
  { to: "/admin/payments", label: "Төлбөр цуглуулалт", icon: Wallet },
  { to: "/admin/payment-providers", label: "Төлбөрийн систем", icon: Settings2 },
  { to: "/admin/notifications", label: "Мэдэгдэл", icon: Bell },
  { to: "/admin/users", label: "Хэрэглэгч", icon: Users },
  { to: "/admin/banners", label: "Баннер", icon: ImageIcon },
  { to: "/admin/blog", label: "Блог", icon: FileText },
  { to: "/admin/settings", label: "Тохиргоо", icon: Settings2 },
];


function AdminLayout() {
  const { isPlatformAdmin, loading, user, refreshRoles, roles } = useAuth();
  const location = useLocation();

  useEffect(() => { if (user) refreshRoles(); /* eslint-disable-next-line */ }, [user?.id]);

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["admin-pending-count"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { count } = await supabase
        .from("merchants")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending");
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
  if (!user) return <div className="flex min-h-screen items-center justify-center text-destructive">Эхлээд нэвтэрнэ үү</div>;
  if (!isPlatformAdmin) {
    if (roles.length === 0) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Эрх шалгаж байна...</div>;
    return <div className="flex min-h-screen items-center justify-center text-destructive">Зөвшөөрөлгүй</div>;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <Link to="/" className="text-xl font-bold">Only</Link>
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Admin</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to}>
                <div className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                  {item.label === "Мерчантууд" && pendingCount > 0 && (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                      {pendingCount}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {user.email?.[0]?.toUpperCase()}
            </div>
            <span className="truncate text-xs">{user.email}</span>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={() => supabase.auth.signOut().then(() => { window.location.href = "/"; })}>
            <LogOut className="mr-2 h-4 w-4" /> Гарах
          </Button>
        </div>
      </aside>

      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-background px-3 md:hidden">
        <Link to="/" className="text-lg font-bold">Only Admin</Link>
        <div className="flex gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to}>
                <Button variant={active ? "default" : "ghost"} size="icon" className="h-9 w-9 shrink-0">
                  <Icon className="h-4 w-4" />
                </Button>
              </Link>
            );
          })}
        </div>
      </div>

      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
