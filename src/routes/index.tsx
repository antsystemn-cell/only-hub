import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, ShoppingBag, Menu, X, Eye, Loader2 } from "lucide-react";
import { fmtMnt } from "@/lib/format";
import { QuickViewDialog, type QuickViewProduct } from "@/components/QuickViewDialog";
import { AccountNav } from "@/components/AccountNav";

const PAGE_SIZE = 12;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Only — Монголын олон дэлгүүрт e-commerce платформ" },
      { name: "description", content: "Олон мерчантуудыг нэгтгэсэн нэгдсэн онлайн худалдааны платформ. Дэлгүүрээ нээж, бүтээгдэхүүнээ зар." },
      { property: "og:title", content: "Only — Монголын онлайн худалдааны платформ" },
      { property: "og:description", content: "Олон мерчантуудыг нэгтгэсэн платформ." },
    ],
  }),
  component: Index,
});

const FALLBACK_SLIDES = [
  { title: "Шинэ улирлын онцлох бараа", subtitle: "Монголын мерчантуудаас шилдэг сонголтууд", button_text: "Дэлгүүрүүд", button_link: "/stores", bg_gradient: "from-primary/90 via-primary/70 to-primary/40", banner_image: null as string | null },
  { title: "Өөрийн дэлгүүрээ нээ", subtitle: "Хэдхэн минутад онлайн худалдаагаа эхэл", button_text: "Бүртгүүлэх", button_link: "/merchant/register", bg_gradient: "from-emerald-500/90 via-emerald-500/60 to-emerald-500/30", banner_image: null },
  { title: "QPay, StorePay, бэлэн", subtitle: "Бүх төлбөрийн систем нэг дор", button_text: "Дэлгэрэнгүй", button_link: "/stores", bg_gradient: "from-violet-500/90 via-violet-500/60 to-violet-500/30", banner_image: null },
];

function Banner() {
  const { data: dbSlides } = useQuery({
    queryKey: ["platform-banners-home"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_banners")
        .select("title,subtitle,button_text,button_link,bg_gradient,banner_image,is_active,position")
        .eq("is_active", true)
        .order("position", { ascending: true });
      return data ?? [];
    },
  });
  const SLIDES = (dbSlides && dbSlides.length > 0 ? dbSlides : FALLBACK_SLIDES) as any[];

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const regionRef = useRef<HTMLDivElement>(null);

  const goto = useCallback((idx: number) => {
    setI(((idx % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, [SLIDES.length]);
  const next = useCallback(() => goto(i + 1), [i, goto]);
  const prev = useCallback(() => goto(i - 1), [i, goto]);

  useEffect(() => {
    if (paused || SLIDES.length <= 1) return;
    const t = setInterval(() => setI((v) => (v + 1) % SLIDES.length), 5500);
    return () => clearInterval(t);
  }, [paused, SLIDES.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); goto(0); }
    else if (e.key === "End") { e.preventDefault(); goto(SLIDES.length - 1); }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    setPaused(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const onTouchEnd = () => {
    const d = touchDeltaX.current;
    touchStartX.current = null;
    touchDeltaX.current = 0;
    if (Math.abs(d) > 40) (d < 0 ? next() : prev());
    setTimeout(() => setPaused(false), 100);
  };

  const safeI = Math.min(i, SLIDES.length - 1);
  const s = SLIDES[safeI];
  return (
    <section className="container mx-auto px-3 pt-3 sm:px-4 sm:pt-4">
      <div
        ref={regionRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Онцлох баннер"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`relative touch-pan-y select-none overflow-hidden rounded-2xl bg-gradient-to-r outline-none ring-offset-background transition-all duration-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${s.bg_gradient ?? "from-primary/90 via-primary/70 to-primary/40"}`}
      >
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          Слайд {safeI + 1} / {SLIDES.length}: {s.title}
        </div>

        {SLIDES.map((slide, idx) => (
          <div
            key={idx}
            role="group"
            aria-roledescription="slide"
            aria-label={`${idx + 1} / ${SLIDES.length}`}
            aria-hidden={idx !== safeI}
            className={`${idx === safeI ? "flex" : "hidden"} relative flex-col items-start gap-4 px-5 py-8 sm:gap-5 sm:px-10 sm:py-12 md:py-16 lg:py-20`}
          >
            {slide.banner_image && (
              <img src={slide.banner_image} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30" />
            )}
            <div className="relative w-full max-w-3xl text-white">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur sm:mb-3 sm:text-xs">
                <Sparkles className="h-3 w-3" /> Only платформ
              </div>
              <h2 className="text-balance text-xl font-bold leading-tight sm:text-3xl md:text-4xl lg:text-5xl">{slide.title}</h2>
              {slide.subtitle && <p className="mt-2 text-pretty text-sm text-white/90 sm:mt-3 sm:text-base md:text-lg">{slide.subtitle}</p>}
            </div>
            <a href={slide.button_link ?? "/"} className="relative" tabIndex={idx === safeI ? 0 : -1}>
              <Button size="sm" variant="secondary" className="rounded-full px-5 py-2 text-xs font-medium shadow-md sm:px-7 sm:py-2.5 sm:text-sm">
                {slide.button_text ?? "Дэлгэрэнгүй"}
              </Button>
            </a>
          </div>
        ))}

        {SLIDES.length > 1 && (
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Слайд ${idx + 1} рүү очих`}
                aria-current={idx === safeI}
                onClick={() => goto(idx)}
                className={`h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${idx === safeI ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Index() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickView, setQuickView] = useState<QuickViewProduct | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data: merchants } = useQuery({
    queryKey: ["home-merchants-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("id,name,slug")
        .eq("is_active", true)
        .eq("approval_status", "approved");
      return data ?? [];
    },
  });

  const merchantById: Record<string, { slug: string; name: string }> = {};
  (merchants ?? []).forEach((m: any) => { merchantById[m.id] = { slug: m.slug, name: m.name }; });

  const productsQ = useInfiniteQuery({
    queryKey: ["home-products-paged"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("products")
        .select("id,name,price,original_price,image_url,thumbnail_url,merchant_id,is_new,is_on_sale,slug,description", { count: "exact" })
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      return { items: data ?? [], count: count ?? 0, page: pageParam as number };
    },
    getNextPageParam: (last) => {
      const loaded = (last.page + 1) * PAGE_SIZE;
      return loaded < last.count ? last.page + 1 : undefined;
    },
  });

  const rawItems = productsQ.data?.pages.flatMap((p) => p.items) ?? [];
  const seen = new Set<string>();
  const items = rawItems.filter((it: any) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  const total = productsQ.data?.pages[0]?.count ?? 0;

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && productsQ.hasNextPage && !productsQ.isFetchingNextPage) {
          productsQ.fetchNextPage();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [productsQ.hasNextPage, productsQ.isFetchingNextPage, productsQ.fetchNextPage, items.length]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:px-4">
          <Link to="/" className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Only</Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <Link to="/stores"><Button variant="ghost" size="sm">Дэлгүүрүүд</Button></Link>
            <AccountNav />
          </nav>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent sm:hidden"
            aria-label={menuOpen ? "Цэс хаах" : "Цэс нээх"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-border bg-background sm:hidden">
            <div className="container mx-auto flex flex-col gap-1 p-3">
              <Link to="/stores" onClick={() => setMenuOpen(false)}><Button variant="ghost" className="w-full justify-start">Дэлгүүрүүд</Button></Link>
              <AccountNav variant="vertical" onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        )}
      </header>

      <Banner />

      <section className="container mx-auto px-3 py-6 sm:px-4 sm:py-10">
        <div className="mb-4 flex items-end justify-between gap-3 sm:mb-6">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl md:text-3xl">Шинэ бүтээгдэхүүн</h2>
            {total > 0 && <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{items.length} / {total} харуулсан</p>}
          </div>
          <Link to="/stores" className="shrink-0 text-xs text-primary hover:underline sm:text-sm">Бүх дэлгүүр →</Link>
        </div>

        {productsQ.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
            <ShoppingBag className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Одоогоор бараа алга байна</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
              {items.map((p: any) => {
                const m = merchantById[p.merchant_id];
                const card = (
                  <Card className="group flex h-full flex-col overflow-hidden rounded-2xl transition-all hover:border-primary hover:shadow-md">
                    <div className="relative aspect-square bg-muted">
                      {(p.thumbnail_url || p.image_url) && (
                        <img src={p.thumbnail_url ?? p.image_url} alt={p.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                      )}
                      {p.is_new && <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">ШИНЭ</span>}
                      {p.is_on_sale && <span className="absolute right-2 top-2 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">SALE</span>}
                      <button
                        type="button"
                        aria-label={`${p.name} — Түргэн харах`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuickView(p); }}
                        className="absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md backdrop-blur transition hover:bg-background hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                      <h3 className="line-clamp-2 min-h-[2.5rem] text-xs font-medium leading-tight group-hover:text-primary sm:text-sm">{p.name}</h3>
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-bold text-foreground sm:text-base">{fmtMnt(p.price)}</span>
                        {p.original_price && Number(p.original_price) > Number(p.price) && (
                          <span className="text-[11px] text-muted-foreground line-through sm:text-xs">{fmtMnt(p.original_price)}</span>
                        )}
                      </div>
                    </div>
                  </Card>
                );
                // Always link to product detail — the route handler accepts either slug or id.
                return m ? (
                  <Link
                    key={p.id}
                    to="/store/$merchantSlug/product/$productSlug"
                    params={{ merchantSlug: m.slug, productSlug: p.slug || p.id }}
                  >
                    {card}
                  </Link>
                ) : (
                  <div key={p.id}>{card}</div>
                );
              })}
            </div>

            <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

            <div className="mt-6 flex items-center justify-center" aria-live="polite">
              {productsQ.isFetchingNextPage ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Уншиж байна...
                </div>
              ) : !productsQ.hasNextPage && items.length > PAGE_SIZE ? (
                <p className="text-xs text-muted-foreground sm:text-sm">Бүх бараа харагдлаа</p>
              ) : null}
            </div>
          </>
        )}
      </section>

      <QuickViewDialog
        open={!!quickView}
        onOpenChange={(o) => !o && setQuickView(null)}
        product={quickView}
        merchantName={quickView ? merchantById[quickView.merchant_id ?? ""]?.name : undefined}
        merchantSlug={quickView ? merchantById[quickView.merchant_id ?? ""]?.slug : undefined}
      />

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground sm:text-sm">
        © {new Date().getFullYear()} Only Platform
      </footer>
    </div>
  );
}
