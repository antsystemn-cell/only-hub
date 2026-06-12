// Centralized invoice lifecycle: create a payment_intent for an order via the
// resolved provider (merchant-own or platform fallback), poll status, and
// route paid intents through confirmOrderPayment() (the single allowed place
// to mark orders as paid + trigger delivery).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PROVIDER_TYPES = ["qpay", "storepay", "pocket", "omniway"] as const;

// ───────────────────────── Create / reuse a payment intent ─────────────────────────
export const createPaymentIntent = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid(),
      providerType: z.enum(PROVIDER_TYPES),
      phone: z.string().trim().max(30).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadProviderRowForCheckout } = await import("@/lib/payments/provider-resolver.server");
    const { getAdapter } = await import("@/lib/payments/adapters/index.server");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, merchant_id, total, payment_status, external_ref, phone")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr || !order) return { ok: false as const, error: "Захиалга олдсонгүй" };
    if (order.payment_status === "confirmed") {
      return { ok: false as const, error: "Энэ захиалга аль хэдийн төлөгдсөн" };
    }

    // Reuse an existing waiting intent for the same (order, provider).
    const { data: existing } = await supabaseAdmin
      .from("payment_intents")
      .select("id, status, invoice_id, qr_text, qr_image, deeplink, urls, request_id, provider_type")
      .eq("order_id", data.orderId)
      .eq("provider_type", data.providerType)
      .in("status", ["initiated", "waiting"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (existing && existing.length > 0) {
      const e = existing[0];
      return {
        ok: true as const,
        intent: {
          id: e.id as string,
          status: e.status as string,
          providerType: e.provider_type as string,
          invoiceId: (e.invoice_id as string) ?? null,
          qrText: (e.qr_text as string) ?? null,
          qrImage: (e.qr_image as string) ?? null,
          deeplink: (e.deeplink as string) ?? null,
          urls: e.urls ?? null,
          requestId: (e.request_id as string) ?? null,
        },
      };
    }

    const resolved = await loadProviderRowForCheckout({
      merchantId: order.merchant_id as string,
      providerType: data.providerType,
    });
    if (!resolved) {
      return { ok: false as const, error: "Энэ дэлгүүр энэ төлбөрийн системийг идэвхжүүлээгүй байна" };
    }
    const adapter = getAdapter(data.providerType);
    if (!adapter) return { ok: false as const, error: "Тохирох адаптер олдсонгүй" };

    // Build absolute callback URL based on the request origin (TanStack server runtime).
    const callbackUrl = buildWebhookUrl(data.providerType);

    let created;
    try {
      created = await adapter.createInvoice({
        orderId: order.id as string,
        amount: Number(order.total),
        description: `Захиалга ${order.external_ref ?? order.id}`,
        phone: data.phone ?? (order.phone as string | null),
        orderRef: (order.external_ref as string) ?? (order.id as string),
        callbackUrl,
        credentials: (resolved.row.credentials as any) ?? {},
      });
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Нэхэмжлэл үүсгэхэд алдаа" };
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("payment_intents")
      .insert({
        order_id: order.id,
        merchant_id: order.merchant_id,
        provider_id: resolved.row.id,
        provider_type: data.providerType,
        amount: order.total,
        phone: data.phone ?? order.phone ?? null,
        status: "waiting",
        invoice_id: created.invoiceId || null,
        request_id: created.requestId ?? null,
        qr_text: created.qrText ?? null,
        qr_image: created.qrImage ?? null,
        deeplink: created.deeplink ?? null,
        urls: (created.urls as any) ?? null,
        provider_response: (created.raw as any) ?? null,
        is_platform_fallback: resolved.isPlatformFallback,
      })
      .select("id")
      .single();
    if (insertErr) return { ok: false as const, error: insertErr.message };

    return {
      ok: true as const,
      intent: {
        id: inserted!.id as string,
        status: "waiting",
        providerType: data.providerType,
        invoiceId: created.invoiceId || null,
        qrText: created.qrText ?? null,
        qrImage: created.qrImage ?? null,
        deeplink: created.deeplink ?? null,
        urls: created.urls ?? null,
        requestId: created.requestId ?? null,
      },
    };
  });

// ───────────────────────── Check intent status (poll) ─────────────────────────
export const checkPaymentIntent = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ intentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadProviderRowForCheckout } = await import("@/lib/payments/provider-resolver.server");
    const { getAdapter } = await import("@/lib/payments/adapters/index.server");
    const { confirmOrderPayment } = await import("@/lib/payments/confirm-order-payment.server");

    const { data: intent, error } = await supabaseAdmin
      .from("payment_intents")
      .select("*")
      .eq("id", data.intentId)
      .maybeSingle();
    if (error || !intent) return { ok: false as const, error: "Нэхэмжлэл олдсонгүй" };

    if (intent.status === "paid") return { ok: true as const, status: "paid" };
    if (intent.status === "failed" || intent.status === "cancelled") {
      return { ok: true as const, status: intent.status as string };
    }

    const resolved = await loadProviderRowForCheckout({
      merchantId: intent.merchant_id as string,
      providerType: intent.provider_type as string,
    });
    if (!resolved) return { ok: false as const, error: "Провайдер олдсонгүй" };
    const adapter = getAdapter(intent.provider_type as string);
    if (!adapter) return { ok: false as const, error: "Адаптер олдсонгүй" };

    let result;
    try {
      result = await adapter.checkStatus({
        invoiceId: intent.invoice_id as string | null,
        requestId: intent.request_id as string | null,
        orderRef: null,
        credentials: (resolved.row.credentials as any) ?? {},
      });
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Шалгахад алдаа" };
    }

    if (result.status === "paid") {
      await supabaseAdmin
        .from("payment_intents")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          provider_response: (result.raw as any) ?? null,
        })
        .eq("id", intent.id);

      const source = intent.is_platform_fallback ? "admin_manual" : "qpay_polling";
      await confirmOrderPayment({
        orderId: intent.order_id as string,
        source: source as any,
        note: `via ${intent.provider_type}${intent.is_platform_fallback ? " (platform fallback)" : ""}`,
      });
      return { ok: true as const, status: "paid" };
    }

    if (result.status === "failed" || result.status === "cancelled") {
      await supabaseAdmin
        .from("payment_intents")
        .update({ status: result.status, provider_response: (result.raw as any) ?? null })
        .eq("id", intent.id);
      return { ok: true as const, status: result.status };
    }

    return { ok: true as const, status: "waiting" };
  });

// ───────────────────────── Storepay-only helper: check eligibility ─────────────────────────
export const checkStorepayEligibility = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      merchantId: z.string().uuid(),
      phone: z.string().trim().regex(/^\d{8}$/, "Утасны дугаар 8 оронтой тоо байх ёстой"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { loadProviderRowForCheckout } = await import("@/lib/payments/provider-resolver.server");
    const { checkEligibility } = await import("@/lib/payments/adapters/storepay.server");
    const resolved = await loadProviderRowForCheckout({
      merchantId: data.merchantId,
      providerType: "storepay",
    });
    if (!resolved) return { ok: false as const, error: "Storepay тохиргоо олдсонгүй" };
    try {
      const r = await checkEligibility((resolved.row.credentials as any) ?? {}, data.phone);
      return { ok: true as const, ...r };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Storepay шалгахад алдаа" };
    }
  });

function buildWebhookUrl(providerType: string): string {
  // Stable per-environment URL — webhooks fall back to checkStatus on receipt,
  // so even a wrong origin won't corrupt anything; the adapter re-verifies.
  const projectId = process.env.SUPABASE_PROJECT_ID || process.env.VITE_SUPABASE_PROJECT_ID;
  const customOrigin = process.env.PUBLIC_APP_ORIGIN;
  const origin =
    customOrigin ||
    (projectId ? `https://project--${projectId}.lovable.app` : "https://only.mn");
  return `${origin.replace(/\/$/, "")}/api/public/payments/${providerType}/webhook`;
}
