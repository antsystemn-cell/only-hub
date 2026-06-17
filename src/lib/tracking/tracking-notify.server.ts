// Auto SMS-ийг жолооч "оноогдсон" болсон үед явуулна. Идемпотент.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendCallproSms } from "@/lib/payment-collection/callpro.server";
import { getOrCreateTrackingToken, buildTrackingUrl } from "./tracking.server";

const DEFAULT_TEMPLATE =
  "Tanii zahialgiig hurgeltend huleelgej ugluu.\n\n" +
  "Ta daraah linkeer orj zahialga bolon hurgeltiin medeellee hyanaarai.\n" +
  "{tracking_link}";

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

export async function sendTrackingLinkSms(orderId: string): Promise<
  | { ok: true; skipped?: boolean; phone?: string }
  | { ok: false; error: string }
> {
  // Check delivery_request marker for idempotency
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
    .select("id, phone, external_ref, merchant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Захиалга олдсонгүй" };
  if (!order.phone) return { ok: false, error: "Утасны дугаар байхгүй" };

  const tok = await getOrCreateTrackingToken(orderId);
  const link = buildTrackingUrl(tok.public_token);
  const { data: merchant } = await supabaseAdmin
    .from("merchants")
    .select("name")
    .eq("id", order.merchant_id)
    .maybeSingle();

  const tpl = await loadTemplate();
  const message = render(tpl, {
    tracking_link: link,
    order_number: order.external_ref ?? order.id.slice(0, 8),
    merchant_name: merchant?.name ?? "Only Hub",
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
