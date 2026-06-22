import { createFileRoute } from "@tanstack/react-router";

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

const CLEAR_COOKIES = [
  "toki_oauth_state=; Path=/; Max-Age=0",
  "toki_oauth_verifier=; Path=/; Max-Age=0",
  "toki_oauth_redirect=; Path=/; Max-Age=0",
];

function redirectWithError(reason: string) {
  const headers = new Headers();
  CLEAR_COOKIES.forEach((c) => headers.append("Set-Cookie", c));
  headers.set("Location", `/login?error=${encodeURIComponent(reason)}`);
  return new Response(null, { status: 302, headers });
}

/**
 * Toki OAuth2 callback. Exchanges the authorization code for tokens,
 * fetches userinfo, then upserts a Supabase user and starts a session
 * by redirecting through a generated magic-link verify URL.
 */
export const Route = createFileRoute("/auth/toki/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const cookies = parseCookies(request.headers.get("cookie"));
        const expectedState = cookies.toki_oauth_state;
        const verifier = cookies.toki_oauth_verifier;
        const postRedirect = cookies.toki_oauth_redirect
          ? decodeURIComponent(cookies.toki_oauth_redirect)
          : "/";

        if (!code || !state || !expectedState || state !== expectedState || !verifier) {
          return redirectWithError("toki_state_mismatch");
        }

        const clientId = process.env.TOKI_CLIENT_ID;
        const clientSecret = process.env.TOKI_CLIENT_SECRET; // optional; PKCE works without
        if (!clientId) return redirectWithError("toki_not_configured");

        const origin = url.origin;
        const redirectUri = `${origin}/auth/toki/callback`;

        try {
          // 1) Exchange code for tokens
          const tokenBody = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: verifier,
          });
          if (clientSecret) tokenBody.set("client_secret", clientSecret);

          const tokenRes = await fetch("https://sso.toki.mn/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: tokenBody.toString(),
          });
          if (!tokenRes.ok) {
            console.error("[toki] token exchange failed", tokenRes.status, await tokenRes.text());
            return redirectWithError("toki_token_failed");
          }
          const tokenJson = (await tokenRes.json()) as {
            access_token: string;
            id_token?: string;
            refresh_token?: string;
            userId?: string;
            sub?: string;
          };

          // 2) Get userinfo
          const tokiUserId = tokenJson.userId ?? tokenJson.sub ?? "";
          const uiUrl = new URL("https://sso.toki.mn/oauth2/userinfo");
          if (tokiUserId) uiUrl.searchParams.set("userId", tokiUserId);
          const uiRes = await fetch(uiUrl.toString(), {
            headers: { Authorization: `Bearer ${tokenJson.access_token}` },
          });
          let userInfo: Record<string, any> = {};
          if (uiRes.ok) {
            userInfo = await uiRes.json();
          } else {
            console.warn("[toki] userinfo failed", uiRes.status, await uiRes.text());
          }

          const tokiSub: string = String(
            userInfo.sub ?? userInfo.userId ?? userInfo.id ?? tokiUserId ?? "",
          );
          const phone: string | undefined =
            userInfo.phone_number ?? userInfo.phoneNumber ?? userInfo.phone;
          const email: string | undefined = userInfo.email;
          const fullName: string | undefined =
            userInfo.name ?? userInfo.full_name ?? userInfo.fullName;

          if (!tokiSub && !phone && !email) {
            console.error("[toki] userinfo missing identifier", userInfo);
            return redirectWithError("toki_no_identity");
          }

          // Synthetic email when Toki only returns phone. Stable per Toki user.
          const syntheticEmail =
            email ?? `toki_${tokiSub || phone}@toki.only.mn`.toLowerCase();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 3) Find or create Supabase user
          let userIdSb: string | null = null;
          // List by email is the supported lookup
          const { data: byEmail } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 200,
          });
          const found = byEmail?.users?.find((u) => u.email === syntheticEmail);
          if (found) userIdSb = found.id;

          if (!userIdSb) {
            const { data: created, error: createErr } =
              await supabaseAdmin.auth.admin.createUser({
                email: syntheticEmail,
                email_confirm: true,
                user_metadata: {
                  full_name: fullName,
                  phone,
                  toki_sub: tokiSub,
                  provider: "toki",
                },
              });
            if (createErr || !created.user) {
              console.error("[toki] createUser failed", createErr);
              return redirectWithError("toki_user_create_failed");
            }
            userIdSb = created.user.id;
          } else {
            await supabaseAdmin.auth.admin.updateUserById(userIdSb, {
              user_metadata: {
                full_name: fullName,
                phone,
                toki_sub: tokiSub,
                provider: "toki",
              },
            });
          }

          // 4) Generate magic-link verify URL and redirect (sets the Supabase session cookie)
          const finalRedirect = postRedirect.startsWith("/")
            ? `${origin}${postRedirect}`
            : origin;
          const { data: linkData, error: linkErr } =
            await supabaseAdmin.auth.admin.generateLink({
              type: "magiclink",
              email: syntheticEmail,
              options: { redirectTo: finalRedirect },
            });
          if (linkErr || !linkData?.properties?.action_link) {
            console.error("[toki] generateLink failed", linkErr);
            return redirectWithError("toki_session_failed");
          }

          const headers = new Headers();
          CLEAR_COOKIES.forEach((c) => headers.append("Set-Cookie", c));
          headers.set("Location", linkData.properties.action_link);
          return new Response(null, { status: 302, headers });
        } catch (err) {
          console.error("[toki] callback error", err);
          return redirectWithError("toki_failed");
        }
      },
    },
  },
});
