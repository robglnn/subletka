import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { resolveDistrict, type SearchQuery } from "@/lib/agent-query";
import { DISTRICT_NAMES, expandTypes, type City, type Listing, type Locale } from "@/lib/domain";
import { displayMoney, roundMoney, toPln, type Money } from "@/lib/money";
import { db } from "./index";
import { browseWhere, toListing } from "./listings";
import { rankedRows } from "./ranking";
import { listings } from "./schema";

const CITY_CAP = 5000;

const everything = (city: City) => browseWhere({ city, type: [], furnished: false, pets: false });

export async function searchListings(q: SearchQuery) {
  const where = and(
    browseWhere({
      city: q.city,
      from: q.from,
      to: q.to,
      type: expandTypes(q.type ?? []),
      max: q.max ? toPln(q.max, q.lang) : undefined,
      furnished: q.furnished ?? false,
      pets: q.pets ?? false,
    }),
    q.rooms ? and(eq(listings.placeType, "whole_place"), gte(listings.rooms, q.rooms)) : undefined,
  );
  const district = q.district ? resolveDistrict(q.city, q.district) : null;
  const rows = await rankedRows(and(where, district ? eq(listings.district, district) : undefined), q, q.sort, CITY_CAP);
  const matched = rows.map(toListing);
  return { total: matched.length, listings: matched.slice(q.offset, q.offset + q.limit) };
}

export async function cityListings(city: City): Promise<Listing[]> {
  const rows = await db.select().from(listings).where(everything(city)).orderBy(asc(listings.priceMonthly)).limit(CITY_CAP);
  return rows.map(toListing);
}

export type CityOverview = {
  city: City;
  activeListings: number;
  lowestMonthlyRent: Money | null;
  medianMonthlyRent: Money | null;
  districts: { name: string; activeListings: number; medianMonthlyRent: Money | null }[];
};

const pln = (amount: number): Money => ({ amount, currency: "PLN" });

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

type Rent = { district: string | null; monthlyPln: number; outlier: boolean };

const overview = (city: City, all: Rent[], lang: Locale): CityOverview => {
  const typical = all.filter((r) => !r.outlier);
  const monthlyPln = typical.map((r) => r.monthlyPln);
  const count = (name: string) => all.filter((r) => r.district === name).length;
  return {
    city,
    activeListings: all.length,
    lowestMonthlyRent: monthlyPln.length ? displayMoney(pln(Math.min(...monthlyPln)), lang) : null,
    medianMonthlyRent: monthlyPln.length ? roundMoney(displayMoney(pln(median(monthlyPln)), lang)) : null,
    districts: DISTRICT_NAMES[city].map((name) => {
      const district = typical.filter((r) => r.district === name).map((r) => r.monthlyPln);
      return {
        name,
        activeListings: count(name),
        medianMonthlyRent: district.length ? roundMoney(displayMoney(pln(median(district)), lang)) : null,
      };
    }),
  };
};

export async function cityOverview(city: City, lang: Locale): Promise<CityOverview> {
  const rows = await db.select().from(listings).where(everything(city)).limit(CITY_CAP);
  const rents = rows.map((r) => ({ district: toListing(r).district, monthlyPln: r.priceMonthly, outlier: r.priceOutlier }));
  return overview(city, rents, lang);
}
