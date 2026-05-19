
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.platform_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  button_text text DEFAULT 'Дэлгэрэнгүй',
  button_link text DEFAULT '/',
  bg_gradient text DEFAULT 'from-primary/90 via-primary/70 to-primary/40',
  banner_image text,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active platform banners" ON public.platform_banners;
CREATE POLICY "Public read active platform banners"
  ON public.platform_banners FOR SELECT
  USING (is_active = true OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admin manage banners" ON public.platform_banners;
CREATE POLICY "Platform admin manage banners"
  ON public.platform_banners FOR ALL
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_platform_banners_updated ON public.platform_banners;
CREATE TRIGGER trg_platform_banners_updated
  BEFORE UPDATE ON public.platform_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  excerpt text,
  content text NOT NULL DEFAULT '',
  cover_image text,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  tags text[] NOT NULL DEFAULT '{}',
  view_count integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published posts" ON public.blog_posts;
CREATE POLICY "Public read published posts"
  ON public.blog_posts FOR SELECT
  USING (status = 'published' OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admin manage posts" ON public.blog_posts;
CREATE POLICY "Platform admin manage posts"
  ON public.blog_posts FOR ALL
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_blog_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := LOWER(REGEXP_REPLACE(COALESCE(NEW.title, ''), '[^a-zA-Z0-9]+', '-', 'g'))
                || '-' || LEFT(gen_random_uuid()::text, 6);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blog_slug ON public.blog_posts;
CREATE TRIGGER trg_blog_slug
  BEFORE INSERT ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_blog_slug();

DROP TRIGGER IF EXISTS trg_blog_updated ON public.blog_posts;
CREATE TRIGGER trg_blog_updated
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS social_facebook text,
  ADD COLUMN IF NOT EXISTS social_instagram text;
