import { Link, useRouterState } from "@tanstack/react-router";
import { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BarChart3, Package, ShoppingCart, Users, Bot, Settings, LogOut, Store, Menu, ShieldCheck, Truck,
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type Tab = { to: string; label: string; icon: typeof BarChart3; end?: boolean };
const TABS: Tab[] = [
  { to: "/merchant/dashboard", label: "Статистик", icon: BarChart3, end: true },
  { to: "/merchant/dashboard/products", label: "Бараа", icon: Package },
  { to: "/merchant/dashboard/orders", label: "Захиалга", icon: ShoppingCart },
  { to: "/merchant/dashboard/delivery", label: "Хүргэлт", icon: Truck },
  { to: "/merchant/dashboard/onshop-delivery", label: "ON Shop хүргэлт", icon: Truck },
  { to: "/merchant/dashboard/users", label: "Үйлчлүүлэгч", icon: Users },
  { to: "/merchant/dashboard/staff", label: "Ажилтан / Эрх", icon: ShieldCheck },
  { to: "/merchant/dashboard/chatbot", label: "AI Чатбот", icon: Bot },
  { to: "/merchant/dashboard/settings", label: "Тохиргоо", icon: Settings },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const SidebarContent = () => (
    <>
      <Link to="/merchant/dashboard" className="mb-8 flex items-center gap-2 px-2">
        <Store className="h-6 w-6 text-primary" />
        <span className="text-xl font-bold">Only</span>
      </Link>

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
              {tab.label}
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
