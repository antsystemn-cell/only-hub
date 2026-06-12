// Pocket (Invescore) adapter. Ported from HomeStore Mongolia reference.
// Auth: OAuth2 client_credentials at sso.invescore.mn.
// Invoice create:  POST /v2/invoicing/generate-invoice → { id, qr, deeplink, orderNumber }
// Status check:    POST /v2/invoicing/invoices/order-number { terminalId, orderNumber }
//                  → { state: "paid" | "cancelled" | "rejected" | "processing" | ... }

import type {
  PaymentProviderAdapter,
  CreateInvoiceInput,
  CheckStatusInput,
  CheckStatusResult,
  TestConnectionResult,
  AdapterInvoice,
} from "./types";

const TOKEN_URL = "https://sso.invescore.mn/auth/realms/invescore/protocol/openid-connect/token";
const INVOICE_URL = "https://service.invescore.mn/merchant/v2/invoicing/generate-invoice";
const CHECK_BY_ORDER_URL = "https://service.invescore.mn/merchant/v2/invoicing/invoices/order-number";

type PocketCreds = {
  client_id?: string;
  client_secret?: string;
  terminal_id?: string | number;
};

function clean(v?: string | number) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

async function getToken(c: PocketCreds): Promise<string> {
  const clientId = clean(c.client_id);
  const clientSecret = clean(c.client_secret);
  if (!clientId || !clientSecret) throw new Error("Pocket client_id / client_secret дутуу");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Pocket auth failed (${res.status}): ${await res.text()}`);
  }
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("Pocket access_token буцаагдсангүй");
  return j.access_token;
}

export const pocketAdapter: PaymentProviderAdapter = {
  requiredFields: ["client_id", "client_secret", "terminal_id"],

  async testConnection(credentials: Record<string, any>): Promise<TestConnectionResult> {
    try {
      const c = credentials as PocketCreds;
      if (!clean(c.terminal_id)) return { ok: false, message: "terminal_id дутуу" };
      await getToken(c);
      return { ok: true, message: "Pocket холболт амжилттай" };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Pocket холболт амжилтгүй" };
    }
  },

  async createInvoice(input: CreateInvoiceInput): Promise<AdapterInvoice> {
    const c = input.credentials as PocketCreds;
    const terminalId = Number(clean(c.terminal_id));
    if (!terminalId) throw new Error("Pocket terminal_id дутуу");
    const token = await getToken(c);
    const orderNumber = input.orderRef || input.orderId;
    const res = await fetch(INVOICE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId,
        amount: Math.round(input.amount),
        info: `ORDER-${orderNumber}`,
        orderNumber,
        invoiceType: "ZERO",
        channel: "ecommerce",
      }),
    });
    const text = await res.text();
    let data: any; try { data = JSON.parse(text); } catch { throw new Error(`Pocket хариу буруу: ${text}`); }
    if (!res.ok) throw new Error(data?.message || "Pocket нэхэмжлэл үүсгэхэд алдаа");
    return {
      invoiceId: String(data.id),
      qrText: data.qr ?? null,
      deeplink: data.deeplink ?? null,
      requestId: orderNumber,
      raw: data,
    };
  },

  async checkStatus(input: CheckStatusInput): Promise<CheckStatusResult> {
    const c = input.credentials as PocketCreds;
    const terminalId = Number(clean(c.terminal_id));
    if (!terminalId) return { status: "waiting" };
    const orderNumber = input.requestId || input.invoiceId;
    if (!orderNumber) return { status: "waiting" };
    const token = await getToken(c);
    const res = await fetch(CHECK_BY_ORDER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ terminalId, orderNumber }),
    });
    if (!res.ok) return { status: "waiting" };
    const data = (await res.json()) as any;
    if (data.state === "paid") return { status: "paid", raw: data };
    if (["cancelled", "rejected", "unsuccess"].includes(data.state)) {
      return { status: "failed", raw: data };
    }
    return { status: "waiting", raw: data };
  },
};
