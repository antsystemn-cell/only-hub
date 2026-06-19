import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { validateCoupon } from "@/lib/coupons.functions";
import { useShipping } from "@/lib/shipping/use-shipping";
import { FreeShippingProgress } from "@/components/cart/FreeShippingProgress";
import { StickyCheckoutBar } from "@/components/cart/StickyCheckoutBar";
import { ArrowLeft, Minus, Plus, ShoppingBag, Tag, Trash2, X } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ForeignOrderInlineBadge } from "@/components/product/ForeignOrderBadge";

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
  const navigate = useNavigate();
  const items = useCart(merchantSlug);
  const qc = useQueryClient();
  const validateFn = useServerFn(validateCoupon);

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

  // Realtime subscribe to product changes — auto rerender when name/price/stock changes
  useEffect(() => {
    if (!merchant?.id || productIds.length === 0) return;
    const ch = supabase
      .channel(`cart-products-${merchant.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products", filter: `merchant_id=eq.${merchant.id}` },
        (payload) => {
          const updated = payload.new as any;
          if (productIds.includes(updated.id)) {
            qc.invalidateQueries({ queryKey: ["cart-products", merchant.id] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [merchant?.id, productIds.join(","), qc]);

  // Sync stored cart names/prices when product changes
  useEffect(() => {
    if (productMap.size === 0) return;
    items.forEach((i) => {
      const p = productMap.get(i.productId);
      if (!p) return;
      if (p.name !== i.name || Number(p.price) !== i.price) {
        cart.update(merchantSlug, cart.keyOf(i), { name: p.name, price: Number(p.price) });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);

  // Compute live values from product map (price may have updated)
  const lineFor = (i: CartItem) => Number(productMap.get(i.productId)?.price ?? i.price);
  const subtotal = items.reduce((s, i) => s + lineFor(i) * i.quantity, 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const discount = coupon?.discount ?? 0;

  const shippingLines = useMemo(
    () =>
      items.map((i) => ({
        productId: i.productId,
        category: productMap.get(i.productId)?.category ?? null,
        price: lineFor(i),
        quantity: i.quantity,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, products],
  );
  const shipping = useShipping({ merchantId: merchant?.id, lines: shippingLines });
  const total = Math.max(0, subtotal - discount);

  // Re-validate coupon when subtotal changes
  useEffect(() => {
    if (!coupon) return;
    (async () => {
      const r = await validateFn({ data: { merchantSlug, code: coupon.code, subtotal } });
      if (r.ok) setCoupon({ code: r.coupon.code, discount: r.discount });
      else {
        setCoupon(null);
        toast.error(r.error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const updateVariant = (item: CartItem, next: Partial<Pick<CartItem, "color" | "size">>) => {
    const oldKey = cart.keyOf(item);
    const merged = { ...item, ...next };
    const newKey = cart.keyOf(merged);
    if (oldKey === newKey) return;
    const existing = items.find((i) => cart.keyOf(i) === newKey && i !== item);
    if (existing) {
      cart.setQty(merchantSlug, newKey, existing.quantity + item.quantity);
      cart.remove(merchantSlug, oldKey);
      toast.success("Хослуулсан барааг нэгтгэлээ");
      return;
    }
    cart.remove(merchantSlug, oldKey);
    cart.add(merchantSlug, merged);
  };

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    try {
      const r = await validateFn({ data: { merchantSlug, code: couponCode.trim(), subtotal } });
      if (r.ok) {
        setCoupon({ code: r.coupon.code, discount: r.discount });
        toast.success(`Купон идэвхжлээ: -${fmtMnt(r.discount)}`);
        setCouponCode("");
      } else {
        toast.error(r.error);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Купон шалгахад алдаа");
    }
  }

  function clientStockCheck(): string | null {
    for (const i of items) {
      const p = productMap.get(i.productId);
      if (!p) continue;
      const k = i.color && i.size ? `${i.color}|${i.size}` : i.color || i.size || "";
      const vs = (p.variant_stock ?? {}) as Record<string, number>;
      // Only enforce stock when this specific variant is explicitly tracked (Easyshop-style).
      if (k && typeof vs[k] === "number" && vs[k] < i.quantity) {
        return `"${p.name}" — үлдэгдэл ${vs[k]}, та ${i.quantity}-г сонгосон`;
      }
    }
    return null;
  }

  function goCheckout() {
    if (items.length === 0) return;
    const issue = clientStockCheck();
    if (issue) return toast.error(issue);
    navigate({ to: "/store/$merchantSlug/checkout", params: { merchantSlug } });
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader
        cartHref={`/store/${merchantSlug}/cart`}
        rightOfLogo={
          merchant ? (
            <span className="flex items-center gap-2">
              <Link to="/store/$merchantSlug" params={{ merchantSlug }} className="font-semibold hover:text-orange-600">
                {merchant.name}
              </Link>
              <span className="text-muted-foreground/60">/</span>
              <span className="font-medium text-foreground">Сагс</span>
            </span>
          ) : null
        }
      />

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
                const stock = variantKey && typeof variantStock[variantKey] === "number"
                  ? variantStock[variantKey]
                  : 999;
                const livePrice = lineFor(item);
                const priceChanged = product && Number(product.price) !== item.price;

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
                            {product?.name ?? item.name}
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

                        {priceChanged && (
                          <p className="text-xs text-amber-600">Үнэ шинэчлэгдсэн</p>
                        )}
                        {item.quantity > stock && (
                          <p className="text-xs text-red-500">Үлдэгдэл хүрэлцэхгүй (зөвхөн {stock})</p>
                        )}

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
                            <div className="text-xs text-muted-foreground">{fmtMnt(livePrice)} × {item.quantity}</div>
                            <div className="font-bold">{fmtMnt(livePrice * item.quantity)}</div>
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

              {shipping.freeThreshold != null && (
                <div className="mb-4">
                  <FreeShippingProgress
                    freeThreshold={shipping.freeThreshold}
                    subtotal={subtotal}
                    amountToFree={shipping.amountToFreeShipping}
                    reached={shipping.freeShippingReached}
                  />
                </div>
              )}

              {shipping.appliedCampaigns.length > 0 && (
                <div className="mb-4 space-y-1">
                  {shipping.appliedCampaigns.map((c) => (
                    <div key={c.id} className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                      🎁 {c.name}
                    </div>
                  ))}
                </div>
              )}

              {/* Coupon */}
              {coupon ? (
                <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <Tag className="h-4 w-4" />
                    <span className="font-medium">{coupon.code}</span>
                    <span>-{fmtMnt(coupon.discount)}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCoupon(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="mb-4 flex gap-2">
                  <Input
                    placeholder="Купон код"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                  />
                  <Button variant="secondary" onClick={applyCoupon}>Идэвхжүүлэх</Button>
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Бараа ({totalQty})</span>
                  <span>{fmtMnt(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Купон хөнгөлөлт</span>
                    <span>-{fmtMnt(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Хүргэлт</span>
                  <span className={shipping.freeShippingReached ? "text-emerald-600 font-medium" : ""}>
                    {shipping.freeShippingReached ? "Үнэгүй" : fmtMnt(shipping.deliveryFee)}
                  </span>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="flex items-baseline justify-between">
                <span className="font-medium">Нийт дүн</span>
                <span className="text-2xl font-bold">{fmtMnt(total + (shipping.freeShippingReached ? 0 : shipping.deliveryFee))}</span>
              </div>
              <Button className="mt-4 hidden w-full lg:flex" size="lg" onClick={goCheckout}>Худалдан авах</Button>
            </Card>
          </div>
        )}
      </div>

      <StickyCheckoutBar
        total={total + (shipping.freeShippingReached ? 0 : shipping.deliveryFee)}
        qty={totalQty}
        label="Худалдан авах"
        onClick={goCheckout}
      />
      {totalQty > 0 && <div className="h-20 lg:hidden" />}
      <SiteFooter />
    </div>
  );
}
