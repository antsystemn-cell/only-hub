// Auto SMS-ийг "хүргэлтэнд гарсан" болсон үед явуулна. Идемпотент.
// Латин үсэг богино темплэйт. CallPro verified link (QPay богино URL) ашиглана.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendCallproSms } from "@/lib/payment-collection/callpro.server";
import { getOrCreateTrackingToken, buildTrackingUrl } from "./tracking.server";

// Богино латин темплэйт. Төгсгөлд # — Sender ID "ONLY"-г тусгаарлана.
const DEFAULT_TEMPLATE =
  "Tanii {merchant_name}-s hiisen zahialga belen.\n" +
  "Dun: {total}MNT\n" +
  "Tulbur: {payment_link}\n" +
  "Bayarlalaa #";

async function loadTemplate(): Promise<string> {
  const { data: row } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "tracking_sms_template")
    .maybeSingle();
  const v: any = (row as any)?.value ?? {};
  return v.message || DEFAULT_TEMPLATE;
}

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function formatAmount(n: number): string {
  try {
    return new Intl.NumberFormat("en-US").format(Math.round(n));
  } catch {
    return String(Math.round(n));
  }
}

export async function sendTrackingLinkSms(orderId: string): Promise<
  | { ok: true; skipped?: boolean; phone?: string }
  | { ok: false; error: string }
> {
  // Idempotency marker
  const { data: dr } = await supabaseAdmin
    .from("delivery_requests")
    .select("id, tracking_sms_sent_at")
    .eq("order_id", orderId)
    .maybeSingle();
  if (dr?.tracking_sms_sent_at) {
    return { ok: true, skipped: true };
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select(
      "id, phone, external_ref, merchant_id, total, payment_status, qpay_short_url",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Захиалга олдсонгүй" };
  if (!order.phone) return { ok: false, error: "Утасны дугаар байхгүй" };

  // Payment link priority: QPay short URL → payment_request invoice → tracking link fallback
  let paymentLink: string | null = (order as any).qpay_short_url ?? null;
  if (!paymentLink) {
    const { data: pr } = await supabaseAdmin
      .from("payment_requests")
      .select("invoice_url")
      .eq("order_id", orderId)
      .maybeSingle();
    paymentLink = (pr as any)?.invoice_url ?? null;
  }
  if (!paymentLink) {
    const tok = await getOrCreateTrackingToken(orderId);
    paymentLink = buildTrackingUrl(tok.public_token);
  }

  const { data: merchant } = await supabaseAdmin
    .from("merchants")
    .select("name, slug")
    .eq("id", order.merchant_id)
    .maybeSingle();

  // Merchant name: prefer slug (латин), fallback to name
  const merchantLabel =
    (merchant as any)?.slug || (merchant as any)?.name || "Only";

  const tpl = await loadTemplate();
  const message = render(tpl, {
    payment_link: paymentLink,
    tracking_link: paymentLink, // backward-compat: хуучин template-ууд
    total: formatAmount(Number(order.total ?? 0)),
    order_number: order.external_ref ?? order.id.slice(0, 8),
    merchant_name: String(merchantLabel),
  });

  const res = await sendCallproSms({ phone: order.phone, message });
  const { logNotification } = await import("@/lib/notifications/log.server");
  if (!res.ok) {
    await logNotification({
      orderId,
      merchantId: order.merchant_id,
      eventType: "tracking_link",
      channel: "sms",
      provider: "callpro",
      recipient: order.phone,
      status: "failed",
      message,
      error: res.error,
    });
    return { ok: false, error: res.error };
  }
  if (dr?.id) {
    await supabaseAdmin
      .from("delivery_requests")
      .update({ tracking_sms_sent_at: new Date().toISOString() })
      .eq("id", dr.id);
  }
  await logNotification({
    orderId,
    merchantId: order.merchant_id,
    eventType: "tracking_link",
    channel: "sms",
    provider: "callpro",
    recipient: order.phone,
    status: "sent",
    message,
  });
  return { ok: true, phone: order.phone };
}
