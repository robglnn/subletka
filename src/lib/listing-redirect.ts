import { isCity, type Locale } from "@/lib/domain";
import { routes } from "@/lib/routes";

export type ListingFate = { state: "visible" | "removed" | "hidden"; id: string; city: string } | { state: "unknown" };

export type ListingRedirect = { status: 301 | 302; location: string };

export const awayFromListing = (lang: Locale, fate: ListingFate): ListingRedirect => {
  if (fate.state === "unknown") return { status: 301, location: routes.home(lang) };
  if (fate.state === "visible") return { status: 302, location: routes.listing(lang, fate.id) };
  return { status: fate.state === "removed" ? 301 : 302, location: isCity(fate.city) ? routes.city(lang, fate.city) : routes.home(lang) };
};

export const listingRedirect = (lang: Locale, requested: string, fate: ListingFate): ListingRedirect | null => {
  if (fate.state !== "visible") return awayFromListing(lang, fate);
  return fate.id === requested ? null : { status: 301, location: routes.listing(lang, fate.id) };
};

export const LISTING_PATH = /^\/([a-z]{2})\/l\/([^/]+)\/?$/;

export const requestedListingId = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
};
