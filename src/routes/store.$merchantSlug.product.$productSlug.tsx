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

export const Route = createFileRoute("/store/$merchantSlug/product/$productSlug")({
  component: ProductDetailPage,
});

type Spec = { label: string; value: string };
type Media = { url: string; type?: "image" | "video" };

/* tiny stable hash for demo rating/sold */
function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function ProductDetailPage() {
  const { merchantSlug, productSlug } = Route.useParams();
  const navigate = useNavigate();
  const cartItems = useCart(merchantSlug);

  const { data: merchant } = useQuery({
    queryKey: ["merchant", merchantSlug],
    queryFn: async () =>
      (await supabase.from("merchants").select("id,name,slug,logo_url,description").eq("slug", merchantSlug).maybeSingle()).data,
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

  const { data: related = [] } = useQuery({
    queryKey: ["related", merchant?.id, product?.id, product?.category],
    enabled: !!merchant?.id && !!product?.id,
    queryFn: async () => {
      let q = supabase.from("products")
        .select("id,name,price,original_price,thumbnail_url,image_url,slug,is_new,is_on_sale")
        .eq("merchant_id", merchant!.id).eq("is_active", true).neq("id", product!.id).limit(12);
      if (product?.category) q = q.eq("category", product.category);
      const { data } = await q;
      return data ?? [];
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

  const variantKey = color && size ? `${color}|${size}` : color || size || "";
  const hasTrackedStock = !!variantKey && typeof variantStock[variantKey] === "number";
  const stockForVariant = hasTrackedStock ? variantStock[variantKey] : Number.MAX_SAFE_INTEGER;
  const needsColor = colors.length > 0 && !color;
  const needsSize = sizes.length > 0 && !size;
  const outOfStock = hasTrackedStock && stockForVariant <= 0;
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
      productId: product.id, name: product.name, price: Number(product.price),
      image: product.thumbnail_url || product.image_url, color, size, quantity: qty,
    });
    toast.success("Сагсанд нэмэгдлээ");
  };

  const handleBuyNow = () => {
    if (needsColor) return toast.error("Өнгө сонгоно уу");
    if (needsSize) return toast.error("Хэмжээ сонгоно уу");
    if (outOfStock) return toast.error("Нөөц дууссан");
    cart.add(merchantSlug, {
      productId: product.id, name: product.name, price: Number(product.price),
      image: product.thumbnail_url || product.image_url, color, size, quantity: qty,
    });
    navigate({ to: "/store/$merchantSlug/cart", params: { merchantSlug } });
  };

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: product.name, url });
      else { await navigator.clipboard.writeText(url); toast.success("Холбоос хуулагдлаа"); }
    } catch { /* cancelled */ }
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
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.original_price)) * 100)
    : 0;

  // Demo rating/sold derived from product id (graceful fallback — no real ratings table)
  const idHash = Math.abs(hashStr(product.id));
  const rating = (4.3 + (idHash % 7) / 10).toFixed(1);
  const reviewCount = 12 + (idHash % 240);
  const soldCount = 30 + (idHash % 500);

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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,0.7fr)] lg:gap-6">
          {/* === Gallery === */}
          <div>
            <Card
              className="group relative overflow-hidden rounded-2xl border-border/60 bg-white"
              onTouchStart={onMainTouchStart}
              onTouchEnd={onMainTouchEnd}
            >
              <div className="relative aspect-square bg-muted">
                {currentMedia?.url ? (
                  currentMedia.type === "video" ? (
                    <video src={currentMedia.url} controls className="h-full w-full object-cover" />
                  ) : (
                    <img src={currentMedia.url} alt={product.name}
                      className="h-full w-full object-cover" />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">Зураг алга</div>
                )}

                {/* Badges top-left */}
                <div className="absolute left-3 top-3 flex flex-col gap-1.5">
                  {hasDiscount && (
                    <Badge className="bg-red-500 px-2 py-0.5 text-xs font-bold text-white hover:bg-red-500">
                      -{discountPct}%
                    </Badge>
                  )}
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
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
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
              {product.is_new && (
                <Badge className="bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-emerald-500">Шинэ</Badge>
              )}
              {product.is_on_sale && (
                <Badge className="bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-orange-500">Онцлох</Badge>
              )}
              {product.category && (
                <Badge variant="secondary" className="text-xs">{product.category}</Badge>
              )}
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
              <span className="text-muted-foreground">{soldCount} борлуулалт</span>
            </div>

            {/* Brand + SKU */}
            {(product.product_code) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>SKU: <span className="font-mono text-foreground">{product.product_code}</span></span>
              </div>
            )}

            {/* Price */}
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-extrabold text-orange-600 sm:text-3xl">{fmtMnt(Number(product.price))}</span>
              {hasDiscount && (
                <>
                  <span className="text-base text-muted-foreground line-through sm:text-lg">{fmtMnt(Number(product.original_price))}</span>
                  <Badge className="bg-red-500 text-white hover:bg-red-500">-{discountPct}%</Badge>
                </>
              )}
            </div>

            {/* Colors */}
            {colors.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-sm font-medium">Өнгө: <span className="text-muted-foreground">{color ?? "сонгоогүй"}</span></div>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button key={c} onClick={() => setColor(c)}
                      className={`rounded-lg border px-3.5 py-1.5 text-sm transition ${color === c ? "border-orange-500 bg-orange-50 text-orange-600" : "border-border bg-white hover:border-orange-300"}`}>
                      {color === c && <Check className="mr-1 inline h-3 w-3" />}{c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sizes */}
            {sizes.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium">Хэмжээ: <span className="text-muted-foreground">{size ?? "сонгоогүй"}</span></div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <button key={s} onClick={() => setSize(s)}
                      className={`min-w-14 rounded-lg border px-3 py-2 text-sm font-medium transition ${size === s ? "border-orange-500 bg-orange-50 text-orange-600" : "border-border bg-white hover:border-orange-300"}`}>
                      {s}
                    </button>
                  ))}
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
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 text-muted-foreground transition hover:text-foreground"
              >
                <Share2 className="h-4 w-4" /> Хуваалцах
              </button>
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
            {/* Delivery card */}
            <Card className="rounded-2xl border-border/60 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold">Хүргэлтийн мэдээлэл</h3>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Truck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">Улаанбаатар дотор</div>
                      <div className="text-xs text-muted-foreground">24-48 цаг</div>
                    </div>
                  </div>
                  <span className="font-semibold text-emerald-600">Үнэгүй</span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Truck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">Орон нутагт</div>
                      <div className="text-xs text-muted-foreground">2-4 хоног</div>
                    </div>
                  </div>
                  <span className="font-semibold">₮6,000</span>
                </li>
                <li className="flex items-start justify-between gap-3 border-t pt-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="font-medium">Хүргэлтийн компани</div>
                  </div>
                  <span className="text-xs text-muted-foreground">Only Delivery</span>
                </li>
              </ul>
            </Card>

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

            {/* Secure payment */}
            <Card className="rounded-2xl border-border/60 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold">Аюулгүй төлбөр</h3>
              <div className="flex flex-wrap gap-2">
                {["StorePay", "QPay", "Pocket", "VISA", "Master"].map((m) => (
                  <span key={m} className="rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    {m}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Таны төлбөр 100% хамгаалагдсан.</p>
            </Card>
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
                  <div className="whitespace-pre-line text-sm text-foreground">{product.description}</div>
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
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Захиалгыг ажлын өдөр 24 цагийн дотор бэлтгэж хүргэлтэнд гаргана.</li>
                  <li>• Улаанбаатар хотод 1-3 хоногт, орон нутагт 3-7 хоногт хүрнэ.</li>
                  <li>• Бараа гэмтэлтэй ирвэл хүлээн авснаас хойш 24 цагт мэдэгдэнэ үү.</li>
                  <li>• 7 хоногийн дотор буцаалт, солилт боломжтой.</li>
                </ul>
              </TabsContent>
            </Tabs>
          </Card>

          {/* Reviews summary */}
          <Card className="rounded-2xl border-border/60 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Хэрэглэгчийн үнэлгээ ({reviewCount})</h3>
              <button className="text-xs font-medium text-orange-600 hover:underline">Бүх үнэлгээг харах</button>
            </div>
            <div className="mt-3 flex items-center gap-5">
              <div className="text-center">
                <div className="text-3xl font-extrabold">{rating}</div>
                <div className="mt-1 flex justify-center">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={`h-4 w-4 ${n <= Math.round(Number(rating)) ? "fill-amber-400 text-amber-400" : "text-muted"}`} />
                  ))}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{reviewCount} үнэлгээ</div>
              </div>
              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const pct = star === 5 ? 78 : star === 4 ? 14 : star === 3 ? 5 : star === 2 ? 2 : 1;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-6 text-muted-foreground">{star} ★</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right text-muted-foreground">{Math.round(reviewCount * pct / 100)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
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
                    <span className="font-semibold text-foreground">4.9</span>
                  </span>
                  <span>•</span>
                  <span>Итгэмжлэгдсэн дэлгүүр</span>
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
