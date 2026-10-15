import "server-only";
import { resolveMx } from "node:dns/promises";
import { createTransport } from "nodemailer";
import type { SupportMessage } from "@/db/schema";
import { siteUrl, supportMailConfig } from "@/lib/env";
import { routes } from "@/lib/routes";

export const MAIL_DOMAIN = "subletka.com";
export const DKIM_SELECTOR = "support";
const FROM = { name: "Subletka", address: `no-reply@${MAIL_DOMAIN}` };

export type Delivery = { ok: true } | { ok: false; error: string };

export const supportEmail = (m: SupportMessage, to: string, site: string) => ({
  from: FROM,
  to,
  replyTo: m.email,
  subject: m.listingId ? `subletka: listing report ${m.listingId}` : `subletka: message from ${m.email}`,
  text: [
    m.message,
    "",
    "--",
    `from: ${m.email}`,
    ...(m.listingId ? [`listing: ${site}${routes.listing(m.lang, m.listingId)}`] : []),
    `lang: ${m.lang}`,
    `id: ${m.id}`,
  ].join("\n"),
});

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function deliverSupportMessage(m: SupportMessage): Promise<Delivery> {
  const { to, dkimKey } = supportMailConfig();
  if (!dkimKey) return { ok: false, error: "SUPPORT_DKIM_PRIVATE_KEY is not set" };
  const domain = to.split("@").pop()!;
  const exchanges = await resolveMx(domain).catch(() => []);
  const hosts = exchanges.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  if (!hosts.length) return { ok: false, error: `no MX for ${domain}` };
  const mail = supportEmail(m, to, siteUrl());
  const errors: string[] = [];
  for (const host of hosts) {
    const transport = createTransport({
      host,
      port: 25,
      name: MAIL_DOMAIN,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      dkim: { domainName: MAIL_DOMAIN, keySelector: DKIM_SELECTOR, privateKey: dkimKey },
    });
    try {
      await transport.sendMail(mail);
      return { ok: true };
    } catch (e) {
      errors.push(`${host}: ${errorText(e)}`);
    } finally {
      transport.close();
    }
  }
  return { ok: false, error: errors.join("; ") };
}
