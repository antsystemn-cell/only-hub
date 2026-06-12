// Storepay adapter. Ported from the HomeStore Mongolia reference edge function.
// Storepay flow:
//   1. POST /merchant-uaa/oauth/token  (grant_type=password) — get bearer token.
//   2. POST /lend-merchant/user/possibleAmount — check buyer's loan eligibility by phone.
//   3. POST /lend-merchant/merchant/loan — create loan (the "invoice"). Returns loanId.
//   4. GET  /lend-merchant/merchant/loan/check/{loanId} → { value: true|false } when paid.
//      or GET /lend-merchant/merchant/loan/checkRequest/{requestId} → { value: { isConfirmed } }.

import type {
  PaymentProviderAdapter,
  CreateInvoiceInput,
  CheckStatusInput,
  CheckStatusResult,
  TestConnectionResult,
  AdapterInvoice,
} from "./types";

const STOREPAY_BASE = "https://service.storepay.mn:8778/lend-merchant";
const STOREPAY_AUTH_URL = "https://service.storepay.mn:8778/merchant-uaa/oauth/token";

type StorepayCreds = {
  username?: string;        // merchant user
  password?: string;        // merchant password
  app_username?: string;    // OAuth client id
  app_password?: string;    // OAuth client secret
  store_id?: string | number;
};

function clean(v?: string | number) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

async function getToken(c: StorepayCreds): Promise<string> {
  const username = clean(c.username);
  const password = clean(c.password);
  const appUser = clean(c.app_username);
  const appPass = clean(c.app_password);
  if (!username || !password || !appUser || !appPass) {
    throw new Error("Storepay username / password / app_username / app_password дутуу байна");
  }
  const basic = Buffer.from(`${appUser}:${appPass}`).toString("base64");
  const res = await fetch(
    `${STOREPAY_AUTH_URL}?grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storepay auth failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Storepay access_token буцаагдсангүй");
  return json.access_token;
}

export async function checkEligibility(
  credentials: Record<string, any>,
  phone: string,
): Promise<{ eligible: boolean; possibleAmount: number; message: string }> {
  if (!/^\d{8}$/.test(phone)) {
    return { eligible: false, possibleAmount: 0, message: "Утасны дугаар 8 оронтой тоо байх ёстой" };
  }
  const token = await getToken(credentials as StorepayCreds);
  const res = await fetch(`${STOREPAY_BASE}/user/possibleAmount`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mobileNumber: phone }),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`Storepay хариу буруу: ${text}`); }
  if (data.status !== "Success") {
    const msg = data.msgList?.[0]?.code || data.msgList?.[0]?.text || "Storepay API алдаа";
    return { eligible: false, possibleAmount: 0, message: msg };
  }
  const amount = typeof data.value === "number" ? data.value : 0;
  return {
    eligible: amount > 0,
    possibleAmount: amount,
    message: amount > 0
      ? `Боломжит лимит: ${amount.toLocaleString()}₮`
      : "Таны Storepay зээлийн эрх хүрэлцэхгүй байна",
  };
}

export const storepayAdapter: PaymentProviderAdapter = {
  requiredFields: ["username", "password", "app_username", "app_password", "store_id"],

  async testConnection(credentials: Record<string, any>): Promise<TestConnectionResult> {
    try {
      const c = credentials as StorepayCreds;
      if (!clean(c.store_id)) return { ok: false, message: "store_id дутуу" };
      await getToken(c);
      return { ok: true, message: "Storepay холболт амжилттай" };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Storepay холболт амжилтгүй" };
    }
  },

  async createInvoice(input: CreateInvoiceInput): Promise<AdapterInvoice> {
    const c = input.credentials as StorepayCreds;
    const storeId = Number(clean(c.store_id));
    if (!storeId) throw new Error("Storepay store_id дутуу");
    if (!input.phone || !/^\d{8}$/.test(input.phone)) {
      throw new Error("Storepay-д утасны дугаар (8 оронтой) шаардлагатай");
    }
    const requestId = crypto.randomUUID();
    const token = await getToken(c);
    const res = await fetch(`${STOREPAY_BASE}/merchant/loan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        mobileNumber: input.phone,
        description: input.description || "Захиалгын төлбөр",
        amount: Math.round(input.amount),
        callbackUrl: input.callbackUrl,
        requestId,
      }),
    });
    const text = await res.text();
    let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok || data?.status === "Failed") {
      const msg = data?.msgList?.[0]?.code || data?.msgList?.[0]?.text || "Storepay нэхэмжлэл үүсгэхэд алдаа";
      throw new Error(msg);
    }
    const loanId = data?.value ? String(data.value) : "";
    return {
      invoiceId: loanId,
      requestId,
      raw: data,
    };
  },

  async checkStatus(input: CheckStatusInput): Promise<CheckStatusResult> {
    const token = await getToken(input.credentials as StorepayCreds);
    let url: string;
    if (input.invoiceId) {
      url = `${STOREPAY_BASE}/merchant/loan/check/${input.invoiceId}`;
    } else if (input.requestId) {
      url = `${STOREPAY_BASE}/merchant/loan/checkRequest/${input.requestId}`;
    } else {
      return { status: "waiting" };
    }
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { status: "waiting" };
    const data = (await res.json()) as any;
    let confirmed = false;
    if (data.status === "Success") {
      if (typeof data.value === "boolean") confirmed = data.value === true;
      else if (data.value && typeof data.value === "object") confirmed = data.value.isConfirmed === true;
    }
    return { status: confirmed ? "paid" : "waiting", raw: data };
  },
};
