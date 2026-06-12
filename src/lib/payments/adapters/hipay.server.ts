// HiPay adapter — implements the common adapter shape for HiPay (developers.hipay.mn).
// Auth model: `client_secret` is sent as a Bearer token. `entity_id` (client_id)
// goes in the JSON body. createInvoice → POST /checkout returns { checkoutId, qrData }
// which the customer pays via GET {base_url}/payment/?checkoutId=...
import type {
  PaymentProviderAdapter,
  CreateInvoiceInput,
  CheckStatusInput,
  CheckStatusResult,
  TestConnectionResult,
  AdapterInvoice,
} from "./types";

type HipayCreds = {
  entity_id?: string;
  client_secret?: string;
  // Backward-compat with the old field names previously shown in the UI.
  merchant_id?: string;
  api_key?: string;
  base_url?: string;
};

function clean(v?: string) {
  return (v ?? "").trim();
}

function normalize(c: HipayCreds) {
  const entityId = clean(c.entity_id || c.merchant_id);
  const clientSecret = clean(c.client_secret || c.api_key);
  const baseUrl = (clean(c.base_url) || "https://api.hipay.mn").replace(/\/$/, "");
  return { entityId, clientSecret, baseUrl };
}

async function postCheckout(c: HipayCreds, amount: number, opts?: { redirectUri?: string; webhookUrl?: string; qrData?: boolean; items?: any[] }) {
  const { entityId, clientSecret, baseUrl } = normalize(c);
  if (!entityId || !clientSecret) throw new Error("HiPay entity_id / client_secret дутуу");
  const body: Record<string, any> = {
    entityId,
    amount,
    qrData: opts?.qrData ?? true,
  };
  if (opts?.redirectUri) body.redirect_uri = opts.redirectUri;
  if (opts?.webhookUrl) body.webhook_url = opts.webhookUrl;
  if (opts?.items) body.items = opts.items;
  const res = await fetch(`${baseUrl}/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${clientSecret}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch {}
  // HiPay sometimes returns an array wrapper.
  const payload = Array.isArray(j) ? j[0] : j;
  if (!res.ok) {
    throw new Error(`HiPay (${res.status}): ${payload?.message || payload?.description || text || "тодорхойгүй алдаа"}`);
  }
  if (!payload || String(payload.code) !== "1" || !payload.checkoutId) {
    throw new Error(`HiPay алдаа: ${payload?.message || payload?.description || "checkoutId буцаагдсангүй"}`);
  }
  return { payload, baseUrl };
}

export const hipayAdapter: PaymentProviderAdapter = {
  requiredFields: ["entity_id", "client_secret"],

  async testConnection(credentials: Record<string, any>): Promise<TestConnectionResult> {
    try {
      const { payload } = await postCheckout(credentials as HipayCreds, 100, { qrData: false });
      return { ok: true, message: `HiPay холболт амжилттай (checkoutId: ${String(payload.checkoutId).slice(0, 12)}…)` };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "HiPay холболт амжилтгүй" };
    }
  },

  async createInvoice(input: CreateInvoiceInput): Promise<AdapterInvoice> {
    const { entityId: _e, clientSecret: _s, baseUrl } = normalize(input.credentials as HipayCreds);
    const { payload } = await postCheckout(input.credentials as HipayCreds, Math.round(input.amount), {
      redirectUri: input.callbackUrl.replace(/\/api\/.*$/, ""),
      webhookUrl: input.callbackUrl,
      qrData: true,
    });
    const paymentUrl = `${baseUrl.replace(/\/api$/, "").replace("api.hipay.mn", "hipay.mn")}/payment/?checkoutId=${encodeURIComponent(payload.checkoutId)}`;
    return {
      invoiceId: String(payload.checkoutId),
      qrText: typeof payload.qrData === "string" ? payload.qrData : null,
      qrImage: null,
      deeplink: paymentUrl,
      urls: [{ name: "HiPay", link: paymentUrl }],
      requestId: String(payload.checkoutId),
      raw: payload,
    };
  },

  async checkStatus(_input: CheckStatusInput): Promise<CheckStatusResult> {
    // HiPay status lookup uses GET /checkout/{checkoutId}; without a stable
    // polling cadence we let the webhook drive payment_status updates.
    return { status: "waiting" };
  },
};
