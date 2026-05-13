import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ChatMsg = { role: "user" | "assistant"; content: string };

export const chatbotPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { merchantId: string; messages: ChatMsg[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: settings } = await supabase
      .from("chatbot_settings")
      .select("system_prompt,knowledge,greeting_message")
      .eq("merchant_id", data.merchantId)
      .maybeSingle();

    const { data: products } = await supabase
      .from("products")
      .select("name,price,description,category")
      .eq("merchant_id", data.merchantId)
      .eq("is_active", true)
      .limit(50);

    const catalog = (products ?? [])
      .map((p: any) => `- ${p.name}: ${p.price}₮${p.description ? ` — ${String(p.description).slice(0, 80)}` : ""}`)
      .join("\n");

    const system = `${settings?.system_prompt ?? "Та дэлгүүрийн туслах ассистент."}\n\n${settings?.knowledge ?? ""}\n\nДэлгүүрийн бараанууд:\n${catalog}`;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, message: "LOVABLE_API_KEY алга" };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            ...data.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      if (res.status === 429) return { ok: false, message: "Хэт олон хүсэлт. Түр хүлээнэ үү." };
      if (res.status === 402) return { ok: false, message: "AI кредит дууссан байна." };
      if (!res.ok) return { ok: false, message: `AI алдаа: ${res.status}` };
      const json = (await res.json()) as any;
      const reply = json?.choices?.[0]?.message?.content ?? "Хариу алга";
      return { ok: true, reply };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Алдаа" };
    }
  });
