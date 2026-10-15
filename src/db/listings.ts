import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";
import { depositOf } from "@/lib/booking-terms";
import { DEFAULT_SORT, canonicalDistrict, type City, type Contact, type Listing, type PlaceFilter } from "@/lib/domain";
import type { Money } from "@/lib/money";
import { legacyRowId, publicListingId } from "@/lib/listing-id";
import type { Filters } from "@/lib/search-params";
import { db } from "./index";
import { photoKey } from "./photo-source";
import { listings, type ListingRow } from "./schema";
import { demoted, rankedRows } from "./ranking";
import { requestedIds } from "./listing-fate";
import { visible } from "./visibility";

export const toListing = (r: ListingRow): Listing => ({
  id: r.publicId ?? publicListingId(r.id, r.origin),
  origin: r.origin,
  city: r.city,
  district: canonicalDistrict(r.city, r.district, r.lat, r.lng),
  lat: r.lat,
  lng: r.lng,
  description: r.description,
  textLang: r.lang,
  price: {
    amount: r.priceAmount,
    currency: r.priceCurrency,
    period: r.pricePeriod,
    billsIncluded: r.billsIncluded,
    startingAt: r.priceStartingAt,
  },
  deposit: depositOf(r.deposit, r.depositMonths),
  cancellation: r.cancellationPolicy,
  additionalCosts: r.additionalCosts,
  availableFrom: r.availableFrom,
  availableTo: r.availableTo,
  minStayDays: r.minStayDays,
  placeType: r.placeType,
  rooms: r.rooms,
  areaM2: r.areaM2,
  roommates:
    r.roommatesCount === null && r.roommatesGenders === null && r.preferredTenantGender === null
      ? null
      : { count: r.roommatesCount, genders: r.roommatesGenders, preferredTenantGender: r.preferredTenantGender },
  furnished: r.furnished,
  petsAllowed: r.petsAllowed,
  photos: r.photos.map(photoKey),
  postedAt: r.postedAt,
  areaBadge: r.areaBadge,
  minutesToCentre: r.minutesToCentre,
});

const PLACE_FILTER_SQL: Record<PlaceFilter, () => SQL | undefined> = {
  room: () => inArray(listings.placeType, ["private_room", "shared_room"]),
  studio: () => and(eq(listings.placeType, "whole_place"), eq(listings.rooms, 1)),
  flat: () => and(eq(listings.placeType, "whole_place"), or(isNull(listings.rooms), gte(listings.rooms, 2))),
};

export type BrowseQuery = Omit<Filters, "page" | "sort"> & { city: City; district?: string };

export const browseWhere = (q: BrowseQuery): SQL | undefined => {
  const parts: (SQL | undefined)[] = [visible(), eq(listings.city, q.city)];
  if (q.district) parts.push(eq(listings.district, q.district));
  if (q.from) {
    parts.push(or(isNull(listings.availableFrom), lte(listings.availableFrom, q.from)));
    parts.push(or(isNull(listings.availableTo), gte(listings.availableTo, q.from)));
  }
  if (q.to) parts.push(or(isNull(listings.availableTo), gte(listings.availableTo, q.to)));
  if (q.type.length) parts.push(or(...q.type.map((t) => PLACE_FILTER_SQL[t]())));
  if (q.max) parts.push(lte(listings.priceMonthly, q.max));
  if (q.furnished) parts.push(eq(listings.furnished, true));
  if (q.pets) parts.push(eq(listings.petsAllowed, true));
  return and(...parts);
};

export const PAGE_SIZE = 24;

export async function browse(q: BrowseQuery & Pick<Filters, "sort" | "page">) {
  await connection();
  const where = browseWhere(q);
  const [rows, [{ total }]] = await Promise.all([
    rankedRows(where, q, q.sort, PAGE_SIZE * q.page),
    db.select({ total: count() }).from(listings).where(where),
  ]);
  return { listings: rows.map(toListing), total };
}

export async function browseCount(q: BrowseQuery) {
  const [{ total }] = await db.select({ total: count() }).from(listings).where(browseWhere(q));
  return total;
}

export async function latest(city: City, limit: number) {
  await connection();
  const where = and(visible(), eq(listings.city, city));
  const [rows, [{ total }]] = await Promise.all([
    rankedRows(where, {}, DEFAULT_SORT, limit),
    db.select({ total: count() }).from(listings).where(where),
  ]);
  return { listings: rows.map(toListing), total };
}

export async function cityGlance(city: City, district?: string) {
  const where = and(visible(), eq(listings.city, city), eq(listings.pricePeriod, "month"), district ? eq(listings.district, district) : undefined);
  const typical = and(where, eq(listings.priceOutlier, false));
  const [[row], [cheapest]] = await Promise.all([
    db
      .select({
        total: count(),
        median: sql<number | null>`percentile_cont(0.5) within group (order by ${listings.priceMonthly}) filter (where not ${listings.priceOutlier})`,
        minutes: sql<number | null>`percentile_cont(0.5) within group (order by ${listings.minutesToCentre})`,
      })
      .from(listings)
      .where(where),
    db
      .select({ amount: listings.priceAmount, currency: listings.priceCurrency })
      .from(listings)
      .where(typical)
      .orderBy(asc(listings.priceMonthly))
      .limit(1),
  ]);
  const lowest: Money | null = cheapest ?? null;
  return {
    total: row.total,
    lowest,
    medianPln: row.median === null ? null : Math.round(Number(row.median)),
    minutes: row.minutes === null ? null : Math.round(Number(row.minutes)),
  };
}

export const NUDGE = { belowArea: 62, areaGain: 15, priceSpread: 0.2 } as const;

export async function betterNearby(publicId: string) {
  const [self] = await db
    .select()
    .from(listings)
    .where(and(visible(), eq(listings.publicId, publicId)));
  if (!self || self.areaBadge || self.areaScore === null || self.areaScore >= NUDGE.belowArea) return null;
  const sameType =
    self.placeType === "whole_place"
      ? and(eq(listings.placeType, "whole_place"), self.rooms === 1 ? eq(listings.rooms, 1) : or(isNull(listings.rooms), gte(listings.rooms, 2)))
      : eq(listings.placeType, self.placeType);
  const [alt] = await db
    .select()
    .from(listings)
    .where(
      and(
        visible(),
        eq(listings.city, self.city),
        sameType,
        sql`${listings.id} <> ${self.id}`,
        sql`not ${demoted()}`,
        gte(listings.areaScore, self.areaScore + NUDGE.areaGain),
        sql`${listings.priceMonthly} > ${self.priceMonthly} and ${listings.priceMonthly} <= ${Math.round(self.priceMonthly * (1 + NUDGE.priceSpread))}`,
        self.availableTo ? or(isNull(listings.availableFrom), lte(listings.availableFrom, self.availableTo)) : undefined,
        self.availableFrom ? or(isNull(listings.availableTo), gte(listings.availableTo, self.availableFrom)) : undefined,
      ),
    )
    .orderBy(desc(listings.fitScore), asc(listings.id))
    .limit(1);
  return alt ? { listing: toListing(alt), morePln: alt.priceMonthly - self.priceMonthly } : null;
}

export async function listingsByIds(ids: string[]) {
  await connection();
  if (!ids.length) return [];
  const rows = await db
    .select()
    .from(listings)
    .where(and(visible(), requestedIds(ids)));
  const byId = new Map(rows.flatMap((r) => [[r.id, r] as const, [r.publicId ?? r.id, r] as const]));
  const found = ids.flatMap((id) => byId.get(id) ?? byId.get(legacyRowId(id) ?? "") ?? []);
  return [...new Set(found)].map(toListing);
}

export async function getActiveListing(requested: string) {
  await connection();
  const [row] = await db
    .select()
    .from(listings)
    .where(and(visible(), requestedIds([requested])))
    .limit(1);
  return row ? toListing(row) : null;
}

export async function getOriginalUrl(publicId: string) {
  const [row] = await db
    .select({ url: listings.sourceUrl })
    .from(listings)
    .where(and(eq(listings.publicId, publicId), visible(), eq(listings.origin, "imported")));
  return row?.url ?? null;
}

export async function getContactDraft(id: string): Promise<(Contact & { listing: Listing }) | null> {
  const [row] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.id, id), visible(), eq(listings.origin, "native")));
  return row?.contactEmail ? { email: row.contactEmail, listing: toListing(row) } : null;
}

export async function listingsByOwner(email: string) {
  await connection();
  const rows = await db.select().from(listings).where(eq(listings.ownerEmail, email)).orderBy(desc(listings.createdAt));
  return rows.map((r) => ({ listing: toListing(r), status: r.status }));
}

export async function activeListingStamps() {
  await connection();
  const rows = await rankedRows(visible(), {}, DEFAULT_SORT, 5000);
  return rows.map((r) => ({ id: r.publicId ?? publicListingId(r.id, r.origin), updatedAt: r.updatedAt }));
}
