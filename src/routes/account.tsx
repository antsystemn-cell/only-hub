import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogOut, ShieldCheck, Package } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Миний бүртгэл — Only" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user, loading, signOut, primaryMerchantId, isPlatformAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { redirect: "/account" } });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Уншиж байна...</div>;
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader showSearch={false} />
      <div className="container mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-bold">Миний бүртгэл</h1>
        <Card className="mt-6 rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
              {(user.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{user.email}</p>
              <p className="text-xs text-muted-foreground">Хэрэглэгчийн ID: {user.id.slice(0, 8)}…</p>
            </div>
          </div>
        </Card>

        <Card className="mt-4 rounded-2xl p-6">
          <h2 className="font-semibold">Миний захиалгууд</h2>
          <p className="mt-1 text-sm text-muted-foreground">Захиалгуудаа болон хүргэлтийн төлвөө хянах</p>
          <Link to="/account/orders">
            <Button variant="outline" className="mt-3"><Package className="mr-2 h-4 w-4" /> Захиалгууд үзэх</Button>
          </Link>
        </Card>

        {(primaryMerchantId || isPlatformAdmin) && (
          <Card className="mt-4 rounded-2xl p-6">
            <h2 className="font-semibold">Удирдлагын хэсэг</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {primaryMerchantId && (
                <Link to="/merchant/dashboard">
                  <Button variant="outline"><LayoutDashboard className="mr-2 h-4 w-4" /> Мерчант хэсэг</Button>
                </Link>
              )}
              {isPlatformAdmin && (
                <Link to="/admin">
                  <Button variant="outline"><ShieldCheck className="mr-2 h-4 w-4" /> Платформ админ</Button>
                </Link>
              )}
            </div>
          </Card>
        )}

        <Card className="mt-4 rounded-2xl p-6">
          <h2 className="font-semibold">Гарах</h2>
          <p className="mt-1 text-sm text-muted-foreground">Та бүртгэлээсээ гарах боломжтой.</p>
          <Button
            variant="destructive"
            className="mt-3"
            onClick={async () => { await signOut(); window.location.href = "/"; }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Гарах
          </Button>
        </Card>
      </div>
      <SiteFooter />
    </div>
  );
}
