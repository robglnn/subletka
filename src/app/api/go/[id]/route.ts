import type { NextRequest } from "next/server";
import { listingFate } from "@/db/listing-fate";
import { getOriginalUrl } from "@/db/listings";
import { DEFAULT_LOCALE, isLocale } from "@/lib/domain";
import { awayFromListing } from "@/lib/listing-redirect";

const PRIVATE = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" };

export async function GET(request: NextRequest, ctx: RouteContext<"/api/go/[id]">) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  const url = await getOriginalUrl(id);
  if (url) return new Response(null, { status: 302, headers: { ...PRIVATE, location: url } });
  const requested = request.nextUrl.searchParams.get("lang") ?? request.cookies.get("lang")?.value ?? "";
  const away = awayFromListing(isLocale(requested) ? requested : DEFAULT_LOCALE, await listingFate(id));
  return new Response(null, { status: away.status, headers: { ...PRIVATE, location: away.location } });
}
