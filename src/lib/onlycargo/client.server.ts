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
  price?: number | null;
  notes?: string | null;
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

function normalizeList<T>(raw: unknown, page: number, pageSize: number): ListResult<T> {
  if (Array.isArray(raw)) {
    return { data: raw as T[], page, pageSize, total: raw.length };
  }
  const obj = (raw ?? {}) as Record<string, unknown>;
  const data = (obj.data ?? obj.items ?? obj.shipments ?? []) as T[];
  const total = Number(obj.total ?? obj.totalCount ?? data.length) || 0;
  return {
    data: Array.isArray(data) ? data : [],
    page: Number(obj.page ?? page) || page,
    pageSize: Number(obj.pageSize ?? obj.perPage ?? pageSize) || pageSize,
    total,
    totalPages: Number(obj.totalPages ?? Math.ceil(total / pageSize)) || undefined,
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
    return normalizeList<OnlyCargoShipment>(raw, page, pageSize);
  },

  getShipment(trackNumber: string) {
    return call<OnlyCargoShipment>(`/shipments/${encodeURIComponent(trackNumber)}`, {
      method: "GET",
    });
  },

  getStatus(trackNumber: string) {
    return call<{ status: string; updated_at?: string }>(
      `/shipments/${encodeURIComponent(trackNumber)}/status`,
      { method: "GET" },
    );
  },

  getHistory(trackNumber: string) {
    return call<{ history: Array<{ status: string; at: string; note?: string }> } | unknown[]>(
      `/shipments/${encodeURIComponent(trackNumber)}/history`,
      { method: "GET" },
    );
  },

  getImages(trackNumber: string) {
    return call<{ images: string[] } | unknown[]>(
      `/shipments/${encodeURIComponent(trackNumber)}/images`,
      { method: "GET" },
    );
  },

  getLocation(trackNumber: string) {
    return call<{ location?: string; lat?: number; lng?: number }>(
      `/shipments/${encodeURIComponent(trackNumber)}/location`,
      { method: "GET" },
    );
  },

  getFee(trackNumber: string) {
    return call<{ fee?: number; currency?: string }>(
      `/shipments/${encodeURIComponent(trackNumber)}/fee`,
      { method: "GET" },
    );
  },
};
