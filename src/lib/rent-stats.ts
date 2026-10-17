import { DISTRICTS, PLACE_FILTERS, type City, type PlaceFilter } from "@/lib/domain";
import type { Money } from "@/lib/money";

export const MEDIAN_MIN_LISTINGS = 3;

export type RentInput = { kind: PlaceFilter; district: string | null; monthlyPln: number; price: Money; outlier: boolean; minutes: number | null };
export type RentGroup = { listings: number; medianPln: number | null; lowest: Money | null };
export type DistrictRent = RentGroup & { name: string; slug: string; minutes: number | null };
export type CityRent = { city: City; all: RentGroup; kinds: Record<PlaceFilter, RentGroup>; districts: DistrictRent[]; updatedAt: Date | null };

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const group = (rows: RentInput[]): RentGroup => {
  const typical = rows.filter((r) => !r.outlier).sort((a, b) => a.monthlyPln - b.monthlyPln);
  return {
    listings: rows.length,
    medianPln: typical.length >= MEDIAN_MIN_LISTINGS ? median(typical.map((r) => r.monthlyPln)) : null,
    lowest: typical[0]?.price ?? null,
  };
};

const byMedian = (a: DistrictRent, b: DistrictRent) =>
  (a.medianPln ?? Infinity) - (b.medianPln ?? Infinity) || b.listings - a.listings || a.name.localeCompare(b.name, "pl");

export const cityRent = (city: City, rows: RentInput[], updatedAt: Date | null, fallbackMinutes: (slug: string) => number | null): CityRent => ({
  city,
  all: group(rows),
  kinds: Object.fromEntries(PLACE_FILTERS.map((k) => [k, group(rows.filter((r) => r.kind === k))])) as Record<PlaceFilter, RentGroup>,
  districts: DISTRICTS[city]
    .map((d): DistrictRent => {
      const here = rows.filter((r) => r.district === d.name);
      const minutes = here.flatMap((r) => (r.minutes === null ? [] : [r.minutes]));
      return { name: d.name, slug: d.slug, ...group(here), minutes: minutes.length ? median(minutes) : fallbackMinutes(d.slug) };
    })
    .sort(byMedian),
  updatedAt,
});
