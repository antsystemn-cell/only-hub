import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/merchant/dashboard/inventory")({
  component: InventoryLayout,
});

const TABS = [
  { to: "/merchant/dashboard/inventory", label: "Нөөцийн жагсаалт", end: true },
  { to: "/merchant/dashboard/inventory/from-cargo", label: "Каргогоос нэмэх" },
  { to: "/merchant/dashboard/inventory/movements", label: "Нөөцийн хөдөлгөөн" },
  { to: "/merchant/dashboard/inventory/settings", label: "Тохиргоо" },
] as const;

function InventoryLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Boxes className="h-7 w-7" /> Нөөц
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Дэлгүүрийн нөөц, каргоноос нөөцлөх, нөөцийн хөдөлгөөн.
        </p>
      </div>
      <div className="border-b border-border overflow-x-auto">
        <nav className="flex gap-1">
          {TABS.map((t) => {
            const active = t.end ? path === t.to : path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to as string}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
