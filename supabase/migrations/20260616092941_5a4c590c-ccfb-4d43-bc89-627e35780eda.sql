INSERT INTO public.platform_settings (key, value)
VALUES (
  'callpro_sms',
  jsonb_build_object(
    'api_url', 'https://api-text.callpro.mn/v1/sms/send',
    'sender', '72992222'
  )
)
ON CONFLICT (key) DO UPDATE
SET value = public.platform_settings.value
         || jsonb_build_object('api_url', 'https://api-text.callpro.mn/v1/sms/send');
