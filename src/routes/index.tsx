import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sparkles, ShoppingBag, Menu, X, Eye, Loader2, Search, Heart, ShoppingCart,
  Star, ChevronLeft, ChevronRight, Truck, ShieldCheck, RotateCcw, BadgeCheck,
  Smartphone, Shirt, Baby, Home, Car, Sparkle, PawPrint, Grid3x3,
  Facebook, Instagram, Mail, Phone, MapPin,
} from "lucide-react";
import { fmtMnt } from "@/lib/format";
import { QuickViewDialog, type QuickViewProduct } from "@/components/QuickViewDialog";
import { AccountNav } from "@/components/AccountNav";
import { useServerFn } from "@tanstack/react-start";
import { getPublicBrandingFn } from "@/lib/branding.functions";

const PAGE_SIZE = 12;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Only — Монголын марketplace, олон дэлгүүрийн платформ" },
      { name: "description", content: "Олон мерчантуудыг нэгтгэсэн нэгдсэн онлайн худалдааны платформ. Хямдрал, шинэ бараа, найдвартай хүргэлт." },
      { property: "og:title", content: "Only — Монголын онлайн худалдааны платформ" },
      { property: "og:description", content: "Олон мерчантуудыг нэгтгэсэн платформ." },
    ],
  }),
  component: Index,
});

/* ---------- Banner ---------- */

const FALLBACK_SLIDES = [
  { title: "Зуны супер хямдрал", subtitle: "Онцлох бараануудыг хямдралтай үнээр аваарай", button_text: "Дэлгэрэнгүй үзэх", button_link: "/stores", bg_gradient: "from-orange-100 via-orange-50 to-amber-50", banner_image: null as string | null },
  { title: "Өөрийн дэлгүүрээ нээ", subtitle: "Хэдхэн минутад онлайн худалдаагаа эхэл", button_text: "Бүртгүүлэх", button_link: "/merchant/register", bg_gradient: "from-emerald-50 via-emerald-50 to-teal-50", banner_image: null },
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
        role="region"
        aria-roledescription="carousel"
        aria-label="Онцлох баннер"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`relative touch-pan-y select-none overflow-hidden rounded-2xl bg-gradient-to-r transition-all duration-500 ${s.bg_gradient ?? "from-orange-100 via-orange-50 to-amber-50"}`}
      >
        <div aria-live="polite" className="sr-only">
          Слайд {safeI + 1} / {SLIDES.length}: {s.title}
        </div>

        {SLIDES.map((slide, idx) => (
          <div
            key={idx}
            aria-hidden={idx !== safeI}
            className={`${idx === safeI ? "flex" : "hidden"} relative aspect-[3/1.2] sm:aspect-[3/1] w-full items-center px-5 py-5 sm:px-10`}
          >
            {slide.banner_image && (
              <img src={slide.banner_image} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40" />
            )}
            <div className="relative z-10 w-full max-w-2xl">
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-0.5 text-[10px] font-medium text-foreground/80 backdrop-blur sm:text-xs">
                <Sparkles className="h-3 w-3 text-orange-500" /> Only платформ
              </div>
              <h2 className="text-balance text-lg font-bold leading-tight text-foreground sm:text-2xl md:text-3xl lg:text-4xl">{slide.title}</h2>
              {slide.subtitle && (
                <p className="mt-1 line-clamp-2 text-xs text-foreground/70 sm:mt-2 sm:text-sm md:text-base">{slide.subtitle}</p>
              )}
              <a href={slide.button_link ?? "/"} className="mt-2 inline-block sm:mt-3">
                <Button size="sm" className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-orange-600 sm:px-5 sm:text-sm">
                  {slide.button_text ?? "Дэлгэрэнгүй"}
                </Button>
              </a>
            </div>
          </div>
        ))}

        {SLIDES.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Өмнөх"
              onClick={prev}
              className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-foreground shadow backdrop-blur hover:bg-white sm:flex"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Дараах"
              onClick={next}
              className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-foreground shadow backdrop-blur hover:bg-white sm:flex"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Слайд ${idx + 1}`}
                  onClick={() => goto(idx)}
                  className={`h-1.5 rounded-full transition-all ${idx === safeI ? "w-5 bg-orange-500" : "w-1.5 bg-foreground/30 hover:bg-foreground/50"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- Categories ---------- */

const CATEGORIES = [
  { label: "Цахилгаан", Icon: Smartphone, color: "bg-blue-50 text-blue-600" },
  { label: "Хувцас", Icon: Shirt, color: "bg-rose-50 text-rose-600" },
  { label: "Хүүхдийн", Icon: Baby, color: "bg-amber-50 text-amber-600" },
  { label: "Гэр ахуй", Icon: Home, color: "bg-emerald-50 text-emerald-600" },
  { label: "Автомашин", Icon: Car, color: "bg-sky-50 text-sky-600" },
  { label: "Гоо сайхан", Icon: Sparkle, color: "bg-violet-50 text-violet-600" },
  { label: "Амьтан", Icon: PawPrint, color: "bg-orange-50 text-orange-600" },
  { label: "Бүгд", Icon: Grid3x3, color: "bg-slate-100 text-slate-700" },
];

function CategoryShortcuts() {
  return (
    <section className="container mx-auto px-3 pt-4 sm:px-4">
      <div className="overflow-x-auto scrollbar-none">
        <div className="grid min-w-max grid-cols-8 gap-2 sm:gap-3 md:min-w-0">
          {CATEGORIES.map(({ label, Icon, color }) => (
            <Link
              key={label}
              to="/stores"
              className="group flex w-16 flex-col items-center gap-1.5 sm:w-auto"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-full transition-transform group-hover:scale-105 sm:h-16 sm:w-16 ${color}`}>
                <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <span className="text-[11px] font-medium text-foreground/80 sm:text-xs">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Product Card ---------- */

function ProductCard({
  p,
  merchant,
  onQuickView,
}: {
  p: any;
  merchant?: { slug: string; name: string; logo_url?: string | null };
  onQuickView: (p: any) => void;
}) {
  const discount = Number(p.discount) > 0
    ? Number(p.discount)
    : (p.original_price && Number(p.original_price) > Number(p.price)
      ? Math.round((1 - Number(p.price) / Number(p.original_price)) * 100)
      : 0);
  const rating = 4.5 + (Math.abs(hashStr(p.id)) % 5) / 10; // pseudo-stable rating display
  const sold = Number(p.sales) > 0 ? Number(p.sales) : (Math.abs(hashStr(p.id)) % 200) + 5;

  const card = (
    <Card className="group flex h-full flex-col overflow-hidden rounded-2xl border-border/60 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-muted">
        {(p.thumbnail_url || p.image_url) ? (
          <img
            src={p.thumbnail_url ?? p.image_url}
            alt={p.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ShoppingBag className="h-8 w-8" />
          </div>
        )}
        {discount > 0 && (
          <span className="absolute left-2 top-2 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
            -{discount}%
          </span>
        )}
        {p.is_new && discount === 0 && (
          <span className="absolute left-2 top-2 rounded-md bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
            ШИНЭ
          </span>
        )}
        <button
          type="button"
          aria-label="Хүсэлтэнд нэмэх"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-foreground shadow backdrop-blur transition hover:bg-white hover:text-rose-500"
        >
          <Heart className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Түргэн харах"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickView(p); }}
          className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-foreground shadow-md backdrop-blur transition hover:scale-105 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Eye className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2 sm:p-2.5">
        <h3 className="line-clamp-2 min-h-[2.25rem] text-[12px] font-medium leading-tight text-foreground/90 sm:text-[13px]">
          {p.name}
        </h3>
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-sm font-bold text-orange-600 sm:text-base">{fmtMnt(p.price)}</span>
          {p.original_price && Number(p.original_price) > Number(p.price) && (
            <span className="text-[10px] text-muted-foreground line-through sm:text-[11px]">
              {fmtMnt(p.original_price)}
            </span>
          )}
        </div>
        {merchant && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground sm:text-[11px]">
            {merchant.logo_url ? (
              <img src={merchant.logo_url} alt="" className="h-3.5 w-3.5 rounded-full object-cover ring-1 ring-orange-100" />
            ) : (
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-100 text-[8px] font-semibold text-orange-700">
                {merchant.name.charAt(0)}
              </span>
            )}
            <span className="truncate">{merchant.name}</span>
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground sm:text-[11px]">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <span>{rating.toFixed(1)}</span>
          <span className="text-foreground/30">·</span>
          <span>{sold}+ борлуулсан</span>
        </div>
      </div>

    </Card>
  );

  return merchant ? (
    <Link
      to="/store/$merchantSlug/product/$productSlug"
      params={{ merchantSlug: merchant.slug, productSlug: p.slug || p.id }}
      className="block"
    >
      {card}
    </Link>
  ) : (
    <div>{card}</div>
  );
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

/* ---------- Horizontal product rail ---------- */

function ProductRail({
  title,
  icon,
  items,
  merchantById,
  onQuickView,
}: {
  title: string;
  icon: React.ReactNode;
  items: any[];
  merchantById: Record<string, { slug: string; name: string; logo_url?: string | null }>;
  onQuickView: (p: any) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="container mx-auto px-3 pt-6 sm:px-4 sm:pt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg md:text-xl">
          <span>{icon}</span>
          <span>{title}</span>
        </h2>
        <Link to="/stores" className="shrink-0 text-xs font-medium text-orange-600 hover:underline sm:text-sm">
          Бүгдийг харах →
        </Link>
      </div>
      <div className="-mx-3 overflow-x-auto px-3 pb-2 scrollbar-none sm:mx-0 sm:px-0">
        <div className="grid auto-cols-[44%] grid-flow-col gap-2.5 sm:auto-cols-[28%] sm:gap-3 md:auto-cols-[19%] lg:auto-cols-[15.5%]">
          {items.slice(0, 12).map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              merchant={merchantById[p.merchant_id]}
              onQuickView={onQuickView}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Featured stores ---------- */

function FeaturedStores({ stores }: { stores: any[] }) {
  if (stores.length === 0) return null;
  return (
    <section className="container mx-auto px-3 pt-6 sm:px-4 sm:pt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg md:text-xl">
          <span>🏪</span> Онцлох дэлгүүрүүд
        </h2>
        <Link to="/stores" className="shrink-0 text-xs font-medium text-orange-600 hover:underline sm:text-sm">
          Бүгдийг харах →
        </Link>
      </div>
      <div className="-mx-3 overflow-x-auto px-3 pb-2 scrollbar-none sm:mx-0 sm:px-0">
        <div className="grid auto-cols-[60%] grid-flow-col gap-2.5 sm:auto-cols-[28%] sm:gap-3 md:auto-cols-[18%]">
          {stores.map((m) => (
            <Link
              key={m.id}
              to="/store/$merchantSlug"
              params={{ merchantSlug: m.slug }}
              className="group"
            >
              <Card className="flex items-center gap-3 rounded-2xl p-3 transition hover:border-orange-300 hover:shadow-md">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-sm font-bold text-orange-600 sm:h-14 sm:w-14">
                  {m.logo_url ? (
                    <img src={m.logo_url} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    m.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground group-hover:text-orange-600">{m.name}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> 4.8
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Benefits ---------- */

function Benefits() {
  const items = [
    { Icon: Truck, title: "Хурдан хүргэлт", desc: "24-48 цаг" },
    { Icon: ShieldCheck, title: "Аюулгүй төлбөр", desc: "100% хамгаалагдсан" },
    { Icon: RotateCcw, title: "Буцаалт хийх", desc: "7 хоногийн дотор" },
    { Icon: BadgeCheck, title: "Найдвартай", desc: "Шалгасан мерчантууд" },
  ];
  return (
    <section className="container mx-auto px-3 pt-8 sm:px-4">
      <div className="grid grid-cols-2 gap-2.5 rounded-2xl border bg-card p-3 sm:grid-cols-4 sm:gap-4 sm:p-5">
        {items.map(({ Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600 sm:h-11 sm:w-11">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold sm:text-sm">{title}</div>
              <div className="truncate text-[10px] text-muted-foreground sm:text-xs">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Page ---------- */

function Index() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickView, setQuickView] = useState<QuickViewProduct | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const brandingFn = useServerFn(getPublicBrandingFn);
  const { data: branding } = useQuery({
    queryKey: ["public-branding"],
    queryFn: () => brandingFn({ data: undefined as any }),
    staleTime: 5 * 60 * 1000,
  });
  const platformLogo = branding?.logoUrl || null;

  const { data: merchants } = useQuery({
    queryKey: ["home-merchants-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("id,name,slug,logo_url")
        .eq("is_active", true)
        .eq("approval_status", "approved");
      return data ?? [];
    },
  });

  const merchantById: Record<string, { slug: string; name: string; logo_url?: string | null }> = {};
  (merchants ?? []).forEach((m: any) => { merchantById[m.id] = { slug: m.slug, name: m.name, logo_url: m.logo_url }; });


  // Featured (is_new flag used as featured marker — schema has no is_featured)
  const { data: featured } = useQuery({
    queryKey: ["home-featured"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,price,original_price,image_url,thumbnail_url,merchant_id,is_new,is_on_sale,slug,description,discount,sales")
        .eq("is_active", true)
        .eq("is_new", true)
        .order("created_at", { ascending: false })
        .limit(12);
      return data ?? [];
    },
  });

  // Discount products
  const { data: discounted } = useQuery({
    queryKey: ["home-discount"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,price,original_price,image_url,thumbnail_url,merchant_id,is_new,is_on_sale,slug,description,discount,sales")
        .eq("is_active", true)
        .or("is_on_sale.eq.true,discount.gt.0")
        .order("discount", { ascending: false })
        .limit(12);
      return data ?? [];
    },
  });

  // Paged "new products" list (infinite)
  const productsQ = useInfiniteQuery({
    queryKey: ["home-products-paged"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("products")
        .select("id,name,price,original_price,image_url,thumbnail_url,merchant_id,is_new,is_on_sale,slug,description,discount,sales", { count: "exact" })
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

  const featuredStores = (merchants ?? []).slice(0, 12);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center gap-2 px-3 sm:h-16 sm:gap-4 sm:px-4">
          <Link to="/" className="flex shrink-0 items-center gap-1.5">
            {platformLogo ? (
              <img src={platformLogo} alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                <ShoppingBag className="h-4 w-4" />
              </div>
            )}
            </div>
            <div className="hidden flex-col leading-none sm:flex">
              <span className="text-base font-extrabold tracking-tight">ONLY</span>
              <span className="text-[9px] font-semibold tracking-wider text-orange-600">MERCHANTS HUB</span>
            </div>
          </Link>

          {/* Search */}
          <form
            action="/stores"
            method="get"
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <div className="relative flex min-w-0 flex-1 items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                name="q"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Бараа, дэлгүүр хайх..."
                className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-20 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-200 sm:h-10"
              />
              <button
                type="submit"
                className="absolute right-1 inline-flex h-7 items-center rounded-full bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-600 sm:h-8 sm:px-4 sm:text-sm"
              >
                Хайх
              </button>
            </div>
          </form>

          <nav className="hidden items-center gap-1 sm:flex">
            <Link to="/account" aria-label="Хүссэн">
              <Button variant="ghost" size="icon" className="rounded-full">
                <Heart className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/stores" aria-label="Сагс">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ShoppingCart className="h-5 w-5" />
              </Button>
            </Link>
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
              <Link to="/stores" onClick={() => setMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start"><ShoppingBag className="mr-2 h-4 w-4" /> Дэлгүүрүүд</Button>
              </Link>
              <Link to="/account" onClick={() => setMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start"><Heart className="mr-2 h-4 w-4" /> Хүссэн</Button>
              </Link>
              <AccountNav variant="vertical" onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        )}
      </header>

      <Banner />
      <CategoryShortcuts />

      <ProductRail
        title="Онцлох бараа"
        icon={<span className="text-amber-500">⭐</span>}
        items={featured ?? []}
        merchantById={merchantById}
        onQuickView={(p) => setQuickView(p)}
      />

      <FeaturedStores stores={featuredStores} />

      <ProductRail
        title="Хямдралтай бараа"
        icon={<span>🔥</span>}
        items={discounted ?? []}
        merchantById={merchantById}
        onQuickView={(p) => setQuickView(p)}
      />

      {/* New products grid (full pagination) */}
      <section className="container mx-auto px-3 py-8 sm:px-4">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg md:text-xl">
              <span>🆕</span> Шинээр нэмэгдсэн
            </h2>
            {total > 0 && <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{items.length} / {total}</p>}
          </div>
          <Link to="/stores" className="shrink-0 text-xs font-medium text-orange-600 hover:underline sm:text-sm">
            Бүгдийг харах →
          </Link>
        </div>

        {productsQ.isLoading ? (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-12 text-center">
            <ShoppingBag className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Одоогоор бараа алга байна</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4 lg:grid-cols-6">
              {items.map((p: any) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  merchant={merchantById[p.merchant_id]}
                  onQuickView={(x) => setQuickView(x)}
                />
              ))}
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

      <Benefits />

      <QuickViewDialog
        open={!!quickView}
        onOpenChange={(o) => !o && setQuickView(null)}
        product={quickView}
        merchantName={quickView ? merchantById[quickView.merchant_id ?? ""]?.name : undefined}
        merchantSlug={quickView ? merchantById[quickView.merchant_id ?? ""]?.slug : undefined}
      />

      {/* Footer */}
      <footer className="mt-12 border-t border-border bg-[#0f1115] text-slate-300">
        <div className="container mx-auto grid grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div className="leading-none">
                <div className="text-base font-extrabold text-white">ONLY</div>
                <div className="text-[9px] font-semibold tracking-wider text-orange-400">MERCHANTS HUB</div>
              </div>
            </div>
            <p className="mt-3 max-w-sm text-xs text-slate-400 sm:text-sm">
              Монголын хамгийн том мерчантуудын нэгдсэн платформ.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <a href="#" aria-label="Facebook" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-orange-500 hover:text-white"><Facebook className="h-4 w-4" /></a>
              <a href="#" aria-label="Instagram" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-orange-500 hover:text-white"><Instagram className="h-4 w-4" /></a>
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Хэрэгтэй холбоос</h4>
            <ul className="space-y-2 text-xs text-slate-400 sm:text-sm">
              <li><Link to="/stores" className="hover:text-orange-400">Дэлгүүрүүд</Link></li>
              <li><Link to="/blog" className="hover:text-orange-400">Блог</Link></li>
              <li><Link to="/account" className="hover:text-orange-400">Миний бүртгэл</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Мерчантад</h4>
            <ul className="space-y-2 text-xs text-slate-400 sm:text-sm">
              <li><Link to="/merchant/register" className="hover:text-orange-400">Бүртгүүлэх</Link></li>
              <li><Link to="/merchant/login" className="hover:text-orange-400">Нэвтрэх</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Холбоо барих</h4>
            <ul className="space-y-2 text-xs text-slate-400 sm:text-sm">
              <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> +976 7711 1234</li>
              <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> info@onlyhub.mn</li>
              <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Улаанбаатар, Монгол</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-[11px] text-slate-500 sm:text-xs">
          © {new Date().getFullYear()} Only Merchants Hub. Бүх эрх хуулиар хамгаалагдсан.
        </div>
      </footer>
    </div>
  );
}
