ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_bogo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gallery_images jsonb NOT NULL DEFAULT '[]'::jsonb;