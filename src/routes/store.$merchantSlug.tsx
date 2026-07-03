import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ShoppingBag } from "lucide-react";
import { fmtMnt } from "@/lib/format";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { AvailabilityBadge } from "@/components/product/ForeignOrderBadge";

export const Route = createFileRoute("/store/$merchantSlug")({
  validateSearch: (search: Record<string, unknown>) => ({
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  component: StorePage,
});

function StorePage() {
  const { merchantSlug } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isStoreIndex = pathname === `/store/${merchantSlug}` || pathname === `/store/${merchantSlug}/`;
  const { data: merchant } = useQuery({
    queryKey: ["merchant", merchantSlug],
    queryFn: async () => (await supabase.from("merchants").select("id,name,slug,logo_url,description,is_active,approval_status,followers_count,created_at,updated_at").eq("slug", merchantSlug).maybeSingle()).data,
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
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader
        cartHref={`/store/${merchantSlug}/cart`}
        rightOfLogo={
          <div className="flex items-center gap-2">
            {merchant.logo_url && (
              <img src={merchant.logo_url} className="h-6 w-6 rounded-full object-cover" alt="" />
            )}
            <span className="truncate font-semibold text-foreground">{merchant.name}</span>
          </div>
        }
      />
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-white p-4 shadow-sm sm:p-5">
          {merchant.logo_url ? (
            <img src={merchant.logo_url} alt={merchant.name} className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-2 ring-orange-100 sm:h-16 sm:w-16" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-xl font-bold text-orange-600 sm:h-16 sm:w-16">
              {merchant.name[0]}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{merchant.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
              <span><span className="font-semibold text-foreground">{products.length}</span> бараа</span>
              <span>•</span>
              <span><span className="font-semibold text-foreground">{(merchant as any).followers_count ?? 0}</span> дагагч</span>
            </div>
            {merchant.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">{merchant.description}</p>
            )}
          </div>
        </div>

        {banners.length > 0 && (
          <div className="relative mt-5 overflow-hidden rounded-2xl">
            <div className="relative h-44 sm:h-56 md:h-64">
              {(banners as any[]).map((banner, i) => (
                <div key={banner.id} className={`absolute inset-0 transition-opacity duration-500 ${i === activeBanner ? "opacity-100" : "opacity-0"}`}>
                  {banner.banner_image && <img src={banner.banner_image} className="h-full w-full object-cover" alt={banner.title} />}
                  <div className="absolute inset-0 flex items-center bg-gradient-to-r from-black/60 to-transparent p-6 sm:p-8">
                    <div>
                      <h2 className="text-xl font-bold text-white sm:text-2xl">{banner.title}</h2>
                      {banner.subtitle && <p className="mt-1 text-sm text-white/80">{banner.subtitle}</p>}
                      {banner.button_text && (
                        <Button className="mt-3 rounded-full bg-orange-500 hover:bg-orange-600" asChild>
                          <a href={banner.button_link ?? "#"}>{banner.button_text}</a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {banners.length > 1 && (
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {(banners as any[]).map((_, i) => (
                  <button key={i} onClick={() => setActiveBanner(i)}
                    className={`h-1.5 rounded-full transition-all ${i === activeBanner ? "w-5 bg-orange-500" : "w-1.5 bg-white/60"}`} />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 rounded-full pl-9" placeholder="Бараа хайх..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>

        {categories.length > 0 && (
          <div className="mt-5 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            <Button size="sm" variant={activeCategory === "all" ? "default" : "outline"}
              className={`whitespace-nowrap rounded-full ${activeCategory === "all" ? "bg-orange-500 hover:bg-orange-600" : ""}`}
              onClick={() => setActiveCategory("all")}>
              Бүгд ({products.length})
            </Button>
            {(categories as any[]).map((cat) => (
              <Button key={cat.id} size="sm" variant={activeCategory === cat.name ? "default" : "outline"}
                className={`whitespace-nowrap rounded-full ${activeCategory === cat.name ? "bg-orange-500 hover:bg-orange-600" : ""}`}
                onClick={() => setActiveCategory(cat.name)}>
                {cat.icon} {cat.name}
              </Button>
            ))}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
          {(filteredProducts as any[]).map((p) => {
            const hasDiscount = p.original_price && Number(p.original_price) > Number(p.price);
            return (
              <Link
                key={p.id}
                to="/store/$merchantSlug/product/$productSlug"
                params={{ merchantSlug, productSlug: p.slug || p.id }}
              >
                <Card className="group flex h-full flex-col overflow-hidden rounded-2xl border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ShoppingBag className="h-8 w-8" />
                      </div>
                    )}
                    <div className="absolute left-2 top-2 z-10">
                      <AvailabilityBadge product={p} size="xs" />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-2.5 sm:p-3">
                    <div className="line-clamp-2 min-h-[2.25rem] text-[12px] font-medium leading-tight text-foreground/90 sm:text-[13px]">
                      {p.name}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-sm font-bold text-orange-600 sm:text-base">{fmtMnt(p.price)}</span>
                      {hasDiscount && (
                        <span className="text-[10px] text-muted-foreground line-through sm:text-[11px]">
                          {fmtMnt(p.original_price)}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
          {filteredProducts.length === 0 && <p className="col-span-full py-10 text-center text-muted-foreground">Бараа алга</p>}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
