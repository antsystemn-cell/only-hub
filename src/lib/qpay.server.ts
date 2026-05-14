import { supabaseAdmin } from "@/integrations/supabase/client.server";

type QpayCredentials = {
  username?: string;
  client_id?: string;
  password?: string;
  client_secret?: string;
  invoice_code?: string;
  base_url?: string;
};

const clean = (value?: string) => value?.trim() ?? "";

export type QpayInvoice = {
  invoice_id: string;
  qr_text?: string;
  qr_image?: string;
  qPay_shortUrl?: string;
  urls?: any;
};

async function getQpayToken(creds: QpayCredentials, baseUrl: string) {
  const username = clean(creds.username || creds.client_id);
  const password = clean(creds.password || creds.client_secret);
  const invoiceCode = clean(creds.invoice_code);
  if (!username || !password || !invoiceCode) {
    throw new Error("QPay client_id / client_secret / invoice_code дутуу");
  }
  if (password === invoiceCode) {
    throw new Error("QPay client_secret/password нь invoice_code-той ижил хадгалагдсан байна");
  }
  const res = await fetch(`${baseUrl}/auth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
    },
    body: "",
  });
  if (!res.ok) throw new Error(`QPay auth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function getMerchantQpayProvider(merchantId: string) {
  const { data } = await supabaseAdmin
    .from("payment_providers")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("provider_type", "qpay")
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

export async function createQpayInvoice(opts: {
  merchantId: string;
  orderId: string;
  amount: number;
  description: string;
  callbackUrl: string;
}): Promise<QpayInvoice | null> {
  const provider = await getMerchantQpayProvider(opts.merchantId);
  if (!provider) return null;
  const creds = (provider.credentials as QpayCredentials) ?? {};
  const baseUrl = (creds.base_url || "https://merchant.qpay.mn/v2").replace(/\/$/, "");
  const invoiceCode = creds.invoice_code;
  if (!invoiceCode) return null;

  const token = await getQpayToken(creds, baseUrl);
  const res = await fetch(`${baseUrl}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      invoice_code: invoiceCode,
      sender_invoice_no: opts.orderId,
      invoice_receiver_code: "terminal",
      invoice_description: opts.description,
      amount: opts.amount,
      callback_url: opts.callbackUrl,
    }),
  });
  if (!res.ok) throw new Error(`QPay invoice failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as QpayInvoice;
  return json;
}

export async function checkQpayPayment(merchantId: string, invoiceId: string): Promise<boolean> {
  const provider = await getMerchantQpayProvider(merchantId);
  if (!provider) return false;
  const creds = (provider.credentials as QpayCredentials) ?? {};
  const baseUrl = (creds.base_url || "https://merchant.qpay.mn/v2").replace(/\/$/, "");
  const token = await getQpayToken(creds, baseUrl);
  const res = await fetch(`${baseUrl}/payment/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      object_type: "INVOICE",
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 5 },
    }),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { count?: number; rows?: Array<{ payment_status?: string }> };
  return (json.rows ?? []).some((r) => r.payment_status === "PAID");
}
