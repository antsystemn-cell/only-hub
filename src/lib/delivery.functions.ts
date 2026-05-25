import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_ENDPOINT =
  "https://hurgelt.only.mn/functions/v1/receive-order";

export const sendOrderToDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Fetch order (with merchant)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr || !order) return { ok: false as const, error: "Захиалга олдсонгүй" };

    // Verify staff access
    const { data: hasAccess } = await supabaseAdmin.rpc("has_merchant_access", {
      _user_id: userId,
      _merchant_id: order.merchant_id,
    });
    if (!hasAccess) return { ok: false as const, error: "Эрх хүрэхгүй" };

    if (order.delivery_order_id) {
      return {
        ok: true as const,
        alreadySent: true,
        deliveryRef: order.delivery_order_id,
        message: `Аль хэдийн илгээсэн: ${order.delivery_order_id}`,
      };
    }

    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("id,name,delivery_api_key,delivery_endpoint")
      .eq("id", order.merchant_id)
      .maybeSingle();

    if (!merchant?.delivery_api_key) {
      return {
        ok: false as const,
        error:
          "Дэлгүүрт хүргэлтийн API key тохируулаагүй байна. Тохиргоо → Хүргэлт хэсэгт нэмнэ үү.",
      };
    }

    const endpoint = (merchant as any).delivery_endpoint || DEFAULT_ENDPOINT;

    const payload = {
      external_order_id: order.external_ref ?? order.id,
      source_channel: "only_mn",
      merchant_name: merchant.name,
      customer_name: order.guest_name ?? "Хэрэглэгч",
      phone: order.phone,
      alternate_phone: null,
      address_text: order.shipping_address,
      district: null,
      delivery_note: order.note ?? null,
      payment_method: order.payment_method ?? "cash",
      payment_status: order.payment_status === "confirmed" ? "paid" : "unpaid",
      delivery_fee: Number(order.delivery_fee ?? 0),
      subtotal: Number(order.total ?? 0) - Number(order.delivery_fee ?? 0),
      total_amount: Number(order.total ?? 0),
      items: Array.isArray(order.items)
        ? (order.items as any[]).map((it) => ({
            name: it.name,
            quantity: it.quantity ?? 1,
            price: it.price ?? 0,
            sku: it.sku ?? null,
            color: it.color ?? null,
            size: it.size ?? null,
          }))
        : [],
    };

    let respJson: any = null;
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${merchant.delivery_api_key}`,
        },
        body: JSON.stringify(payload),
      });
      respJson = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const errMsg = respJson?.error ?? `HTTP ${resp.status}`;
        return { ok: false as const, error: `Хүргэлтийн систем алдаа: ${errMsg}` };
      }
    } catch (e: any) {
      return {
        ok: false as const,
        error: `Хүргэлтийн API руу холбогдоход алдаа: ${e?.message ?? "тодорхойгүй"}`,
      };
    }

    const ref =
      respJson?.internal_order_number ??
      respJson?.order_id ??
      `DLV-${order.id.slice(0, 8).toUpperCase()}`;

    await supabaseAdmin
      .from("orders")
      .update({
        delivery_order_id: ref,
        delivery_status: "submitted",
        status: "delivering",
      })
      .eq("id", order.id);

    return {
      ok: true as const,
      deliveryRef: ref,
      message: `Хүргэлт рүү амжилттай илгээлээ: ${ref}`,
    };
  });
