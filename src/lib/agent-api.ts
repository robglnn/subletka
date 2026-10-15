import "server-only";
import { z } from "zod";
import { cityOverview, searchListings } from "@/db/agent-search";
import { getActiveListing } from "@/db/listings";
import {
  CitiesQuery,
  DetailQuery,
  queryIssues,
  resolveDistrict,
  searchApiPath,
  SearchQuery,
  type OperationName,
} from "@/lib/agent-query";
import { CITIES } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { LOCALE_CURRENCY } from "@/lib/money";
import type { ApiError, CitiesResult, PublicListing, SearchResult } from "@/lib/agent-response";
import { searchPageUrl, toPublicListing } from "@/lib/public-listing";
import { routes } from "@/lib/routes";

type Failure = { status: 400 | 404; body: z.infer<typeof ApiError> };
export type ApiResult<T> = { status: 200; body: T } | Failure;

const invalid = (error: z.ZodError, site: string): Failure => ({
  status: 400,
  body: { error: "invalid_query", issues: queryIssues(error), docs: `${site}/openapi.json` },
});

export async function search(input: unknown, site: string): Promise<ApiResult<SearchResult>> {
  const parsed = SearchQuery.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, site);
  const q = { ...parsed.data, district: parsed.data.district && (resolveDistrict(parsed.data.city, parsed.data.district) ?? undefined) };
  const { total, listings } = await searchListings(q);
  const end = q.offset + listings.length;
  return {
    status: 200,
    body: {
      query: q,
      currency: LOCALE_CURRENCY[q.lang],
      total,
      count: listings.length,
      next: end < total ? `${site}${searchApiPath({ ...q, offset: end })}` : null,
      searchPage: searchPageUrl(site, q),
      results: listings.map((l) => toPublicListing(l, q.lang, site)),
    },
  };
}

export async function listing(input: unknown, site: string): Promise<ApiResult<PublicListing>> {
  const parsed = DetailQuery.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, site);
  const found = await getActiveListing(parsed.data.id);
  if (!found) return { status: 404, body: { error: "not_found" } };
  return { status: 200, body: toPublicListing(found, parsed.data.lang, site, true) };
}

export async function cities(input: unknown, site: string): Promise<ApiResult<CitiesResult>> {
  const parsed = CitiesQuery.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, site);
  const { lang } = parsed.data;
  const overviews = await Promise.all(CITIES.map((c) => cityOverview(c, lang)));
  return {
    status: 200,
    body: {
      currency: LOCALE_CURRENCY[lang],
      cities: overviews.map((c) => ({
        ...c,
        name: getDictionary(lang).cities[c.city],
        url: `${site}${routes.city(lang, c.city)}`,
        search: `${site}${searchApiPath({ city: c.city, lang })}`,
      })),
    },
  };
}

export const OPERATION_HANDLERS: Record<OperationName, (input: unknown, site: string) => Promise<ApiResult<Record<string, unknown>>>> = {
  search_listings: search,
  get_listing: listing,
  list_cities: cities,
};
