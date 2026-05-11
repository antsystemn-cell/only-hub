import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtMnt } from "@/lib/format";
import { cart, useCart, type CartItem } from "@/lib/cart";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

export const Route = createFileRoute("/store/$merchantSlug/cart")({
  component: CartPage,
});

function extractOptions(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x : x?.name ?? x?.value ?? ""))
    .filter(Boolean);
}

function CartPage() {
  const { merchantSlug } = Route.useParams();
  const items = useCart(merchantSlug);

  const { data: merchant } = useQuery({
    queryKey: ["merchant", merchantSlug],
    queryFn: async () =>
      (await supabase.from("merchants").select("id,name,slug,logo_url").eq("slug", merchantSlug).maybeSingle()).data,
  });

  const productIds = useMemo(() => Array.from(new Set(items.map((i) => i.productId))), [items]);

  const { data: products = [] } = useQuery({
    queryKey: ["cart-products", merchant?.id, productIds.join(",")],
    enabled: !!merchant?.id && productIds.length > 0,
    queryFn: async () =>
      (await supabase.from("products").select("*").in("id", productIds)).data ?? [],
  });

  const productMap = useMemo(() => {
    const m = new Map<string, any>();
    (products as any[]).forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const updateVariant = (item: CartItem, next: Partial<Pick<CartItem, "color" | "size">>) => {
    const oldKey = cart.keyOf(item);
    const merged = { ...item, ...next };
    const newKey = cart.keyOf(merged);
    if (oldKey === newKey) return;
    // Check duplicate
    const existing = items.find((i) => cart.keyOf(i) === newKey && i !== item);
    if (existing) {
      cart.setQty(merchantSlug, newKey, existing.quantity + item.quantity);
      cart.remove(merchantSlug, oldKey);
      toast.success("Хослуулсан барааг нэгтгэлээ");
      return;
    }
    // No direct edit — remove and re-add
    cart.remove(merchantSlug, oldKey);
    cart.add(merchantSlug, merged);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center gap-3 px-4">
          <Link to="/" className="text-xl font-bold">Only</Link>
          <span className="text-muted-foreground">/</span>
          {merchant && (
            <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="font-semibold hover:underline">
              {merchant.name}
            </Link>
          )}
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">Сагс</span>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Link
          to="/store/$merchantSlug"
          params={{ merchantSlug }}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Дэлгүүр рүү буцах
        </Link>

        <h1 className="mb-6 text-3xl font-bold">Миний сагс</h1>

        {items.length === 0 ? (
          <Card className="rounded-2xl p-12 text-center">
            <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">Таны сагс хоосон байна</p>
            <Link to="/store/$merchantSlug" params={{ merchantSlug }}>
              <Button>Бараа үзэх</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-3">
              {items.map((item) => {
                const k = cart.keyOf(item);
                const product = productMap.get(item.productId);
                const colors = extractOptions(product?.colors);
                const sizes = extractOptions(product?.sizes);
                const variantStock: Record<string, number> = product?.variant_stock ?? {};
                const variantKey = item.color && item.size ? `${item.color}|${item.size}` : item.color || item.size || "";
                const stock = variantKey && variantStock[variantKey] != null
                  ? variantStock[variantKey]
                  : product?.stock_quantity ?? 99;

                return (
                  <Card key={k} className="rounded-2xl p-4">
                    <div className="flex gap-4">
                      <Link
                        to="/store/$merchantSlug/product/$productSlug"
                        params={{ merchantSlug, productSlug: product?.slug || item.productId }}
                        className="shrink-0"
                      >
                        <div className="h-24 w-24 overflow-hidden rounded-lg bg-muted sm:h-28 sm:w-28">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                      </Link>

                      <div className="flex flex-1 flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to="/store/$merchantSlug/product/$productSlug"
                            params={{ merchantSlug, productSlug: product?.slug || item.productId }}
                            className="font-medium hover:underline line-clamp-2"
                          >
                            {item.name}
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => cart.remove(merchantSlug, k)}
                            aria-label="Устгах"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {colors.length > 0 && (
                            <Select
                              value={item.color ?? ""}
                              onValueChange={(v) => updateVariant(item, { color: v })}
                            >
                              <SelectTrigger className="h-9 w-auto min-w-28">
                                <SelectValue placeholder="Өнгө" />
                              </SelectTrigger>
                              <SelectContent>
                                {colors.map((c) => (
                                  <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {sizes.length > 0 && (
                            <Select
                              value={item.size ?? ""}
                              onValueChange={(v) => updateVariant(item, { size: v })}
                            >
                              <SelectTrigger className="h-9 w-auto min-w-24">
                                <SelectValue placeholder="Хэмжээ" />
                              </SelectTrigger>
                              <SelectContent>
                                {sizes.map((s) => (
                                  <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>

                        <div className="mt-auto flex items-end justify-between gap-2">
                          <div className="flex items-center rounded-lg border">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => cart.setQty(merchantSlug, k, Math.max(1, item.quantity - 1))}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-10 text-center font-medium">{item.quantity}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={item.quantity >= stock}
                              onClick={() => cart.setQty(merchantSlug, k, item.quantity + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">{fmtMnt(item.price)} × {item.quantity}</div>
                            <div className="font-bold">{fmtMnt(item.price * item.quantity)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}

              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => cart.clear(merchantSlug)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Сагсыг хоослох
                </Button>
              </div>
            </div>

            <Card className="h-fit rounded-2xl p-5 lg:sticky lg:top-20">
              <h3 className="mb-4 font-semibold">Захиалгын дүн</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Бараа ({totalQty})</span>
                  <span>{fmtMnt(total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Хүргэлт</span>
                  <span className="text-muted-foreground">Дараагийн алхам</span>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="flex items-baseline justify-between">
                <span className="font-medium">Нийт дүн</span>
                <span className="text-2xl font-bold">{fmtMnt(total)}</span>
              </div>
              <Button className="mt-4 w-full" size="lg">Худалдан авах</Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
