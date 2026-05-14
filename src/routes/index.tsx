import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, ShoppingBag, ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { fmtMnt } from "@/lib/format";

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

const SLIDES = [
  {
    title: "Шинэ улирлын онцлох бараа",
    sub: "Монголын мерчантуудаас шилдэг сонголтууд",
    cta: "Дэлгүүрүүд",
    href: "/stores" as const,
    bg: "from-primary/90 via-primary/70 to-primary/40",
  },
  {
    title: "Өөрийн дэлгүүрээ нээ",
    sub: "Хэдхэн минутад онлайн худалдаагаа эхэл",
    cta: "Бүртгүүлэх",
    href: "/merchant/register" as const,
    bg: "from-emerald-500/90 via-emerald-500/60 to-emerald-500/30",
  },
  {
    title: "QPay, StorePay, бэлэн",
    sub: "Бүх төлбөрийн систем нэг дор",
    cta: "Дэлгэрэнгүй",
    href: "/stores" as const,
    bg: "from-violet-500/90 via-violet-500/60 to-violet-500/30",
  },
];

function Banner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);
  const s = SLIDES[i];
  return (
    <section className="container mx-auto px-3 pt-3 sm:px-4 sm:pt-4">
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${s.bg} transition-all duration-500`}>
        <div className="flex items-center justify-between gap-3 px-4 py-5 sm:px-8 sm:py-7 md:py-8">
          <div className="min-w-0 text-white">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur sm:text-xs">
              <Sparkles className="h-3 w-3" /> Only платформ
            </div>
            <h2 className="truncate text-lg font-bold sm:text-2xl md:text-3xl">{s.title}</h2>
            <p className="mt-0.5 line-clamp-1 text-xs text-white/90 sm:text-sm md:text-base">{s.sub}</p>
          </div>
          <Link to={s.href} className="shrink-0">
            <Button size="sm" variant="secondary" className="rounded-full px-3 sm:px-5 sm:text-sm">
              {s.cta}
            </Button>
          </Link>
        </div>
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              aria-label={`Слайд ${idx + 1}`}
              onClick={() => setI(idx)}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Index() {
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: merchants } = useQuery({
    queryKey: ["home-merchants-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("id,slug")
        .eq("is_active", true)
        .eq("approval_status", "approved");
      return data ?? [];
    },
  });

  const merchantBySlug: Record<string, string> = {};
  (merchants ?? []).forEach((m: any) => { merchantBySlug[m.id] = m.slug; });

  const productsQ = useInfiniteQuery({
    queryKey: ["home-products-paged"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("products")
        .select("id,name,price,original_price,image_url,thumbnail_url,merchant_id,is_new,is_on_sale,slug", { count: "exact" })
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .range(from, to);
      return { items: data ?? [], count: count ?? 0, page: pageParam as number };
    },
    getNextPageParam: (last) => {
      const loaded = (last.page + 1) * PAGE_SIZE;
      return loaded < last.count ? last.page + 1 : undefined;
    },
  });

  const items = productsQ.data?.pages.flatMap((p) => p.items) ?? [];
  const total = productsQ.data?.pages[0]?.count ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:px-4">
          <Link to="/" className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Only</Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <Link to="/stores"><Button variant="ghost" size="sm">Дэлгүүрүүд</Button></Link>
            <Link to="/merchant/login"><Button variant="ghost" size="sm">Нэвтрэх</Button></Link>
            <Link to="/merchant/register"><Button size="sm">Дэлгүүр нээх</Button></Link>
          </nav>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent sm:hidden"
            aria-label="Цэс"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-border bg-background sm:hidden">
            <div className="container mx-auto flex flex-col gap-1 p-3">
              <Link to="/stores" onClick={() => setMenuOpen(false)}><Button variant="ghost" className="w-full justify-start">Дэлгүүрүүд</Button></Link>
              <Link to="/merchant/login" onClick={() => setMenuOpen(false)}><Button variant="ghost" className="w-full justify-start">Нэвтрэх</Button></Link>
              <Link to="/merchant/register" onClick={() => setMenuOpen(false)}><Button className="w-full">Дэлгүүр нээх</Button></Link>
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
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
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
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {items.map((p: any) => {
                const slug = merchantBySlug[p.merchant_id];
                const inner = (
                  <Card className="group flex h-full flex-col overflow-hidden rounded-2xl transition-all hover:border-primary hover:shadow-md">
                    <div className="relative aspect-square bg-muted">
                      {(p.thumbnail_url || p.image_url) && (
                        <img src={p.thumbnail_url ?? p.image_url} alt={p.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                      )}
                      {p.is_new && <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">ШИНЭ</span>}
                      {p.is_on_sale && <span className="absolute right-2 top-2 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">SALE</span>}
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
                return slug ? (
                  <Link key={p.id} to="/store/$merchantSlug" params={{ merchantSlug: slug }}>{inner}</Link>
                ) : (
                  <div key={p.id}>{inner}</div>
                );
              })}
            </div>

            <div className="mt-8 flex items-center justify-center gap-3">
              {productsQ.hasNextPage ? (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => productsQ.fetchNextPage()}
                  disabled={productsQ.isFetchingNextPage}
                  className="rounded-full px-6"
                >
                  {productsQ.isFetchingNextPage ? "Уншиж байна..." : "Дараагийн 12"}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                items.length > PAGE_SIZE && (
                  <p className="text-xs text-muted-foreground sm:text-sm">Бүх бараа харагдлаа</p>
                )
              )}
            </div>
          </>
        )}
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground sm:text-sm">
        © {new Date().getFullYear()} Only Platform
      </footer>
    </div>
  );
}
