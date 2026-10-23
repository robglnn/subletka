import assert from "node:assert/strict";
import { test } from "node:test";
import { ROBOTS_RULES } from "@/app/robots";
import { fromSearchParams, OPERATIONS, queryIssues, resolveDistrict, SearchQuery } from "./agent-query";
import { PublicListing } from "./agent-response";
import type { Listing, Locale } from "./domain";
import { findForbidden } from "./forbidden-copy";
import { listingJsonLd, cityJsonLd, rentJsonLd } from "./json-ld";
import { llmsFullTxt, llmsTxt } from "./llms-txt";
import { handleMcp, type McpServer } from "./mcp";
import { openApiSpec } from "./openapi";
import type { PhotoKey } from "./photo";
import { searchPageUrl, toPublicListing } from "./public-listing";
import { cityRent, type RentInput } from "./rent-stats";

const SITE = "https://subletka.com";
const WRONG_CURRENCY: Record<Locale, RegExp> = { pl: /€|\bEUR\b/, en: /zł|\bPLN\b/ };

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: "AbCdEfGhIjKlMnOp",
  origin: "imported",
  city: "warszawa",
  district: "Mokotów",
  lat: 52.19,
  lng: 21.03,
  description: "Jasne mieszkanie, czynsz 500 zł plus media.",
  textLang: "pl",
  price: { amount: 820, currency: "EUR", period: "month", billsIncluded: true, startingAt: false },
  deposit: { kind: "amount", amount: 820 },
  cancellation: null,
  additionalCosts: null,
  availableFrom: "2026-10-20",
  availableTo: null,
  minStayDays: 30,
  placeType: "whole_place",
  rooms: 1,
  areaM2: 38.4,
  roommates: null,
  furnished: true,
  petsAllowed: false,
  photos: ["IcOUAiuq6mQaH9Xbb_6-hN" as PhotoKey],
  postedAt: new Date("2026-10-15T00:00:00Z"),
  areaBadge: true,
  minutesToCentre: 17,
  ...over,
});

const withoutHostText = (value: unknown) => JSON.stringify(value, (k, v) => (k === "description" ? undefined : v));
const forbidden = (text: string) => findForbidden(text).map((h) => `${h.term}: ${h.excerpt}`);

const parse = (query: string) => SearchQuery.safeParse(fromSearchParams(new URLSearchParams(query)));

test("agents can write the search the way a person says it", () => {
  const q = parse("city=warszawa&district=mokotow&from=2026-11-01&rooms=1&max=4000&lang=pl&furnished=1&type=flat,studio");
  assert.ok(q.success);
  assert.deepEqual(
    { ...q.data, district: resolveDistrict(q.data.city, q.data.district!) },
    { city: "warszawa", district: "Mokotów", from: "2026-11-01", rooms: 1, max: 4000, lang: "pl", furnished: true, type: ["flat", "studio"], sort: "best", limit: 20, offset: 0 },
  );
  assert.equal(resolveDistrict("warszawa", "praga-poludnie"), "Praga-Południe");
  assert.equal(resolveDistrict("krakow", "STARE MIASTO"), "Stare Miasto");
});

test("a bad search names each bad parameter so the agent can fix it", () => {
  const q = parse("city=warszawa&district=narnia&price=3&from=2026-13-40");
  assert.ok(!q.success);
  const params = queryIssues(q.error).map((i) => i.param).sort();
  assert.deepEqual(params, ["district", "from", "price"]);
  assert.match(queryIssues(q.error).find((i) => i.param === "district")!.message, /Mokotów/);
});

test("public listings show only the language's currency and carry no lister contact or source", () => {
  for (const lang of ["pl", "en"] as const) {
    const out = toPublicListing(listing(), lang, SITE, true);
    assert.ok(PublicListing.safeParse(out).success);
    assert.doesNotMatch(withoutHostText(out), WRONG_CURRENCY[lang]);
    assert.equal(out.url, `${SITE}/${lang}/l/AbCdEfGhIjKlMnOp`);
    assert.deepEqual(Object.keys(out).filter((k) => /source|contact|email|phone|owner|lat|lng/i.test(k)), []);
  }
  const pl = toPublicListing(listing(), "pl", SITE);
  const en = toPublicListing(listing(), "en", SITE);
  assert.deepEqual([pl.price.currency, pl.price.amount, pl.deposit], ["PLN", 3500, { amount: 3500, currency: "PLN" }]);
  assert.deepEqual([en.price.currency, en.price.amount, en.price.text], ["EUR", 820, "€820/mo"]);
  assert.equal(pl.description, undefined);
  const type = (over: Partial<Listing>) => toPublicListing(listing(over), "en", SITE).type;
  assert.deepEqual([type({}), type({ rooms: 2 }), type({ rooms: null }), type({ placeType: "shared_room", rooms: null })], ["studio", "flat", "flat", "room"]);
});

test("listing JSON-LD is a priced RealEstateListing in the page language's currency, without host text", () => {
  for (const lang of ["pl", "en"] as const) {
    const graph = listingJsonLd(listing(), lang, SITE);
    const types = graph["@graph"].map((n) => n["@type"]);
    assert.deepEqual(types, ["RealEstateListing", "Apartment", "BreadcrumbList", "Organization", "WebSite"]);
    const offer = graph["@graph"][0].offers as { priceCurrency: string; priceSpecification: { unitCode: string } };
    assert.equal(offer.priceCurrency, lang === "pl" ? "PLN" : "EUR");
    assert.equal(offer.priceSpecification.unitCode, "MON");
    assert.doesNotMatch(JSON.stringify(graph), WRONG_CURRENCY[lang]);
    assert.doesNotMatch(JSON.stringify(graph), /czynsz/);
  }
  assert.equal(listingJsonLd(listing({ placeType: "private_room" }), "en", SITE)["@graph"][1]["@type"], "Room");
});

test("city JSON-LD lists the listings and the visible FAQ", () => {
  const graph = cityJsonLd("krakow", "en", SITE, [listing({ city: "krakow", district: "Kazimierz" })], 55);
  const page = graph["@graph"][0] as unknown as { about: { sameAs: string }; mainEntity: { numberOfItems: number; itemListElement: { url: string }[] } };
  assert.equal(page.about.sameAs, "https://www.wikidata.org/wiki/Q31487");
  assert.equal(page.mainEntity.numberOfItems, 55);
  assert.equal(page.mainEntity.itemListElement[0].url, `${SITE}/en/l/AbCdEfGhIjKlMnOp`);
  assert.equal(graph["@graph"][1]["@type"], "FAQPage");
});

const counts = [
  { city: "warszawa" as const, activeListings: 2, districts: [{ name: "Mokotów", activeListings: 2 }, { name: "Wola", activeListings: 0 }] },
  { city: "krakow" as const, activeListings: 1, districts: [{ name: "Stare Miasto", activeListings: 1 }] },
];

test("llms.txt hands agents ready-made district searches in both currencies and documents every parameter", () => {
  const text = llmsTxt(SITE, counts, new Date("2026-10-15T12:00:00Z"));
  assert.ok(text.startsWith("# Subletka\n\n> "));
  assert.match(text, /- Mokotów \(2\): \[€\]\(https:\/\/subletka\.com\/api\/v1\/listings\?city=warszawa&district=mokotow&lang=en\) · \[zł\]\(.*lang=pl\)/);
  assert.doesNotMatch(text, /Wola/);
  for (const param of Object.keys(SearchQuery.shape)) assert.match(text, new RegExp(`- \`${param}\``));
  assert.match(text, /from=2026-11-01/);
  const reading = text.slice(text.indexOf("Reading results"), text.indexOf("## API"));
  for (const field of ["availableFrom", "availableTo", "minStayDays", "price.startingAt", "rooms", "next"]) assert.ok(reading.includes(`\`${field}`), field);
  assert.ok(text.includes("[Privacy](https://subletka.com/en/privacy) · [Terms](https://subletka.com/en/terms)"));
});

const rentRow = (monthlyPln: number, over: Partial<RentInput> = {}): RentInput => ({
  kind: "room",
  district: "Mokotów",
  monthlyPln,
  price: { amount: monthlyPln, currency: "PLN" },
  outlier: false,
  minutes: 18,
  ...over,
});
const RENT_AT = new Date("2026-10-16T05:00:00Z");
const warsawRent = cityRent("warszawa", [rentRow(2000), rentRow(2096), rentRow(2300), rentRow(4000, { kind: "flat", district: "Wola" })], RENT_AT, () => null);
const krakowRent = cityRent("krakow", [], null, () => null);

test("the rent page describes a Dataset with medians in the page language's currency, its method and the date of the last change", () => {
  const graph = rentJsonLd(warsawRent, "en", SITE, new Date("2026-10-17T12:00:00Z"));
  const [page, dataset] = graph["@graph"] as unknown as Record<string, unknown>[];
  assert.equal(page["@type"], "WebPage");
  assert.deepEqual(page.mainEntity, { "@id": `${SITE}/en/warszawa/rent#dataset` });
  assert.equal(dataset["@type"], "Dataset");
  assert.equal(dataset.name, "Rent in Warsaw by district");
  assert.ok((dataset.description as string).length >= 50);
  assert.equal(dataset.temporalCoverage, "2026-10-17");
  assert.equal(dataset.dateModified, RENT_AT.toISOString());
  assert.equal(dataset.isAccessibleForFree, true);
  assert.match(dataset.measurementTechnique as string, /at least 3 listings/);
  assert.deepEqual(dataset.variableMeasured, [
    { "@type": "PropertyValue", name: "median monthly rent: Warsaw", value: 515, unitText: "EUR" },
    { "@type": "PropertyValue", name: "median monthly rent: room", value: 490, unitText: "EUR" },
    { "@type": "PropertyValue", name: "median monthly rent: Mokotów", value: 490, unitText: "EUR" },
  ]);
  assert.ok(!("distribution" in dataset));
  for (const lang of ["pl", "en"] as const) assert.doesNotMatch(JSON.stringify(rentJsonLd(warsawRent, lang, SITE, new Date())), WRONG_CURRENCY[lang]);
  const pl = rentJsonLd(warsawRent, "pl", SITE, new Date())["@graph"][1] as unknown as { variableMeasured: { value: number; unitText: string }[] };
  assert.deepEqual(pl.variableMeasured[0], { "@type": "PropertyValue", name: "mediana miesięcznego czynszu: Warszawa", value: 2200, unitText: "PLN" });
});

test("llms.txt carries rent medians per type and the cheapest districts, in zł and €, with links to the rent pages", () => {
  const text = llmsTxt(SITE, counts, new Date("2026-10-17T12:00:00Z"), [warsawRent, krakowRent]);
  const section = text.slice(text.indexOf("## Rent statistics"), text.indexOf("## Website"));
  assert.match(section, /\[Warsaw\]\(https:\/\/subletka\.com\/en\/warszawa\/rent\) · \[Kraków\]\(https:\/\/subletka\.com\/en\/krakow\/rent\)/);
  assert.ok(section.includes("- Warsaw, as of 2026-10-16: median room 2\u00a0100 zł (€490) from 3."), section);
  assert.ok(section.includes("  Lowest district medians: Mokotów 2\u00a0100 zł (€490)."), section);
  assert.ok(section.includes("- Kraków, as of 2026-10-17: too few listings for medians."), section);
  assert.doesNotMatch(llmsTxt(SITE, counts), /## Rent statistics/);
});

test("llms-full.txt lists every listing in one currency per language", () => {
  const byCity = { warszawa: [listing(), listing({ id: "native-1", district: null })], krakow: [] };
  const pl = llmsFullTxt(SITE, "pl", byCity);
  const en = llmsFullTxt(SITE, "en", byCity);
  assert.doesNotMatch(pl, WRONG_CURRENCY.pl);
  assert.doesNotMatch(en, WRONG_CURRENCY.en);
  assert.match(en, /### Mokotów\n\n- \[studio in Mokotów\]\(https:\/\/subletka\.com\/en\/l\/AbCdEfGhIjKlMnOp\): €820\/mo/);
  assert.match(en, /### Warsaw\n/);
});

test("agent-facing documents never name a source, the owner, or a fee", () => {
  const byCity = { warszawa: [listing()], krakow: [] };
  const docs = [
    llmsTxt(SITE, counts, new Date(), [warsawRent, krakowRent]),
    JSON.stringify(rentJsonLd(warsawRent, "pl", SITE, new Date())),
    JSON.stringify(rentJsonLd(warsawRent, "en", SITE, new Date())),
    llmsFullTxt(SITE, "pl", byCity),
    llmsFullTxt(SITE, "en", byCity),
    JSON.stringify(openApiSpec(SITE)),
    JSON.stringify(listingJsonLd(listing(), "pl", SITE)),
    JSON.stringify(cityJsonLd("warszawa", "en", SITE, [listing()], 1)),
    JSON.stringify(OPERATIONS),
  ];
  assert.deepEqual(docs.flatMap(forbidden), []);
});

test("the OpenAPI spec documents every operation with typed parameters and responses", () => {
  const spec = openApiSpec(SITE);
  assert.deepEqual(Object.keys(spec.paths), ["/api/v1/listings", "/api/v1/listings/{id}", "/api/v1/cities"]);
  const search = spec.paths["/api/v1/listings"].get;
  assert.deepEqual(search.parameters.find((p) => p.name === "type"), {
    name: "type",
    in: "query",
    required: false,
    description: SearchQuery.shape.type.meta()?.description,
    schema: { type: "array", items: { type: "string", enum: ["room", "studio", "flat", "whole"] } },
    style: "form",
    explode: false,
  });
  assert.equal(spec.paths["/api/v1/listings/{id}"].get.parameters[0].in, "path");
  assert.ok(["Listing", "SearchResult", "CitiesResult", "Error", "Money"].every((id) => id in spec.components.schemas));
});

const fakeServer = (calls: unknown[]): McpServer => ({
  name: "subletka",
  title: "Subletka",
  version: "1.0.0",
  instructions: "read-only",
  tools: [
    {
      name: "search_listings",
      title: "Search",
      description: "search",
      inputSchema: { type: "object" },
      call: async (args) => {
        calls.push(args);
        return (args as { city?: string }).city ? { status: 200, body: { total: 0 } } : { status: 400, body: { error: "invalid_query" } };
      },
    },
  ],
});

test("the MCP endpoint speaks stateless JSON-RPC: handshake, read-only tools, tool errors as results", async () => {
  const calls: unknown[] = [];
  const server = fakeServer(calls);
  const init = await handleMcp(server, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.deepEqual((init as { result: { protocolVersion: string } }).result.protocolVersion, "2025-06-18");
  const future = await handleMcp(server, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } });
  assert.equal((future as { result: { protocolVersion: string } }).result.protocolVersion, "2025-11-25");
  assert.equal(await handleMcp(server, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const list = (await handleMcp(server, { jsonrpc: "2.0", id: 3, method: "tools/list" })) as { result: { tools: { annotations: { readOnlyHint: boolean } }[] } };
  assert.equal(list.result.tools[0].annotations.readOnlyHint, true);
  const ok = (await handleMcp(server, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_listings", arguments: { city: "krakow" } } })) as {
    result: { isError: boolean; structuredContent: unknown; content: { text: string }[] };
  };
  assert.deepEqual([ok.result.isError, ok.result.structuredContent, JSON.parse(ok.result.content[0].text)], [false, { total: 0 }, { total: 0 }]);
  const bad = (await handleMcp(server, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "search_listings", arguments: {} } })) as { result: { isError: boolean } };
  assert.equal(bad.result.isError, true);
  assert.deepEqual(calls, [{ city: "krakow" }, {}]);
  const unknown = (await handleMcp(server, { jsonrpc: "2.0", id: 6, method: "resources/list" })) as { error: { code: number } };
  assert.equal(unknown.error.code, -32601);
  assert.deepEqual(await handleMcp(server, "not json"), { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
});

test("robots.txt lets search engines and AI agents reach pages, the API, the MCP endpoint and llms.txt, not private pages", () => {
  const groups = Array.isArray(ROBOTS_RULES) ? ROBOTS_RULES : [ROBOTS_RULES];
  const tokens = groups.flatMap((g) => (Array.isArray(g.userAgent) ? g.userAgent : [g.userAgent ?? ""]));
  for (const bot of ["*", "OAI-SearchBot", "ChatGPT-User", "GPTBot", "Claude-SearchBot", "Claude-User", "ClaudeBot", "PerplexityBot", "Perplexity-User", "meta-externalagent", "meta-externalfetcher", "meta-webindexer", "GrokBot", "xAI-SearchBot", "rednote-websearch-bot", "Bingbot", "Googlebot"]) {
    assert.ok(tokens.includes(bot), `${bot} has a group`);
  }
  for (const g of groups) {
    const allow = [g.allow ?? []].flat();
    const disallow = [g.disallow ?? []].flat();
    assert.ok(["/", "/api/v1/", "/api/mcp", "/llms.txt"].every((p) => allow.includes(p)), "allows the agent surface");
    assert.ok(["/api/", "/*/manage/", "/*/me"].every((p) => disallow.includes(p)), "keeps private pages out");
  }
});

test("a district search sends people to that district's page with the same filters, and a city search to the city page", () => {
  const q = (query: string) => SearchQuery.parse(fromSearchParams(new URLSearchParams(query)));
  assert.equal(searchPageUrl(SITE, q("city=warszawa&district=praga poludnie&lang=en&max=900")), `${SITE}/en/warszawa/praga-poludnie?max=3843`);
  assert.equal(searchPageUrl(SITE, q("city=krakow&lang=pl&sort=cheapest")), `${SITE}/pl/krakow?sort=cheapest`);
  assert.equal(searchPageUrl(SITE, q("city=krakow&lang=pl&type=flat,studio")), `${SITE}/pl/krakow?type=whole`);
  assert.equal(searchPageUrl(SITE, q("city=krakow&lang=pl&type=room")), `${SITE}/pl/krakow?type=room`);
});
