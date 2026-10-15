import "server-only";
import { INDEXNOW_KEY, type IndexNowConfig } from "@/lib/indexnow";
import { SUPPORT_EMAIL } from "@/lib/support";

export type GoogleConfig = { clientId: string; clientSecret: string; authSecret: string };

export const googleConfig = (): GoogleConfig | null => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !AUTH_SECRET) return null;
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, authSecret: AUTH_SECRET };
};

export type SupportMailConfig = { to: string; dkimKey: string | null };

export const supportMailConfig = (): SupportMailConfig => ({
  to: process.env.SUPPORT_FORWARD_TO?.trim() || SUPPORT_EMAIL,
  dkimKey: process.env.SUPPORT_DKIM_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() || null,
});

export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const indexNowConfig = (): IndexNowConfig | null => {
  const key = process.env.INDEXNOW_KEY?.trim();
  const site = siteUrl();
  return key && INDEXNOW_KEY.test(key) && site.startsWith("https://") ? { site, key } : null;
};

export const requestOrigin = (h: Headers) => {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
};

export const clientIp = (h: Headers) => h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
