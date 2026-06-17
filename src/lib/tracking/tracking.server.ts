// Public order tracking — server-only. Token-баазлан customer-т аюулгүй
// мэдээлэл буцаана. Хэрэглэгчийн нэвтрэлт шаардахгүй.
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL ||
  process.env.PUBLIC_APP_ORIGIN ||
  "https://only.mn";

export function buildTrackingUrl(token: string): string {
  return `${PUBLIC_BASE.replace(/\/$/, "")}/track/${token}`;
}

function makeToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function getOrCreateTrackingToken(orderId: string) {
  const { data: existing } = await supabaseAdmin
    .from("public_order_tokens")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing) return existing;

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, phone")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Захиалга олдсонгүй");

  const token = makeToken();
  const { data: inserted, error } = await supabaseAdmin
    .from("public_order_tokens")
    .insert({
      order_id: orderId,
      public_token: token,
      customer_phone: order.phone,
    })
    .select("*")
    .single();
  if (error || !inserted) {
    // race
    const { data: again } = await supabaseAdmin
      .from("public_order_tokens")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    if (again) return again;
    throw error ?? new Error("Token үүсгэхэд алдаа гарлаа");
  }
  return inserted;
}

export async function regenerateTrackingToken(orderId: string) {
  const token = makeToken();
  const { data, error } = await supabaseAdmin
    .from("public_order_tokens")
    .upsert(
      {
        order_id: orderId,
        public_token: token,
        is_active: true,
        expires_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
      },
      { onConflict: "order_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function disableTrackingToken(orderId: string) {
  await supabaseAdmin
    .from("public_order_tokens")
    .update({ is_active: false })
    .eq("order_id", orderId);
}

export type PublicTrackingResult =
  | { ok: false; reason: "not_found" | "expired" | "disabled" }
  | { ok: true; data: PublicOrderView };

export interface PublicOrderView {
  order: {
    id: string;
    external_ref: string | null;
    items: Array<{ name: string; qty: number; price: number; image?: string | null }>;
    subtotal: number;
    delivery_fee: number;
    total: number;
    payment_status: string;
    payment_method: string;
    delivery_status: string | null;
    paid_at: string | null;
    created_at: string;
    phone: string | null;
    shipping_address: string | null;
    note: string | null;
    qpay_qr_image: string | null;
    qpay_qr_text: string | null;
    qpay_short_url: string | null;
  };
  merchant: {
    name: string;
    slug: string;
    logo: string | null;
    phone: string | null;
  };
  delivery: {
    status: string | null;
    external_ref: string | null;
    assigned_at: string | null;
    picked_up_at: string | null;
    delivered_at: string | null;
    requested_at: string | null;
    cancelled_at: string | null;
  } | null;
  driver: {
    name: string | null;
    phone: string | null;
    vehicle: string | null;
  } | null;
  timeline: Array<{ id: string; status: string; note: string | null; created_at: string }>;
  payment_request: {
    provider: string;
    invoice_url: string | null;
    qr_text: string | null;
    qr_image: string | null;
    amount: number;
    status: string;
  } | null;
  token: {
    open_count: number;
    last_accessed_at: string | null;
    expires_at: string;
  };
  refreshed_at: string;
}

export async function resolveOrderByToken(token: string): Promise<PublicTrackingResult> {
  const { data: tok } = await supabaseAdmin
    .from("public_order_tokens")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();
  if (!tok) return { ok: false, reason: "not_found" };
  if (!tok.is_active) return { ok: false, reason: "disabled" };
  if (tok.expires_at && new Date(tok.expires_at) < new Date()) {
    return { ok: false, reason: "expired" };
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select(
      "id, external_ref, items, total, delivery_fee, payment_status, payment_method, delivery_status, paid_at, created_at, phone, shipping_address, note, qpay_qr_image, qpay_qr_text, qpay_short_url, merchant_id",
    )
    .eq("id", tok.order_id)
    .maybeSingle();
  if (!order) return { ok: false, reason: "not_found" };

  const { data: merchant } = await supabaseAdmin
    .from("merchants")
    .select("name, slug, logo_url, contact_phone")
    .eq("id", order.merchant_id)
    .maybeSingle();

  const { data: dr } = await supabaseAdmin
    .from("delivery_requests")
    .select(
      "id, status, external_ref, assigned_at, picked_up_at, delivered_at, requested_at, cancelled_at, driver_id, package_info",
    )
    .eq("order_id", order.id)
    .maybeSingle();

  let driver: PublicOrderView["driver"] = null;
  if (dr) {
    // 1) Try Swift Hub webhook payload first
    const { data: wh } = await supabaseAdmin
      .from("delivery_webhooks")
      .select("payload")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const whPayload: any = (wh as any)?.payload ?? null;
    const whDriver = whPayload?.driver ?? whPayload?.courier ?? null;
    if (whDriver && (whDriver.name || whDriver.phone)) {
      driver = {
        name: whDriver.name ?? whDriver.full_name ?? null,
        phone: whDriver.phone ?? whDriver.phone_number ?? null,
        vehicle: whDriver.vehicle ?? whDriver.vehicle_plate ?? null,
      };
    } else if (dr.driver_id) {
      // 2) Lookup auth user metadata
      const { data: ures } = await supabaseAdmin.auth.admin.getUserById(dr.driver_id);
      const u = ures?.user;
      if (u) {
        const meta: any = u.user_metadata ?? {};
        driver = {
          name: meta.full_name ?? meta.name ?? u.email ?? null,
          phone: meta.phone ?? u.phone ?? null,
          vehicle: meta.vehicle ?? null,
        };
      }
    }
  }

  let timeline: PublicOrderView["timeline"] = [];
  if (dr) {
    const { data: hist } = await supabaseAdmin
      .from("delivery_status_history")
      .select("id, status, note, created_at")
      .eq("delivery_request_id", dr.id)
      .order("created_at", { ascending: true });
    timeline = (hist ?? []).map((h: any) => ({
      id: h.id,
      status: h.status,
      note: h.note,
      created_at: h.created_at,
    }));
  }

  const { data: pr } = await supabaseAdmin
    .from("payment_requests")
    .select("payment_provider, invoice_url, qr_text, qr_image, amount, status")
    .eq("order_id", order.id)
    .maybeSingle();

  // increment access counter (best effort, fire-and-forget)
  void supabaseAdmin
    .from("public_order_tokens")
    .update({
      open_count: (tok.open_count ?? 0) + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq("id", tok.id);

  const items = Array.isArray(order.items)
    ? (order.items as any[]).map((it) => ({
        name: it.name ?? it.product_name ?? "Бараа",
        qty: Number(it.quantity ?? it.qty ?? 1),
        price: Number(it.price ?? it.unit_price ?? 0),
        image: it.image ?? null,
      }))
    : [];
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return {
    ok: true,
    data: {
      order: {
        id: order.id,
        external_ref: order.external_ref ?? null,
        items,
        subtotal,
        delivery_fee: Number(order.delivery_fee ?? 0),
        total: Number(order.total ?? 0),
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        delivery_status: order.delivery_status,
        paid_at: order.paid_at ?? null,
        created_at: order.created_at,
        phone: order.phone,
        shipping_address: order.shipping_address,
        note: order.note,
        qpay_qr_image: order.qpay_qr_image,
        qpay_qr_text: order.qpay_qr_text,
        qpay_short_url: order.qpay_short_url,
      },
      merchant: {
        name: (merchant as any)?.name ?? "—",
        slug: (merchant as any)?.slug ?? "",
        logo: (merchant as any)?.logo_url ?? null,
        phone: (merchant as any)?.contact_phone ?? null,
      },
      delivery: dr
        ? {
            status: dr.status,
            external_ref: dr.external_ref ?? null,
            assigned_at: dr.assigned_at,
            picked_up_at: dr.picked_up_at,
            delivered_at: dr.delivered_at,
            requested_at: dr.requested_at,
            cancelled_at: dr.cancelled_at,
          }
        : null,
      driver,
      timeline,
      payment_request: pr
        ? {
            provider: pr.payment_provider,
            invoice_url: pr.invoice_url,
            qr_text: pr.qr_text,
            qr_image: pr.qr_image,
            amount: Number(pr.amount ?? 0),
            status: pr.status,
          }
        : null,
      token: {
        open_count: (tok.open_count ?? 0) + 1,
        last_accessed_at: tok.last_accessed_at,
        expires_at: tok.expires_at,
      },
      refreshed_at: new Date().toISOString(),
    },
  };
}
