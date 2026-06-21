// Auto-translate scraped foreign-product preview text to Mongolian via
// Lovable AI Gateway. Keeps proper nouns (brand, model codes, sizes like
// "US 9.5", numbers, URLs) intact and translates everything else.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const KV = z.object({ label: z.string(), value: z.string() });
const Section = z.object({ title: z.string(), content: z.string() });
const OptValue = z.object({
  propertyValueId: z.string(),
  value: z.string(),
  sizeHint: z.string().nullable().optional(),
});
const OptGroup = z.object({
  name: z.string(),
  level: z.number().optional(),
  prefix: z.string().nullable().optional(),
  values: z.array(OptValue),
});
const Variant = z.object({
  sizeLabel: z.string(),
  colorLabel: z.string().nullable().optional(),
});

const Payload = z.object({
  title: z.string().default(""),
  brand: z.string().default(""),
  category: z.string().default(""),
  description: z.string().default(""),
  productInfo: z.array(KV).default([]),
  productIntroSections: z.array(Section).default([]),
  optionGroups: z.array(OptGroup).default([]),
  variants: z.array(Variant).default([]),
});

export type TranslatePayload = z.infer<typeof Payload>;

export const translateForeignPreview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Payload.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, message: "LOVABLE_API_KEY алга", data: null };

    const system = [
      "You are a professional Korean/English/Chinese → Mongolian (Cyrillic) e-commerce translator.",
      "Translate ALL human-readable text values in the provided JSON to natural Mongolian.",
      "Rules:",
      "- Keep brand names, model codes, SKUs, sizes (e.g. 'US 9.5', 'EU 42', 'M', 'XL'), numbers, units (cm, kg), URLs, and propertyValueId UNCHANGED.",
      "- Translate product titles, descriptions, category names, info labels and values, intro section titles and content, option group names and color names.",
      "- Keep the JSON SHAPE and KEYS exactly identical to the input. Only change string VALUES (except those covered by the rules above).",
      "- Do not add, remove, or reorder array items.",
      "- Output strict JSON only, no markdown, no commentary.",
    ].join("\n");

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(data) },
          ],
        }),
      });
      if (res.status === 429)
        return { ok: false as const, message: "Орчуулгын хүсэлт хэт олон. Түр хүлээнэ үү.", data: null };
      if (res.status === 402)
        return { ok: false as const, message: "AI кредит дууссан байна.", data: null };
      if (!res.ok)
        return { ok: false as const, message: `Орчуулгын алдаа: ${res.status}`, data: null };

      const json = (await res.json()) as any;
      const raw = json?.choices?.[0]?.message?.content ?? "";
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false as const, message: "AI хариу JSON биш байна", data: null };
      }
      const safe = Payload.safeParse(parsed);
      if (!safe.success) {
        return { ok: false as const, message: "AI бүтэц таарахгүй байна", data: null };
      }
      return { ok: true as const, data: safe.data };
    } catch (e: any) {
      return { ok: false as const, message: e?.message ?? "Орчуулгын алдаа", data: null };
    }
  });
