CREATE UNIQUE INDEX IF NOT EXISTS products_source_unique_idx
  ON public.products (merchant_id, source_system, source_product_id)
  WHERE source_product_id IS NOT NULL;