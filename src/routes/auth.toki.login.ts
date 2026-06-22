import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const COOKIE_OPTS = "Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600";

/**
 * Starts the Toki Sign in (OAuth2 Authorization Code Flow + PKCE).
 * - Builds the authorize URL with PKCE
 * - Stores state / code_verifier / post-login redirect in short-lived HttpOnly cookies
 * - Redirects the browser to https://sso.toki.mn/oauth2/authorize
 */
export const Route = createFileRoute("/auth/toki/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rawRedirect = url.searchParams.get("redirect");
        const postRedirect =
          rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
            ? rawRedirect
            : "/";

        const clientId = process.env.TOKI_CLIENT_ID;
        if (!clientId) {
          return new Response(
            "Toki Sign in тохиргоо дутуу байна. TOKI_CLIENT_ID нууцыг тохируулна уу.",
            { status: 500 },
          );
        }

        const origin = url.origin;
        const redirectUri = `${origin}/auth/toki/callback`;

        const state = base64url(crypto.randomBytes(24));
        const verifier = base64url(crypto.randomBytes(32));
        const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());

        const authUrl = new URL("https://sso.toki.mn/oauth2/authorize");
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("scope", "openid offline_access");
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("code_challenge", challenge);
        authUrl.searchParams.set("code_challenge_method", "S256");

        const headers = new Headers();
        headers.append("Set-Cookie", `toki_oauth_state=${state}; ${COOKIE_OPTS}`);
        headers.append("Set-Cookie", `toki_oauth_verifier=${verifier}; ${COOKIE_OPTS}`);
        headers.append(
          "Set-Cookie",
          `toki_oauth_redirect=${encodeURIComponent(postRedirect)}; ${COOKIE_OPTS}`,
        );
        headers.set("Location", authUrl.toString());
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
