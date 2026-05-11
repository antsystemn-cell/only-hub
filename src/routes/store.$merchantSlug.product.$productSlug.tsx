import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { fmtMnt } from "@/lib/format";
import { cart, useCart } from "@/lib/cart";
import { Minus, Plus, ShoppingCart, ArrowLeft, Check } from "lucide-react";

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
      (await supabase.from("merchants").select("id,name,slug,logo_url").eq("slug", merchantSlug).maybeSingle()).data,
  });

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", merchant?.id, productSlug],
    enabled: !!merchant?.id,
    queryFn: async () => {
      const bySlug = await supabase
        .from("products")
        .select("*")
        .eq("merchant_id", merchant!.id)
        .eq("slug", productSlug)
        .maybeSingle();
      if (bySlug.data) return bySlug.data;
      const byId = await supabase
        .from("products")
        .select("*")
        .eq("merchant_id", merchant!.id)
        .eq("id", productSlug)
        .maybeSingle();
      return byId.data;
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

  const variantKey = color && size ? `${color}|${size}` : color || size || "";
  const stockForVariant =
    variantKey && variantStock[variantKey] != null ? variantStock[variantKey] : product?.stock_quantity ?? 0;
  const needsColor = colors.length > 0 && !color;
  const needsSize = sizes.length > 0 && !size;
  const outOfStock = stockForVariant <= 0;

  if (isLoading || !merchant) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Уншиж байна...</div>;
  }
  if (!product) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
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
      productId: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.thumbnail_url || product.image_url,
      color,
      size,
      quantity: qty,
    });
    toast.success("Сагсанд нэмэгдлээ");
  };

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  const hasDiscount = product.original_price != null && Number(product.original_price) > Number(product.price);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center gap-3 px-4">
          <Link to="/" className="text-xl font-bold">Only</Link>
          <span className="text-muted-foreground">/</span>
          <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="font-semibold hover:underline">
            {merchant.name}
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/store/$merchantSlug/cart" params={{ merchantSlug }}>
              <Button variant="ghost" size="sm" className="relative">
                <ShoppingCart className="h-5 w-5" />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground">
                    {cartCount}
                  </span>
                )}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Link
          to="/store/$merchantSlug"
          params={{ merchantSlug }}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Буцах
        </Link>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Gallery */}
          <div>
            <Card className="overflow-hidden rounded-2xl">
              <div className="aspect-square bg-muted">
                {gallery[activeImg]?.url ? (
                  gallery[activeImg]?.type === "video" ? (
                    <video src={gallery[activeImg].url} controls className="h-full w-full object-cover" />
                  ) : (
                    <img src={gallery[activeImg].url} alt={product.name} className="h-full w-full object-cover" />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">Зураг алга</div>
                )}
              </div>
            </Card>
            {gallery.length > 1 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {gallery.map((m, i) => (
                  <button
                    key={m.url + i}
                    onClick={() => setActiveImg(i)}
                    className={`aspect-square overflow-hidden rounded-lg border-2 ${
                      i === activeImg ? "border-primary" : "border-transparent"
                    }`}
                  >
                    {m.type === "video" ? (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-xs">▶</div>
                    ) : (
                      <img src={m.url} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <div className="flex flex-wrap gap-2">
              {product.is_new && <Badge className="bg-blue-500 text-white hover:bg-blue-500">Шинэ</Badge>}
              {product.is_on_sale && <Badge className="bg-red-500 text-white hover:bg-red-500">Хямдрал</Badge>}
              {product.category && <Badge variant="secondary">{product.category}</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-bold">{product.name}</h1>
            {product.product_code && (
              <p className="mt-1 text-sm text-muted-foreground">Код: {product.product_code}</p>
            )}

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-bold">{fmtMnt(Number(product.price))}</span>
              {hasDiscount && (
                <>
                  <span className="text-lg text-muted-foreground line-through">
                    {fmtMnt(Number(product.original_price))}
                  </span>
                  <Badge className="bg-red-500 text-white hover:bg-red-500">-{product.discount}%</Badge>
                </>
              )}
            </div>

            {product.description && (
              <p className="mt-4 whitespace-pre-line text-muted-foreground">{product.description}</p>
            )}

            <Separator className="my-6" />

            {colors.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 text-sm font-medium">Өнгө: <span className="text-muted-foreground">{color ?? "Сонгох"}</span></div>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        color === c ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      }`}
                    >
                      {color === c && <Check className="mr-1 inline h-3 w-3" />}
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sizes.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 text-sm font-medium">Хэмжээ: <span className="text-muted-foreground">{size ?? "Сонгох"}</span></div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={`min-w-12 rounded-lg border px-4 py-2 text-sm transition ${
                        size === s ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <div className="mb-2 text-sm font-medium">Тоо ширхэг</div>
              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-lg border">
                  <Button variant="ghost" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-10 text-center font-medium">{qty}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQty((q) => Math.min(stockForVariant || q + 1, q + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <span className={`text-sm ${outOfStock ? "text-red-500" : "text-muted-foreground"}`}>
                  {outOfStock ? "Нөөц дууссан" : `Үлдэгдэл: ${stockForVariant}`}
                </span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button size="lg" className="flex-1" onClick={handleAdd} disabled={outOfStock}>
                <ShoppingCart className="mr-2 h-5 w-5" /> Сагсанд нэмэх
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="flex-1"
                disabled={outOfStock}
                onClick={() => {
                  handleAdd();
                  navigate({ to: "/store/$merchantSlug", params: { merchantSlug } });
                }}
              >
                Шууд худалдан авах
              </Button>
            </div>

            {specs.length > 0 && (
              <Card className="mt-6 rounded-2xl p-5">
                <h3 className="mb-3 font-semibold">Үзүүлэлт</h3>
                <dl className="grid gap-2 text-sm">
                  {specs.map((s, i) => (
                    <div key={i} className="grid grid-cols-[140px_1fr] gap-3 border-b border-border/50 pb-2 last:border-0">
                      <dt className="text-muted-foreground">{s.label}</dt>
                      <dd className="font-medium">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
