import { NextResponse, type NextRequest } from "next/server";
import { listingFate } from "@/db/listing-fate";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/domain";
import { LISTING_PATH, listingRedirect, requestedListingId } from "@/lib/listing-redirect";

const LANG_COOKIE = "lang";
const CANONICAL_ORIGIN = "https://subletka.com";
const SERVED_HOSTS = new Set(["subletka.com", "localhost", "127.0.0.1"]);

const fromAcceptLanguage = (header: string | null): Locale => {
  const ranked = (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  const hit = ranked.map((r) => r.lang).find(isLocale);
  return hit ?? DEFAULT_LOCALE;
};

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":", 1)[0].toLowerCase();
  if (!SERVED_HOSTS.has(host)) return NextResponse.redirect(`${CANONICAL_ORIGIN}${pathname}${search}`, 301);
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) {
    const segment = pathname.match(LISTING_PATH)?.[2];
    if (segment !== undefined) {
      const requested = requestedListingId(segment);
      const away = listingRedirect(first, requested, await listingFate(requested));
      if (away) return NextResponse.redirect(new URL(away.location, request.nextUrl), away.status);
    }
    const response = NextResponse.next();
    if (request.cookies.get(LANG_COOKIE)?.value !== first) {
      response.cookies.set(LANG_COOKIE, first, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    }
    return response;
  }
  const saved = request.cookies.get(LANG_COOKIE)?.value;
  const locale = saved && isLocale(saved) ? saved : fromAcceptLanguage(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!api/|p/|img/|_next/|__|\\.well-known/|.*\\.[a-z0-9]+$).*)",
    {
      source: "/:path*",
      has: [{ type: "header", key: "x-forwarded-host" }],
      missing: [{ type: "header", key: "x-forwarded-host", value: "(?:subletka\\.com|localhost|127\\.0\\.0\\.1)(?::\\d+)?" }],
    },
    {
      source: "/:path*",
      missing: [
        { type: "header", key: "x-forwarded-host" },
        { type: "host", value: "(?:subletka\\.com|localhost|127\\.0\\.0\\.1)" },
      ],
    },
    "/:lang(pl|en)/l/:id",
  ],
};
