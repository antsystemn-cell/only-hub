import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { fmtMnt } from "@/lib/format";
import { AccountNav } from "@/components/AccountNav";

export const Route = createFileRoute("/store/$merchantSlug")({ component: StorePage });

function StorePage() {
  const { merchantSlug } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isStoreIndex = pathname === `/store/${merchantSlug}` || pathname === `/store/${merchantSlug}/`;
  const { data: merchant } = useQuery({
    queryKey: ["merchant", merchantSlug],
    queryFn: async () => (await supabase.from("merchants").select("id,name,slug,logo_url,description,is_active,approval_status,owner_id,created_at,updated_at").eq("slug", merchantSlug).maybeSingle()).data,
  });
  const { data: products = [] } = useQuery({
    queryKey: ["store-products", merchant?.id],
    enabled: !!merchant?.id,
    queryFn: async () => (await supabase.from("products").select("*").eq("merchant_id", merchant!.id).eq("is_active", true)).data ?? [],
  });
  const { data: banners = [] } = useQuery({
    queryKey: ["store-banners", merchant?.id],
    enabled: !!merchant?.id,
    queryFn: async () => (await supabase.from("promo_banners").select("*").eq("merchant_id", merchant!.id).eq("is_active", true).order("position")).data ?? [],
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["store-categories", merchant?.id],
    enabled: !!merchant?.id,
    queryFn: async () => (await supabase.from("categories").select("*").eq("merchant_id", merchant!.id).order("position")).data ?? [],
  });

  const [activeBanner, setActiveBanner] = useState(0);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setActiveBanner((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  const filteredProducts = useMemo(() => {
    let list = activeCategory === "all" ? products : (products as any[]).filter((p: any) => p.category === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = (list as any[]).filter((p: any) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.product_code ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, activeCategory, searchQuery]);

  if (!isStoreIndex) return <Outlet />;

  if (!merchant) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Уншиж байна...</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center gap-3 px-4">
          <Link to="/" className="text-xl font-bold">Only</Link>
          <span className="text-muted-foreground">/</span>
          {merchant.logo_url && <img src={merchant.logo_url} className="h-8 w-8 rounded-full object-cover" />}
          <span className="font-semibold">{merchant.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <AccountNav />
          </div>
        </div>
      </header>
      <div className="container mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold">{merchant.name}</h1>
        {merchant.description && <p className="mt-2 text-muted-foreground">{merchant.description}</p>}

        {banners.length > 0 && (
          <div className="relative mt-6 overflow-hidden rounded-2xl">
            <div className="relative h-48 md:h-64">
              {(banners as any[]).map((banner, i) => (
                <div key={banner.id} className={`absolute inset-0 transition-opacity duration-500 ${i === activeBanner ? "opacity-100" : "opacity-0"}`}>
                  {banner.banner_image && <img src={banner.banner_image} className="h-full w-full object-cover" alt={banner.title} />}
                  <div className="absolute inset-0 flex items-center bg-gradient-to-r from-black/60 to-transparent p-8">
                    <div>
                      <h2 className="text-2xl font-bold text-white">{banner.title}</h2>
                      {banner.subtitle && <p className="mt-1 text-white/80">{banner.subtitle}</p>}
                      {banner.button_text && (
                        <Button className="mt-4" asChild>
                          <a href={banner.button_link ?? "#"}>{banner.button_text}</a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {banners.length > 1 && (
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
                {(banners as any[]).map((_, i) => (
                  <button key={i} onClick={() => setActiveBanner(i)}
                    className={`h-2 rounded-full transition-all ${i === activeBanner ? "w-6 bg-white" : "w-2 bg-white/50"}`} />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="relative mt-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Бараа хайх..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>

        {categories.length > 0 && (
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            <Button size="sm" variant={activeCategory === "all" ? "default" : "outline"}
              className="whitespace-nowrap rounded-full"
              onClick={() => setActiveCategory("all")}>
              Бүгд ({products.length})
            </Button>
            {(categories as any[]).map((cat) => (
              <Button key={cat.id} size="sm" variant={activeCategory === cat.name ? "default" : "outline"}
                className="whitespace-nowrap rounded-full"
                onClick={() => setActiveCategory(cat.name)}>
                {cat.icon} {cat.name}
              </Button>
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {(filteredProducts as any[]).map((p) => (
            <Link
              key={p.id}
              to="/store/$merchantSlug/product/$productSlug"
              params={{ merchantSlug, productSlug: p.slug || p.id }}
            >
              <Card className="overflow-hidden rounded-2xl transition hover:shadow-lg">
                {p.image_url && <img src={p.image_url} alt={p.name} className="h-48 w-full object-cover" />}
                <div className="p-4">
                  <div className="line-clamp-2 font-medium">{p.name}</div>
                  <div className="mt-2 font-bold">{fmtMnt(p.price)}</div>
                </div>
              </Card>
            </Link>
          ))}
          {filteredProducts.length === 0 && <p className="col-span-full py-10 text-center text-muted-foreground">Бараа алга</p>}
        </div>
      </div>
    </div>
  );
}
