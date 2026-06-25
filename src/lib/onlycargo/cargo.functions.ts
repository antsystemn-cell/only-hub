import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ListInput = z.object({
  merchantId: z.string().uuid(),
  page: z.number().int().min(1).default(1).optional(),
  pageSize: z.number().int().min(1).max(100).default(20).optional(),
  status: z.string().min(1).max(40).optional(),
  q: z.string().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

async function resolveCustomerCode(supabase: any, merchantId: string, userId: string) {
  // Verify access + read customer_code
  const { data: access } = await supabase.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: merchantId,
  });
  if (!access) throw new Response("Forbidden", { status: 403 });

  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("onlycargo_customer_code")
    .eq("id", merchantId)
    .maybeSingle();
  if (error) throw new Response(error.message, { status: 500 });
  const code = merchant?.onlycargo_customer_code as string | null | undefined;
  if (!code || !code.trim()) {
    throw new Response(
      "OnlyCargo customer code тохируулаагүй байна. Тохиргоо хэсгээс оруулна уу.",
      { status: 400 },
    );
  }
  return code.trim();
}

export const listMerchantCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ListInput.parse(i))
  .handler(async ({ data, context }) => {
    const customerCode = await resolveCustomerCode(
      context.supabase,
      data.merchantId,
      context.userId,
    );
    const { onlyCargo } = await import("./client.server");
    return onlyCargo.listShipments({
      page: data.page,
      pageSize: data.pageSize,
      status: data.status,
      q: data.q,
      from: data.from,
      to: data.to,
      customer_code: customerCode,
    });
  });

export const getMerchantCargoCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ merchantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const customerCode = await resolveCustomerCode(
      context.supabase,
      data.merchantId,
      context.userId,
    );
    const { onlyCargo } = await import("./client.server");
    const statuses = ["created", "in_transit", "arrived", "ready_for_pickup"];
    const results = await Promise.all(
      statuses.map((s) =>
        onlyCargo
          .listShipments({ status: s, customer_code: customerCode, pageSize: 1, page: 1 })
          .then((r) => [s, r.total ?? r.data.length] as const)
          .catch(() => [s, 0] as const),
      ),
    );
    return Object.fromEntries(results) as Record<string, number>;
  });

export const getMerchantCargoDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      trackNumber: z.string().min(1).max(80),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const customerCode = await resolveCustomerCode(
      context.supabase,
      data.merchantId,
      context.userId,
    );
    const { data: isAdmin } = await context.supabase.rpc("is_platform_admin", {
      _user_id: context.userId,
    });

    const { onlyCargo } = await import("./client.server");
    const detail = await onlyCargo.getShipment(data.trackNumber);

    // Defensive scope check — merchants may only view shipments positively
    // matched to their own customer_code. Missing/empty codes never bypass
    // authorization; only platform admins see unresolved shipments.
    const shipmentCode =
      (detail?.customer_code as string | null | undefined) ??
      ((detail as Record<string, unknown> | null | undefined)?.customerCode as string | undefined) ??
      null;
    const shipmentMerchantId =
      (detail?.merchant_id as string | null | undefined) ??
      ((detail as Record<string, unknown> | null | undefined)?.merchantId as string | undefined) ??
      null;

    if (!isAdmin) {
      if (!shipmentCode && !shipmentMerchantId) {
        console.warn("[cargo] unresolved shipment access blocked", {
          trackNumber: data.trackNumber,
          merchantId: data.merchantId,
        });
        throw new Response(
          "Энэ ачааны мэдээлэл бүрэн бус байна. Захиргаатай холбоо барина уу.",
          { status: 403 },
        );
      }
      const codeMatches = shipmentCode && shipmentCode === customerCode;
      const merchantMatches = shipmentMerchantId && shipmentMerchantId === data.merchantId;
      if (!codeMatches && !merchantMatches) {
        console.warn("[cargo] cross-merchant access blocked", {
          trackNumber: data.trackNumber,
          merchantId: data.merchantId,
          shipmentCode,
          shipmentMerchantId,
        });
        throw new Response("Forbidden", { status: 403 });
      }
    }

    const [history, location] = await Promise.allSettled([
      onlyCargo.getHistory(data.trackNumber),
      onlyCargo.getLocation(data.trackNumber),
    ]);
    if (history.status === "rejected") {
      console.warn("[cargo] history fetch failed", { trackNumber: data.trackNumber, err: String(history.reason) });
    }
    if (location.status === "rejected") {
      console.warn("[cargo] location fetch failed", { trackNumber: data.trackNumber, err: String(location.reason) });
    }
    return {
      detail,
      history: history.status === "fulfilled" ? history.value : null,
      location: location.status === "fulfilled" ? location.value : null,
    };
  });

export const updateMerchantCargoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      customerCode: z.string().trim().max(80),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("is_merchant_owner", {
      _user_id: context.userId,
      _merchant_id: data.merchantId,
    });
    const { data: isAdmin } = await context.supabase.rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    if (!isOwner && !isAdmin) throw new Response("Forbidden", { status: 403 });

    const { error } = await context.supabase
      .from("merchants")
      .update({ onlycargo_customer_code: data.customerCode || null })
      .eq("id", data.merchantId);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

const CreateInput = z.object({
  merchantId: z.string().uuid(),
  trackNumber: z.string().trim().min(3).max(80),
  phone: z.string().trim().min(6).max(20),
  description: z.string().trim().max(500).optional(),
  weight: z.number().positive().max(10000).optional(),
  length: z.number().positive().max(1000).optional(),
  width: z.number().positive().max(1000).optional(),
  height: z.number().positive().max(1000).optional(),
});

export const createMerchantCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    const customerCode = await resolveCustomerCode(
      context.supabase,
      data.merchantId,
      context.userId,
    );
    const { onlyCargo } = await import("./client.server");
    const dims =
      data.length || data.width || data.height
        ? { length: data.length, width: data.width, height: data.height }
        : undefined;
    return onlyCargo.createShipment({
      trackNumber: data.trackNumber,
      phone: data.phone,
      customerCode,
      description: data.description,
      weight: data.weight,
      dimensions: dims,
    });
  });

/**
 * Real unread cargo notifications for a merchant.
 * Source: notifications_log rows the webhook receiver inserts with
 *   provider='onlycargo', event_type LIKE 'cargo.%', status='pending'.
 * Marked as 'sent' once the merchant opens the cargo page.
 */
export const getMerchantCargoUnreadCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ merchantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: access } = await context.supabase.rpc("has_merchant_access", {
      _user_id: context.userId,
      _merchant_id: data.merchantId,
    });
    if (!access) throw new Response("Forbidden", { status: 403 });

    const { count, error } = await context.supabase
      .from("notifications_log")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", data.merchantId)
      .eq("provider", "onlycargo")
      .eq("status", "pending")
      .like("event_type", "cargo.%");
    if (error) throw new Response(error.message, { status: 500 });
    return { unread: count ?? 0 };
  });

export const markMerchantCargoNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ merchantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: access } = await context.supabase.rpc("has_merchant_access", {
      _user_id: context.userId,
      _merchant_id: data.merchantId,
    });
    if (!access) throw new Response("Forbidden", { status: 403 });

    // Use admin client to bypass RLS for the UPDATE (read policy only allows SELECT).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("notifications_log")
      .update({ status: "sent" }, { count: "exact" })
      .eq("merchant_id", data.merchantId)
      .eq("provider", "onlycargo")
      .eq("status", "pending")
      .like("event_type", "cargo.%");
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true, marked: count ?? 0 };
  });
