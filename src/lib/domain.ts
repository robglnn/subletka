import DISTRICT_DATA from "@/data/districts.json";
import type { PhotoKey } from "@/lib/photo";

export const LOCALES = ["pl", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pl";
export const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);
export const LOCALE_TAG: Record<Locale, string> = { pl: "pl-PL", en: "en-GB" };

export const CITIES = ["warszawa", "krakow"] as const;
export type City = (typeof CITIES)[number];
export const isCity = (v: string): v is City => (CITIES as readonly string[]).includes(v);

export const PLACE_TYPES = ["whole_place", "private_room", "shared_room"] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

export const PLACE_FILTERS = ["room", "studio", "flat"] as const;
export type PlaceFilter = (typeof PLACE_FILTERS)[number];

export const SORTS = ["best", "cheapest", "newest"] as const;
export type Sort = (typeof SORTS)[number];
export const DEFAULT_SORT: Sort = "best";

export const GENDERS = ["female", "male", "mixed"] as const;
export type Gender = (typeof GENDERS)[number];

export const CURRENCIES = ["PLN", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const PRICE_PERIODS = ["month", "week", "night"] as const;
export type PricePeriod = (typeof PRICE_PERIODS)[number];
export type ShownPeriod = Exclude<PricePeriod, "week">;
export const TERM_KINDS = ["sublet", "mid_term", "flexible"] as const;
export type TermKind = (typeof TERM_KINDS)[number];

export const CANCELLATIONS = ["flexible", "moderate", "strict"] as const;
export type Cancellation = (typeof CANCELLATIONS)[number];
export type Deposit = { kind: "none" } | { kind: "months"; months: number } | { kind: "amount"; amount: number };

export type Contact = { email: string };

export type Price = {
  amount: number;
  currency: Currency;
  period: PricePeriod;
  billsIncluded: boolean | null;
  startingAt: boolean;
};

export type Roommates = {
  count: number | null;
  genders: Gender | null;
  preferredTenantGender: "female" | "male" | null;
};

export type ListingOrigin = "imported" | "native";

export type Listing = {
  id: string;
  origin: ListingOrigin;
  city: City;
  district: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  textLang: string | null;
  price: Price;
  deposit: Deposit | null;
  cancellation: Cancellation | null;
  additionalCosts: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  minStayDays: number | null;
  placeType: PlaceType;
  rooms: number | null;
  areaM2: number | null;
  roommates: Roommates | null;
  furnished: boolean | null;
  petsAllowed: boolean | null;
  photos: PhotoKey[];
  postedAt: Date | null;
  areaBadge: boolean;
  minutesToCentre: number | null;
};

type LatLng = readonly [number, number];
export type District = { name: string; slug: string; center: LatLng };

export const DISTRICTS = DISTRICT_DATA as unknown as Record<City, District[]>;

export const DISTRICT_NAMES = Object.fromEntries(CITIES.map((c) => [c, DISTRICTS[c].map((d) => d.name)])) as Record<City, string[]>;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ł/g, "l")
    .replace(/[\s-]+/g, " ")
    .toLowerCase()
    .trim();

const ALIASES: Record<City, Record<string, string>> = {
  warszawa: { "stary mokotow": "Mokotów", "saska kepa": "Praga-Południe", powisle: "Śródmieście", muranow: "Śródmieście" },
  krakow: { kazimierz: "Stare Miasto", lagiewniki: "Łagiewniki-Borek Fałęcki", "borek falecki": "Łagiewniki-Borek Fałęcki", zablocie: "Podgórze" },
};

export const findDistrict = (city: City, district: string): District | null => {
  const key = fold(district);
  const target = fold(ALIASES[city][key] ?? district);
  return DISTRICTS[city].find((d) => fold(d.name) === target) ?? null;
};

export const districtBySlug = (city: City, slug: string) => DISTRICTS[city].find((d) => d.slug === slug) ?? null;

export const districtCenter = (city: City, district: string | null): LatLng | null =>
  district ? (findDistrict(city, district)?.center ?? null) : null;

const distanceM = ([aLat, aLng]: LatLng, [bLat, bLng]: LatLng) => {
  const dy = (aLat - bLat) * 111_320;
  const dx = (aLng - bLng) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

const NEAREST_MAX_M = 1500;

export const canonicalDistrict = (city: City, district: string | null, lat: number | null, lng: number | null) => {
  if (district) return findDistrict(city, district)?.name ?? district;
  if (lat === null || lng === null) return null;
  const [name, d] = DISTRICTS[city]
    .map((x) => [x.name, distanceM([lat, lng], x.center)] as const)
    .sort((a, b) => a[1] - b[1])[0];
  return d <= NEAREST_MAX_M ? name : null;
};

const WARSAW_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" });

export const warsawDay = (at: Date) => WARSAW_DAY.format(at);

export const isPastDates = (availableTo: string | null, today: string) => availableTo !== null && availableTo < today;

export type Approximate = { center: LatLng; radiusM: number };

export const approximateLocation = (l: Pick<Listing, "city" | "district" | "lat" | "lng">): Approximate | null => {
  if (l.lat !== null && l.lng !== null) return { center: [l.lat, l.lng], radiusM: 450 };
  const d = districtCenter(l.city, l.district);
  return d ? { center: d, radiusM: 900 } : null;
};
