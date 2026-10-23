import { z } from "zod";
import { CITIES, CURRENCIES, GENDERS, PLACE_FILTERS, PLACE_TYPES, PRICE_PERIODS } from "@/lib/domain";

const Money = z.object({ amount: z.number().int(), currency: z.enum(CURRENCIES) }).meta({ id: "Money" });

export const PublicListing = z
  .object({
    id: z.string(),
    url: z.url().meta({ description: "Subletka page for this listing. Send the person here; the main button reaches the lister." }),
    title: z.string().meta({ description: "Built from place type, rooms and district in the response language, so several results can share a title. Tell them apart by price, areaM2 and dates." }),
    city: z.enum(CITIES),
    cityName: z.string(),
    district: z.string().nullable(),
    placeType: z.enum(PLACE_TYPES),
    type: z.enum(PLACE_FILTERS).meta({ description: "Matches the type search parameter, where whole covers studio and flat. room is a private or shared room, studio is a one-room whole place, flat is any other whole place." }),
    rooms: z.number().int().nullable().meta({ description: "Rooms in a whole place as the lister counted them. Null for rooms in shared places." }),
    areaM2: z.number().int().nullable(),
    price: Money.extend({
      period: z.enum(PRICE_PERIODS),
      startingAt: z.boolean().meta({ description: "True when the amount is the lowest of several options. price.text then starts with from or od." }),
      billsIncluded: z.boolean().nullable(),
      text: z.string().meta({ description: "Price as Subletka shows it, for example 2 400 zł/mies. or €560/mo." }),
    }),
    monthlyRent: Money.meta({ description: "Rent per month in the response currency, used by max and sort=cheapest." }),
    deposit: Money.nullable(),
    availableFrom: z.string().nullable().meta({ description: "YYYY-MM-DD. Null means available now." }),
    availableTo: z.string().nullable().meta({ description: "YYYY-MM-DD. Null means open-ended." }),
    minStayDays: z.number().int().nullable().meta({ description: "Shortest stay the lister accepts, in days. Null means not stated." }),
    furnished: z.boolean().nullable(),
    petsAllowed: z.boolean().nullable(),
    roommates: z
      .object({
        count: z.number().int().nullable(),
        genders: z.enum(GENDERS).nullable(),
        preferredTenantGender: z.enum(["female", "male"]).nullable(),
      })
      .nullable(),
    photos: z.array(z.url()),
    postedAt: z.string().nullable(),
    minutesToCentre: z.number().int().nullable().meta({ description: "Typical public transport time to the city centre on a weekday morning, walking included. Null when not known." }),
    description: z.string().optional().meta({ description: "Lister's own text as written. Detail endpoint only." }),
    descriptionLang: z.string().nullable().optional(),
  })
  .meta({ id: "Listing" });
export type PublicListing = z.infer<typeof PublicListing>;

export const SearchResult = z
  .object({
    query: z.record(z.string(), z.unknown()).meta({ description: "The query as understood, with the district name normalised." }),
    currency: z.enum(CURRENCIES),
    total: z.number().int(),
    count: z.number().int(),
    next: z.url().nullable().meta({ description: "Next page of results, or null." }),
    searchPage: z.url().meta({ description: "The same search on the Subletka website, for people: the district page when a district is given, otherwise the city page. The website has no rooms filter, so this page leaves rooms out." }),
    results: z.array(PublicListing),
  })
  .meta({ id: "SearchResult" });
export type SearchResult = z.infer<typeof SearchResult>;

export const CitiesResult = z
  .object({
    currency: z.enum(CURRENCIES),
    cities: z.array(
      z.object({
        city: z.enum(CITIES),
        name: z.string(),
        url: z.url(),
        search: z.url(),
        activeListings: z.number().int(),
        lowestMonthlyRent: Money.nullable(),
        medianMonthlyRent: Money.nullable().meta({ description: "Median monthly rent of active listings in the city." }),
        districts: z.array(
          z.object({
            name: z.string(),
            activeListings: z.number().int(),
            medianMonthlyRent: Money.nullable().meta({ description: "Median monthly rent of active listings in the district." }),
          }),
        ),
      }),
    ),
  })
  .meta({ id: "CitiesResult" });
export type CitiesResult = z.infer<typeof CitiesResult>;

export const ApiError = z
  .object({
    error: z.enum(["invalid_query", "not_found", "rate_limited"]),
    message: z.string().optional(),
    issues: z.array(z.object({ param: z.string(), message: z.string() })).optional(),
    docs: z.url().optional(),
  })
  .meta({ id: "Error" });
