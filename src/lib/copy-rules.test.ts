import assert from "node:assert/strict";
import { test } from "node:test";
import manifest from "@/app/manifest";
import { POST as mcp } from "@/app/api/mcp/route";
import { ogSvg } from "./brand";
import { copyProblems, findCopyIssues } from "./copy-rules";
import { getDictionary } from "./i18n/dictionaries";
import { priceView } from "./i18n/format";
import { llmsFullTxt, llmsTxt } from "./llms-txt";
import { openApiSpec } from "./openapi";
import { OPERATIONS } from "./agent-query";

const issues = (text: string) => findCopyIssues(text).map((i) => `${i.rule}:${i.match}`);

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return strings(value({ placeType: "whole_place", rooms: 2, place: "Mokotów" }));
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
};

test("declined brand forms are caught, the nominative, the domain and identifiers are not", () => {
  assert.deepEqual(issues("o Subletce, na Subletce, w SUBLETCE"), ["declined-brand:Subletce", "declined-brand:Subletce", "declined-brand:SUBLETCE"]);
  assert.deepEqual(issues("z Subletki, przez Subletkę, z Subletką, Subletko!"), [
    "declined-brand:Subletki",
    "declined-brand:Subletkę",
    "declined-brand:Subletką",
    "declined-brand:Subletko",
  ]);
  assert.deepEqual(issues("Subletkom, Subletkami, o Subletkach, subletkowy"), [
    "declined-brand:Subletkom",
    "declined-brand:Subletkami",
    "declined-brand:Subletkach",
    "declined-brand:subletkowy",
  ]);
  assert.deepEqual(issues("Subletka, subletka.com, support@subletka.com, subletka_session, Subletka's, SUBLETKA"), []);
  assert.deepEqual(issues("<title>O Subletka · Subletka</title><h1>o Subletka</h1>"), []);
  assert.deepEqual(copyProblems("O Subletka · Subletka\no Subletka"), []);
  assert.deepEqual(copyProblems("O Subletce"), ['declines the brand: "O Subletce"']);
});

test("week wording is caught in both languages, weekdays and weekends are not", () => {
  assert.deepEqual(issues("for weeks or months, one week, weekly rent, a fortnight"), [
    "weeks:weeks",
    "weeks:week",
    "weeks:weekly",
    "weeks:fortnight",
  ]);
  assert.deepEqual(issues("na tygodnie, min. 2 tygodni, tydzień, 500 zł/tydz., tygodniowy"), [
    "weeks:tygodnie",
    "weeks:tygodni",
    "weeks:tydzień",
    "weeks:tydz",
    "weeks:tygodniowy",
  ]);
  assert.deepEqual(issues('on a weekday morning, weekend trips, Weekdays, tydzieńko, "period": "week", `week`'), []);
});

test("a weekly price shows as its monthly equivalent", () => {
  const weekly = { price: { amount: 300, currency: "PLN" as const, period: "week" as const, billsIncluded: null, startingAt: false } };
  assert.deepEqual(priceView("pl", weekly), { main: "1\u00a0300 zł", unit: "/mies." });
  assert.deepEqual(priceView("en", weekly), { main: "€305", unit: "/mo" });
  const nightly = { price: { amount: 80, currency: "PLN" as const, period: "night" as const, billsIncluded: null, startingAt: false } };
  assert.deepEqual(priceView("en", nightly).unit, "/night");
});

test("dictionaries and static copy never decline the brand or mention weeks", () => {
  const texts = [...strings(getDictionary("pl")), ...strings(getDictionary("en")), ...strings(manifest()), ogSvg()];
  assert.ok(texts.includes("o nas"));
  assert.equal(getDictionary("pl").meta.aboutTitle, "O Subletka");
  assert.equal(getDictionary("pl").about.title, "o Subletka");
  assert.equal(getDictionary("pl").nav.about, "o nas");
  assert.deepEqual(texts.flatMap(issues), []);
});

const counts = [
  { city: "warszawa" as const, activeListings: 1, districts: [{ name: "Mokotów", activeListings: 1 }] },
  { city: "krakow" as const, activeListings: 0, districts: [] },
];

test("agent-facing documents and the live MCP handshake never decline the brand or mention weeks", async () => {
  const call = (body: object) =>
    mcp(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": "203.0.113.11" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
      }),
    ).then((r) => r.text());
  const init = await call({ method: "initialize", params: { protocolVersion: "2025-06-18" } });
  const tools = await call({ method: "tools/list" });
  assert.match(init, /long-term stays/);
  assert.match(tools, /search_listings/);
  const docs = [
    llmsTxt("https://subletka.com", counts),
    llmsFullTxt("https://subletka.com", "pl", { warszawa: [], krakow: [] }),
    llmsFullTxt("https://subletka.com", "en", { warszawa: [], krakow: [] }),
    JSON.stringify(openApiSpec("https://subletka.com")),
    JSON.stringify(OPERATIONS),
    init,
    tools,
  ];
  assert.deepEqual(docs.flatMap(issues), []);
});
