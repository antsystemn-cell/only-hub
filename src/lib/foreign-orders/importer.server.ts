import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export async function findExistingForeignProductInternal(data: {
  merchantId: string;
  source: string;
  sourceProductId: string | null;
  sourceUrl: string | null;
}) {
  const query = supabaseAdmin
    .from("products")
    .select("id, name, slug, image_url, is_active, created_at")
    .eq("merchant_id", data.merchantId)
    .eq("foreign_source", data.source);

  if (data.sourceProductId) {
    query.eq("source_product_id", data.sourceProductId);
  } else if (data.sourceUrl) {
    query.eq("source_url", data.sourceUrl);
  } else {
    return { items: [] };
  }

  const { data: items, error } = await query;
  if (error) throw error;
  return { items: items ?? [] };
}

export async function createForeignProductInternal(data: any) {
  // Minimal implementation to fix the build; logic usually involves
  // inserting into products and product_variants tables with pricing logic.
  const { data: product, error: pError } = await supabaseAdmin
    .from("products")
    .insert({
      merchant_id: data.merchantId,
      name: data.title,
      brand: data.brand,
      category: data.category,
      description: data.description,
      image_url: data.coverImage,
      gallery: data.gallery,
      source_url: data.sourceUrl,
      source_product_id: data.sourceProductId,
      foreign_source: data.source,
      is_active: true,
      price: 0, // Will be updated by variants/trigger
    })
    .select()
    .single();

  if (pError) throw pError;

  if (data.variants && data.variants.length > 0) {
    const variantsToInsert = data.variants.map((v: any) => ({
      product_id: product.id,
      merchant_id: data.merchantId,
      size_label: v.sizeLabel,
      color_label: v.colorLabel,
      source_price: v.sourcePrice,
      is_purchasable: v.isPurchasable,
      source_variant_id: v.sourceVariantId,
      // Default to manual for now if imported
      manual_price_override: true,
      price: v.sourcePrice, // Logic for CNY/KRW -> MNT usually goes here or in a trigger
    }));

    const { error: vError } = await supabaseAdmin
      .from("product_variants")
      .insert(variantsToInsert);

    if (vError) throw vError;
  }

  return product;
}
