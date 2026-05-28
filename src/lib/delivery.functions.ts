// Backward-compatible wrapper. Шинэ delivery service-ийг ашиглана.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createDeliveryRequest } from "./delivery/delivery.service";

export const sendOrderToDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("merchant_id, delivery_order_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Захиалга олдсонгүй" };

    const { data: ok } = await supabaseAdmin.rpc("has_merchant_access", {
      _user_id: userId,
      _merchant_id: order.merchant_id,
    });
    if (!ok) return { ok: false as const, error: "Эрх хүрэхгүй" };

    const res = await createDeliveryRequest({ orderId: data.orderId, userId });
    if (!res.ok) return { ok: false as const, error: res.error };
    const ref = res.deliveryRequest?.external_ref ?? res.deliveryRequest?.id;
    return {
      ok: true as const,
      alreadySent: !!res.alreadyExists,
      deliveryRef: ref,
      message: res.alreadyExists
        ? `Аль хэдийн илгээсэн: ${ref}`
        : `Хүргэлт амжилттай үүслээ: ${ref}`,
    };
  });

// Re-export new functions for convenience
export {
  createDeliveryRequestFn,
  updateDeliveryStatusFn,
  cancelDeliveryRequestFn,
  calculateDeliveryFeeFn,
  listMerchantDeliveryRequests,
  getDeliveryHistoryByOrder,
} from "./delivery/delivery.functions";
