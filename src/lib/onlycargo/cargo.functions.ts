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

function normalizeCargoPhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("976") && digits.length === 11 ? digits.slice(3) : digits;
}

function generateHiddenCargoCode(merchantId: string) {
  const uuid = globalThis.crypto?.randomUUID?.().replace(/-/g, "");
  return `oh_${uuid || merchantId.replace(/-/g, "")}_${Date.now().toString(36)}`;
}

/**
 * Loose ownership check per product spec:
 *   "Do not apply strict masked phone comparison that hides valid rows.
 *    If OnlyCargo already filters by phone, trust that result.
 *    Only reject row if it clearly has a full different phone number."
 *
 * Returns true unless we can positively prove the row belongs to a
 * different phone (fully unmasked digits that don't match the last 8
 * digits of the verified phone). Empty, missing, or masked phones are
 * trusted — the upstream API already filtered by phone.
 */
function isClearlyDifferentPhone(
  rowPhoneRaw: string | null | undefined,
  verifiedPhone: string,
): boolean {
  const raw = String(rowPhoneRaw ?? "").trim();
  if (!raw) return false; // empty → trust upstream
  if (/[*x•·#?]/i.test(raw)) return false; // masked → trust upstream
  const digits = normalizeCargoPhone(raw);
  if (digits.length < 8) return false; // unparseable → trust upstream
  const verifiedLast8 = verifiedPhone.slice(-8);
  if (verifiedLast8.length < 8) return false;
  return digits.slice(-8) !== verifiedLast8;
}




async function resolveCargoLink(supabase: any, merchantId: string, userId: string) {
  // Verify access + read hidden customer_code and visible cargo phone.
  const { data: access } = await supabase.rpc("has_merchant_access", {
    _user_id: userId,
    _merchant_id: merchantId,
  });
  if (!access) throw new Response("Forbidden", { status: 403 });

  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("onlycargo_customer_code,onlycargo_phone,onlycargo_phone_verified_at")
    .eq("id", merchantId)
    .maybeSingle();
  if (error) throw new Response(error.message, { status: 500 });
  const code = (merchant?.onlycargo_customer_code as string | null | undefined)?.trim() ?? "";
  const phone = normalizeCargoPhone(merchant?.onlycargo_phone as string | null | undefined);
  const verifiedAt = (merchant as any)?.onlycargo_phone_verified_at as string | null | undefined;
  if (!phone) {
    throw new Response("Каргоны утасны дугаар тохируулаагүй байна.", { status: 400 });
  }
  if (!verifiedAt) {
    throw new Response("Каргоны утас баталгаажаагүй байна. OTP-ээр баталгаажуулна уу.", { status: 403 });
  }
  return { customerCode: code || null, phone };
}

export const listMerchantCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ListInput.parse(i))
  .handler(async ({ data, context }) => {
    const cargoLink = await resolveCargoLink(
      context.supabase,
      data.merchantId,
      context.userId,
    );
    const { onlyCargo } = await import("./client.server");
    const result = await onlyCargo.listShipments({
      page: data.page,
      pageSize: data.pageSize,
      status: data.status,
      q: data.q,
      from: data.from,
      to: data.to,
      phone: cargoLink.phone,
    });
    // Loose ownership filter (spec): trust the upstream phone filter; only
    // reject a row when it positively has a different full unmasked phone.
    const verified = cargoLink.phone;
    let rejected = 0;
    const filtered = result.data.filter((row: any) => {
      if (isClearlyDifferentPhone(row?.phone, verified)) {
        rejected++;
        return false;
      }
      return true;
    });
    console.info("[cargo] listMerchantCargo", {
      merchantId: data.merchantId,
      verifiedLast4: verified.slice(-4),
      apiRows: result.data.length,
      kept: filtered.length,
      rejected,
    });
    return { ...result, data: filtered };
  });




export const getMerchantCargoCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ merchantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    let cargoLink: { customerCode: string | null; phone: string };
    try {
      cargoLink = await resolveCargoLink(
        context.supabase,
        data.merchantId,
        context.userId,
      );
    } catch {
      // Phone not set/verified or no access — return empty counts gracefully.
      return {} as Record<string, number>;
    }
    const { onlyCargo } = await import("./client.server");
    const statuses = ["created", "received", "processing", "in_transit", "arrived", "ready_for_pickup", "completed", "cancelled", "archived"];
    const results = await Promise.all(
      statuses.map((s) =>
        onlyCargo
          .listShipments({ status: s, phone: cargoLink.phone, pageSize: 1, page: 1 })
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
    const cargoLink = await resolveCargoLink(
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
    const shipmentPhone =
      (detail?.phone as string | null | undefined) ??
      ((detail as Record<string, unknown> | null | undefined)?.phoneNumber as string | undefined) ??
      null;

    if (!isAdmin) {
      if (!shipmentCode && !shipmentMerchantId && !shipmentPhone) {
        console.warn("[cargo] unresolved shipment access blocked", {
          trackNumber: data.trackNumber,
          merchantId: data.merchantId,
        });
        throw new Response(
          "Энэ ачааны мэдээлэл бүрэн бус байна. Захиргаатай холбоо барина уу.",
          { status: 403 },
        );
      }
      const codeMatches = shipmentCode && cargoLink.customerCode && shipmentCode === cargoLink.customerCode;
      const merchantMatches = shipmentMerchantId && shipmentMerchantId === data.merchantId;
      const phoneMatches = shipmentPhone && !isClearlyDifferentPhone(shipmentPhone, cargoLink.phone);
      if (!codeMatches && !merchantMatches && !phoneMatches) {
        console.warn("[cargo] cross-merchant access blocked", {
          trackNumber: data.trackNumber,
          merchantId: data.merchantId,
          shipmentCode,
          shipmentMerchantId,
          shipmentPhone,
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

export const updateMerchantCargoPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      phone: z.string().trim().min(6).max(30),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Phone changes must go through OTP verification. Only platform admins
    // can directly set / reset the cargo phone (admin reset path).
    const { data: isAdmin } = await context.supabase.rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    if (!isAdmin) {
      throw new Response(
        "Утсыг шууд тохируулах боломжгүй. OTP-ээр баталгаажуулна уу.",
        { status: 403 },
      );
    }

    const normalizedPhone = normalizeCargoPhone(data.phone);
    if (normalizedPhone.length < 6) {
      throw new Response("Каргоны утасны дугаар буруу байна.", { status: 400 });
    }

    const { data: merchant, error: readErr } = await context.supabase
      .from("merchants")
      .select("onlycargo_customer_code")
      .eq("id", data.merchantId)
      .maybeSingle();
    if (readErr) throw new Response(readErr.message, { status: 500 });

    const existingCode = (merchant?.onlycargo_customer_code as string | null | undefined)?.trim();
    const nextCode = existingCode || generateHiddenCargoCode(data.merchantId);

    const { error } = await context.supabase
      .from("merchants")
      .update({
        onlycargo_phone: normalizedPhone,
        onlycargo_phone_verified_at: new Date().toISOString(),
        onlycargo_phone_pending: null,
        onlycargo_phone_pending_at: null,
        onlycargo_customer_code: nextCode,
        onlycargo_sync_error: null,
      })
      .eq("id", data.merchantId);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

const CreateInput = z.object({
  merchantId: z.string().uuid(),
  trackNumber: z.string().trim().min(3).max(80),
  phone: z.string().trim().min(6).max(30).optional(),
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
    const cargoLink = await resolveCargoLink(
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
      phone: cargoLink.phone,
      customerCode: cargoLink.customerCode ?? `oh_${data.merchantId.replace(/-/g, "")}`,
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
