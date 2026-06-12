// Omniway / OmniTech adapter. Ported from Only.mn reference edge function.
// Auth: Basic (username/password).
// Invoice:  POST /ecommerce/invoices → { invoiceNumber, imageBase64, qrContent }
// Status:   GET  /ecommerce/invoices/{invoiceNumber} → { statusId: 301=UNPAID, 302=PAID, 303=CANCELLED }

import type {
  PaymentProviderAdapter,
  CreateInvoiceInput,
  CheckStatusInput,
  CheckStatusResult,
  TestConnectionResult,
  AdapterInvoice,
} from "./types";

const OMNIWAY_BASE = "https://payment.omnitech.mn";

type OmniwayCreds = { username?: string; password?: string };

function clean(v?: string) {
  return v?.trim() ?? "";
}

function basicHeader(c: OmniwayCreds) {
  const u = clean(c.username);
  const p = clean(c.password);
  if (!u || !p) throw new Error("Omniway username / password дутуу");
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

export const omniwayAdapter: PaymentProviderAdapter = {
  requiredFields: ["username", "password"],

  async testConnection(credentials: Record<string, any>): Promise<TestConnectionResult> {
    try {
      const c = credentials as OmniwayCreds;
      const auth = basicHeader(c);
      // Omniway has no dedicated test endpoint — call a lightweight GET that requires auth.
      // /ecommerce/invoices with a bogus number returns 4xx but proves auth works.
      const res = await fetch(`${OMNIWAY_BASE}/ecommerce/invoices/__test__`, {
        method: "GET",
        headers: { Authorization: auth, Accept: "application/json" },
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: "Omniway нэвтрэх эрх буруу" };
      }
      return { ok: true, message: "Omniway холболт амжилттай" };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Omniway холболт амжилтгүй" };
    }
  },

  async createInvoice(input: CreateInvoiceInput): Promise<AdapterInvoice> {
    const auth = basicHeader(input.credentials as OmniwayCreds);
    const orderNumber = input.orderRef || input.orderId;
    const body: Record<string, any> = {
      amount: Math.round(input.amount),
      orderNumber,
      description: input.description || `Захиалга ${orderNumber}`,
      callbackUrl: input.callbackUrl,
    };
    if (input.phone) body.mobileNumber = input.phone;
    const res = await fetch(`${OMNIWAY_BASE}/ecommerce/invoices`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any; try { data = JSON.parse(text); } catch { throw new Error(`Omniway хариу буруу: ${text}`); }
    if (!res.ok) throw new Error(data?.message || `Omniway нэхэмжлэл алдаа (${res.status})`);
    const qrImage = data.imageBase64
      ? (data.imageBase64.startsWith("data:") ? data.imageBase64 : `data:image/png;base64,${data.imageBase64}`)
      : null;
    return {
      invoiceId: String(data.invoiceNumber),
      qrText: data.qrContent ?? null,
      qrImage,
      raw: data,
    };
  },

  async checkStatus(input: CheckStatusInput): Promise<CheckStatusResult> {
    if (!input.invoiceId) return { status: "waiting" };
    const auth = basicHeader(input.credentials as OmniwayCreds);
    const res = await fetch(`${OMNIWAY_BASE}/ecommerce/invoices/${input.invoiceId}`, {
      method: "GET",
      headers: { Authorization: auth, Accept: "application/json" },
    });
    if (!res.ok) return { status: "waiting" };
    const data = (await res.json()) as any;
    if (data.statusId === 302) return { status: "paid", raw: data };
    if (data.statusId === 303) return { status: "cancelled", raw: data };
    return { status: "waiting", raw: data };
  },
};
