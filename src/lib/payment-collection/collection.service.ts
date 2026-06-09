// Post-delivery automated payment collection. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createQpayInvoice } from "@/lib/qpay.server";
import { sendCallproSms } from "./callpro.server";

const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL ||
  process.env.LOVABLE_APP_URL ||
  "https://only-hub.lovable.app";

type PaymentRequestRow = any;

async function loadAutoSettings() {
  const { data: row } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "auto_payment_collection")
    .maybeSingle();
  const v: any = (row as any)?.value ?? {};
  return {
    enabled: v.enabled !== false,
    expires_hours: Number(v.expires_hours ?? 48),
    sms_template_qpay:
      v.sms_template_qpay ||
      "Сайн байна уу?\n\nТаны захиалга амжилттай хүргэгдлээ.\n\nТөлөх дүн:\n{amount}₮\n\nТөлбөр төлөх:\n{invoice_link}\n\nЗахиалгын дугаар:\n{order_number}\n\nБаярлалаа.",
    sms_template_bank:
      v.sms_template_bank ||
      "Сайн байна уу?\n\nТаны захиалга амжилттай хүргэгдлээ.\n\nТөлөх дүн:\n{amount}₮\n\nХүлээн авагч:\n{recipient}\n\nДанс:\n{bank_account}\n\nГүйлгээний утга:\n{order_number}",
  };
}

async function loadBankAccount() {
  const { data: row } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "bank_account_info")
    .maybeSingle();
  const v: any = (row as any)?.value ?? {};
  return {
    bank: v.bank || "",
    account_number: v.account_number || "",
    account_name: v.account_name || "Only Hub",
  };
}

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

async function findOrCreateRequest(orderId: string): Promise<{
  ok: boolean;
  request?: PaymentRequestRow;
  order?: any;
  error?: string;
  alreadyExisted?: boolean;
}> {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Захиалга олдсонгүй" };
  if (order.payment_status === "confirmed") {
    return { ok: false, error: "Захиалга төлөгдсөн байна" };
  }

  const { data: existing } = await supabaseAdmin
    .from("payment_requests")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing) {
    return { ok: true, request: existing, order, alreadyExisted: true };
  }

  const auto = await loadAutoSettings();
  const expiresAt = new Date(Date.now() + auto.expires_hours * 3600_000).toISOString();
  const { data: inserted, error } = await supabaseAdmin
    .from("payment_requests")
    .insert({
      order_id: order.id,
      merchant_id: order.merchant_id,
      customer_phone: order.phone,
      amount: Number(order.total ?? 0),
      payment_provider: "qpay",
      status: "pending",
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error || !inserted) {
    // Race condition fallback
    const { data: again } = await supabaseAdmin
      .from("payment_requests")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    if (again) return { ok: true, request: again, order, alreadyExisted: true };
    return { ok: false, error: error?.message ?? "payment_request үүсэхгүй" };
  }
  return { ok: true, request: inserted, order, alreadyExisted: false };
}

async function generateInvoiceFor(request: PaymentRequestRow, order: any) {
  const callback = `${PUBLIC_BASE}/api/public/qpay/webhook?order_id=${order.id}`;
  try {
    const inv = await createQpayInvoice({
      merchantId: order.merchant_id,
      orderId: order.id,
      amount: Number(request.amount ?? order.total ?? 0),
      description: `Захиалга ${order.external_ref ?? order.id.slice(0, 8)}`,
      callbackUrl: callback,
    });
    if (!inv) {
      return await markBankFallback(request, order, "QPay тохиргоо байхгүй");
    }
    const invoiceUrl =
      inv.qPay_shortUrl ||
      `${PUBLIC_BASE}/store/${order.merchant_id}/order/${order.id}`;
    const { data: updated } = await supabaseAdmin
      .from("payment_requests")
      .update({
        payment_provider: "qpay",
        invoice_id: inv.invoice_id,
        invoice_url: invoiceUrl,
        qr_text: inv.qr_text ?? null,
        qr_image: inv.qr_image ?? null,
        last_error: null,
      })
      .eq("id", request.id)
      .select("*")
      .single();
    // Mirror to orders so customer tracking page renders QR
    await supabaseAdmin
      .from("orders")
      .update({
        qpay_invoice_id: inv.invoice_id,
        qpay_qr_text: inv.qr_text ?? null,
        qpay_qr_image: inv.qr_image ?? null,
        qpay_short_url: inv.qPay_shortUrl ?? null,
        qpay_urls: (inv.urls as any) ?? [],
        payment_error: null,
      })
      .eq("id", order.id);
    return updated ?? request;
  } catch (e: any) {
    return await markBankFallback(request, order, e?.message ?? "QPay алдаа");
  }
}

async function markBankFallback(request: PaymentRequestRow, _order: any, reason: string) {
  const bank = await loadBankAccount();
  const bankStr = bank.account_number
    ? `${bank.bank} ${bank.account_number}`.trim()
    : "";
  const { data: updated } = await supabaseAdmin
    .from("payment_requests")
    .update({
      payment_provider: "bank_transfer",
      bank_account: bank,
      invoice_url: null,
      invoice_id: null,
      qr_text: null,
      qr_image: null,
      last_error: reason,
    })
    .eq("id", request.id)
    .select("*")
    .single();
  return updated ?? { ...request, payment_provider: "bank_transfer", bank_account: bank, last_error: reason, _bankStr: bankStr };
}

async function sendRequestSms(
  request: PaymentRequestRow,
  order: any,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  if (!order.phone) return { ok: false, error: "Хэрэглэгчийн утас байхгүй" };
  if (!opts.force && request.sms_sent_at) return { ok: true, skipped: true };
  const auto = await loadAutoSettings();
  const orderNumber = order.external_ref ?? order.id.slice(0, 8);
  const amount = Number(request.amount ?? order.total ?? 0).toLocaleString("en-US");

  let message: string;
  if (request.payment_provider === "qpay" && request.invoice_url) {
    message = renderTemplate(auto.sms_template_qpay, {
      amount,
      invoice_link: request.invoice_url,
      order_number: orderNumber,
    });
  } else {
    const bank: any = request.bank_account ?? (await loadBankAccount());
    const bankAccount = bank?.account_number
      ? `${bank.bank ?? ""} ${bank.account_number}`.trim()
      : "—";
    message = renderTemplate(auto.sms_template_bank, {
      amount,
      bank_account: bankAccount,
      recipient: bank?.account_name || "Only Hub",
      order_number: orderNumber,
    });
  }

  const res = await sendCallproSms({ phone: order.phone, message });
  if (!res.ok) {
    await supabaseAdmin
      .from("payment_requests")
      .update({
        sms_attempts: (request.sms_attempts ?? 0) + 1,
        last_sms_error: res.error,
      })
      .eq("id", request.id);
    return { ok: false, error: res.error };
  }
  await supabaseAdmin
    .from("payment_requests")
    .update({
      sms_sent_at: new Date().toISOString(),
      sms_attempts: (request.sms_attempts ?? 0) + 1,
      last_sms_error: null,
      status: "requested",
    })
    .eq("id", request.id);
  return { ok: true };
}

// Public entry: жолооч "Delivered" дарсны дараа.
export async function onDeliveryCompleted(args: {
  orderId: string;
  collectedInCash?: boolean;
}) {
  const { orderId, collectedInCash } = args;

  if (collectedInCash) {
    await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "confirmed",
        delivery_status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    return { ok: true as const, collectedInCash: true };
  }

  const auto = await loadAutoSettings();
  if (!auto.enabled) {
    console.log("[collection] disabled by platform_settings", orderId);
    return { ok: true as const, disabled: true };
  }

  const found = await findOrCreateRequest(orderId);
  if (!found.ok || !found.request || !found.order) {
    console.error("[collection] findOrCreateRequest failed", orderId, found.error);
    return { ok: false as const, error: found.error ?? "payment_request үүсэхгүй" };
  }
  let req = found.request;
  const order = found.order;

  // Generate invoice if missing
  if (!req.invoice_id && req.payment_provider !== "bank_transfer") {
    try {
      req = await generateInvoiceFor(req, order);
    } catch (e) {
      console.error("[collection] generateInvoiceFor failed", orderId, e);
    }
  }

  // Send SMS (idempotent). Хэрэв өмнө явсан бол алгасна. Алдаа гарвал лог үлдээнэ.
  const smsRes = await sendRequestSms(req, order, { force: false });
  if (!smsRes.ok) {
    console.error("[collection] SMS failed", orderId, smsRes.error);
  } else if (smsRes.skipped) {
    console.log("[collection] SMS already sent (skipped)", orderId);
  } else {
    console.log("[collection] SMS sent", orderId, order.phone);
  }

  // Update order delivery_status hint
  await supabaseAdmin
    .from("orders")
    .update({ delivery_status: "payment_requested" })
    .eq("id", orderId)
    .neq("payment_status", "confirmed");

  return {
    ok: true as const,
    paymentRequestId: req.id,
    smsSent: !!smsRes.ok && !smsRes.skipped,
    smsSkipped: !!smsRes.skipped,
    smsError: smsRes.ok ? null : smsRes.error ?? null,
    provider: req.payment_provider,
  };
}


export async function resendCollectionSms(orderId: string) {
  const { data: req } = await supabaseAdmin
    .from("payment_requests")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!req) return { ok: false as const, error: "Төлбөрийн хүсэлт байхгүй" };
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false as const, error: "Захиалга олдсонгүй" };
  return sendRequestSms(req, order, { force: true });
}

export async function markRequestPaid(orderId: string) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("payment_requests")
    .update({ status: "paid", paid_at: nowIso })
    .eq("order_id", orderId);
  await supabaseAdmin
    .from("orders")
    .update({
      payment_status: "confirmed",
      delivery_status: "paid",
      updated_at: nowIso,
    })
    .eq("id", orderId);
  return { ok: true as const };
}
