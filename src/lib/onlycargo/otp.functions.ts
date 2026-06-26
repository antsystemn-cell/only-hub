import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RESEND_COOLDOWN_SEC = 60;
const OTP_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;

function normalizeCargoPhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("976") && digits.length === 11 ? digits.slice(3) : digits;
}

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateCode() {
  const arr = new Uint32Array(1);
  globalThis.crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, "0");
}

function generateHiddenCargoCode(merchantId: string) {
  const uuid = globalThis.crypto?.randomUUID?.().replace(/-/g, "");
  return `oh_${uuid || merchantId.replace(/-/g, "")}_${Date.now().toString(36)}`;
}

async function assertOwner(supabase: any, userId: string, merchantId: string) {
  const { data: isOwner } = await supabase.rpc("is_merchant_owner", {
    _user_id: userId,
    _merchant_id: merchantId,
  });
  const { data: isAdmin } = await supabase.rpc("is_platform_admin", { _user_id: userId });
  if (!isOwner && !isAdmin) throw new Response("Forbidden", { status: 403 });
}

export const requestCargoPhoneOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      phone: z.string().trim().min(6).max(30),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.merchantId);
    const phone = normalizeCargoPhone(data.phone);
    if (phone.length < 6) throw new Response("Утасны дугаар буруу байна.", { status: 400 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cooldown: latest OTP for this merchant
    const { data: last } = await supabaseAdmin
      .from("merchant_cargo_otps")
      .select("created_at")
      .eq("merchant_id", data.merchantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.created_at) {
      const ageSec = (Date.now() - new Date(last.created_at as string).getTime()) / 1000;
      if (ageSec < RESEND_COOLDOWN_SEC) {
        throw new Response(
          `OTP дахин авахын тулд ${Math.ceil(RESEND_COOLDOWN_SEC - ageSec)} секунд хүлээнэ үү.`,
          { status: 429 },
        );
      }
    }

    const code = generateCode();
    const code_hash = await sha256Hex(`${data.merchantId}:${phone}:${code}`);
    const expires_at = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();

    const { error: insErr } = await supabaseAdmin.from("merchant_cargo_otps").insert({
      merchant_id: data.merchantId,
      phone,
      code_hash,
      expires_at,
    });
    if (insErr) throw new Response(insErr.message, { status: 500 });

    await supabaseAdmin
      .from("merchants")
      .update({ onlycargo_phone_pending: phone, onlycargo_phone_pending_at: new Date().toISOString() })
      .eq("id", data.merchantId);

    // Send SMS via existing CallPro
    const { sendCallproSms } = await import("@/lib/payment-collection/callpro.server");
    const res = await sendCallproSms({
      phone,
      message: `Only Hub каргоны баталгаажуулах код: ${code}. ${OTP_TTL_MIN} минутын дотор хүчинтэй.`,
    });
    if (!res.ok) {
      console.warn("[cargo-otp] sms failed", res.error);
      throw new Response(`SMS илгээхэд алдаа: ${res.error}`, { status: 502 });
    }

    return { ok: true, expiresInSec: OTP_TTL_MIN * 60, cooldownSec: RESEND_COOLDOWN_SEC };
  });

export const verifyCargoPhoneOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      merchantId: z.string().uuid(),
      phone: z.string().trim().min(6).max(30),
      code: z.string().trim().regex(/^\d{6}$/, "6 оронтой код оруулна уу."),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.merchantId);
    const phone = normalizeCargoPhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: otp, error: readErr } = await supabaseAdmin
      .from("merchant_cargo_otps")
      .select("id,code_hash,expires_at,attempts,consumed_at,phone")
      .eq("merchant_id", data.merchantId)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readErr) throw new Response(readErr.message, { status: 500 });
    if (!otp) throw new Response("OTP олдсонгүй. Дахин код авна уу.", { status: 400 });
    if (otp.consumed_at) throw new Response("Энэ код аль хэдийн ашиглагдсан.", { status: 400 });
    if (new Date(otp.expires_at as string).getTime() < Date.now()) {
      throw new Response("Кодын хугацаа дууссан. Шинэ код авна уу.", { status: 400 });
    }
    if ((otp.attempts ?? 0) >= MAX_ATTEMPTS) {
      throw new Response("Хэт олон удаа буруу оруулсан. Шинэ код авна уу.", { status: 429 });
    }

    const expected = await sha256Hex(`${data.merchantId}:${phone}:${data.code}`);
    if (expected !== otp.code_hash) {
      await supabaseAdmin
        .from("merchant_cargo_otps")
        .update({ attempts: (otp.attempts ?? 0) + 1 })
        .eq("id", otp.id);
      throw new Response("Код буруу байна.", { status: 400 });
    }

    // Mark consumed
    await supabaseAdmin
      .from("merchant_cargo_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otp.id);

    // Read existing hidden code (do not regenerate if already linked)
    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("onlycargo_customer_code")
      .eq("id", data.merchantId)
      .maybeSingle();
    const existingCode = (merchant?.onlycargo_customer_code as string | null | undefined)?.trim();
    const nextCode = existingCode || generateHiddenCargoCode(data.merchantId);

    const { error: updErr } = await supabaseAdmin
      .from("merchants")
      .update({
        onlycargo_phone: phone,
        onlycargo_phone_verified_at: new Date().toISOString(),
        onlycargo_phone_pending: null,
        onlycargo_phone_pending_at: null,
        onlycargo_customer_code: nextCode,
        onlycargo_sync_error: null,
      })
      .eq("id", data.merchantId);
    if (updErr) throw new Response(updErr.message, { status: 500 });

    return { ok: true };
  });

export const getCargoPhoneStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ merchantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: access } = await context.supabase.rpc("has_merchant_access", {
      _user_id: context.userId,
      _merchant_id: data.merchantId,
    });
    if (!access) throw new Response("Forbidden", { status: 403 });

    const { data: m, error } = await context.supabase
      .from("merchants")
      .select("onlycargo_phone,onlycargo_phone_verified_at,onlycargo_phone_pending,onlycargo_phone_pending_at,onlycargo_sync_error,onlycargo_last_synced_at")
      .eq("id", data.merchantId)
      .maybeSingle();
    if (error) throw new Response(error.message, { status: 500 });
    return {
      phone: (m?.onlycargo_phone as string | null) ?? null,
      verifiedAt: (m?.onlycargo_phone_verified_at as string | null) ?? null,
      pendingPhone: (m?.onlycargo_phone_pending as string | null) ?? null,
      pendingAt: (m?.onlycargo_phone_pending_at as string | null) ?? null,
      syncError: (m?.onlycargo_sync_error as string | null) ?? null,
      lastSyncedAt: (m?.onlycargo_last_synced_at as string | null) ?? null,
    };
  });
