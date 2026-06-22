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
    const { onlyCargo } = await import("./client.server");
    const detail = await onlyCargo.getShipment(data.trackNumber);
    // Scope check: shipment must belong to merchant
    const shipmentCode =
      (detail?.customer_code as string | undefined) ??
      ((detail as Record<string, unknown>)?.customerCode as string | undefined);
    if (shipmentCode && shipmentCode !== customerCode) {
      throw new Response("Forbidden", { status: 403 });
    }
    const [history, location] = await Promise.allSettled([
      onlyCargo.getHistory(data.trackNumber),
      onlyCargo.getLocation(data.trackNumber),
    ]);
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
