import { Link, useRouterState } from "@tanstack/react-router";
import { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BarChart3, Package, ShoppingCart, Users, Bot, Settings, LogOut, Store, Menu, ShieldCheck, Truck, CreditCard, Globe2, PackageSearch,
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMerchantCargoCounts } from "@/lib/onlycargo/cargo.functions";

type Tab = { to: string; label: string; icon: typeof BarChart3; end?: boolean };
const TABS: Tab[] = [
  { to: "/merchant/dashboard", label: "Статистик", icon: BarChart3, end: true },
  { to: "/merchant/dashboard/products", label: "Бараа", icon: Package },
  { to: "/merchant/dashboard/orders", label: "Захиалга", icon: ShoppingCart },
  { to: "/merchant/dashboard/cargo", label: "Карго", icon: PackageSearch },
  { to: "/merchant/dashboard/foreign-queue", label: "Гадаад захиалга", icon: Globe2 },
  { to: "/merchant/dashboard/delivery", label: "Хүргэлт удирдах", icon: Truck },
  { to: "/merchant/dashboard/users", label: "Үйлчлүүлэгч", icon: Users },
  { to: "/merchant/dashboard/staff", label: "Ажилтан / Эрх", icon: ShieldCheck },
  { to: "/merchant/dashboard/payments", label: "Төлбөрийн тохиргоо", icon: CreditCard },
  { to: "/merchant/dashboard/chatbot", label: "AI Чатбот", icon: Bot },
  { to: "/merchant/dashboard/settings", label: "Тохиргоо", icon: Settings },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut, user, merchantIds, primaryMerchantId, setPrimaryMerchantId } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { data: merchants = [] } = useQuery({
    queryKey: ["dashboard-merchants", merchantIds.join(",")],
    enabled: merchantIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("id,name,slug")
        .in("id", merchantIds);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 10,
  });

  const cargoCountsFn = useServerFn(getMerchantCargoCounts);
  const { data: cargoCounts } = useQuery({
    queryKey: ["dashboard-cargo-counts", primaryMerchantId],
    enabled: !!primaryMerchantId,
    queryFn: () => cargoCountsFn({ data: { merchantId: primaryMerchantId! } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
  const cargoBadge =
    (cargoCounts?.created ?? 0) +
    (cargoCounts?.arrived ?? 0) +
    (cargoCounts?.ready_for_pickup ?? 0);

  const SidebarContent = () => (
    <>
      <Link to="/merchant/dashboard" className="mb-8 flex items-center gap-2 px-2">
        <Store className="h-6 w-6 text-primary" />
        <span className="text-xl font-bold">Only</span>
      </Link>

      {merchantIds.length > 1 && (
        <div className="mb-5 px-2">
          <Select value={primaryMerchantId ?? ""} onValueChange={setPrimaryMerchantId}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="Дэлгүүр сонгох" />
            </SelectTrigger>
            <SelectContent>
              {merchantIds.map((id) => {
                const merchant = merchants.find((m: any) => m.id === id);
                return (
                  <SelectItem key={id} value={id}>
                    {merchant?.name ?? id.slice(0, 8)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      <nav className="flex-1 space-y-1">
        {TABS.map((tab) => {
          const active = tab.end ? path === tab.to : path.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to as string}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="flex-1">{tab.label}</span>
              {tab.to === "/merchant/dashboard/cargo" && cargoBadge > 0 && (
                <Badge variant={active ? "secondary" : "default"} className="h-5 px-1.5 text-xs">
                  {cargoBadge}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-2 truncate px-3 text-xs text-muted-foreground">{user?.email}</p>
        <Button variant="ghost" className="w-full justify-start" onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" /> Гарах
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-card p-4 md:flex">
        <SidebarContent />
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4 flex flex-col">
              <SheetTitle className="sr-only">Мерчант самбарын цэс</SheetTitle>
              <SheetDescription className="sr-only">Дэлгүүрийн удирдлагын хэсгүүд рүү шилжих цэс</SheetDescription>
              <SidebarContent />
            </SheetContent>
          </Sheet>
          <span className="font-semibold">Only Dashboard</span>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
