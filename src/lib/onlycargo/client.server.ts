// Server-only HTTP client for OnlyCargo external API.
// Docs:
//   Base URL: process.env.ONLYCARGO_API_URL
//   Auth: Authorization: Bearer <ONLYCARGO_API_KEY>
//   Endpoints: /shipments, /shipments/:track, /shipments/:track/{status,fee,history,images,location}, /health

export type OnlyCargoStatus =
  | "created"
  | "received"
  | "in_transit"
  | "processing"
  | "ready_for_pickup"
  | "arrived"
  | "completed"
  | "archived";

export interface OnlyCargoShipment {
  track_number: string;
  status: OnlyCargoStatus | string;
  customer_code?: string | null;
  merchant_id?: string | null;
  phone?: string | null;
  weight?: number | null;
  volume?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  price?: number | null;
  fee?: number | null;
  description?: string | null;
  notes?: string | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  images?: string[] | null;
  location_history?: any[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  arrived_at?: string | null;
  picked_up_at?: string | null;
  [k: string]: any;
}

export interface ListResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages?: number;
}

export interface ListShipmentsParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: "asc" | "desc";
  status?: string;
  q?: string;
  merchant_id?: string;
  customer_code?: string;
  phone?: string;
  from?: string;
  to?: string;
}

function getConfig() {
  const url = process.env.ONLYCARGO_API_URL;
  const key = process.env.ONLYCARGO_API_KEY;
  if (!url || !key) {
    throw new Response("OnlyCargo API тохиргоо дутуу байна", { status: 500 });
  }
  return { url: url.replace(/\/+$/, ""), key };
}

async function call<T>(
  path: string,
  init: RequestInit = {},
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const { url, key } = getConfig();
  const qs = query
    ? "?" +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const res = await fetch(`${url}${path}${qs}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 429) {
    const retry = res.headers.get("Retry-After") ?? "1";
    throw new Response(`OnlyCargo rate limit. ${retry}s дараа дахин оролдоно уу.`, {
      status: 429,
    });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[onlycargo] HTTP", res.status, path, text.slice(0, 500));
    if (path === "/shipments" && init.method === "POST" && res.status === 403) {
      throw new Response(
        "OnlyCargo API түлхүүр ачаа үүсгэх эрхгүй байна. Карго системийн админ дээр бүртгэсэн ачаа утасны дугаараар танай дэлгүүртэй автоматаар холбогдоно; Only Hub-ээс шууд бүртгэхэд create эрхтэй API түлхүүр шаардлагатай.",
        { status: 403 },
      );
    }
    throw new Response(text || `OnlyCargo алдаа: ${res.status}`, { status: res.status });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- Normalization ----------
// External API uses mixed naming (camelCase / snake_case). We always return snake_case
// from the client so the rest of the app has a single shape to consume.
function pick<T = unknown>(obj: Record<string, any>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

function normalizePhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("976") && digits.length === 11 ? digits.slice(3) : digits;
}

// Safe money parser shared by client + server. Accepts number or numeric
// string (may include ₮, commas, spaces). Returns null when invalid so the
// UI never renders NaN.
export function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[₮,\s]/g, "").replace(/[^\d.\-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["total", "amount", "fee", "price", "value", "totalFee", "total_fee"]) {
      const parsed = parseMoney(obj[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}


export function normalizeShipment(raw: any): OnlyCargoShipment {
  // Defensive: OnlyCargo may wrap payloads as { data: {...} } or return the
  // shipment object directly. Always unwrap before reading fields.
  const src =
    raw && typeof raw === "object" && raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
      ? raw.data
      : raw;
  if (!src || typeof src !== "object") {
    console.warn("[onlycargo] normalizeShipment: non-object payload", { type: typeof src });
    return { track_number: "", status: "unknown" } as OnlyCargoShipment;
  }
  try {
    const out: OnlyCargoShipment = {
      ...src,
      track_number:
        pick<string>(src, "track_number", "trackNumber", "tracking_number", "trackingNumber") ??
        src.track_number ?? "",
      status: pick<string>(src, "status") ?? "unknown",
      customer_code: pick<string>(src, "customer_code", "customerCode") ?? null,
      merchant_id: pick<string>(src, "merchant_id", "merchantId") ?? null,
      phone: normalizePhone(pick<string>(src, "phone", "phone_number", "phoneNumber", "customer_phone", "customerPhone")) || null,
      weight: pick<number>(src, "weight"),
      volume: pick<number>(src, "volume", "volumeM3", "volume_m3"),
      length: pick<number>(src, "length"),
      width: pick<number>(src, "width"),
      height: pick<number>(src, "height"),
      price: parseMoney(pick<unknown>(src, "price", "fee", "amount", "cargo_fee", "cargoFee", "total_fee", "totalFee")),
      fee: parseMoney(pick<unknown>(src, "fee", "price", "amount", "cargo_fee", "cargoFee", "total_fee", "totalFee")),

      description: pick<string>(src, "description", "desc") ?? null,
      notes: pick<string>(src, "notes", "note") ?? null,
      location: pick<string>(src, "location", "current_location", "currentLocation") ?? null,
      lat: pick<number>(src, "lat", "latitude"),
      lng: pick<number>(src, "lng", "longitude"),
      images: (pick<string[]>(src, "images", "image_urls", "imageUrls") as string[] | undefined) ?? null,
      location_history:
        (pick<any[]>(src, "location_history", "locationHistory") as any[] | undefined) ?? null,
      created_at: pick<string>(src, "created_at", "createdAt") ?? null,
      updated_at: pick<string>(src, "updated_at", "updatedAt") ?? null,
      arrived_at: pick<string>(src, "arrived_at", "arrivedAt") ?? null,
      picked_up_at: pick<string>(src, "picked_up_at", "pickedUpAt") ?? null,
    };
    return out;
  } catch (e) {
    console.warn("[onlycargo] normalizeShipment failed", e);
    return {
      track_number: String(src.track_number ?? src.trackNumber ?? ""),
      status: "unknown",
    } as OnlyCargoShipment;
  }
}

function normalizeList<T = OnlyCargoShipment>(
  raw: unknown,
  page: number,
  pageSize: number,
  normalizeItem?: (x: any) => T,
): ListResult<T> {
  if (Array.isArray(raw)) {
    const arr = normalizeItem ? raw.map(normalizeItem) : (raw as T[]);
    return { data: arr, page, pageSize, total: arr.length };
  }
  const obj = (raw ?? {}) as Record<string, unknown>;
  const meta = (obj.meta ?? {}) as Record<string, unknown>;
  const pagination = (obj.pagination ?? {}) as Record<string, unknown>;

  const rawData = (obj.data ?? obj.items ?? obj.shipments ?? obj.results ?? []) as any[];
  const data = (Array.isArray(rawData) ? rawData : []) as any[];
  const items = normalizeItem ? data.map(normalizeItem) : (data as T[]);

  // Support every common shape: data.total, meta.total, pagination.total, totalCount, count.
  // Never fall back to the page length as a stand-in for "total".
  const totalCandidates = [
    obj.total,
    obj.totalCount,
    obj.count,
    meta.total,
    meta.totalCount,
    meta.count,
    pagination.total,
    pagination.totalCount,
    pagination.count,
  ];
  let total = 0;
  let totalKnown = false;
  for (const v of totalCandidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) {
      total = n;
      totalKnown = true;
      break;
    }
  }
  if (!totalKnown) {
    // Last resort: if we got a full page, signal "at least one more page may exist"
    // by reporting current offset + page length. Never claim the count equals the page length.
    total = data.length === pageSize ? (page - 1) * pageSize + data.length + 1 : (page - 1) * pageSize + data.length;
  }

  const totalPagesRaw = pick<number>(obj as any, "totalPages", "total_pages")
    ?? pick<number>(meta as any, "totalPages", "total_pages")
    ?? pick<number>(pagination as any, "totalPages", "total_pages");

  return {
    data: items,
    page: Number(pick<number>(obj as any, "page", "currentPage")) || page,
    pageSize: Number(pick<number>(obj as any, "pageSize", "perPage", "limit")) || pageSize,
    total,
    totalPages: Number(totalPagesRaw) || (total > 0 ? Math.ceil(total / pageSize) : undefined),
  };
}

export const onlyCargo = {
  async listShipments(params: ListShipmentsParams = {}): Promise<ListResult<OnlyCargoShipment>> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const raw = await call<unknown>("/shipments", { method: "GET" }, {
      page,
      pageSize,
      sort: params.sort,
      order: params.order,
      status: params.status,
      q: params.q,
      search: params.q,
      merchant_id: params.merchant_id,
      customer_code: params.customer_code,
      // OnlyCargo's production API treats legacy snake_case phone params as a
      // different/empty filter. Use the supported camelCase phone filters so
      // the verified phone is applied server-side without hiding valid rows.
      phoneNumber: params.phone,
      customerPhone: params.phone,
      from: params.from,
      to: params.to,
    });
    return normalizeList<OnlyCargoShipment>(raw, page, pageSize, normalizeShipment);
  },

  async getShipment(trackNumber: string) {
    const raw = await call<any>(`/shipments/${encodeURIComponent(trackNumber)}`, {
      method: "GET",
    });
    return normalizeShipment(raw);
  },

  getStatus(trackNumber: string) {
    return call<{ status: string; updated_at?: string }>(
      `/shipments/${encodeURIComponent(trackNumber)}/status`,
      { method: "GET" },
    );
  },

  async getHistory(trackNumber: string) {
    const raw = await call<any>(
      `/shipments/${encodeURIComponent(trackNumber)}/history`,
      { method: "GET" },
    );
    const items: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.history)
          ? raw.history
          : Array.isArray(raw?.items)
            ? raw.items
            : [];
    return items.map((h) => ({
      status: pick<string>(h, "status", "event", "state") ?? "",
      at: pick<string>(h, "at", "occurred_at", "occurredAt", "created_at", "createdAt", "timestamp") ?? null,
      location: pick<string>(h, "location", "place") ?? null,
      note: pick<string>(h, "note", "notes", "message", "description") ?? null,
      raw: h,
    }));
  },

  async getImages(trackNumber: string) {
    const raw = await call<any>(
      `/shipments/${encodeURIComponent(trackNumber)}/images`,
      { method: "GET" },
    );
    const arr: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.images)
        ? raw.images
        : Array.isArray(raw?.data)
          ? raw.data
          : [];
    return arr
      .map((x) => (typeof x === "string" ? x : x?.url ?? x?.image_url ?? x?.imageUrl))
      .filter((u): u is string => typeof u === "string" && u.length > 0);
  },

  async getLocation(trackNumber: string) {
    const raw = await call<any>(
      `/shipments/${encodeURIComponent(trackNumber)}/location`,
      { method: "GET" },
    );
    return {
      location: pick<string>(raw ?? {}, "location", "current_location", "currentLocation") ?? null,
      lat: pick<number>(raw ?? {}, "lat", "latitude") ?? null,
      lng: pick<number>(raw ?? {}, "lng", "longitude") ?? null,
      updated_at: pick<string>(raw ?? {}, "updated_at", "updatedAt", "at") ?? null,
      history:
        (pick<any[]>(raw ?? {}, "history", "location_history", "locationHistory") as any[] | undefined) ?? [],
    };
  },

  async getFee(trackNumber: string) {
    const raw = await call<any>(
      `/shipments/${encodeURIComponent(trackNumber)}/fee`,
      { method: "GET" },
    );
    return {
      fee: parseMoney(pick<unknown>(raw ?? {}, "fee", "amount", "price", "cargo_fee", "cargoFee", "total_fee", "totalFee")),
      currency: pick<string>(raw ?? {}, "currency") ?? "MNT",
    };
  },


  async createShipment(payload: {
    trackNumber: string;
    phone: string;
    customerCode: string;
    description?: string;
    weight?: number;
    dimensions?: { length?: number; width?: number; height?: number };
  }) {
    // OnlyCargo API hot path expects snake_case fields. Send both shapes so
    // newer (camelCase) and legacy (snake_case) backends both accept the call,
    // and the created row is always tagged with customer_code → it shows up
    // in the merchant's list filter immediately.
    const body = {
      track_number: payload.trackNumber,
      trackNumber: payload.trackNumber,
      phone: normalizePhone(payload.phone),
      phone_number: normalizePhone(payload.phone),
      phoneNumber: normalizePhone(payload.phone),
      customer_phone: normalizePhone(payload.phone),
      customerPhone: normalizePhone(payload.phone),
      customer_code: payload.customerCode,
      customerCode: payload.customerCode,
      description: payload.description,
      weight: payload.weight,
      length: payload.dimensions?.length,
      width: payload.dimensions?.width,
      height: payload.dimensions?.height,
      dimensions: payload.dimensions,
    };
    const raw = await call<any>("/shipments", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return normalizeShipment(raw);
  },
};
