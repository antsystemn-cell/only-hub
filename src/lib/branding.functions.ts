import { createServerFn } from "@tanstack/react-start";

/**
 * Public branding info (e.g. platform logo). No auth required — used in SiteHeader.
 * Reads a small allow-list of keys from platform_settings via admin client.
 */
export const getPublicBrandingFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("key,value")
    .in("key", ["platform_logo_url"]);
  const map: Record<string, any> = {};
  for (const r of data ?? []) map[(r as any).key] = (r as any).value;
  const logoUrl =
    typeof map.platform_logo_url === "string"
      ? map.platform_logo_url
      : (map.platform_logo_url?.url ?? null);
  return { logoUrl: (logoUrl as string | null) || null };
});
