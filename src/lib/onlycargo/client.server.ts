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

export function normalizeShipment(raw: any): OnlyCargoShipment {
  if (!raw || typeof raw !== "object") return raw;
  const out: OnlyCargoShipment = {
    ...raw,
    track_number: pick<string>(raw, "track_number", "trackNumber", "tracking_number", "trackingNumber") ?? raw.track_number ?? "",
    status: pick<string>(raw, "status") ?? "unknown",
    customer_code: pick<string>(raw, "customer_code", "customerCode") ?? null,
    merchant_id: pick<string>(raw, "merchant_id", "merchantId") ?? null,
    phone: pick<string>(raw, "phone", "phoneNumber") ?? null,
    weight: pick<number>(raw, "weight"),
    volume: pick<number>(raw, "volume", "volumeM3", "volume_m3"),
    length: pick<number>(raw, "length"),
    width: pick<number>(raw, "width"),
    height: pick<number>(raw, "height"),
    price: pick<number>(raw, "price", "fee", "amount"),
    fee: pick<number>(raw, "fee", "price", "amount"),
    description: pick<string>(raw, "description", "desc") ?? null,
    notes: pick<string>(raw, "notes", "note") ?? null,
    location: pick<string>(raw, "location", "current_location", "currentLocation") ?? null,
    lat: pick<number>(raw, "lat", "latitude"),
    lng: pick<number>(raw, "lng", "longitude"),
    images: (pick<string[]>(raw, "images", "image_urls", "imageUrls") as string[] | undefined) ?? null,
    location_history:
      (pick<any[]>(raw, "location_history", "locationHistory") as any[] | undefined) ?? null,
    created_at: pick<string>(raw, "created_at", "createdAt") ?? null,
    updated_at: pick<string>(raw, "updated_at", "updatedAt") ?? null,
    arrived_at: pick<string>(raw, "arrived_at", "arrivedAt") ?? null,
    picked_up_at: pick<string>(raw, "picked_up_at", "pickedUpAt") ?? null,
  };
  return out;
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
      merchant_id: params.merchant_id,
      customer_code: params.customer_code,
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
      fee: pick<number>(raw ?? {}, "fee", "amount", "price") ?? null,
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
    const raw = await call<any>("/shipments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return normalizeShipment(raw);
  },
};
