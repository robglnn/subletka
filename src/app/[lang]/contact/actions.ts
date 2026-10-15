"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { recordDelivery, saveSupportMessage } from "@/db/support";
import { isLocale, type Locale } from "@/lib/domain";
import { clientIp } from "@/lib/env";
import { allow } from "@/lib/rate-limit";
import { parseSupport, type SupportState } from "@/lib/support-form";
import { deliverSupportMessage } from "@/lib/support-mail";

const failed = (code: "rateLimited" | "generic"): SupportState => ({ kind: "error", code, fields: [] });

export async function sendSupport(lang: Locale, _prev: SupportState, fd: FormData): Promise<SupportState> {
  if (!isLocale(lang)) return failed("generic");
  const parsed = parseSupport(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));
  if (parsed.kind === "bot") return { kind: "sent" };
  if (parsed.kind === "invalid") return { kind: "error", code: "invalid", fields: parsed.fields };
  if (!allow(`support:${clientIp(await headers())}`, 5, 60 * 60_000)) return failed("rateLimited");
  const saved = await saveSupportMessage(parsed.values, lang).catch((e) => {
    console.error("support: could not store message", e);
    return null;
  });
  if (!saved) return failed("generic");
  after(async () => {
    const result = await deliverSupportMessage(saved);
    if (!result.ok) console.error(`support: delivery failed for ${saved.id}: ${result.error}`);
    await recordDelivery(saved.id, result);
  });
  return { kind: "sent" };
}
