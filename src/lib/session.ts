import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";

export const SESSION_COOKIE = "subletka_session";
const MAX_AGE_S = 60 * 60 * 24 * 30;

const Payload = z.object({ email: z.string().email(), exp: z.number() });
export type Session = { email: string };

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export const encodeSession = (email: string, secret: string) => {
  const data = Buffer.from(JSON.stringify({ email, exp: Date.now() + MAX_AGE_S * 1000 })).toString("base64url");
  return `${data}.${sign(data, secret)}`;
};

export const decodeSession = (value: string, secret: string): Session | null => {
  const [data, mac] = value.split(".");
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(data, "base64url").toString());
  } catch {
    return null;
  }
  const parsed = Payload.safeParse(json);
  if (!parsed.success || parsed.data.exp < Date.now()) return null;
  return { email: parsed.data.email };
};

export const sessionCookie = (value: string) => ({
  name: SESSION_COOKIE,
  value,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_S,
});

export async function getSession(): Promise<Session | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  return raw ? decodeSession(raw, secret) : null;
}
