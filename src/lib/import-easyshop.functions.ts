import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const EASYSHOP_URL = "https://jiqjebbxcwetakdhfuel.supabase.co";
const EASYSHOP_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcWplYmJ4Y3dldGFrZGhmdWVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDk2NzEsImV4cCI6MjA4OTYyNTY3MX0.-SOaK2hWFgUviUwrd2_DIOx133rya3xEbwkANhhQXCE";

const EASYSHOP_SLUG = "easyshop";

type EasyshopProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  category: string | null;
  discount: number | null;
  is_new: boolean | null;
  is_on_sale: boolean | null;
  is_bogo: boolean | null;
  is_active: boolean | null;
  product_code: string | null;
  slug: string | null;
  specifications: any;
  detail_media: any;
  colors: any;
  sizes: any;
  stock_quantity: number | null;
  variant_stock: any;
  sales: number | null;
};

async function fetchAll(filterSale: boolean): Promise<EasyshopProduct[]> {
  // Filter: active and (is_new OR is_on_sale OR original_price > price OR discount > 0)
  // PostgREST `or` syntax
  const url = new URL(`${EASYSHOP_URL}/rest/v1/products`);
  url.searchParams.set("select", "*");
  url.searchParams.set("is_active", "eq.true");
  if (filterSale) {
    url.searchParams.set("or", "(is_new.eq.true,is_on_sale.eq.true,discount.gt.0)");
  }
  const res = await fetch(url.toString(), {
    headers: { apikey: EASYSHOP_ANON, Authorization: `Bearer ${EASYSHOP_ANON}` },
  });
  if (!res.ok) throw new Error(`Easyshop fetch failed: ${res.status}`);
  return (await res.json()) as EasyshopProduct[];
}

export const importEasyshopProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        onlyDiscounted: z.boolean().default(true),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: isAdmin } = await supabaseAdmin.rpc("is_platform_admin", { _user_id: userId });
    if (!isAdmin) return { ok: false as const, error: "Эрх хүрэхгүй" };

    const { data: merchant, error: mErr } = await supabaseAdmin
      .from("merchants")
      .select("id")
      .eq("slug", EASYSHOP_SLUG)
      .maybeSingle();
    if (mErr || !merchant) return { ok: false as const, error: "Easyshop merchant олдсонгүй" };
    const merchantId = merchant.id;

    let products: EasyshopProduct[];
    try {
      products = await fetchAll(data.onlyDiscounted);
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Easyshop API алдаа" };
    }

    if (products.length === 0) {
      return { ok: true as const, fetched: 0, upserted: 0, skipped: 0 };
    }

    const rows = products.map((p) => ({
      merchant_id: merchantId,
      source_system: "easyshop",
      source_product_id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.price ?? 0),
      original_price: p.original_price != null ? Number(p.original_price) : null,
      image_url: p.image_url,
      thumbnail_url: p.thumbnail_url,
      category: p.category,
      discount: Number(p.discount ?? 0),
      is_new: !!p.is_new,
      is_on_sale: !!p.is_on_sale,
      is_bogo: !!p.is_bogo,
      is_active: p.is_active !== false,
      product_code: p.product_code,
      slug: p.slug ? `${p.slug}-${p.id.slice(0, 6)}` : null,
      specifications: p.specifications ?? [],
      detail_media: p.detail_media ?? [],
      colors: p.colors ?? [],
      sizes: p.sizes ?? [],
      stock_quantity: Number(p.stock_quantity ?? 0),
      variant_stock: p.variant_stock ?? {},
      sales: Number(p.sales ?? 0),
      updated_at: new Date().toISOString(),
    }));

    // Upsert in batches to be safe
    let upserted = 0;
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error } = await supabaseAdmin
        .from("products")
        .upsert(slice as any, { onConflict: "merchant_id,source_system,source_product_id" });
      if (error) {
        return {
          ok: false as const,
          error: error.message,
          upserted,
          fetched: products.length,
        };
      }
      upserted += slice.length;
    }

    return {
      ok: true as const,
      fetched: products.length,
      upserted,
      merchantId,
    };
  });
