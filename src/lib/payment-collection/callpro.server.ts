// CallPro SMS клиент. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CalproConfig = {
  api_url: string;
  api_key: string;
  sender?: string;
};

async function loadConfig(): Promise<CalproConfig | null> {
  // 1. Platform setting (override)
  const { data: row } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "callpro_sms")
    .maybeSingle();
  const v: any = (row as any)?.value ?? {};
  const api_url = v.api_url || process.env.CALLPRO_API_URL || "";
  const api_key = v.api_key || process.env.CALLPRO_API_KEY || "";
  const sender = v.sender || process.env.CALLPRO_SENDER || "OnlyHub";
  if (!api_url || !api_key) return null;
  return { api_url, api_key, sender };
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 8) return "976" + digits;
  return digits;
}

export async function sendCallproSms(args: {
  phone: string;
  message: string;
}): Promise<{ ok: true; provider: string; raw: any } | { ok: false; error: string }> {
  const cfg = await loadConfig();
  if (!cfg) return { ok: false, error: "CallPro тохиргоо хийгдээгүй байна" };
  const to = normalizePhone(args.phone);
  if (!to) return { ok: false, error: "Утасны дугаар буруу" };

  try {
    // CallPro нь олон endpoint-той учир query-string + Bearer 2-уланг дэмжинэ.
    const url = new URL(cfg.api_url);
    // GET-аар дэмждэг (CallPro classic): ?key=...&from=...&to=...&text=...
    url.searchParams.set("key", cfg.api_key);
    if (cfg.sender) url.searchParams.set("from", cfg.sender);
    url.searchParams.set("to", to);
    url.searchParams.set("text", args.message);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cfg.api_key}`,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `CallPro ${res.status}: ${text.slice(0, 200)}` };
    }
    let raw: any = text;
    try { raw = JSON.parse(text); } catch { /* keep text */ }
    return { ok: true, provider: "callpro", raw };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "SMS илгээхэд алдаа гарлаа" };
  }
}
