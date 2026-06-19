// Cart/checkout availability re-check for foreign-order variants.
// Returns per-item issues so the UI can block checkout and tell the user.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const ItemSchema = z.object({
  productId: z.string().uuid(),
  color: z.string().max(200).nullable().optional(),
  size: z.string().max(200).nullable().optional(),
  quantity: z.number().int().min(1).max(999),
});

const Input = z.object({
  merchantSlug: z.string().min(1).max(100),
  items: z.array(ItemSchema).max(100),
});

type Issue = {
  productId: string;
  color?: string | null;
  size?: string | null;
  reason: string;
  priceReviewPending?: boolean;
};

export const validateForeignCart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; issues: Issue[] }> => {
    if (!data.items.length) return { ok: true, issues: [] };

    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("id")
      .eq("slug", data.merchantSlug)
      .maybeSingle();
    if (!merchant) return { ok: false, issues: [{ productId: "", reason: "Дэлгүүр олдсонгүй" }] };

    const ids = Array.from(new Set(data.items.map((i) => i.productId)));
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id,name,product_type,merchant_id,is_active")
      .in("id", ids);
    const pmap = new Map<string, any>((products ?? []).map((p) => [p.id, p]));

    const foreignIds = (products ?? [])
      .filter((p: any) => p.product_type === "FOREIGN_ORDER" && p.merchant_id === merchant.id)
      .map((p: any) => p.id);
    if (!foreignIds.length) return { ok: true, issues: [] };

    const { data: variants } = await supabaseAdmin
      .from("product_variants")
      .select(
        "product_id,size_label,color_label,availability_status,is_purchasable,price_review_required",
      )
      .in("product_id", foreignIds);
    const byProduct = new Map<string, any[]>();
    (variants ?? []).forEach((v: any) => {
      const arr = byProduct.get(v.product_id) ?? [];
      arr.push(v);
      byProduct.set(v.product_id, arr);
    });

    const issues: Issue[] = [];
    for (const i of data.items) {
      const p = pmap.get(i.productId);
      if (!p || !p.is_active || p.merchant_id !== merchant.id) {
        issues.push({ productId: i.productId, reason: `"${p?.name ?? "Бараа"}" байхгүй болсон` });
        continue;
      }
      if (p.product_type !== "FOREIGN_ORDER") continue;
      const vs = byProduct.get(p.id) ?? [];
      if (!vs.length) continue;
      const match =
        vs.find(
          (v) =>
            (i.size && v.size_label === i.size) ||
            (i.color && v.color_label === i.color),
        ) ?? vs[0];
      if (!match) continue;

      if (match.is_purchasable === false || match.availability_status === "UNAVAILABLE") {
        issues.push({
          productId: p.id,
          color: i.color ?? null,
          size: i.size ?? null,
          reason: `"${p.name}" — сонгосон хувилбар Poizon Korea дээр түр дууссан байна.`,
        });
        continue;
      }
      if (
        match.availability_status &&
        !["AVAILABLE", "LOW_STOCK"].includes(String(match.availability_status))
      ) {
        issues.push({
          productId: p.id,
          color: i.color ?? null,
          size: i.size ?? null,
          reason: `"${p.name}" — хувилбарын боломжит эсэхийг шалгаж байна. Хэсэг хүлээгээд дахин оролдоно уу.`,
        });
        continue;
      }
      if (match.price_review_required) {
        issues.push({
          productId: p.id,
          color: i.color ?? null,
          size: i.size ?? null,
          reason: `"${p.name}" — эх сурвалж дээр үнэ өөрчлөгдсөн. Мерчант шинэ үнийг батлахаас өмнө захиалга үүсгэх боломжгүй.`,
          priceReviewPending: true,
        });
      }
    }

    return { ok: issues.length === 0, issues };
  });
