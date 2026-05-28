// Swift Delivery Hub / hurgelt.only.mn адаптер. Зөвхөн server дотор ашиглана.
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_ENDPOINT =
  process.env.SWIFT_DELIVERY_API_URL ||
  "https://hurgelt.only.mn/functions/v1/receive-order";

export interface SwiftSendArgs {
  order: any;
  merchant: any;
  deliveryRequestId: string;
}

export interface SwiftSendResult {
  ok: boolean;
  externalRef?: string;
  raw?: any;
  error?: string;
}

export async function swiftSendOrder(args: SwiftSendArgs): Promise<SwiftSendResult> {
  const { order, merchant, deliveryRequestId } = args;

  const apiKey = merchant.delivery_api_key || process.env.SWIFT_DELIVERY_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Хүргэлтийн API key тохируулаагүй байна." };
  }

  const endpoint = merchant.delivery_endpoint || DEFAULT_ENDPOINT;

  const payload = {
    external_order_id: order.external_ref ?? order.id,
    delivery_request_id: deliveryRequestId,
    source_channel: "only_hub",
    merchant_name: merchant.name,
    customer_name: order.guest_name ?? "Хэрэглэгч",
    phone: order.phone,
    address_text: order.shipping_address,
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

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const raw = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: raw?.error ?? `HTTP ${resp.status}`, raw };
    }
    const ref =
      raw?.internal_order_number ??
      raw?.order_id ??
      `DLV-${String(order.id).slice(0, 8).toUpperCase()}`;
    return { ok: true, externalRef: ref, raw };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Холбогдоход алдаа гарлаа" };
  }
}

// Map external delivery system fulfillment_status → internal delivery status.
export const SWIFT_STATUS_MAP: Record<string, string> = {
  confirmed: "requested",
  phone_confirmed: "requested",
  preparing: "assigned",
  assigned: "assigned",
  out_for_delivery: "in_transit",
  delivering: "in_transit",
  picked_up: "picked_up",
  delivered: "delivered",
  completed: "delivered",
  cancelled: "cancelled",
  failed: "failed",
};

export function mapSwiftStatus(ext: string | null | undefined, fallback: string): string {
  if (!ext) return fallback;
  return SWIFT_STATUS_MAP[ext.toLowerCase()] ?? fallback;
}
