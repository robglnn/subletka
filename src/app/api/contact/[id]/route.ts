import type { NextRequest } from "next/server";
import { listingFate } from "@/db/listing-fate";
import { getContactDraft } from "@/db/listings";
import { isLocale } from "@/lib/domain";
import { clientIp, siteUrl } from "@/lib/env";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { listingTitle } from "@/lib/i18n/format";
import { awayFromListing } from "@/lib/listing-redirect";
import { allow } from "@/lib/rate-limit";
import { routes } from "@/lib/routes";

const PRIVATE = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" };

export async function GET(request: NextRequest, ctx: RouteContext<"/api/contact/[id]">) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  if (!allow(`contact:${clientIp(request.headers)}`, 40, 10 * 60_000)) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: PRIVATE });
  }
  const draft = await getContactDraft(id);
  const json = request.nextUrl.searchParams.get("format") === "json";
  if (!draft && json) return Response.json({ error: "not_found" }, { status: 404, headers: PRIVATE });
  if (draft && json) return Response.json({ email: draft.email }, { headers: PRIVATE });

  const requested = request.nextUrl.searchParams.get("lang") ?? "";
  const lang = isLocale(requested) ? requested : "pl";
  if (!draft) {
    const away = awayFromListing(lang, await listingFate(id));
    return new Response(null, { status: away.status, headers: { ...PRIVATE, location: away.location } });
  }
  const subject = `Subletka: ${listingTitle(lang, draft.listing)}`;
  const body = fill(getDictionary(lang).listing.contactBody, { url: `${siteUrl()}${routes.listing(lang, draft.listing.id)}` });
  const mailto = `mailto:${draft.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return new Response(null, { status: 302, headers: { ...PRIVATE, location: mailto } });
}
