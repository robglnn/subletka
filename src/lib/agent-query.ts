import { z } from "zod";
import { CITIES, DEFAULT_SORT, DISTRICT_NAMES, LOCALES, PLACE_FILTERS, SORTS, canonicalDistrict, type City } from "@/lib/domain";

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "not a real date")
  .meta({ format: "date" });

export const ListingId = z.string().regex(/^[A-Za-z0-9_:-]{1,64}$/);

export const LangParam = z
  .enum(LOCALES)
  .default("en")
  .meta({ description: "Response language and currency. pl returns prices in zł (PLN), en returns prices in € (EUR). Use the currency the user's budget is in." });

export const SearchQuery = z
  .object({
    city: z.enum(CITIES).meta({ description: "City slug. warszawa is Warsaw, krakow is Kraków.", example: "warszawa" }),
    district: z
      .string()
      .min(2)
      .max(40)
      .optional()
      .meta({ description: "District name. Accents, case and hyphens are optional, so mokotow, Mokotów and praga poludnie all work. GET /api/v1/cities lists every district.", example: "mokotow" }),
    from: isoDay.optional().meta({ description: "Move-in date, YYYY-MM-DD. Returns places available on or before this day.", example: "2026-11-01" }),
    to: isoDay.optional().meta({ description: "Move-out date, YYYY-MM-DD. Returns places available until at least this day or open-ended.", example: "2027-01-31" }),
    type: z
      .array(z.enum(PLACE_FILTERS))
      .optional()
      .meta({ description: "Place types, comma separated in a URL. room is a private or shared room, studio is a one-room whole place, flat is any other whole place. Each result carries the same type field." }),
    rooms: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .meta({ description: "Minimum number of rooms in a whole place, as the ad counts them. Implies a whole place. Ads count differently. Some count bedrooms, others count every room the Polish way, where a studio is 1 room and a one-bedroom flat is 2. For a one-bedroom, use rooms=1 and say which results have type studio, or rooms=2 to rule studios out.", example: 1 }),
    max: z
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .optional()
      .meta({ description: "Maximum monthly rent in the currency of lang, so max=4000&lang=pl means 4000 zł and max=900&lang=en means €900.", example: 4000 }),
    furnished: z.boolean().optional().meta({ description: "Only furnished places." }),
    pets: z.boolean().optional().meta({ description: "Only places that allow pets." }),
    sort: z.enum(SORTS).default(DEFAULT_SORT).meta({ description: "Listings available by the move-in day (from, or today without from) come first, as on the website. Within each group, best fit first (value for money, area, transit time to the centre, listing quality and freshness, with at most two in a row from one building), cheapest monthly rent first, or newest first." }),
    lang: LangParam,
    limit: z.number().int().min(1).max(50).default(20).meta({ description: "Results per page." }),
    offset: z.number().int().min(0).max(5000).default(0).meta({ description: "Results to skip, for paging." }),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.district && !resolveDistrict(q.city, q.district)) {
      ctx.addIssue({ code: "custom", path: ["district"], message: `unknown district for ${q.city}, use one of ${DISTRICT_NAMES[q.city].join(", ")}` });
    }
    if (q.from && q.to && q.to < q.from) ctx.addIssue({ code: "custom", path: ["to"], message: "to is before from" });
  });

export type SearchQuery = z.infer<typeof SearchQuery>;

export const DetailQuery = z.object({ id: ListingId.meta({ description: "Listing id from a search result." }), lang: LangParam }).strict();
export const CitiesQuery = z.object({ lang: LangParam }).strict();

export const OPERATIONS = {
  search_listings: {
    path: "/api/v1/listings",
    title: "Search sublets",
    description:
      "Search active rooms and flats for long-term stays in Warsaw or Kraków by district, move-in and move-out dates, place type, rooms and maximum monthly rent. Each result links to its Subletka page, where the person can contact the lister.",
    schema: SearchQuery,
  },
  get_listing: {
    path: "/api/v1/listings/{id}",
    title: "Get a sublet",
    description: "Full details of one listing, including its description, all photos and terms.",
    schema: DetailQuery,
  },
  list_cities: {
    path: "/api/v1/cities",
    title: "List cities and districts",
    description: "Cities with active listing counts, lowest and median monthly rent, and every district name accepted by search_listings with its count and median monthly rent.",
    schema: CitiesQuery,
  },
} as const;

export type OperationName = keyof typeof OPERATIONS;

export const dropSafeIntegerBounds = ({ jsonSchema: s }: { jsonSchema: { minimum?: number; maximum?: number } }) => {
  if (s.minimum === Number.MIN_SAFE_INTEGER) delete s.minimum;
  if (s.maximum === Number.MAX_SAFE_INTEGER) delete s.maximum;
};

export const jsonSchema = (schema: z.ZodType) => {
  const out: Record<string, unknown> = z.toJSONSchema(schema, { io: "input", override: dropSafeIntegerBounds });
  delete out.$schema;
  return out;
};

export const resolveDistrict = (city: City, district: string) => {
  const name = canonicalDistrict(city, district, null, null);
  return name && DISTRICT_NAMES[city].includes(name) ? name : null;
};

export const districtSlug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[\s-]+/g, "-");

const asNumber = (v: string) => (/^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v);
const asBoolean = (v: string) => (["1", "true", "yes"].includes(v) ? true : ["0", "false", "no"].includes(v) ? false : v);
const asList = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

const FROM_URL: Partial<Record<keyof SearchQuery, (v: string) => unknown>> = {
  type: asList,
  rooms: asNumber,
  max: asNumber,
  limit: asNumber,
  offset: asNumber,
  furnished: asBoolean,
  pets: asBoolean,
};

export const fromSearchParams = (params: URLSearchParams): Record<string, unknown> =>
  Object.fromEntries(
    [...params.keys()].map((key) => {
      const value = params.get(key) ?? "";
      const coerce = FROM_URL[key as keyof SearchQuery];
      return [key, coerce ? coerce(value) : value];
    }),
  );

export const searchApiPath = (q: Partial<SearchQuery>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === false || (Array.isArray(value) && !value.length)) continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return `/api/v1/listings?${params}`;
};

export type QueryIssue = { param: string; message: string };

export const queryIssues = (error: z.ZodError): QueryIssue[] =>
  error.issues.map((i) => ({
    param: i.path.join(".") || (i.code === "unrecognized_keys" ? i.keys.join(", ") : ""),
    message: i.message,
  }));
