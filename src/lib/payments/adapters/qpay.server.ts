// QPay adapter — wraps the existing qpay.server.ts helpers behind the common
// adapter shape so payments.functions.ts can dispatch by provider_type.

import type {
  PaymentProviderAdapter,
  CreateInvoiceInput,
  CheckStatusInput,
  CheckStatusResult,
  TestConnectionResult,
  AdapterInvoice,
} from "./types";

type QpayCreds = {
  username?: string;
  client_id?: string;
  password?: string;
  client_secret?: string;
  invoice_code?: string;
  base_url?: string;
};

function clean(v?: string) { return v?.trim() ?? ""; }

async function getToken(c: QpayCreds, baseUrl: string): Promise<string> {
  const username = clean(c.username || c.client_id);
  const password = clean(c.password || c.client_secret);
  const invoiceCode = clean(c.invoice_code);
  if (!username || !password || !invoiceCode) {
    throw new Error("QPay client_id / client_secret / invoice_code дутуу");
  }
  if (password === invoiceCode) {
    throw new Error("QPay client_secret нь invoice_code-той ижил байж болохгүй");
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
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("QPay access_token буцаагдсангүй");
  return j.access_token;
}

export const qpayAdapter: PaymentProviderAdapter = {
  requiredFields: ["username", "password", "invoice_code"],

  async testConnection(credentials: Record<string, any>): Promise<TestConnectionResult> {
    try {
      const c = credentials as QpayCreds;
      const baseUrl = (c.base_url || "https://merchant.qpay.mn/v2").replace(/\/$/, "");
      await getToken(c, baseUrl);
      return { ok: true, message: "QPay холболт амжилттай" };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "QPay холболт амжилтгүй" };
    }
  },

  async createInvoice(input: CreateInvoiceInput): Promise<AdapterInvoice> {
    const c = input.credentials as QpayCreds;
    const baseUrl = (c.base_url || "https://merchant.qpay.mn/v2").replace(/\/$/, "");
    const token = await getToken(c, baseUrl);
    const res = await fetch(`${baseUrl}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        invoice_code: clean(c.invoice_code),
        sender_invoice_no: input.orderRef || input.orderId,
        invoice_receiver_code: "terminal",
        invoice_description: input.description,
        amount: Math.round(input.amount),
        callback_url: input.callbackUrl,
      }),
    });
    if (!res.ok) throw new Error(`QPay invoice failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as any;
    return {
      invoiceId: String(j.invoice_id),
      qrText: j.qr_text ?? null,
      qrImage: j.qr_image ? `data:image/png;base64,${j.qr_image}` : null,
      deeplink: j.qPay_shortUrl ?? null,
      urls: j.urls ?? null,
      raw: j,
    };
  },

  async checkStatus(input: CheckStatusInput): Promise<CheckStatusResult> {
    if (!input.invoiceId) return { status: "waiting" };
    const c = input.credentials as QpayCreds;
    const baseUrl = (c.base_url || "https://merchant.qpay.mn/v2").replace(/\/$/, "");
    const token = await getToken(c, baseUrl);
    const res = await fetch(`${baseUrl}/payment/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        object_type: "INVOICE",
        object_id: input.invoiceId,
        offset: { page_number: 1, page_limit: 5 },
      }),
    });
    if (!res.ok) return { status: "waiting" };
    const j = (await res.json()) as { rows?: Array<{ payment_status?: string }> };
    return {
      status: (j.rows ?? []).some((r) => r.payment_status === "PAID") ? "paid" : "waiting",
      raw: j,
    };
  },
};
