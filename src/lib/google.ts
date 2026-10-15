import "server-only";
import { z } from "zod";
import type { GoogleConfig } from "@/lib/env";

export const STATE_COOKIE = "subletka_oauth";
export const CALLBACK_PATH = "/api/auth/google/callback";

export const safeNext = (v: string | null | undefined) => (v && /^\/(?![/\\])/.test(v) ? v : "/");

export const authorizeUrl = (cfg: GoogleConfig, origin: string, state: string) => {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `${origin}${CALLBACK_PATH}`,
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  }).toString();
  return url;
};

const IdToken = z.object({
  iss: z.enum(["accounts.google.com", "https://accounts.google.com"]),
  aud: z.string(),
  email: z.email(),
  email_verified: z.literal(true),
  exp: z.number(),
});

export async function verifiedEmail(cfg: GoogleConfig, origin: string, code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: `${origin}${CALLBACK_PATH}`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const { id_token } = (await res.json()) as { id_token?: string };
  const payload = id_token?.split(".")[1];
  if (!payload) return null;
  const claims = IdToken.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString()));
  if (!claims.success || claims.data.aud !== cfg.clientId || claims.data.exp * 1000 < Date.now()) return null;
  return claims.data.email.toLowerCase();
}
