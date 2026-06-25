import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createQpayInvoice, checkQpayPayment } from "@/lib/qpay.server";
import { confirmOrderPayment } from "@/lib/payments/confirm-order-payment.server";

const ItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().max(500),
  price: z.number().min(0),
  quantity: z.number().int().min(1).max(999),
  color: z.string().max(100).nullable().optional(),
  size: z.string().max(100).nullable().optional(),
  image: z.string().max(2000).nullable().optional(),
});

const CreateInput = z.object({
  merchantSlug: z.string().min(1).max(100),
  items: z.array(ItemSchema).min(1).max(100),
  customerName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(30),
  shippingAddress: z.string().trim().min(3).max(500),
  branch: z.string().max(120).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  deliveryOptionId: z.string().uuid().nullable().optional(),
  paymentMethod: z.enum(["pending", "qpay", "storepay", "pocket", "omniway", "hipay", "cash", "transfer", "manual"]).default("pending"),
  couponCode: z.string().max(50).optional().nullable(),
});

function variantKey(c?: string | null, s?: string | null) {
  return c && s ? `${c}|${s}` : c || s || "";
}

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data }) => {
    // 1. Merchant
    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("id,name,slug")
      .eq("slug", data.merchantSlug)
      .maybeSingle();
    if (!merchant) return { ok: false as const, error: "Дэлгүүр олдсонгүй" };

    // 2. Validate stock + price
    const ids = Array.from(new Set(data.items.map((i) => i.productId)));
    const { data: products } = await supabaseAdmin
      .from("products")
      .select(
        "id,name,price,stock_quantity,variant_stock,is_active,merchant_id,product_type,foreign_source,source_url,source_country,source_currency,source_name,default_delivery_min_days,default_delivery_max_days",
      )
      .in("id", ids);
    const pmap = new Map<string, any>((products ?? []).map((p) => [p.id, p]));

    // Pre-fetch variants once for any foreign-order products, to snapshot source prices.
    const foreignIds = (products ?? [])
      .filter((p: any) => p.product_type === "FOREIGN_ORDER")
      .map((p: any) => p.id);
    let variantsByProduct = new Map<string, any[]>();
    if (foreignIds.length) {
      const { data: vs } = await supabaseAdmin
        .from("product_variants")
        .select("*")
        .in("product_id", foreignIds);
      (vs ?? []).forEach((v: any) => {
        const arr = variantsByProduct.get(v.product_id) ?? [];
        arr.push(v);
        variantsByProduct.set(v.product_id, arr);
      });
    }

    const issues: string[] = [];
    let subtotal = 0;
    const normalized = data.items.map((i) => {
      const p = pmap.get(i.productId);
      if (!p || !p.is_active || p.merchant_id !== merchant.id) {
        issues.push(`"${i.name}" бараа байхгүй болсон`);
        return null;
      }
      const k = variantKey(i.color, i.size);
      const vs = (p.variant_stock ?? {}) as Record<string, number>;
      // Easyshop-style: only enforce stock when the chosen variant is explicitly tracked.
      if (k && typeof vs[k] === "number" && vs[k] < i.quantity) {
        issues.push(`"${p.name}" — үлдэгдэл ${vs[k]}, та ${i.quantity}-г сонгосон`);
      }
      const realPrice = Number(p.price);
      if (Math.abs(realPrice - i.price) > 0.01) {
        i.price = realPrice;
      }
      subtotal += realPrice * i.quantity;

      // Foreign-order snapshot — frozen at purchase time.
      let foreign: any = null;
      if (p.product_type === "FOREIGN_ORDER") {
        const variants = variantsByProduct.get(p.id) ?? [];
        const match =
          variants.find(
            (v) =>
              (i.size && v.size_label === i.size) ||
              (i.color && v.color_label === i.color),
          ) ?? variants[0];

        // Enforce availability — backend re-check, defeats any stale frontend state.
        if (match) {
          if (match.is_purchasable === false) {
            issues.push(
              `"${p.name}" — сонгосон хувилбар Poizon Korea дээр түр дууссан байна. Сонголтоо шинэчилнэ үү.`,
            );
          } else if (
            match.availability_status &&
            !["AVAILABLE", "LOW_STOCK"].includes(String(match.availability_status))
          ) {
            issues.push(
              `"${p.name}" — сонгосон хувилбарын боломжит эсэхийг шалгах шаардлагатай.`,
            );
          }
        }

        foreign = {
          product_type: "FOREIGN_ORDER",
          foreign_source: p.foreign_source,
          source_url: p.source_url,
          source_country: p.source_country,
          source_currency: p.source_currency ?? match?.source_currency ?? null,
          source_name: p.source_name,
          source_product_id: null,
          source_variant_id: match?.source_variant_id ?? null,
          source_price: match?.source_price != null ? Number(match.source_price) : null,
          source_price_mnt:
            match?.source_price_mnt != null ? Number(match.source_price_mnt) : null,
          exchange_rate: match?.exchange_rate != null ? Number(match.exchange_rate) : null,
          customer_paid_price_mnt: realPrice,
          delivery_min_days: p.default_delivery_min_days,
          delivery_max_days: p.default_delivery_max_days,
        };
      }

      return { ...i, price: realPrice, name: p.name, foreign };
    });
    if (issues.length) return { ok: false as const, error: issues.join("\n") };

    // 3. Delivery
    let deliveryFee = 0;
    if (data.deliveryOptionId) {
      const { data: opt } = await supabaseAdmin
        .from("delivery_options")
        .select("id,price,merchant_id,is_active")
        .eq("id", data.deliveryOptionId)
        .maybeSingle();
      if (!opt || opt.merchant_id !== merchant.id || !opt.is_active) {
        return { ok: false as const, error: "Хүргэлтийн сонголт буруу" };
      }
      deliveryFee = Number(opt.price);
    }

    // 4. Coupon
    let discount = 0;
    let couponId: string | null = null;
    if (data.couponCode) {
      const { data: coupon } = await supabaseAdmin
        .from("coupons")
        .select("*")
        .eq("merchant_id", merchant.id)
        .ilike("code", data.couponCode)
        .eq("is_active", true)
        .maybeSingle();
      if (coupon) {
        const expired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
        const maxed = coupon.max_uses != null && coupon.used_count >= coupon.max_uses;
        const minOk = subtotal >= Number(coupon.min_order);
        if (!expired && !maxed && minOk) {
          discount =
            coupon.discount_type === "percent"
              ? Math.round((subtotal * Number(coupon.discount_value)) / 100)
              : Math.min(subtotal, Number(coupon.discount_value));
          couponId = coupon.id;
        }
      }
    }

    const total = Math.max(0, subtotal - discount) + deliveryFee;

    // 4b. Resolve inventory links so we know which items must go through the
    //     atomic reservation flow vs. the legacy variant_stock decrement path.
    const { resolveLinksForCart, reserveForOrder, releaseForOrder } = await import(
      "@/lib/inventory/reservation.server"
    );
    const linkInputs = (normalized as any[])
      .map((i: any, idx: number) =>
        i ? { productId: i.productId, variantKey: variantKey(i.color, i.size) || null, quantity: i.quantity, orderItemIndex: idx } : null,
      )
      .filter(Boolean) as { productId: string; variantKey: string | null; quantity: number; orderItemIndex: number }[];
    const resolvedLinks = await resolveLinksForCart(merchant.id, linkInputs);
    const reservedProductIds = new Set(resolvedLinks.map((r) => `${r.productId}`));

    // 4c. Reserve stock atomically BEFORE creating the order, so concurrent
    //     checkouts cannot oversell the same tracked variant.
    //     Items handled by inventory_reservations are EXCLUDED here to avoid
    //     double-decrement (the inventory→product sync trigger already drops
    //     variant_stock when quantity_reserved increases).
    const stockItems = normalized
      .map((i) => {
        if (!i) return null;
        if (reservedProductIds.has(i.productId)) return null;
        const k = variantKey(i.color, i.size);
        return k ? { product_id: i.productId, variant_key: k, qty: i.quantity } : null;
      })
      .filter(Boolean) as { product_id: string; variant_key: string; qty: number }[];
    // Availability check only — actual reservation is logged AFTER order insert
    // via reserve_legacy_stock_for_order so each hold is tied to a real order id.
    if (stockItems.length) {
      const { data: probe, error: probeErr } = await supabaseAdmin.rpc(
        "decrement_variant_stocks",
        { _items: stockItems as any },
      );
      if (probeErr) return { ok: false as const, error: probeErr.message };
      const pr = probe as any;
      if (pr && pr.ok === false) {
        const lines = (pr.insufficient ?? [])
          .map((it: any) => `Барааны "${it.variant_key}" — үлдэгдэл ${it.remaining}, та ${it.requested}-г сонгосон`)
          .join("\n");
        return { ok: false as const, error: lines || "Барааны үлдэгдэл хүрэлцэхгүй" };
      }
      await supabaseAdmin.rpc("restore_variant_stocks", { _items: stockItems as any });
    }

    // Coupon: validated above (coupon_id snapshotted on order). Actual
    // used_count consumption happens inside confirmOrderPayment() so abandoned
    // unpaid orders don't burn uses.



    // 5. Insert order
    const hasForeign = normalized.some((i: any) => i?.foreign);
    const hasReady = normalized.some((i: any) => i && !i.foreign);
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        merchant_id: merchant.id,
        items: normalized as any,
        total,
        delivery_fee: deliveryFee,
        delivery_option_id: data.deliveryOptionId ?? null,
        guest_name: data.customerName,
        phone: data.phone,
        shipping_address: data.shippingAddress,
        branch: data.branch ?? null,
        note: data.note ?? null,
        is_guest: true,
        source: "web",
        payment_method: data.paymentMethod,
        payment_status: "unpaid",
        status: "pending",
        coupon_id: couponId,
        has_foreign_order_items: hasForeign,
        has_ready_stock_items: hasReady,
      } as any)
      .select("*")
      .single();
    if (orderErr || !order) {
      return { ok: false as const, error: orderErr?.message ?? "Захиалга үүсгэхэд алдаа" };
    }

    // 5a. Legacy variant_stock reservation logged against the new order id.
    if (stockItems.length) {
      const { data: legRes, error: legErr } = await supabaseAdmin.rpc(
        "reserve_legacy_stock_for_order",
        { _order_id: order.id, _merchant_id: merchant.id, _items: stockItems as any },
      );
      const lr = legRes as any;
      if (legErr || (lr && lr.ok === false)) {
        await supabaseAdmin.from("orders").delete().eq("id", order.id);
        const lines = (lr?.insufficient ?? [])
          .map((it: any) => `Барааны "${it.variant_key}" — үлдэгдэл ${it.remaining}, та ${it.requested}-г сонгосон`)
          .join("\n");
        return { ok: false as const, error: lines || legErr?.message || "Барааны үлдэгдэл хүрэлцэхгүй" };
      }
    }

    // 5b. Reserve inventory for linked items (after we have an order id).
    if (resolvedLinks.length) {
      const resRes = await reserveForOrder({
        orderId: order.id,
        merchantId: merchant.id,
        resolved: resolvedLinks,
      });
      if (!resRes.ok) {
        await releaseForOrder(order.id, "cancelled");
        await supabaseAdmin.rpc("release_legacy_stock_reservations", {
          _order_id: order.id, _reason: "cancelled",
        });
        await supabaseAdmin.from("orders").delete().eq("id", order.id);
        return { ok: false as const, error: resRes.error };
      }
    }





    // 6. QPay invoice (if applicable)
    let qpay: any = null;
    let qpayError: string | null = null;
    if (data.paymentMethod === "qpay") {
      try {
        const reqUrl = getRequestUrl();
        const callbackUrl = `${reqUrl.origin}/api/public/qpay/webhook?order_id=${order.id}`;
        qpay = await createQpayInvoice({
          merchantId: merchant.id,
          orderId: order.id,
          amount: total,
          description: `${merchant.name} - ${order.external_ref ?? order.id}`,
          callbackUrl,
        });
        if (!qpay) {
          qpayError = "QPay тохиргоо хийгдээгүй байна (мерчантад invoice_code алга)";
        } else if (qpay?.invoice_id) {
          await supabaseAdmin
            .from("orders")
            .update({
              qpay_invoice_id: qpay.invoice_id,
              qpay_qr_text: qpay.qr_text ?? null,
              qpay_qr_image: qpay.qr_image ?? null,
              qpay_short_url: qpay.qPay_shortUrl ?? null,
              qpay_urls: (qpay.urls ?? []) as any,
              payment_error: null,
            })
            .eq("id", order.id);
        }
      } catch (e: any) {
        qpayError = e?.message ?? "QPay invoice үүсгэхэд алдаа";
        console.error("QPay invoice failed:", qpayError);
      }
      if (qpayError) {
        await supabaseAdmin
          .from("orders")
          .update({ payment_error: qpayError })
          .eq("id", order.id);
      }
    }

    return {
      ok: true as const,
      order: {
        id: order.id,
        external_ref: order.external_ref,
        total,
        subtotal,
        discount,
        deliveryFee,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        payment_error: qpayError,
      },
      qpay,
    };
  });

export const getOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,external_ref,status,payment_status,total,merchant_id,qpay_invoice_id,payment_method,payment_error")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Захиалга олдсонгүй" };

    if (order.payment_status === "unpaid" && order.payment_method === "qpay" && order.qpay_invoice_id) {
      try {
        const paid = await checkQpayPayment(order.merchant_id, order.qpay_invoice_id);
        if (paid) {
          await confirmOrderPayment({ orderId: order.id, source: "qpay_polling" });
          order.payment_status = "confirmed";
          order.payment_error = null;
        }
      } catch (e: any) {
        console.error("QPay check failed:", e?.message);
      }
    }
    return { ok: true as const, order };
  });

export const retryQpayInvoice = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,merchant_id,total,external_ref,payment_method,payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Захиалга олдсонгүй" };
    if (order.payment_status === "confirmed") return { ok: false as const, error: "Аль хэдийн төлөгдсөн" };
    if (order.payment_method !== "qpay") return { ok: false as const, error: "QPay-ээр төлөх захиалга биш" };

    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("id,name")
      .eq("id", order.merchant_id)
      .maybeSingle();
    if (!merchant) return { ok: false as const, error: "Дэлгүүр олдсонгүй" };

    try {
      const reqUrl = getRequestUrl();
      const callbackUrl = `${reqUrl.origin}/api/public/qpay/webhook?order_id=${order.id}`;
      const qpay = await createQpayInvoice({
        merchantId: order.merchant_id,
        orderId: order.id,
        amount: Number(order.total),
        description: `${merchant.name} - ${order.external_ref ?? order.id}`,
        callbackUrl,
      });
      if (!qpay) {
        const err = "QPay тохиргоо хийгдээгүй байна";
        await supabaseAdmin.from("orders").update({ payment_error: err }).eq("id", order.id);
        return { ok: false as const, error: err };
      }
      const { data: updated } = await supabaseAdmin
        .from("orders")
        .update({
          qpay_invoice_id: qpay.invoice_id,
          qpay_qr_text: qpay.qr_text ?? null,
          qpay_qr_image: qpay.qr_image ?? null,
          qpay_short_url: qpay.qPay_shortUrl ?? null,
          qpay_urls: (qpay.urls ?? []) as any,
          payment_error: null,
        })
        .eq("id", order.id)
        .select("id,external_ref,status,payment_status,total,merchant_id,payment_method,payment_error,qpay_invoice_id,qpay_qr_text,qpay_qr_image,qpay_short_url,qpay_urls")
        .single();
      return { ok: true as const, qpay, order: updated };
    } catch (e: any) {
      const err = e?.message ?? "QPay invoice үүсгэхэд алдаа";
      await supabaseAdmin.from("orders").update({ payment_error: err }).eq("id", order.id);
      return { ok: false as const, error: err };
    }
  });

// Pick a payment method for an existing "pending" order, then bootstrap the
// provider-specific flow (QPay invoice for qpay; otherwise just persist the choice
// and let the order page render the appropriate panel).
export const setOrderPaymentMethod = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        paymentMethod: z.enum(["qpay", "storepay", "pocket", "omniway", "hipay", "cash", "transfer", "manual"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,merchant_id,total,external_ref,payment_method,payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Захиалга олдсонгүй" };
    if (order.payment_status === "confirmed") return { ok: false as const, error: "Аль хэдийн төлөгдсөн" };

    await supabaseAdmin
      .from("orders")
      .update({ payment_method: data.paymentMethod, payment_error: null })
      .eq("id", order.id);

    if (data.paymentMethod === "qpay") {
      const { data: merchant } = await supabaseAdmin
        .from("merchants")
        .select("id,name")
        .eq("id", order.merchant_id)
        .maybeSingle();
      if (!merchant) return { ok: false as const, error: "Дэлгүүр олдсонгүй" };
      try {
        const reqUrl = getRequestUrl();
        const callbackUrl = `${reqUrl.origin}/api/public/qpay/webhook?order_id=${order.id}`;
        const qpay = await createQpayInvoice({
          merchantId: order.merchant_id,
          orderId: order.id,
          amount: Number(order.total),
          description: `${merchant.name} - ${order.external_ref ?? order.id}`,
          callbackUrl,
        });
        if (!qpay) {
          const err = "QPay тохиргоо хийгдээгүй байна";
          await supabaseAdmin.from("orders").update({ payment_error: err }).eq("id", order.id);
          return { ok: false as const, error: err };
        }
        await supabaseAdmin
          .from("orders")
          .update({
            qpay_invoice_id: qpay.invoice_id,
            qpay_qr_text: qpay.qr_text ?? null,
            qpay_qr_image: qpay.qr_image ?? null,
            qpay_short_url: qpay.qPay_shortUrl ?? null,
            qpay_urls: (qpay.urls ?? []) as any,
            payment_error: null,
          })
          .eq("id", order.id);
      } catch (e: any) {
        const err = e?.message ?? "QPay invoice үүсгэхэд алдаа";
        await supabaseAdmin.from("orders").update({ payment_error: err }).eq("id", order.id);
        return { ok: false as const, error: err };
      }
    }

    if (data.paymentMethod === "hipay") {
      try {
        const { loadProviderRowForCheckout } = await import("@/lib/payments/provider-resolver.server");
        const { getAdapter } = await import("@/lib/payments/adapters/index.server");
        const resolved = await loadProviderRowForCheckout({
          merchantId: order.merchant_id,
          providerType: "hipay",
        });
        if (!resolved) throw new Error("HiPay тохиргоо хийгдээгүй байна");
        const adapter = getAdapter("hipay");
        if (!adapter) throw new Error("HiPay adapter байхгүй");
        const reqUrl = getRequestUrl();
        const callbackUrl = `${reqUrl.origin}/api/public/payments/hipay/webhook?order_id=${order.id}`;
        const invoice = await adapter.createInvoice({
          orderId: order.id,
          amount: Number(order.total),
          description: order.external_ref ?? order.id,
          orderRef: order.external_ref ?? null,
          callbackUrl,
          credentials: (resolved.row.credentials ?? {}) as Record<string, any>,
        });
        await supabaseAdmin
          .from("orders")
          .update({
            qpay_invoice_id: invoice.invoiceId,
            qpay_qr_text: invoice.qrText ?? null,
            qpay_short_url: invoice.deeplink ?? null,
            qpay_urls: (invoice.urls ?? []) as any,
            payment_error: null,
          })
          .eq("id", order.id);
      } catch (e: any) {
        const err = e?.message ?? "HiPay invoice үүсгэхэд алдаа";
        await supabaseAdmin.from("orders").update({ payment_error: err }).eq("id", order.id);
        return { ok: false as const, error: err };
      }
    }

    const { data: refreshed } = await supabaseAdmin
      .from("orders")
      .select("id,external_ref,status,payment_status,total,merchant_id,payment_method,payment_error,qpay_invoice_id,qpay_qr_text,qpay_qr_image,qpay_short_url,qpay_urls")
      .eq("id", order.id)
      .maybeSingle();
    return { ok: true as const, order: refreshed };
  });

// Reset payment method back to "pending" so the user can pick a different one.
// Clears any previously-generated invoice metadata (QPay/HiPay QR, urls, etc.).
export const resetOrderPaymentMethod = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Захиалга олдсонгүй" };
    if (order.payment_status === "confirmed") return { ok: false as const, error: "Аль хэдийн төлөгдсөн" };

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_method: "pending",
        payment_error: null,
        qpay_invoice_id: null,
        qpay_qr_text: null,
        qpay_qr_image: null,
        qpay_short_url: null,
        qpay_urls: [],
      })
      .eq("id", order.id)
      .select("id,external_ref,status,payment_status,total,merchant_id,qpay_invoice_id,payment_method,payment_error")
      .single();

    if (updateError || !updatedOrder) {
      return { ok: false as const, error: updateError?.message ?? "Төлбөрийн хэрэгсэл солиход алдаа гарлаа" };
    }

    return { ok: true as const, order: updatedOrder };
  });

// Merchant/admin manual order entry. Bypasses the strict "insert validated"
// RLS policy (which only allows status in {pending,new} and payment_status=unpaid)
// so staff can record sales that are already confirmed/paid.
const ManualItem = z.object({
  name: z.string().min(1).max(500),
  price: z.number().min(0),
  quantity: z.number().int().min(1).max(999),
  sku: z.string().max(200).optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
});

const ManualOrderInput = z.object({
  merchantId: z.string().uuid(),
  phone: z.string().trim().min(3).max(30),
  name: z.string().max(200).optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  items: z.array(ManualItem).min(1).max(200),
  deliveryFee: z.number().min(0).default(0),
  paymentMethod: z.string().max(50).default("cash"),
  paymentStatus: z.enum(["unpaid", "confirmed"]).default("unpaid"),
  status: z.string().max(50).default("confirmed"),
  note: z.string().max(2000).optional().nullable(),
  saleDate: z.string().optional().nullable(),
  branch: z.string().max(200).optional().nullable(),
  source: z.string().max(50).default("store"),
  sendToDelivery: z.boolean().default(true),
});

export const createManualOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ManualOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: access } = await supabaseAdmin.rpc("has_merchant_access", {
      _user_id: userId,
      _merchant_id: data.merchantId,
    });
    if (!access) return { ok: false as const, error: "Хандах эрхгүй" };

    const subtotal = data.items.reduce((s, it) => s + it.price * it.quantity, 0);
    const total = subtotal + (data.deliveryFee || 0);

    // Always insert in a safe baseline state, then transition via service.
    const insertStatus =
      data.paymentStatus === "confirmed" ? "pending" : data.status;
    const { data: inserted, error } = await supabaseAdmin
      .from("orders")
      .insert({
        merchant_id: data.merchantId,
        items: data.items as any,
        total,
        status: insertStatus,
        payment_method: data.paymentMethod,
        payment_status: "unpaid",
        phone: data.phone,
        guest_name: data.name || null,
        shipping_address: data.address || null,
        delivery_fee: data.deliveryFee || 0,
        is_guest: true,
        source: data.source,
        note: data.note || null,
        sale_date: data.saleDate
          ? new Date(data.saleDate).toISOString()
          : new Date().toISOString(),
        branch: data.branch || null,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return { ok: false as const, error: error?.message ?? "Үүсгэхэд алдаа" };
    }

    // Inventory reservation for linked products (best-effort: warn on failure
    // but do not block manual entry — admin recovers via inventory page).
    let reservationWarning: string | null = null;
    try {
      const { resolveLinksForCart, reserveForOrder } = await import(
        "@/lib/inventory/reservation.server"
      );
      const linkInputs = data.items
        .map((it, idx) =>
          it.product_id
            ? { productId: it.product_id, variantKey: null, quantity: it.quantity, orderItemIndex: idx }
            : null,
        )
        .filter(Boolean) as any[];
      if (linkInputs.length) {
        const resolved = await resolveLinksForCart(data.merchantId, linkInputs);
        if (resolved.length) {
          const r = await reserveForOrder({
            orderId: inserted.id,
            merchantId: data.merchantId,
            resolved,
          });
          if (!r.ok) reservationWarning = r.error;
        }
      }
    } catch (e: any) {
      reservationWarning = e?.message ?? String(e);
    }

    // Apply target status (allowed once row exists because update policy is permissive)
    if (insertStatus !== data.status && data.paymentStatus !== "confirmed") {
      await supabaseAdmin.from("orders").update({ status: data.status }).eq("id", inserted.id);
    }

    // If marked as paid, route through the centralized confirmation service
    // (idempotent, fires commission trigger + inventory confirm).
    // Delivery creation is controlled explicitly below via sendToDelivery.
    if (data.paymentStatus === "confirmed") {
      const res = await confirmOrderPayment({
        orderId: inserted.id,
        source: "merchant_manual",
        skipDelivery: true,
      });
      if (!res.ok) {
        return { ok: false as const, error: res.error, orderId: inserted.id };
      }
      if (data.status && data.status !== "pending") {
        await supabaseAdmin.from("orders").update({ status: data.status }).eq("id", inserted.id);
      }
    }

    // Optional manual delivery dispatch (independent of payment status).
    // createDeliveryRequest is idempotent — duplicates surface as alreadyExists.
    let deliveryCreated = false;
    let deliveryAlready = false;
    let deliveryError: string | null = null;
    let deliveryRef: string | null = null;
    if (data.sendToDelivery) {
      try {
        const { createDeliveryRequest } = await import("@/lib/delivery/delivery.service");
        const res: any = await createDeliveryRequest({ orderId: inserted.id, userId });
        if (res?.ok) {
          deliveryAlready = !!res.alreadyExists;
          deliveryCreated = !deliveryAlready;
          deliveryRef = res.deliveryRequest?.external_ref ?? res.deliveryRequest?.id ?? null;
        } else {
          deliveryError = res?.error ?? "Хүргэлт үүсгэхэд алдаа";
        }
      } catch (e: any) {
        deliveryError = e?.message ?? String(e);
      }
    }

    return {
      ok: true as const,
      orderId: inserted.id,
      deliveryCreated,
      deliveryAlready,
      deliveryRef,
      deliveryError,
      reservationWarning,
    };
  });

// Merchant admin updates an order's recipient/address. If the order was
// already pushed to the delivery provider, we mirror the change so the
// courier sees the new destination.
export const updateOrderShipping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        shippingAddress: z.string().trim().min(1).max(500),
        phone: z.string().trim().min(4).max(30).optional().nullable(),
        recipientName: z.string().trim().max(120).optional().nullable(),
        branch: z.string().trim().max(120).optional().nullable(),
        note: z.string().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,merchant_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Захиалга олдсонгүй" };
    const { data: allowed } = await supabaseAdmin.rpc("has_merchant_access", {
      _user_id: userId,
      _merchant_id: order.merchant_id,
    });
    if (!allowed) return { ok: false as const, error: "Эрх хүрэхгүй" };

    const patch: Record<string, any> = {
      shipping_address: data.shippingAddress,
      updated_at: new Date().toISOString(),
    };
    if (data.phone != null) patch.phone = data.phone;
    if (data.recipientName !== undefined) patch.guest_name = data.recipientName;
    if (data.branch !== undefined) patch.branch = data.branch;
    if (data.note !== undefined) patch.note = data.note;

    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update(patch as any)
      .eq("id", order.id);
    if (updErr) return { ok: false as const, error: updErr.message };

    // Sync local delivery_request row (always — works for local + external).
    const drPatch: Record<string, any> = {
      dropoff_address: data.shippingAddress,
    };
    if (data.phone != null) drPatch.recipient_phone = data.phone;
    if (data.recipientName !== undefined) drPatch.recipient_name = data.recipientName;
    const { data: dr } = await supabaseAdmin
      .from("delivery_requests")
      .update(drPatch as any)
      .eq("order_id", order.id)
      .select("id,mode,provider,status")
      .maybeSingle();

    // If pushed to Swift, re-post the order so the provider gets the new
    // destination. /order-intake is idempotent on external_order_id.
    let syncedExternal = false;
    let syncError: string | null = null;
    if (dr && dr.mode === "external" && dr.status !== "delivered" && dr.status !== "cancelled") {
      try {
        const { swiftSendOrder } = await import("@/lib/delivery/delivery.swift");
        const { data: freshOrder } = await supabaseAdmin
          .from("orders")
          .select("*")
          .eq("id", order.id)
          .maybeSingle();
        const { data: merchant } = await supabaseAdmin
          .from("merchants")
          .select("id,name,slug")
          .eq("id", order.merchant_id)
          .maybeSingle();
        if (freshOrder && merchant) {
          const res = await swiftSendOrder({
            order: freshOrder,
            merchant,
            deliveryRequestId: dr.id,
          });
          if (res.ok) {
            syncedExternal = true;
          } else {
            syncError = res.error ?? "Swift sync failed";
            await supabaseAdmin
              .from("delivery_requests")
              .update({ last_error: syncError })
              .eq("id", dr.id);
          }
        }
      } catch (e: any) {
        syncError = e?.message ?? String(e);
      }
    }

    return {
      ok: true as const,
      deliverySynced: !!dr,
      syncedExternal,
      syncError,
    };
  });
