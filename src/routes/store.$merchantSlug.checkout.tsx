import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { fmtMnt } from "@/lib/format";
import { cart, useCart } from "@/lib/cart";
import { validateCoupon } from "@/lib/coupons.functions";
import { createOrder } from "@/lib/orders.functions";
import { getCheckoutMethodsForStore } from "@/lib/payments/providers.functions";
import { useShipping } from "@/lib/shipping/use-shipping";
import { FreeShippingProgress } from "@/components/cart/FreeShippingProgress";
import { StickyCheckoutBar } from "@/components/cart/StickyCheckoutBar";
import { ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/store/$merchantSlug/checkout")({
  component: CheckoutPage,
});

const FormSchema = z.object({
  customerName: z.string().trim().min(1, "Нэрээ оруулна уу").max(120),
  phone: z.string().trim().min(6, "Утасны дугаар буруу").max(30),
  shippingAddress: z.string().trim().min(3, "Хаягаа оруулна уу").max(500),
  branch: z.string().max(120).optional(),
  note: z.string().max(1000).optional(),
});

function variantKey(c?: string | null, s?: string | null) {
  return c && s ? `${c}|${s}` : c || s || "";
}

function CheckoutPage() {
  const { merchantSlug } = Route.useParams();
  const navigate = useNavigate();
  const items = useCart(merchantSlug);
  const validateFn = useServerFn(validateCoupon);
  const createOrderFn = useServerFn(createOrder);

  const { data: merchant } = useQuery({
    queryKey: ["merchant", merchantSlug],
    queryFn: async () =>
      (await supabase.from("merchants").select("id,name,slug").eq("slug", merchantSlug).maybeSingle()).data,
  });

  const productIds = useMemo(() => Array.from(new Set(items.map((i) => i.productId))), [items]);
  const { data: products = [] } = useQuery({
    queryKey: ["checkout-products", merchant?.id, productIds.join(",")],
    enabled: !!merchant?.id && productIds.length > 0,
    queryFn: async () =>
      (await supabase.from("products").select("id,name,price,stock_quantity,variant_stock,is_active").in("id", productIds)).data ?? [],
  });
  const productMap = useMemo(() => {
    const m = new Map<string, any>();
    (products as any[]).forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const { data: deliveryOptions = [] } = useQuery({
    queryKey: ["delivery-options", merchant?.id],
    enabled: !!merchant?.id,
    queryFn: async () =>
      (await supabase
        .from("delivery_options")
        .select("*")
        .eq("merchant_id", merchant!.id)
        .eq("is_active", true)
        .order("position")).data ?? [],
  });

  const getCheckoutMethodsFn = useServerFn(getCheckoutMethodsForStore);
  const { data: methodsRes } = useQuery({
    queryKey: ["checkout-methods", merchantSlug],
    queryFn: () => getCheckoutMethodsFn({ data: { merchantSlug } }),
  });
  const paymentMethods = ((methodsRes as any)?.methods ?? []) as Array<{
    id: string; providerType: string; name: string; icon: string | null; description: string | null; isPlatformFallback: boolean;
  }>;

  const [form, setForm] = useState({ customerName: "", phone: "", shippingAddress: "", branch: "", note: "" });
  const [deliveryOptionId, setDeliveryOptionId] = useState<string>("");
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Default to first delivery option
  useEffect(() => {
    if (!deliveryOptionId && deliveryOptions.length) setDeliveryOptionId(deliveryOptions[0].id);
  }, [deliveryOptions, deliveryOptionId]);

  const subtotal = items.reduce((s, i) => {
    const p = productMap.get(i.productId);
    return s + Number(p?.price ?? i.price) * i.quantity;
  }, 0);
  const selectedManualFee = deliveryOptions.find((d: any) => d.id === deliveryOptionId)?.price;
  const shippingLines = useMemo(
    () =>
      items.map((i) => ({
        productId: i.productId,
        category: productMap.get(i.productId)?.category ?? null,
        price: Number(productMap.get(i.productId)?.price ?? i.price),
        quantity: i.quantity,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, products],
  );
  const shipping = useShipping({
    merchantId: merchant?.id,
    lines: shippingLines,
    selectedDeliveryFee: selectedManualFee != null ? Number(selectedManualFee) : null,
  });
  const deliveryFee = shipping.freeShippingReached ? 0 : shipping.deliveryFee;
  const discount = coupon?.discount ?? 0;
  const total = Math.max(0, subtotal - discount) + deliveryFee;

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    try {
      const r = await validateFn({ data: { merchantSlug, code: couponCode.trim(), subtotal } });
      if (r.ok) {
        setCoupon({ code: r.coupon.code, discount: r.discount });
        toast.success(`Купон идэвхжлээ: -${fmtMnt(r.discount)}`);
      } else {
        setCoupon(null);
        toast.error(r.error);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Купон шалгахад алдаа");
    }
  }

  // Re-validate coupon when subtotal changes (price/stock/items)
  useEffect(() => {
    if (!coupon) return;
    (async () => {
      const r = await validateFn({ data: { merchantSlug, code: coupon.code, subtotal } });
      if (r.ok) {
        if (r.discount !== coupon.discount) setCoupon({ code: r.coupon.code, discount: r.discount });
      } else {
        setCoupon(null);
        toast.error(r.error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);
  function clientStockCheck(): string | null {
    for (const i of items) {
      const p = productMap.get(i.productId);
      if (!p) return `"${i.name}" бараа байхгүй болсон`;
      if (!p.is_active) return `"${p.name}" бараа идэвхгүй`;
      const k = variantKey(i.color, i.size);
      const vs = (p.variant_stock ?? {}) as Record<string, number>;
      if (k && typeof vs[k] === "number" && vs[k] < i.quantity) {
        return `"${p.name}" — үлдэгдэл ${vs[k]}, та ${i.quantity}-г сонгосон`;
      }
    }
    return null;
  }

  async function handleSubmit() {
    if (items.length === 0) return toast.error("Сагс хоосон байна");
    const parsed = FormSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const stockIssue = clientStockCheck();
    if (stockIssue) return toast.error(stockIssue);
    

    setSubmitting(true);
    try {
      const r = await createOrderFn({
        data: {
          merchantSlug,
          items: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            color: i.color ?? null,
            size: i.size ?? null,
            image: i.image ?? null,
          })),
          customerName: parsed.data.customerName,
          phone: parsed.data.phone,
          shippingAddress: parsed.data.shippingAddress,
          branch: parsed.data.branch || null,
          note: parsed.data.note || null,
          deliveryOptionId: deliveryOptionId || null,
          paymentMethod: "pending" as any,
          couponCode: coupon?.code ?? null,
        },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      cart.clear(merchantSlug);
      toast.success("Захиалга үүслээ");
      navigate({ to: "/store/$merchantSlug/order/$orderId", params: { merchantSlug, orderId: r.order.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Захиалга үүсгэхэд алдаа");
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="rounded-2xl p-10 text-center">
          <p className="mb-4 text-muted-foreground">Сагс хоосон байна</p>
          <Link to="/store/$merchantSlug" params={{ merchantSlug }}>
            <Button>Бараа үзэх</Button>
          </Link>
        </Card>
      </div>
    );
  }

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
          <span className="font-medium">Захиалга</span>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Link
          to="/store/$merchantSlug/cart"
          params={{ merchantSlug }}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Сагс руу буцах
        </Link>
        <h1 className="mb-6 text-3xl font-bold">Захиалга өгөх</h1>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Card className="rounded-2xl p-5">
              <h3 className="mb-4 font-semibold">Хүлээн авагч</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Нэр *</Label>
                  <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} maxLength={120} />
                </div>
                <div>
                  <Label>Утас *</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Хүргэх хаяг *</Label>
                  <Input value={form.shippingAddress} onChange={(e) => setForm({ ...form, shippingAddress: e.target.value })} maxLength={500} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Тэмдэглэл</Label>
                  <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={1000} />
                </div>
              </div>
            </Card>

            {deliveryOptions.length > 0 && (
              <Card className="rounded-2xl p-5">
                <h3 className="mb-4 font-semibold">Хүргэлт</h3>
                <RadioGroup value={deliveryOptionId} onValueChange={setDeliveryOptionId} className="space-y-2">
                  {(deliveryOptions as any[]).map((d) => (
                    <label key={d.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 hover:border-primary/50">
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value={d.id} />
                        <div>
                          <div className="font-medium">{d.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {d.estimated_days_min}-{d.estimated_days_max} хоног
                            {d.description ? ` · ${d.description}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="font-semibold">{fmtMnt(Number(d.price))}</div>
                    </label>
                  ))}
                </RadioGroup>
              </Card>
            )}

            {paymentMethods.length > 0 && (
              <Card className="rounded-2xl border-dashed bg-muted/30 p-5 text-sm text-muted-foreground">
                Төлбөрийн хэлбэрээ дараагийн алхамд (захиалга баталгаажсаны дараа) сонгоно.
              </Card>
            )}
          </div>

          <Card className="h-fit rounded-2xl p-5 lg:sticky lg:top-20">
            <h3 className="mb-4 font-semibold">Захиалгын дүн</h3>
            <div className="mb-4 max-h-48 space-y-2 overflow-y-auto text-sm">
              {items.map((i) => (
                <div key={cart.keyOf(i)} className="flex justify-between gap-2">
                  <span className="line-clamp-1">
                    {i.name} {i.color || i.size ? `(${[i.color, i.size].filter(Boolean).join("/")})` : ""} × {i.quantity}
                  </span>
                  <span className="shrink-0">{fmtMnt(Number(productMap.get(i.productId)?.price ?? i.price) * i.quantity)}</span>
                </div>
              ))}
            </div>

            {coupon ? (
              <div className="mb-3 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-sm">
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{coupon.code} (-{fmtMnt(coupon.discount)})</span>
                <Button variant="ghost" size="sm" onClick={() => { setCoupon(null); setCouponCode(""); }}>Цуцлах</Button>
              </div>
            ) : (
              <div className="mb-3 flex gap-2">
                <Input placeholder="Купон код" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
                <Button variant="secondary" onClick={applyCoupon}>Идэвхжүүлэх</Button>
              </div>
            )}

            {shipping.freeThreshold != null && (
              <div className="mb-3">
                <FreeShippingProgress
                  freeThreshold={shipping.freeThreshold}
                  subtotal={subtotal}
                  amountToFree={shipping.amountToFreeShipping}
                  reached={shipping.freeShippingReached}
                />
              </div>
            )}
            {shipping.appliedCampaigns.length > 0 && (
              <div className="mb-3 space-y-1">
                {shipping.appliedCampaigns.map((c) => (
                  <div key={c.id} className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                    🎁 {c.name}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Дэд дүн</span><span>{fmtMnt(subtotal)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600"><span>Купон ({coupon?.code})</span><span>-{fmtMnt(discount)}</span></div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Хүргэлт</span>
                <span className={shipping.freeShippingReached ? "text-emerald-600 font-medium" : ""}>
                  {shipping.freeShippingReached ? "Үнэгүй" : fmtMnt(deliveryFee)}
                </span>
              </div>
            </div>
            <Separator className="my-4" />
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Нийт төлөх</span>
              <span className="text-2xl font-bold">{fmtMnt(total)}</span>
            </div>
            <Button className="mt-4 hidden w-full lg:flex" size="lg" disabled={submitting} onClick={handleSubmit}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Захиалга баталгаажуулах
            </Button>
          </Card>
        </div>
      </div>

      <StickyCheckoutBar
        total={total}
        qty={items.reduce((s, i) => s + i.quantity, 0)}
        label={submitting ? "Илгээж байна..." : "Захиалга баталгаажуулах"}
        disabled={submitting}
        onClick={handleSubmit}
      />
      <div className="h-20 lg:hidden" />
    </div>
  );
}
