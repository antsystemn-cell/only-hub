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
import {
  Minus, Plus, ShoppingCart, ChevronRight, Check, ChevronLeft, Heart,
  Share2, Truck, Shield, Store as StoreIcon, Play,
} from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

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
        .eq("merchant_id", merchant!.id).eq("is_active", true).neq("id", product!.id).limit(8);
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
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => { setActiveImg(0); setColor(null); setSize(null); setQty(1); }, [product?.id]);

  const variantKey = color && size ? `${color}|${size}` : color || size || "";
  // Easyshop-style: only enforce stock if this specific variant has a tracked number.
  const hasTrackedStock = !!variantKey && typeof variantStock[variantKey] === "number";
  const stockForVariant = hasTrackedStock ? variantStock[variantKey] : Number.MAX_SAFE_INTEGER;
  const needsColor = colors.length > 0 && !color;
  const needsSize = sizes.length > 0 && !size;
  const outOfStock = hasTrackedStock && stockForVariant <= 0;

  if (isLoading || !merchant) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-2xl bg-muted" />
          <div className="space-y-3">
            <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-10 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-24 w-full animate-pulse rounded bg-muted" />
          </div>
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

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: product.name, url });
      else { await navigator.clipboard.writeText(url); toast.success("Холбоос хуулагдлаа"); }
    } catch { /* cancelled */ }
  };

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  const hasDiscount = product.original_price != null && Number(product.original_price) > Number(product.price);
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.original_price)) * 100)
    : 0;

  const onMainTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onMainTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || gallery.length < 2) return;
    const d = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(d) > 40) {
      setActiveImg((i) => d < 0 ? Math.min(gallery.length - 1, i + 1) : Math.max(0, i - 1));
    }
  };

  const onMainMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  const currentMedia = gallery[activeImg];

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader
        cartHref={`/store/${merchantSlug}/cart`}
        rightOfLogo={
          <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="font-semibold hover:text-orange-600">
            {merchant.name}
          </Link>
        }
        trailing={
          <Button variant="ghost" size="icon" aria-label="Хуваалцах" onClick={handleShare} className="rounded-full">
            <Share2 className="h-5 w-5" />
          </Button>
        }
      />

      <div className="container mx-auto px-3 py-3 sm:px-4 sm:py-5">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
          <Link to="/" className="hover:text-foreground">Нүүр</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="hover:text-foreground">{merchant.name}</Link>
          {product.category && (<><ChevronRight className="h-3.5 w-3.5" /><span className="hover:text-foreground">{product.category}</span></>)}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate text-foreground">{product.name}</span>
        </nav>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
          {/* Gallery */}
          <div className="lg:flex lg:gap-3">
            {/* Side thumbs (desktop) */}
            {gallery.length > 1 && (
              <div className="order-1 hidden flex-col gap-2 lg:flex lg:max-h-[560px] lg:overflow-y-auto">
                {gallery.map((m, i) => (
                  <button
                    key={m.url + i}
                    onClick={() => setActiveImg(i)}
                    aria-label={`Зураг ${i + 1}`}
                    aria-current={i === activeImg}
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === activeImg ? "border-primary" : "border-transparent hover:border-border"}`}
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

            {/* Main image */}
            <div className="order-2 flex-1">
              <Card
                className="group relative overflow-hidden rounded-2xl"
                onMouseEnter={() => setZoom({ x: 50, y: 50 })}
                onMouseLeave={() => setZoom(null)}
                onMouseMove={onMainMouseMove}
                onTouchStart={onMainTouchStart}
                onTouchEnd={onMainTouchEnd}
              >
                <div className="relative aspect-square bg-muted">
                  {currentMedia?.url ? (
                    currentMedia.type === "video" ? (
                      <video src={currentMedia.url} controls className="h-full w-full object-cover" />
                    ) : (
                      <img
                        src={currentMedia.url}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-200"
                        style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%`, transform: "scale(1.6)" } : undefined}
                      />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">Зураг алга</div>
                  )}

                  {/* Badges */}
                  <div className="absolute left-3 top-3 flex flex-col gap-1.5">
                    {product.is_new && <Badge className="bg-blue-500 text-white hover:bg-blue-500">ШИНЭ</Badge>}
                    {hasDiscount && <Badge className="bg-red-500 text-white hover:bg-red-500">-{discountPct}%</Badge>}
                  </div>

                  {/* Mobile arrows */}
                  {gallery.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Өмнөх зураг"
                        onClick={() => setActiveImg((i) => Math.max(0, i - 1))}
                        disabled={activeImg === 0}
                        className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow backdrop-blur disabled:opacity-30 lg:hidden"
                      ><ChevronLeft className="h-5 w-5" /></button>
                      <button
                        type="button"
                        aria-label="Дараагийн зураг"
                        onClick={() => setActiveImg((i) => Math.min(gallery.length - 1, i + 1))}
                        disabled={activeImg === gallery.length - 1}
                        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow backdrop-blur disabled:opacity-30 lg:hidden"
                      ><ChevronRight className="h-5 w-5" /></button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-2.5 py-0.5 text-xs font-medium shadow lg:hidden">
                        {activeImg + 1} / {gallery.length}
                      </div>
                    </>
                  )}
                </div>
              </Card>

              {/* Mobile thumbs */}
              {gallery.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                  {gallery.map((m, i) => (
                    <button
                      key={m.url + i}
                      onClick={() => setActiveImg(i)}
                      aria-label={`Зураг ${i + 1}`}
                      className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === activeImg ? "border-primary" : "border-transparent"}`}
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
          </div>

          {/* Info column */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            <div className="flex flex-wrap items-center gap-1.5">
              {product.category && <Badge variant="secondary" className="text-xs">{product.category}</Badge>}
              {product.is_on_sale && <Badge className="bg-red-500 text-xs text-white hover:bg-red-500">Хямдрал</Badge>}
            </div>
            <h1 className="mt-2 text-xl font-bold leading-tight sm:text-2xl md:text-3xl">{product.name}</h1>
            {product.product_code && (
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Код: <span className="font-mono">{product.product_code}</span></p>
            )}

            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-bold text-orange-600 sm:text-3xl">{fmtMnt(Number(product.price))}</span>
              {hasDiscount && (
                <>
                  <span className="text-base text-muted-foreground line-through sm:text-lg">{fmtMnt(Number(product.original_price))}</span>
                  <Badge className="bg-red-500 text-white hover:bg-red-500">-{discountPct}%</Badge>
                </>
              )}
            </div>

            {/* Merchant strip */}
            <Link to="/store/$merchantSlug" params={{ merchantSlug }}>
              <Card className="mt-4 flex items-center gap-3 rounded-xl p-3 transition hover:border-primary">
                {merchant.logo_url ? (
                  <img src={merchant.logo_url} alt={merchant.name} className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><StoreIcon className="h-5 w-5" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{merchant.name}</div>
                  <div className="truncate text-xs text-muted-foreground">Дэлгүүр үзэх →</div>
                </div>
              </Card>
            </Link>

            {colors.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-sm font-medium">Өнгө: <span className="text-muted-foreground">{color ?? "сонгоогүй"}</span></div>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button key={c} onClick={() => setColor(c)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${color === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"}`}>
                      {color === c && <Check className="mr-1 inline h-3 w-3" />}{c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {sizes.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium">Хэмжээ: <span className="text-muted-foreground">{size ?? "сонгоогүй"}</span></div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <button key={s} onClick={() => setSize(s)}
                      className={`min-w-12 rounded-lg border px-3 py-2 text-sm transition ${size === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <div className="inline-flex items-center rounded-lg border">
                <Button variant="ghost" size="icon" aria-label="Хасах" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></Button>
                <span className="w-10 text-center text-sm font-semibold">{qty}</span>
                <Button variant="ghost" size="icon" aria-label="Нэмэх" onClick={() => setQty((q) => Math.min(stockForVariant || q + 1, q + 1))}><Plus className="h-4 w-4" /></Button>
              </div>
              <span className={`text-xs sm:text-sm ${outOfStock ? "font-medium text-red-500" : "text-muted-foreground"}`}>
                {outOfStock ? "Нөөц дууссан" : hasTrackedStock ? `Үлдэгдэл: ${stockForVariant}` : "Бэлэн байгаа"}
              </span>
            </div>

            {/* Action buttons (sticky on mobile) */}
            <div className="mt-5 hidden gap-2 lg:flex">
              <Button size="lg" className="flex-1" onClick={handleAdd} disabled={outOfStock}>
                <ShoppingCart className="mr-2 h-5 w-5" /> Сагсанд нэмэх
              </Button>
              <Button size="lg" variant="secondary" className="flex-1" disabled={outOfStock}
                onClick={() => { handleAdd(); navigate({ to: "/store/$merchantSlug/cart", params: { merchantSlug } }); }}>
                Шууд авах
              </Button>
              <Button size="lg" variant="outline" aria-label="Хадгалах"><Heart className="h-5 w-5" /></Button>
            </div>

            {/* Trust badges */}
            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {[
                { icon: Truck, label: "Хурдан хүргэлт" },
                { icon: Shield, label: "Найдвартай төлбөр" },
                { icon: Check, label: "Чанартай бараа" },
              ].map((t, i) => (
                <div key={i} className="flex flex-col items-center gap-1 rounded-xl border border-border/60 p-2.5">
                  <t.icon className="h-4 w-4 text-primary" />
                  <span className="text-[11px] leading-tight text-muted-foreground sm:text-xs">{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detail tabs */}
        <div className="mt-8 sm:mt-12">
          <Tabs defaultValue="desc">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="desc">Тайлбар</TabsTrigger>
              {specs.length > 0 && <TabsTrigger value="specs">Үзүүлэлт</TabsTrigger>}
              <TabsTrigger value="delivery">Хүргэлт & Буцаалт</TabsTrigger>
            </TabsList>
            <TabsContent value="desc" className="mt-4">
              {product.description ? (
                <div className="prose prose-sm max-w-none whitespace-pre-line text-sm text-foreground sm:text-base">
                  {product.description}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Тайлбар оруулаагүй байна.</p>
              )}
            </TabsContent>
            {specs.length > 0 && (
              <TabsContent value="specs" className="mt-4">
                <Card className="rounded-2xl p-0 sm:p-2">
                  <dl className="divide-y divide-border">
                    {specs.map((s, i) => (
                      <div key={i} className="grid grid-cols-[120px_1fr] gap-3 px-4 py-2.5 sm:grid-cols-[180px_1fr]">
                        <dt className="text-sm text-muted-foreground">{s.label}</dt>
                        <dd className="text-sm font-medium">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </TabsContent>
            )}
            <TabsContent value="delivery" className="mt-4">
              <Card className="rounded-2xl p-5 text-sm text-muted-foreground">
                <ul className="space-y-2">
                  <li>• Захиалгыг ажлын өдөр 24 цагийн дотор бэлтгэж хүргэлтэнд гаргана.</li>
                  <li>• Улаанбаатар хотод 1-3 хоногт, орон нутагт 3-7 хоногт хүрнэ.</li>
                  <li>• Хэрэв бараа гэмтэлтэй ирвэл хүлээн авснаас хойш 24 цагийн дотор мэдэгдэнэ үү.</li>
                  <li>• Буцаалт болон солилт нь тухайн дэлгүүрийн нөхцлийн дагуу хийгдэнэ.</li>
                </ul>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-10 sm:mt-14">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="text-lg font-bold sm:text-xl">Төстэй бараанууд</h2>
              <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="text-xs text-primary hover:underline sm:text-sm">Бүгдийг үзэх →</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {related.map((p: any) => (
                <Link
                  key={p.id}
                  to="/store/$merchantSlug/product/$productSlug"
                  params={{ merchantSlug, productSlug: p.slug ?? p.id }}
                >
                  <Card className="group flex h-full flex-col overflow-hidden rounded-2xl transition-all hover:border-primary hover:shadow-md">
                    <div className="relative aspect-square bg-muted">
                      {(p.thumbnail_url || p.image_url) && (
                        <img src={p.thumbnail_url ?? p.image_url} alt={p.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                      )}
                      {p.is_new && <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">ШИНЭ</span>}
                      {p.is_on_sale && <span className="absolute right-2 top-2 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">SALE</span>}
                    </div>
                    <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                      <h3 className="line-clamp-2 min-h-[2.5rem] text-xs font-medium leading-tight group-hover:text-primary sm:text-sm">{p.name}</h3>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-sm font-bold sm:text-base">{fmtMnt(Number(p.price))}</span>
                        {p.original_price && Number(p.original_price) > Number(p.price) && (
                          <span className="text-[11px] text-muted-foreground line-through sm:text-xs">{fmtMnt(Number(p.original_price))}</span>
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



      {/* Mobile sticky CTA */}
      <div className="sticky bottom-0 z-30 mt-8 border-t border-border bg-background/95 px-3 py-2.5 backdrop-blur lg:hidden">
        <div className="container mx-auto flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Хадгалах" className="h-11 w-11 shrink-0"><Heart className="h-5 w-5" /></Button>
          <Button className="h-11 flex-1" onClick={handleAdd} disabled={outOfStock}>
            <ShoppingCart className="mr-2 h-4 w-4" /> Сагсанд
          </Button>
          <Button variant="secondary" className="h-11 flex-1" disabled={outOfStock}
            onClick={() => { handleAdd(); navigate({ to: "/store/$merchantSlug/cart", params: { merchantSlug } }); }}>
            Шууд авах
          </Button>
        </div>
      </div>
    </div>
  );
}
