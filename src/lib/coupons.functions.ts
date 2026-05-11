import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ValidateInput = z.object({
  merchantSlug: z.string().min(1).max(100),
  code: z.string().trim().min(1).max(50),
  subtotal: z.number().min(0),
});

export const validateCoupon = createServerFn({ method: "POST" })
  .inputValidator((data) => ValidateInput.parse(data))
  .handler(async ({ data }) => {
    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("id")
      .eq("slug", data.merchantSlug)
      .maybeSingle();
    if (!merchant) return { ok: false as const, error: "Дэлгүүр олдсонгүй" };

    const { data: coupon } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .eq("merchant_id", merchant.id)
      .ilike("code", data.code)
      .eq("is_active", true)
      .maybeSingle();

    if (!coupon) return { ok: false as const, error: "Купон олдсонгүй" };
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date())
      return { ok: false as const, error: "Купон хүчингүй болсон" };
    if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses)
      return { ok: false as const, error: "Купоны хязгаар дууссан" };
    if (data.subtotal < Number(coupon.min_order))
      return {
        ok: false as const,
        error: `Доод дүн ${Number(coupon.min_order).toLocaleString("mn-MN")}₮`,
      };

    const discount =
      coupon.discount_type === "percent"
        ? Math.round((data.subtotal * Number(coupon.discount_value)) / 100)
        : Math.min(data.subtotal, Number(coupon.discount_value));

    return {
      ok: true as const,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: Number(coupon.discount_value),
      },
      discount,
    };
  });
