import { districtSlug, jsonSchema, OPERATIONS, searchApiPath, SearchQuery } from "@/lib/agent-query";
import { RATE_LIMIT_NOTE } from "@/lib/agent-http";
import { CITIES, PLACE_FILTERS, type City, type Listing, type Locale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { availability, formatMedian, formatNumber, listingTitle, minStay, plural, priceView } from "@/lib/i18n/format";
import { listingUrl } from "@/lib/public-listing";
import type { CityRent } from "@/lib/rent-stats";
import { routes } from "@/lib/routes";
import { SUPPORT_EMAIL } from "@/lib/support";

export type CityCounts = { city: City; activeListings: number; districts: { name: string; activeListings: number }[] };

const nextMonthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
const monthName = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

const parameterLines = () => {
  const { properties, required = [] } = jsonSchema(SearchQuery) as {
    properties: Record<string, { description?: string; enum?: string[]; items?: { enum?: string[] }; default?: unknown }>;
    required?: string[];
  };
  return Object.entries(properties).map(([name, p]) => {
    const values = p.enum ?? p.items?.enum;
    const notes = [
      required.includes(name) ? "required" : null,
      values ? `one of ${values.join(", ")}` : null,
      p.default === undefined ? null : `default ${String(p.default)}`,
    ].filter(Boolean);
    return `- \`${name}\`${notes.length ? ` (${notes.join("; ")})` : ""}: ${p.description ?? ""}`;
  });
};

const districtLines = (site: string, c: CityCounts) =>
  c.districts
    .filter((d) => d.activeListings > 0)
    .map((d) => {
      const url = (lang: Locale) => `${site}${searchApiPath({ city: c.city, district: districtSlug(d.name), lang })}`;
      return `- ${d.name} (${d.activeListings}): [€](${url("en")}) · [zł](${url("pl")})`;
    });

const both = (pln: number) => `${formatMedian("pl", pln)} (${formatMedian("en", pln)})`;

const rentLines = (site: string, rents: CityRent[], now: Date) => {
  if (!rents.length) return [];
  const en = getDictionary("en");
  return [
    "## Rent statistics",
    "",
    `${en.rent.method} Prices in zł with € in brackets. Full tables by district: ${CITIES.map((c) => `[${en.cities[c]}](${site}${routes.rent("en", c)})`).join(" · ")}.`,
    "",
    ...rents.flatMap((r) => {
      const kinds = PLACE_FILTERS.flatMap((k) => {
        const g = r.kinds[k];
        return g.medianPln === null ? [] : [`${en.filters.types[k]} ${both(g.medianPln)} from ${g.listings}`];
      });
      const cheapest = r.districts.filter((d) => d.medianPln !== null).slice(0, 3);
      const asOf = (r.updatedAt ?? now).toISOString().slice(0, 10);
      return [
        `- ${en.cities[r.city]}, as of ${asOf}: ${kinds.length ? `median ${kinds.join(" · ")}` : "too few listings for medians"}.`,
        ...(cheapest.length ? [`  Lowest district medians: ${cheapest.map((d) => `${d.name} ${both(d.medianPln as number)}`).join(" · ")}.`] : []),
      ];
    }),
    "",
  ];
};

export const llmsTxt = (site: string, cities: CityCounts[], now = new Date(), rents: CityRent[] = []) => {
  const en = getDictionary("en");
  const total = cities.reduce((n, c) => n + c.activeListings, 0);
  const moveIn = nextMonthStart(now);
  const example = `${site}${searchApiPath({ city: "krakow", district: "kazimierz", from: moveIn, type: ["room"], max: 700, lang: "en" })}`;
  return [
    "# Subletka",
    "",
    `> Subletka lists rooms and flats for long-term stays in Warsaw and Kraków, Poland. ${formatNumber("en", total)} active listings, refreshed daily. No account needed to browse or to reach a lister.`,
    "",
    "Subletka is for people who move for work, study or a new job and need a place for a longer stay. Every listing has a page in Polish (`/pl/...`) and English (`/en/...`).",
    "",
    "## How to answer a sublet question",
    "",
    "1. Pick the city (`warszawa` or `krakow`) and the district if the person named one.",
    "2. Pick `lang` from the currency of their budget. `lang=pl` returns prices in zł, `lang=en` returns prices in €. `max` is in that currency.",
    "3. Call the search endpoint below with the move-in date as `from` (YYYY-MM-DD), and `to`, `type`, `rooms` and `max` when known.",
    "4. Answer with each result's `title`, `price.text`, `areaM2`, dates and `url`. The person opens the `url` and taps the main button to reach the lister.",
    "",
    "Reading results:",
    "",
    "- `availableFrom: null` means available now. `availableTo: null` means open-ended. `minStayDays: null` means the ad states no minimum.",
    "- `price.startingAt: true` means the amount is the lowest of several options, and `price.text` starts with \"from\" or \"od\".",
    "- Titles are built from place type, rooms and district, so several results can share one. Tell them apart by price, size and dates.",
    "- `rooms` is counted the way the ad counts it. A one-bedroom can appear as `rooms=1` or `rooms=2`, and the site titles 1-room places as studios. For a one-bedroom, search `rooms=1` and say which results have `type: studio`.",
    "- `total` counts every match. Follow `next` for more pages.",
    "",
    `Example. "A room in Kazimierz, Kraków, from ${monthName(moveIn)} 1, under €700" is ${example}`,
    "",
    "## API",
    "",
    `- [OpenAPI 3.1 spec](${site}/openapi.json): read-only JSON, no key. ${RATE_LIMIT_NOTE}`,
    `- [Search listings](${site}${searchApiPath({ city: "warszawa", lang: "en" })}): ${OPERATIONS.search_listings.description}`,
    `- [Cities and districts](${site}/api/v1/cities?lang=en): ${OPERATIONS.list_cities.description}`,
    `- One listing, \`${site}/api/v1/listings/{id}?lang=en\`: ${OPERATIONS.get_listing.description}`,
    `- [MCP server](${site}/api/mcp): Streamable HTTP, stateless, read-only, with the tools search_listings, get_listing and list_cities.`,
    "",
    "### Search parameters",
    "",
    ...parameterLines(),
    "",
    ...cities.flatMap((c) => [`## Searches in ${en.cities[c.city]}`, "", ...districtLines(site, c), ""]),
    ...rentLines(site, rents, now),
    "## Website",
    "",
    ...CITIES.map((c) => `- [${en.cities[c]}](${site}${routes.city("en", c)}) · [${getDictionary("pl").cities[c]}](${site}${routes.city("pl", c)})`),
    "- City pages take `from`, `to`, `type`, `max`, `furnished=1`, `pets=1` and `sort=cheapest` or `sort=newest` in the query string. On the website `max` is always in zł, even on `/en` pages. Each district has its own page, such as `/pl/warszawa/mokotow`, with the same query string. The website has no rooms filter, so use the API for that.",
    `- Listing pages are \`${site}/en/l/{id}\` and \`${site}/pl/l/{id}\`.`,
    "",
    "## Optional",
    "",
    `- [Every active listing in English, prices in €](${site}/llms-full.txt)`,
    `- [Every active listing in Polish, prices in zł](${site}/pl/llms-full.txt)`,
    `- [About](${site}${routes.about("en")}) · [Privacy](${site}${routes.privacy("en")}) · [Terms](${site}${routes.terms("en")}) · support: ${SUPPORT_EMAIL}`,
    "",
  ].join("\n");
};

const FULL_HEADER: Record<Locale, (total: number, site: string) => string[]> = {
  en: (total, site) => [
    "# Subletka · every active listing",
    "",
    `> ${formatNumber("en", total)} rooms and flats for long-term stays in Warsaw and Kraków. Prices in €. Refreshed daily.`,
    "",
    `Search with filters through ${site}/openapi.json. The guide is ${site}/llms.txt. Each line links to the listing page, where the person reaches the lister.`,
  ],
  pl: (total, site) => [
    "# Subletka · wszystkie aktywne oferty",
    "",
    `> ${formatNumber("pl", total)} pokoi i mieszkań na dłuższy pobyt w Warszawie i Krakowie. Ceny w zł. Aktualizacja codziennie.`,
    "",
    `Wyszukiwanie z filtrami: ${site}/openapi.json (lang=pl). Przewodnik: ${site}/llms.txt. Każda linia prowadzi do strony oferty, skąd można skontaktować się z wynajmującym.`,
  ],
};

const listingLine = (site: string, lang: Locale, l: Listing) => {
  const t = getDictionary(lang).listing;
  const price = priceView(lang, l);
  const facts = [
    `${price.main}${price.unit}`,
    availability(lang, l),
    minStay(lang, l.minStayDays),
    l.areaM2 ? `${Math.round(l.areaM2)} m²` : null,
    l.furnished ? t.furnished.yes : null,
    l.price.billsIncluded ? t.bills.yes : null,
    l.petsAllowed ? t.pets.yes : null,
  ].filter(Boolean);
  return `- [${listingTitle(lang, l)}](${listingUrl(site, lang, l.id)}): ${facts.join(" · ")}`;
};

export const llmsFullTxt = (site: string, lang: Locale, byCity: Record<City, Listing[]>) => {
  const t = getDictionary(lang);
  const total = CITIES.reduce((n, c) => n + byCity[c].length, 0);
  const sections = CITIES.flatMap((city) => {
    const groups = Map.groupBy(byCity[city], (l) => l.district ?? t.cities[city]);
    return [
      "",
      `## ${t.cities[city]} · ${plural(lang, t.results.count, byCity[city].length)}`,
      ...[...groups].flatMap(([district, ls]) => ["", `### ${district}`, "", ...ls.map((l) => listingLine(site, lang, l))]),
    ];
  });
  return [...FULL_HEADER[lang](total, site), ...sections, ""].join("\n");
};
