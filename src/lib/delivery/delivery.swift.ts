// Swift Delivery Hub адаптер. Зөвхөн server-side. API key браузерт хэзээ ч очихгүй.
const API_URL = (process.env.SWIFT_DELIVERY_API_URL || "").replace(/\/$/, "");
const API_KEY = process.env.SWIFT_DELIVERY_API_KEY || "";

// Only Merchants Hub external_order_id-ийн заавал prefix
export const OMH_PREFIX = "OMH-";
export function buildExternalOrderId(orderId: string): string {
  return `${OMH_PREFIX}${orderId}`;
}
export function isOmhExternalId(ext: string | null | undefined): boolean {
  return !!ext && ext.startsWith(OMH_PREFIX);
}

export interface SwiftSendArgs {
  order: any;
  merchant: any;
  deliveryRequestId: string;
}

export interface SwiftSendResult {
  ok: boolean;
  externalRef?: string;
  trackingCode?: string;
  raw?: any;
  error?: string;
}

function ensureConfig(): string | null {
  if (!API_URL) return "SWIFT_DELIVERY_API_URL тохируулаагүй";
  if (!API_KEY) return "SWIFT_DELIVERY_API_KEY тохируулаагүй";
  return null;
}

export async function swiftSendOrder(args: SwiftSendArgs): Promise<SwiftSendResult> {
  const cfgErr = ensureConfig();
  if (cfgErr) return { ok: false, error: cfgErr };
  const { order, merchant } = args;

  const items = Array.isArray(order.items) ? (order.items as any[]) : [];
  const deliveryFee = Number(order.delivery_fee ?? 0);
  const total = Number(order.total ?? 0);

  const payload = {
    external_order_id: buildExternalOrderId(String(order.id)),
    source_system: "only_merchants_hub",
    merchant_code: merchant?.id ?? merchant?.slug ?? null,
    merchant_name: merchant?.name ?? null,
    shop_code: merchant?.id ?? merchant?.slug ?? null,
    shop_name: merchant?.name ?? null,
    customer_name: order.guest_name ?? "Хэрэглэгч",
    phone: order.phone,
    district: order.branch ?? null,
    address_text: order.shipping_address,
    delivery_note: order.note ?? null,
    payment_method: order.payment_method ?? "cash",
    payment_status: order.payment_status === "confirmed" ? "paid" : "unpaid",
    items: items.map((it) => ({
      product_name: it.name ?? it.product_name ?? "Бараа",
      quantity: Number(it.quantity ?? 1),
      unit_price: Number(it.price ?? it.unit_price ?? 0),
      sku: it.sku ?? null,
    })),
    subtotal: total - deliveryFee,
    total_amount: total,
    delivery_fee: deliveryFee,
  };

  try {
    const resp = await fetch(`${API_URL}/order-intake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify(payload),
    });
    const raw = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: raw?.error ?? raw?.message ?? `HTTP ${resp.status}`, raw };
    }
    const tracking =
      raw?.internal_order_number ?? raw?.tracking_code ?? raw?.order_id ?? null;
    return { ok: true, externalRef: tracking ?? payload.external_order_id, trackingCode: tracking, raw };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Холбогдоход алдаа гарлаа" };
  }
}

// Outbound status sync (admin "Төлөв шинэчлэх" / cancel)
export async function swiftSyncStatus(args: {
  orderId: string;
  fulfillmentStatus: string;
  paymentStatus?: string;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string; raw?: any }> {
  const cfgErr = ensureConfig();
  if (cfgErr) return { ok: false, error: cfgErr };

  try {
    const resp = await fetch(`${API_URL}/status-update-inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify({
        external_order_id: buildExternalOrderId(args.orderId),
        fulfillment_status: args.fulfillmentStatus,
        payment_status: args.paymentStatus ?? null,
        note: args.note ?? null,
      }),
    });
    const raw = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: raw?.error ?? `HTTP ${resp.status}`, raw };
    return { ok: true, raw };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Холбогдоход алдаа гарлаа" };
  }
}

export function verifySwiftApiKey(incoming: string | null | undefined): boolean {
  if (!API_KEY) return false;
  return !!incoming && incoming === API_KEY;
}

// Standardized status map (Swift fulfillment_status → internal DeliveryStatus)
export const SWIFT_STATUS_MAP: Record<string, string> = {
  new: "pending",
  pending: "pending",
  confirmed: "requested",
  phone_confirmed: "requested",
  preparing: "assigned",
  assigned: "assigned",
  picked_up: "picked_up",
  out_for_delivery: "in_transit",
  delivering: "in_transit",
  in_transit: "in_transit",
  delivered: "delivered",
  completed: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  failed: "failed",
};

export function mapSwiftStatus(ext: string | null | undefined, fallback: string): string {
  if (!ext) return fallback;
  return SWIFT_STATUS_MAP[ext.toLowerCase()] ?? fallback;
}
