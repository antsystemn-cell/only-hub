// Notification logging helper. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type NotificationEvent =
  | "paid"
  | "delivered"
  | "payment_requested"
  | "sms_retry"
  | "delivery_dispatched"
  | "delivery_failed";

export interface LogNotificationArgs {
  orderId?: string | null;
  merchantId?: string | null;
  eventType: NotificationEvent | string;
  channel?: "sms" | "email" | "webhook" | "system";
  recipient?: string | null;
  status?: "sent" | "failed" | "skipped" | "pending";
  provider?: string | null;
  message?: string | null;
  error?: string | null;
  payload?: Record<string, any> | null;
  attempt?: number;
}

export async function logNotification(args: LogNotificationArgs) {
  try {
    await supabaseAdmin.from("notifications_log").insert({
      order_id: args.orderId ?? null,
      merchant_id: args.merchantId ?? null,
      event_type: args.eventType,
      channel: args.channel ?? "sms",
      recipient: args.recipient ?? null,
      status: args.status ?? "sent",
      provider: args.provider ?? null,
      message: args.message ?? null,
      error: args.error ?? null,
      payload: (args.payload ?? null) as any,
      attempt: args.attempt ?? 1,
    });
  } catch (e) {
    // Logging must never throw upstream
    console.error("[notifications] logNotification failed", e);
  }
}
