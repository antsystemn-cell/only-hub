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
      .select("id,name,price,stock_quantity,variant_stock,is_active,merchant_id")
      .in("id", ids);
    const pmap = new Map<string, any>((products ?? []).map((p) => [p.id, p]));

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
        // price changed; use real price
        i.price = realPrice;
      }
      subtotal += realPrice * i.quantity;
      return { ...i, price: realPrice, name: p.name };
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

    // 4b. Reserve stock atomically BEFORE creating the order, so concurrent
    //     checkouts cannot oversell the same tracked variant.
    const stockItems = normalized
      .map((i) => {
        const k = variantKey(i!.color, i!.size);
        return k ? { product_id: i!.productId, variant_key: k, qty: i!.quantity } : null;
      })
      .filter(Boolean) as { product_id: string; variant_key: string; qty: number }[];
    let stockReserved = false;
    if (stockItems.length) {
      const { data: stockRes, error: stockErr } = await supabaseAdmin.rpc(
        "decrement_variant_stocks",
        { _items: stockItems as any },
      );
      if (stockErr) return { ok: false as const, error: stockErr.message };
      const r = stockRes as any;
      if (r && r.ok === false) {
        const lines = (r.insufficient ?? [])
          .map(
            (it: any) =>
              `Барааны "${it.variant_key}" — үлдэгдэл ${it.remaining}, та ${it.requested}-г сонгосон`,
          )
          .join("\n");
        return { ok: false as const, error: lines || "Барааны үлдэгдэл хүрэлцэхгүй" };
      }
      stockReserved = true;
    }

    // 4c. Atomically consume the coupon (prevents double-use under load).
    if (couponId) {
      const { data: consumed, error: consumeErr } = await supabaseAdmin.rpc("consume_coupon", {
        _coupon_id: couponId,
      });
      if (consumeErr || !consumed) {
        if (stockReserved) {
          await supabaseAdmin.rpc("restore_variant_stocks", { _items: stockItems as any });
        }
        return { ok: false as const, error: "Купоны хязгаар дууссан" };
      }
    }

    // 5. Insert order
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
      })
      .select("*")
      .single();
    if (orderErr || !order) {
      // Compensating rollback for the reservations we just made.
      if (stockReserved) {
        await supabaseAdmin.rpc("restore_variant_stocks", { _items: stockItems as any });
      }
      if (couponId) {
        // Best-effort: decrement the counter we just bumped via consume_coupon.
        const { data: c } = await supabaseAdmin
          .from("coupons")
          .select("used_count")
          .eq("id", couponId)
          .single();
        if (c && c.used_count > 0) {
          await supabaseAdmin
            .from("coupons")
            .update({ used_count: c.used_count - 1 })
            .eq("id", couponId);
        }
      }
      return { ok: false as const, error: orderErr?.message ?? "Захиалга үүсгэхэд алдаа" };
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
        sale_date: data.saleDate ? new Date(data.saleDate).toISOString() : null,
        branch: data.branch || null,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return { ok: false as const, error: error?.message ?? "Үүсгэхэд алдаа" };
    }

    // Apply target status (allowed once row exists because update policy is permissive)
    if (insertStatus !== data.status && data.paymentStatus !== "confirmed") {
      await supabaseAdmin.from("orders").update({ status: data.status }).eq("id", inserted.id);
    }

    // If marked as paid, route through the centralized confirmation service
    // (idempotent, fires commission trigger + auto delivery request).
    if (data.paymentStatus === "confirmed") {
      const res = await confirmOrderPayment({
        orderId: inserted.id,
        source: "merchant_manual",
      });
      if (!res.ok) {
        return { ok: false as const, error: res.error, orderId: inserted.id };
      }
      // If caller also requested a non-pending status (e.g. completed), apply it now.
      if (data.status && data.status !== "pending") {
        await supabaseAdmin.from("orders").update({ status: data.status }).eq("id", inserted.id);
      }
    }

    return { ok: true as const, orderId: inserted.id };
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
      .update(patch)
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
      .update(drPatch)
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
