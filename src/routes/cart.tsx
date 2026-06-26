import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, ShoppingBag, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMnt } from "@/lib/format";
import { cart, type CartItem } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Миний сагс — Only" }] }),
  component: CartIndexPage,
});

type MerchantCart = {
  slug: string;
  items: CartItem[];
  total: number;
  qty: number;
};

function readAllCarts(): MerchantCart[] {
  if (typeof window === "undefined") return [];
  const out: MerchantCart[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("only:cart:")) continue;
    const slug = key.slice("only:cart:".length);
    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]") as CartItem[];
      if (!Array.isArray(items) || items.length === 0) continue;
      const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
      const qty = items.reduce((s, i) => s + i.quantity, 0);
      out.push({ slug, items, total, qty });
    } catch {
      // ignore
    }
  }
  return out;
}

function CartIndexPage() {
  const [carts, setCarts] = useState<MerchantCart[]>([]);
  useEffect(() => {
    setCarts(readAllCarts());
    const onStorage = () => setCarts(readAllCarts());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const slugs = carts.map((c) => c.slug);
  const { data: merchants } = useQuery({
    queryKey: ["cart-merchants", slugs],
    enabled: slugs.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("slug,name,logo_url")
        .in("slug", slugs);
      return data ?? [];
    },
  });

  const merchantBySlug = new Map((merchants ?? []).map((m) => [m.slug, m]));
  const grandTotal = carts.reduce((s, c) => s + c.total, 0);
  const grandQty = carts.reduce((s, c) => s + c.qty, 0);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader />
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShoppingCart className="h-6 w-6 text-orange-500" />
            Миний сагс
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {grandQty > 0
              ? `${carts.length} дэлгүүрт ${grandQty} бараа • Нийт ${fmtMnt(grandTotal)}`
              : "Сагс хоосон байна"}
          </p>
        </div>

        {carts.length === 0 ? (
          <Card className="rounded-2xl p-12 text-center">
            <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-semibold">Сагс хоосон байна</h2>
            <p className="mt-1 text-sm text-muted-foreground">Дэлгүүр үзээд таалагдсан бараагаа сагсанд нэмнэ үү.</p>
            <Link to="/stores" className="mt-5 inline-block">
              <Button className="bg-orange-500 hover:bg-orange-600">Дэлгүүр үзэх</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {carts.map((c) => {
              const m = merchantBySlug.get(c.slug);
              return (
                <Link
                  key={c.slug}
                  to="/store/$merchantSlug/cart"
                  params={{ merchantSlug: c.slug }}
                  className="block"
                >
                  <Card className="flex items-center gap-4 rounded-2xl border-border/60 p-4 transition hover:border-orange-300 hover:shadow-md">
                    {m?.logo_url ? (
                      <img src={m.logo_url} alt={m.name} className="h-12 w-12 rounded-full object-cover ring-2 ring-orange-100" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-lg font-bold text-orange-600">
                        {(m?.name ?? c.slug)[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-semibold">{m?.name ?? c.slug}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.qty} бараа • {fmtMnt(c.total)}
                      </div>
                      <div className="mt-1 flex -space-x-2">
                        {c.items.slice(0, 4).map((it, idx) =>
                          it.image ? (
                            <img
                              key={idx}
                              src={it.image}
                              alt=""
                              className="h-8 w-8 rounded-md border-2 border-white object-cover"
                            />
                          ) : null,
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
