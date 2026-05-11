-- chatbot_settings
CREATE TABLE IF NOT EXISTS public.chatbot_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL UNIQUE,
  bot_name text NOT NULL DEFAULT 'Ассистент',
  greeting_message text NOT NULL DEFAULT 'Сайн байна уу! Би танд хэрхэн туслах вэ?',
  system_prompt text NOT NULL DEFAULT '',
  knowledge text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chatbot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chatbot_settings staff manage"
  ON public.chatbot_settings FOR ALL
  USING (public.has_merchant_access(auth.uid(), merchant_id))
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "chatbot_settings public read enabled"
  ON public.chatbot_settings FOR SELECT
  USING (is_enabled = true OR public.has_merchant_access(auth.uid(), merchant_id));

CREATE TRIGGER trg_chatbot_updated
  BEFORE UPDATE ON public.chatbot_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- merchants delivery key
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS delivery_api_key text;
