import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fmtMnt } from "@/lib/format";
import { cart, useCart } from "@/lib/cart";
import { wishlist, useIsWishlisted } from "@/lib/wishlist";
import {
  Minus, Plus, ShoppingCart, ChevronRight, Check, ChevronLeft, Heart,
  Truck, Shield, ShieldCheck, Store as StoreIcon, Play, Star,
  RotateCcw, BadgeCheck, Zap, CreditCard,
} from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ShareMenu } from "@/components/product/ShareMenu";
import { ReviewsSection } from "@/components/product/ReviewsSection";
import { ForeignOrderInlineBadge, ForeignOrderPanel, isForeignOrder, CountryOriginBadge, AvailabilityBadge } from "@/components/product/ForeignOrderBadge";

export const Route = createFileRoute("/store/$merchantSlug/product/$productSlug")({
  component: ProductDetailPage,
});

type Spec = { label: string; value: string };
type Media = { url: string; type?: "image" | "video" };



function ProductDetailPage() {
  const { merchantSlug, productSlug } = Route.useParams();
  const navigate = useNavigate();
  const cartItems = useCart(merchantSlug);

  const { data: merchant } = useQuery({
    queryKey: ["merchant", merchantSlug],
    queryFn: async () =>
      (await supabase.from("merchants").select("id,name,slug,logo_url,description,shipping_config,policy_shipping,policy_return,followers_count,can_create_foreign_order_products").eq("slug", merchantSlug).maybeSingle()).data,
  });

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", merchant?.id, productSlug],
    enabled: !!merchant?.id,
    queryFn: async () => {
      const bySlug = await supabase.from("products").select("*").eq("merchant_id", merchant!.id).eq("slug", productSlug).maybeSingle();
      if (bySlug.data) return bySlug.data;
      const byId = await supabase.from("products").select("*").eq("merchant_id", merchant!.id).eq("id", productSlug).maybeSingle();
      return byId.data;
    },
  });

  // Platform default policies (public read whitelist)
  const { data: platformDefaults } = useQuery({
    queryKey: ["platform-defaults"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key,value")
        .in("key", ["policy_shipping_default", "policy_return_default"]);
      const out: Record<string, string> = {};
      for (const r of data ?? []) {
        const v = (r as any).value;
        out[(r as any).key] = typeof v === "string" ? v : (v?.content ?? "");
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Enabled payment providers (merchant's verified providers; platform-managed as fallback per provider_type)
  const { data: payments = [] } = useQuery({
    queryKey: ["pdp-payments", merchant?.id],
    enabled: !!merchant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_providers")
        .select("id,name,provider_type,icon,logo_url,description,is_active,is_platform_managed,merchant_id,config_status,position")
        .eq("is_active", true)
        .eq("config_status", "verified")
        .or(`merchant_id.eq.${merchant!.id},is_platform_managed.eq.true`)
        .order("position", { ascending: true });
      // Dedupe by provider_type: prefer merchant's own row over the platform-managed fallback.
      const byType = new Map<string, any>();
      for (const row of data ?? []) {
        const key = String(row.provider_type ?? "").toLowerCase();
        const existing = byType.get(key);
        if (!existing) { byType.set(key, row); continue; }
        const rowIsMerchant = row.merchant_id === merchant!.id;
        const existingIsMerchant = existing.merchant_id === merchant!.id;
        if (rowIsMerchant && !existingIsMerchant) byType.set(key, row);
      }
      return Array.from(byType.values());
    },
  });

  // Reviews aggregate
  const { data: reviewStats } = useQuery({
    queryKey: ["pdp-reviews", product?.id],
    enabled: !!product?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("reviews")
        .select("rating")
        .eq("product_id", product!.id)
        .eq("is_hidden", false);
      const ratings = (data ?? []).map((r: any) => r.rating as number);
      const count = ratings.length;
      const avg = count > 0 ? ratings.reduce((a, b) => a + b, 0) / count : 0;
      const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const r of ratings) dist[r] = (dist[r] ?? 0) + 1;
      return { count, avg, dist };
    },
  });

  // Similar products: same store first, then same category across platform, then featured
  const { data: related = [] } = useQuery({
    queryKey: ["related-v2", merchant?.id, product?.id, product?.category],
    enabled: !!merchant?.id && !!product?.id,
    queryFn: async () => {
      const cols = "id,name,price,original_price,thumbnail_url,image_url,slug,is_new,is_on_sale,merchant_id,product_type";
      const seen = new Set<string>([product!.id]);
      const pick = (rows: any[]) => rows.filter((r) => !seen.has(r.id) && seen.add(r.id));
      // Tier 1: same store
      const t1 = await supabase.from("products").select(cols)
        .eq("merchant_id", merchant!.id).eq("is_active", true).neq("id", product!.id).limit(12);
      const out = pick(t1.data ?? []);
      // Tier 2: same category across platform
      if (out.length < 12 && product?.category) {
        const t2 = await supabase.from("products").select(cols)
          .eq("category", product.category).eq("is_active", true).neq("id", product!.id).limit(12);
        out.push(...pick(t2.data ?? []));
      }
      // Tier 3: featured / new
      if (out.length < 12) {
        const t3 = await supabase.from("products").select(cols)
          .eq("is_active", true).eq("is_on_sale", true).neq("id", product!.id).limit(12);
        out.push(...pick(t3.data ?? []));
      }
      return out.slice(0, 12);
    },
  });

  const colors: string[] = useMemo(() => {
    const c = (product?.colors as any) ?? [];
    return Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.name ?? x?.value ?? "")).filter(Boolean) : [];
  }, [product]);
  const sizes: string[] = useMemo(() => {
    const s = (product?.sizes as any) ?? [];
    return Array.isArray(s) ? s.map((x) => (typeof x === "string" ? x : x?.name ?? x?.value ?? "")).filter(Boolean) : [];
  }, [product]);
  const specs: Spec[] = useMemo(() => {
    const s = (product?.specifications as any) ?? [];
    return Array.isArray(s)
      ? s.map((x) => ({ label: String(x?.label ?? x?.key ?? ""), value: String(x?.value ?? "") })).filter((x) => x.label || x.value)
      : [];
  }, [product]);
  const gallery: Media[] = useMemo(() => {
    if (!product) return [];
    const detail = (product.detail_media as any) ?? [];
    const arr: Media[] = Array.isArray(detail)
      ? detail.map((m) => (typeof m === "string" ? { url: m } : { url: m?.url, type: m?.type })).filter((m) => m.url)
      : [];
    // Also include gallery_images (used by the foreign-order importer) so all
    // imported photos surface in the carousel — not just the cover image.
    const galleryImages = (product as any).gallery_images;
    if (Array.isArray(galleryImages)) {
      for (const url of galleryImages) {
        if (typeof url === "string" && url) arr.push({ url, type: "image" });
      }
    }
    if (product.image_url) arr.unshift({ url: product.image_url, type: "image" });
    const seen = new Set<string>();
    return arr.filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)));
  }, [product]);

  const variantStock: Record<string, number> = (product?.variant_stock as any) ?? {};
  const [activeImg, setActiveImg] = useState(0);
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => { setActiveImg(0); setColor(null); setSize(null); setQty(1); }, [product?.id]);
  const isForeign = product?.product_type === "FOREIGN_ORDER";
  const { data: foreignVariants = [] } = useQuery({
    queryKey: ["pdp-foreign-variants", product?.id],
    enabled: !!product?.id && !!isForeign,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_variants")
        .select("size_label,color_label,availability_status,is_purchasable,price_review_required,rounded_customer_price_mnt,final_customer_price_mnt")
        .eq("product_id", product!.id);
      return data ?? [];
    },
  });

  const unavailableColors = useMemo(() => {
    if (!isForeign) return new Set<string>();
    // Color is unavailable iff EVERY variant matching that color is not purchasable.
    const byColor = new Map<string, { total: number; bad: number }>();
    for (const v of foreignVariants as any[]) {
      if (!v.color_label) continue;
      const k = String(v.color_label);
      const cur = byColor.get(k) ?? { total: 0, bad: 0 };
      cur.total++;
      if (v.is_purchasable === false || v.availability_status === "UNAVAILABLE") cur.bad++;
      byColor.set(k, cur);
    }
    return new Set([...byColor.entries()].filter(([, c]) => c.total > 0 && c.bad === c.total).map(([k]) => k));
  }, [foreignVariants, isForeign]);

  const unavailableSizes = useMemo(() => {
    if (!isForeign) return new Set<string>();
    // If a color is chosen, a size is unavailable iff that specific (color,size) combo is not purchasable.
    // Otherwise it's unavailable iff every variant with that size is not purchasable.
    const out = new Set<string>();
    const sizesAll = new Map<string, { total: number; bad: number }>();
    for (const v of foreignVariants as any[]) {
      if (!v.size_label) continue;
      const k = String(v.size_label);
      if (color && v.color_label && v.color_label !== color) continue;
      const cur = sizesAll.get(k) ?? { total: 0, bad: 0 };
      cur.total++;
      if (v.is_purchasable === false || v.availability_status === "UNAVAILABLE") cur.bad++;
      sizesAll.set(k, cur);
    }
    for (const [k, c] of sizesAll) if (c.total > 0 && c.bad === c.total) out.add(k);
    return out;
  }, [foreignVariants, isForeign, color]);

  const selectedForeignVariant = useMemo(() => {
    if (!isForeign) return null;
    return (
      (foreignVariants as any[]).find(
        (v) =>
          (size ? v.size_label === size : true) &&
          (color ? v.color_label === color : true),
      ) ?? null
    );
  }, [foreignVariants, isForeign, size, color]);

  const foreignBlocked =
    isForeign &&
    !!selectedForeignVariant &&
    (selectedForeignVariant.is_purchasable === false ||
      selectedForeignVariant.availability_status === "UNAVAILABLE");

  const foreignPriceReview =
    isForeign &&
    (foreignVariants as any[]).some((v) => v.price_review_required === true);

  // Compute the active display price: variant override (foreign) → product.price
  const variantPriceCandidates = useMemo(() => {
    if (!isForeign) return [] as number[];
    const matches = (foreignVariants as any[]).filter(
      (v) =>
        (size ? v.size_label === size : true) &&
        (color ? v.color_label === color : true),
    );
    return matches
      .map((v) => Number(v.rounded_customer_price_mnt ?? v.final_customer_price_mnt ?? 0))
      .filter((n) => n > 0);
  }, [foreignVariants, isForeign, size, color]);

  const activePrice = useMemo(() => {
    if (variantPriceCandidates.length === 0) return Number(product?.price ?? 0);
    // If a unique variant is matched (or all candidates share the same price), use it.
    const min = Math.min(...variantPriceCandidates);
    const max = Math.max(...variantPriceCandidates);
    return min === max ? min : min;
  }, [variantPriceCandidates, product?.price]);

  const activePriceMax = useMemo(() => {
    if (variantPriceCandidates.length === 0) return null;
    const min = Math.min(...variantPriceCandidates);
    const max = Math.max(...variantPriceCandidates);
    return min === max ? null : max;
  }, [variantPriceCandidates]);

  const variantKey = color && size ? `${color}|${size}` : color || size || "";
  const hasTrackedStock = !!variantKey && typeof variantStock[variantKey] === "number";
  const stockForVariant = hasTrackedStock ? variantStock[variantKey] : Number.MAX_SAFE_INTEGER;
  const needsColor = colors.length > 0 && !color;
  const needsSize = sizes.length > 0 && !size;
  const outOfStock = (hasTrackedStock && stockForVariant <= 0) || foreignBlocked;
  const wished = useIsWishlisted(product?.id);

  if (isLoading || !merchant) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader cartHref={`/store/${merchantSlug}/cart`} />
        <div className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[1.1fr_1fr_0.7fr]">
          <div className="aspect-square animate-pulse rounded-2xl bg-muted" />
          <div className="space-y-3">
            <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-10 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-24 w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="hidden h-64 animate-pulse rounded-2xl bg-muted lg:block" />
        </div>
      </div>
    );
  }
  if (!product) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-muted-foreground">Бараа олдсонгүй</p>
        <Link to="/store/$merchantSlug" params={{ merchantSlug }}>
          <Button variant="outline">Дэлгүүр рүү буцах</Button>
        </Link>
      </div>
    );
  }

  const handleAdd = () => {
    if (needsColor) return toast.error("Өнгө сонгоно уу");
    if (needsSize) return toast.error("Хэмжээ сонгоно уу");
    if (outOfStock) return toast.error("Нөөц дууссан");
    cart.add(merchantSlug, {
      productId: product.id, name: product.name, price: Number(activePrice || product.price),
      image: product.thumbnail_url || product.image_url, color, size, quantity: qty,
    });
    toast.success("Сагсанд нэмэгдлээ");
  };

  const handleBuyNow = () => {
    if (needsColor) return toast.error("Өнгө сонгоно уу");
    if (needsSize) return toast.error("Хэмжээ сонгоно уу");
    if (outOfStock) return toast.error("Нөөц дууссан");
    cart.add(merchantSlug, {
      productId: product.id, name: product.name, price: Number(activePrice || product.price),
      image: product.thumbnail_url || product.image_url, color, size, quantity: qty,
    });
    navigate({ to: "/store/$merchantSlug/cart", params: { merchantSlug } });
  };

  const toggleWish = () => {
    const added = wishlist.toggle({
      productId: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.thumbnail_url || product.image_url,
      merchantSlug,
      productSlug: product.slug ?? product.id,
    });
    toast.success(added ? "Хүссэн жагсаалтад нэмэгдлээ" : "Хүссэн жагсаалтаас хасагдлаа");
  };

  const hasDiscount = product.original_price != null && Number(product.original_price) > Number(product.price);

  // Real rating from reviews; fallback display when no reviews yet
  const reviewCount = reviewStats?.count ?? 0;
  const rating = reviewCount > 0 ? (reviewStats!.avg).toFixed(1) : "5.0";
  const soldCount = Number(product.sales ?? 0);

  const onMainTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onMainTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || gallery.length < 2) return;
    const d = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(d) > 40) {
      setActiveImg((i) => d < 0 ? Math.min(gallery.length - 1, i + 1) : Math.max(0, i - 1));
    }
  };

  const currentMedia = gallery[activeImg];
  const mainMediaFitClass = isForeign ? "object-contain" : "object-cover";
  const prevImg = () => setActiveImg((i) => Math.max(0, i - 1));
  const nextImg = () => setActiveImg((i) => Math.min(gallery.length - 1, i + 1));

  const trustItems = [
    { icon: BadgeCheck, label: "100% оригинал" },
    { icon: ShieldCheck, label: "Албан баталгаа" },
    { icon: RotateCcw, label: "7 хоногт буцаалт" },
    { icon: Shield, label: "Аюулгүй төлбөр" },
    { icon: Zap, label: "Хурдан хүргэлт" },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] pb-20 lg:pb-0">
      <SiteHeader cartHref={`/store/${merchantSlug}/cart`} />

      <div className="container mx-auto px-3 py-3 sm:px-4 sm:py-5">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-3 hidden items-center gap-1 text-xs text-muted-foreground sm:flex sm:text-sm">
          <Link to="/" className="hover:text-foreground">Нүүр</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="hover:text-foreground">{merchant.name}</Link>
          {product.category && (<><ChevronRight className="h-3.5 w-3.5" /><span className="hover:text-foreground">{product.category}</span></>)}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate text-foreground">{product.name}</span>
        </nav>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,0.7fr)] lg:gap-6">
          {/* === Gallery === */}
          <div className="min-w-0 overflow-hidden">
            <Card
              className="group relative aspect-square w-full max-w-full overflow-hidden rounded-2xl border-border/60 bg-white p-0"
              onTouchStart={onMainTouchStart}
              onTouchEnd={onMainTouchEnd}
            >
              <div className="absolute inset-0 overflow-hidden bg-muted">
                {currentMedia?.url ? (
                  currentMedia.type === "video" ? (
                    <video src={currentMedia.url} controls className="h-full w-full object-contain" />
                  ) : (
                    <img src={currentMedia.url} alt={product.name} className={`h-full w-full ${mainMediaFitClass}`} />
                  )
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">Зураг алга</div>
                )}

                {/* Badges top-left */}
                <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5">
                  <AvailabilityBadge product={product} size="sm" />
                </div>

                {/* Heart top-right */}
                <button
                  type="button"
                  aria-label={wished ? "Хүссэн жагсаалтаас хасах" : "Хүссэнд нэмэх"}
                  aria-pressed={wished}
                  onClick={toggleWish}
                  className={`absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition hover:scale-105 ${wished ? "text-rose-500" : "text-foreground hover:text-rose-500"}`}
                >
                  <Heart className={`h-4 w-4 ${wished ? "fill-current" : ""}`} />
                </button>

                {/* Desktop arrows */}
                {gallery.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Өмнөх зураг"
                      onClick={prevImg}
                      disabled={activeImg === 0}
                      className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md backdrop-blur transition hover:bg-white disabled:opacity-30 lg:inline-flex"
                    ><ChevronLeft className="h-5 w-5" /></button>
                    <button
                      type="button"
                      aria-label="Дараагийн зураг"
                      onClick={nextImg}
                      disabled={activeImg === gallery.length - 1}
                      className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md backdrop-blur transition hover:bg-white disabled:opacity-30 lg:inline-flex"
                    ><ChevronRight className="h-5 w-5" /></button>

                    {/* Mobile arrows */}
                    <button
                      type="button"
                      aria-label="Өмнөх зураг"
                      onClick={prevImg}
                      disabled={activeImg === 0}
                      className="absolute left-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow backdrop-blur disabled:opacity-30 lg:hidden"
                    ><ChevronLeft className="h-5 w-5" /></button>
                    <button
                      type="button"
                      aria-label="Дараагийн зураг"
                      onClick={nextImg}
                      disabled={activeImg === gallery.length - 1}
                      className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow backdrop-blur disabled:opacity-30 lg:hidden"
                    ><ChevronRight className="h-5 w-5" /></button>

                    {/* Counter */}
                    <div className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-medium text-white">
                      {activeImg + 1} / {gallery.length}
                    </div>
                  </>
                )}
              </div>
            </Card>

            {/* Thumbnail row */}
            {gallery.length > 1 && (
              <div className="mt-3 flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1">
                {gallery.map((m, i) => (
                  <button
                    key={m.url + i}
                    onClick={() => setActiveImg(i)}
                    aria-label={`Зураг ${i + 1}`}
                    aria-current={i === activeImg}
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition ${i === activeImg ? "border-primary" : "border-transparent hover:border-border"}`}
                  >
                    {m.type === "video" ? (
                      <div className="flex h-full w-full items-center justify-center bg-muted"><Play className="h-4 w-4" /></div>
                    ) : (
                      <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* === Info column === */}
          <div className="min-w-0">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-1.5">
              <AvailabilityBadge product={product} size="md" />
              {product.category && (
                <Badge variant="secondary" className="text-xs">{product.category}</Badge>
              )}
              {isForeignOrder(product) && <ForeignOrderInlineBadge product={product} />}
              <CountryOriginBadge product={product as any} size="md" />
            </div>

            {/* Name */}
            <h1 className="mt-2 text-xl font-bold leading-tight text-foreground sm:text-2xl">{product.name}</h1>

            {/* Rating row */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{rating}</span>
                <span className="text-muted-foreground">({reviewCount} үнэлгээ)</span>
              </div>
              {soldCount > 0 && <span className="text-muted-foreground">{soldCount} борлуулалт</span>}
            </div>

            {/* Brand + SKU */}
            {(product.product_code) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>SKU: <span className="font-mono text-foreground">{product.product_code}</span></span>
              </div>
            )}

            {/* Price */}
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-extrabold text-orange-600 sm:text-3xl">
                {fmtMnt(Number(activePrice || product.price))}
                {activePriceMax ? ` – ${fmtMnt(activePriceMax)}` : ""}
              </span>
              {hasDiscount && (
                <span className="text-base text-muted-foreground line-through sm:text-lg">{fmtMnt(Number(product.original_price))}</span>
              )}
            </div>

            <ForeignOrderPanel product={product as any} />

            {foreignPriceReview && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠ Эх сурвалж дээр энэ барааны үнэ өөрчлөгдсөн байж болзошгүй. Мерчант шинэ үнийг
                хянаж буй учир сонгосон хувилбарын эцсийн үнэ захиалга баталгаажих үед өөрчлөгдөж болно.
              </div>
            )}
            {foreignBlocked && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Сонгосон хувилбар Poizon Korea дээр түр дууссан байна. Өөр хувилбар сонгоно уу.
              </div>
            )}


            {/* Colors */}
            {colors.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-sm font-medium">Өнгө: <span className="text-muted-foreground">{color ?? "сонгоогүй"}</span></div>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => {
                    const disabled = unavailableColors.has(c);
                    return (
                      <button key={c} disabled={disabled} onClick={() => !disabled && setColor(c)}
                        title={disabled ? "Энэ өнгө одоогоор боломжгүй" : undefined}
                        className={`relative rounded-lg border px-3.5 py-1.5 text-sm transition ${
                          disabled
                            ? "cursor-not-allowed border-dashed border-border bg-muted text-muted-foreground line-through opacity-60"
                            : color === c
                            ? "border-orange-500 bg-orange-50 text-orange-600"
                            : "border-border bg-white hover:border-orange-300"
                        }`}>
                        {color === c && !disabled && <Check className="mr-1 inline h-3 w-3" />}{c}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sizes */}
            {sizes.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium">Хэмжээ: <span className="text-muted-foreground">{size ?? "сонгоогүй"}</span></div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => {
                    const disabled = unavailableSizes.has(s);
                    return (
                      <button key={s} disabled={disabled} onClick={() => !disabled && setSize(s)}
                        title={disabled ? "Энэ хэмжээ одоогоор боломжгүй" : undefined}
                        className={`min-w-14 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                          disabled
                            ? "cursor-not-allowed border-dashed border-border bg-muted text-muted-foreground line-through opacity-60"
                            : size === s
                            ? "border-orange-500 bg-orange-50 text-orange-600"
                            : "border-border bg-white hover:border-orange-300"
                        }`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity + stock */}
            <div className="mt-5">
              <div className="mb-2 text-sm font-medium">Тоо ширхэг:</div>
              <div className="flex items-center gap-4">
                <div className="inline-flex items-center rounded-lg border bg-white">
                  <Button variant="ghost" size="icon" aria-label="Хасах" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></Button>
                  <span className="w-10 text-center text-sm font-semibold">{qty}</span>
                  <Button variant="ghost" size="icon" aria-label="Нэмэх" onClick={() => setQty((q) => Math.min(stockForVariant || q + 1, q + 1))}><Plus className="h-4 w-4" /></Button>
                </div>
                <span className={`text-xs sm:text-sm ${outOfStock ? "font-medium text-red-500" : "text-muted-foreground"}`}>
                  {outOfStock
                    ? "Нөөц дууссан"
                    : <>Бэлэн байгаа: <span className="font-semibold text-emerald-600">{hasTrackedStock ? `${stockForVariant} ширхэг` : "хангалттай"}</span></>}
                </span>
              </div>
            </div>

            {/* Desktop CTAs */}
            <div className="mt-5 hidden gap-2 lg:flex">
              <Button size="lg" className="h-12 flex-1 bg-orange-500 text-white hover:bg-orange-600" onClick={handleAdd} disabled={outOfStock}>
                <ShoppingCart className="mr-2 h-5 w-5" /> Сагсанд нэмэх
              </Button>
              <Button size="lg" variant="outline" className="h-12 flex-1 border-orange-500 text-orange-600 hover:bg-orange-50" disabled={outOfStock} onClick={handleBuyNow}>
                Одоо авах
              </Button>
            </div>

            {/* Wishlist + share inline */}
            <div className="mt-3 hidden items-center gap-6 text-sm lg:flex">
              <button
                type="button"
                onClick={toggleWish}
                className={`inline-flex items-center gap-1.5 transition ${wished ? "text-rose-500" : "text-muted-foreground hover:text-rose-500"}`}
              >
                <Heart className={`h-4 w-4 ${wished ? "fill-current" : ""}`} />
                {wished ? "Хүссэнд хадгалсан" : "Хүссэнд нэмэх"}
              </button>
              <ShareMenu
                url={typeof window !== "undefined" ? window.location.href : ""}
                title={product.name}
                text={product.description ?? undefined}
              />
            </div>

            {/* Trust strip */}
            <div className="mt-5 hidden flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border/60 bg-white px-4 py-3 text-xs text-muted-foreground sm:flex">
              {trustItems.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <t.icon className="h-4 w-4 text-emerald-600" /> {t.label}
                </span>
              ))}
            </div>
          </div>

          {/* === Right column (desktop only) === */}
          <aside className="hidden flex-col gap-4 lg:flex">
            {/* Delivery card (dynamic from merchant.shipping_config) */}
            <ShippingCard merchant={merchant} product={product} />


            {/* Store card */}
            <Card className="rounded-2xl border-border/60 bg-white p-4">
              <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="block">
                <div className="flex items-center gap-3">
                  {merchant.logo_url ? (
                    <img src={merchant.logo_url} alt={merchant.name} className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><StoreIcon className="h-6 w-6" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{merchant.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-foreground">4.9</span>
                      </span>
                      <span>•</span>
                      <span>Итгэмжлэгдсэн дэлгүүр</span>
                    </div>
                  </div>
                </div>
              </Link>
              <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="mt-3 block">
                <Button variant="outline" className="w-full">Дэлгүүр рүү орох</Button>
              </Link>
            </Card>

            {/* Secure payment (dynamic from payment_providers) */}
            <PaymentMethodsCard providers={payments} />

          </aside>
        </div>

        {/* === Detail tabs + Reviews summary === */}
        <div className="mt-8 grid gap-5 lg:mt-12 lg:grid-cols-2 lg:gap-6">
          {/* Tabs */}
          <Card className="rounded-2xl border-border/60 bg-white p-4 sm:p-5">
            <Tabs defaultValue="desc">
              <TabsList className="w-full justify-start overflow-x-auto bg-transparent p-0">
                <TabsTrigger value="desc" className="data-[state=active]:border-orange-500 data-[state=active]:text-orange-600 rounded-none border-b-2 border-transparent px-3 py-2">
                  Бүтээгдэхүүний мэдээлэл
                </TabsTrigger>
                {specs.length > 0 && (
                  <TabsTrigger value="specs" className="data-[state=active]:border-orange-500 data-[state=active]:text-orange-600 rounded-none border-b-2 border-transparent px-3 py-2">
                    Техникийн үзүүлэлт
                  </TabsTrigger>
                )}
                <TabsTrigger value="delivery" className="data-[state=active]:border-orange-500 data-[state=active]:text-orange-600 rounded-none border-b-2 border-transparent px-3 py-2">
                  Хүргэлт & Буцаалт
                </TabsTrigger>
              </TabsList>
              <TabsContent value="desc" className="mt-4">
                {product.description ? (
                  /<[a-z][\s\S]*>/i.test(product.description) ? (
                    <div
                      className="prose prose-sm max-w-none text-sm text-foreground prose-headings:text-foreground prose-img:rounded-xl prose-img:my-3 prose-table:text-sm prose-th:bg-muted prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-table:border prose-th:border prose-td:border"
                      dangerouslySetInnerHTML={{ __html: product.description }}
                    />
                  ) : (
                    <div className="whitespace-pre-line text-sm text-foreground">{product.description}</div>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">Тайлбар оруулаагүй байна.</p>
                )}
              </TabsContent>
              {specs.length > 0 && (
                <TabsContent value="specs" className="mt-4">
                  <dl className="divide-y divide-border">
                    {specs.map((s, i) => (
                      <div key={i} className="grid grid-cols-[120px_1fr] gap-3 py-2.5 sm:grid-cols-[180px_1fr]">
                        <dt className="text-sm text-muted-foreground">{s.label}</dt>
                        <dd className="text-sm font-medium">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                </TabsContent>
              )}
              <TabsContent value="delivery" className="mt-4">
                <PolicyBlock
                  title="Хүргэлтийн нөхцөл"
                  html={merchant.policy_shipping || platformDefaults?.policy_shipping_default || ""}
                />
                <div className="mt-4">
                  <PolicyBlock
                    title="Буцаалтын нөхцөл"
                    html={merchant.policy_return || platformDefaults?.policy_return_default || ""}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </Card>

          {/* Reviews summary (real) */}
          <ReviewSummaryCard
            count={reviewCount}
            avg={Number(rating)}
            dist={reviewStats?.dist ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }}
          />
          <ReviewsSection productId={product.id} />
        </div>

        {/* === Mobile-only: store card === */}
        <Card className="mt-5 rounded-2xl border-border/60 bg-white p-4 lg:hidden">
          <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="block">
            <div className="flex items-center gap-3">
              {merchant.logo_url ? (
                <img src={merchant.logo_url} alt={merchant.name} className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted"><StoreIcon className="h-5 w-5" /></div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{merchant.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-foreground">{rating}</span>
                  </span>
                  <span>•</span>
                  <span>{merchant.followers_count ?? 0} дагагч</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        </Card>

        {/* === Related === */}
        {related.length > 0 && (
          <section className="mt-8 sm:mt-12">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-base font-bold sm:text-lg">Ижил төстэй бараанууд</h2>
              <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="text-xs font-medium text-orange-600 hover:underline sm:text-sm">
                Бүгдийг үзэх →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
              {related.slice(0, 6).map((p: any) => (
                <Link
                  key={p.id}
                  to="/store/$merchantSlug/product/$productSlug"
                  params={{ merchantSlug, productSlug: p.slug ?? p.id }}
                >
                  <Card className="group flex h-full flex-col overflow-hidden rounded-2xl border-border/60 bg-white transition-all hover:border-orange-300 hover:shadow-md">
                    <div className="relative aspect-square bg-muted">
                      {(p.thumbnail_url || p.image_url) && (
                        <img src={p.thumbnail_url ?? p.image_url} alt={p.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-2.5">
                      <h3 className="line-clamp-2 min-h-[2.25rem] text-xs font-medium leading-tight group-hover:text-orange-600 sm:text-[13px]">{p.name}</h3>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-sm font-bold text-orange-600">{fmtMnt(Number(p.price))}</span>
                        {p.original_price && Number(p.original_price) > Number(p.price) && (
                          <span className="text-[10px] text-muted-foreground line-through">{fmtMnt(Number(p.original_price))}</span>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <SiteFooter />

      {/* === Mobile sticky CTA === */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 px-3 py-2.5 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
        <div className="container mx-auto flex items-center gap-2">
          <Link to="/store/$merchantSlug/cart" params={{ merchantSlug }} aria-label="Сагс">
            <Button variant="outline" size="icon" className="relative h-11 w-11 shrink-0 border-orange-500 text-orange-600">
              <ShoppingCart className="h-5 w-5" />
              {cartItems.length > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                  {cartItems.reduce((s, i) => s + i.quantity, 0)}
                </span>
              )}
            </Button>
          </Link>
          <Button
            className="h-11 flex-1 bg-orange-500 text-white hover:bg-orange-600"
            onClick={handleAdd}
            disabled={outOfStock}
          >
            Сагсанд нэмэх
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1 border-orange-500 text-orange-600 hover:bg-orange-50"
            onClick={handleBuyNow}
            disabled={outOfStock}
          >
            Одоо авах
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  Reusable PDP sub-components                                 */
/* ============================================================ */

type ShippingItem = {
  title: string;
  description?: string;
  duration?: string;
  price?: number;
  free?: boolean;
  label?: string;
};

function ShippingCard({ merchant }: { merchant: any }) {
  const cfg = (merchant?.shipping_config ?? {}) as {
    ub?: ShippingItem;
    local?: ShippingItem;
    extras?: ShippingItem[];
  };
  const defaultUb: ShippingItem = { title: "Улаанбаатар дотор", duration: "24-48 цаг", price: 0, free: true };
  const defaultLocal: ShippingItem = { title: "Орон нутагт", duration: "2-4 хоног", price: 6000, label: "" };
  const ub = { ...defaultUb, ...(cfg.ub ?? {}) };
  const local = { ...defaultLocal, ...(cfg.local ?? {}) };
  const extras = Array.isArray(cfg.extras) ? cfg.extras : [];

  const renderRow = (it: ShippingItem, key: string) => {
    const priceLabel =
      it.free
        ? "Үнэгүй"
        : it.label
          ? it.label
          : typeof it.price === "number"
            ? fmtMnt(it.price)
            : "—";
    const priceClass = it.free ? "font-semibold text-emerald-600" : "font-semibold";
    return (
      <li key={key} className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Truck className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{it.title}</div>
            {(it.description || it.duration) && (
              <div className="text-xs text-muted-foreground">
                {it.description || it.duration}
              </div>
            )}
          </div>
        </div>
        <span className={priceClass}>{priceLabel}</span>
      </li>
    );
  };

  return (
    <Card className="rounded-2xl border-border/60 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">Хүргэлтийн мэдээлэл</h3>
      <ul className="space-y-3 text-sm">
        {renderRow(ub, "ub")}
        {renderRow(local, "local")}
        {extras.map((it, i) => renderRow(it, `ex-${i}`))}
        <li className="flex items-start justify-between gap-3 border-t pt-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div className="font-medium">Хүргэлтийн компани</div>
          </div>
          <span className="text-xs text-muted-foreground">Only Delivery</span>
        </li>
      </ul>
    </Card>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  qpay: "QPay",
  storepay: "StorePay",
  pocket: "Pocket",
  omniway: "Omniway",
  visa: "Visa",
  mastercard: "MasterCard",
  hipay: "HiPay",
  cash: "Бэлэн",
};

function PaymentMethodsCard({ providers }: { providers: any[] }) {
  const visible = providers ?? [];
  return (
    <Card className="rounded-2xl border-border/60 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">Аюулгүй төлбөр</h3>
      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">Төлбөрийн сонголт удахгүй нэмэгдэнэ.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((p) => {
            const label = p.name || PROVIDER_LABELS[(p.provider_type ?? "").toLowerCase()] || p.provider_type;
            const iconStr = typeof p.icon === "string" ? p.icon.trim() : "";
            const isIconUrl = /^https?:\/\//i.test(iconStr);
            const imgSrc = p.logo_url || (isIconUrl ? iconStr : "");
            const emoji = !isIconUrl ? iconStr : "";
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-white px-3 py-2"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-white">
                  {imgSrc ? (
                    <img src={imgSrc} alt={label} className="max-h-6 max-w-6 object-contain" loading="lazy" />
                  ) : emoji ? (
                    <span className="text-lg leading-none" aria-hidden>{emoji}</span>
                  ) : (
                    <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{label}</div>
                  {p.description ? (
                    <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Таны төлбөр 100% хамгаалагдсан.</p>
    </Card>
  );
}

function PolicyBlock({ title, html }: { title: string; html: string }) {
  if (!html) {
    return (
      <div>
        <h4 className="mb-1.5 text-sm font-semibold">{title}</h4>
        <p className="text-sm text-muted-foreground">Тохиргоо одоогоор хоосон байна.</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold">{title}</h4>
      <div
        className="prose prose-sm max-w-none text-sm text-foreground prose-headings:text-foreground prose-li:my-0.5 prose-ul:my-2 prose-p:my-2"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function ReviewSummaryCard({
  count,
  avg,
  dist,
}: {
  count: number;
  avg: number;
  dist: Record<number, number>;
}) {
  const display = count > 0 ? avg.toFixed(1) : "5.0";
  return (
    <Card className="rounded-2xl border-border/60 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Хэрэглэгчийн үнэлгээ ({count})</h3>
      </div>
      <div className="mt-3 flex items-center gap-5">
        <div className="text-center">
          <div className="text-3xl font-extrabold">{display}</div>
          <div className="mt-1 flex justify-center">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`h-4 w-4 ${n <= Math.round(Number(display)) ? "fill-amber-400 text-amber-400" : "text-muted"}`}
              />
            ))}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {count === 0 ? "Үнэлгээ алга" : `${count} үнэлгээ`}
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const n = dist[star] ?? 0;
            const pct = count > 0 ? Math.round((n / count) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-muted-foreground">{star} ★</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right text-muted-foreground">{n}</span>
              </div>
            );
          })}
        </div>
      </div>
      {count === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Энэ бараанд үнэлгээ хараахан алга. Худалдан авч, хүргэлт амжилттай дууссаны дараа үнэлгээ үлдээх боломжтой.
        </p>
      )}
    </Card>
  );
}

