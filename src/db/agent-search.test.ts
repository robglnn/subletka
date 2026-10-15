import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { like } from "drizzle-orm";
import { runMigrations } from "../instrumentation-node";
import { SearchQuery } from "../lib/agent-query";
import { warsawDay } from "../lib/domain";
import { publicListingId } from "../lib/listing-id";
import { cityOverview, searchListings } from "./agent-search";
import { db } from "./index";
import { cityGlance } from "./listings";
import { listings, type ListingInsert } from "./schema";

const url = process.env.DATABASE_URL;
const CITY = "krakow" as const;
const DISTRICT = "Swoszowice";
const RANKED = "Łagiewniki-Borek Fałęcki";
const day = (offset: number) => warsawDay(new Date(Date.now() + offset * 86_400_000));

const row = (id: string, over: Partial<ListingInsert>): ListingInsert => ({
  id: `qa_agent:${id}`,
  publicId: publicListingId(`qa_agent:${id}`, "imported"),
  origin: "imported",
  status: "active",
  source: "qa_agent",
  sourceUrl: `https://example.com/qa-agent/${id}`,
  city: CITY,
  district: DISTRICT,
  title: "Room",
  priceAmount: 3000,
  priceCurrency: "PLN",
  pricePeriod: "month",
  priceMonthly: 3000,
  termKind: "mid_term",
  placeType: "whole_place",
  rooms: 1,
  photos: ["https://example.com/a.jpg"],
  ...over,
});

const ROWS = [
  row("match", { availableFrom: null, priceAmount: 2900, priceMonthly: 2900 }),
  row("too-late", { availableFrom: "2026-12-01" }),
  row("too-dear", { priceAmount: 4500, priceMonthly: 4500 }),
  row("eur", { priceAmount: 900, priceCurrency: "EUR", priceMonthly: 3843 }),
  row("room", { placeType: "private_room", rooms: null, priceAmount: 2800, priceMonthly: 2800 }),
  row("elsewhere", { district: "Stare Miasto" }),
  row("gone", { status: "removed" }),
  row("rank-later-cheap", { district: RANKED, availableFrom: day(30), priceAmount: 1000, priceMonthly: 1000 }),
  row("rank-now-dear", { district: RANKED, availableFrom: day(-3), priceAmount: 5000, priceMonthly: 5000 }),
  row("rank-open", { district: RANKED, availableFrom: null, priceAmount: 4000, priceMonthly: 4000 }),
];

const clean = () => db.delete(listings).where(like(listings.id, "qa_agent:%"));
const q = (input: Record<string, unknown>) => SearchQuery.parse({ city: CITY, district: "swoszowice", ...input });
const ids = (r: Awaited<ReturnType<typeof searchListings>>) => r.listings.map((l) => l.id).sort();
const pid = (id: string) => publicListingId(`qa_agent:${id}`, "imported");

before(async () => {
  if (!url) return;
  await runMigrations(url);
  await clean();
  await db.insert(listings).values(ROWS);
});
after(async () => {
  if (url) await clean();
  await db.$client.end();
});

test("search filters by district, move-in date, rooms and a max in the language's currency", { skip: !url && "needs DATABASE_URL" }, async () => {
  const pl = await searchListings(q({ from: "2026-11-01", rooms: 1, max: 4000, lang: "pl" }));
  assert.deepEqual(ids(pl), [pid("eur"), pid("match")].sort());
  const en = await searchListings(q({ from: "2026-11-01", rooms: 1, max: 900, lang: "en" }));
  assert.deepEqual(ids(en), [pid("eur"), pid("match")].sort());
  const tight = await searchListings(q({ from: "2026-11-01", rooms: 1, max: 850, lang: "en" }));
  assert.deepEqual(ids(tight), [pid("match")]);
});

test("search pages through results and reports the full total", { skip: !url && "needs DATABASE_URL" }, async () => {
  const first = await searchListings(q({ limit: 2, sort: "cheapest" }));
  const rest = await searchListings(q({ limit: 10, offset: 2, sort: "cheapest" }));
  assert.equal(first.total, 5);
  assert.equal(first.listings.length, 2);
  assert.equal(new Set([...ids(first), ...ids(rest)]).size, 5);
  assert.deepEqual(first.listings.map((l) => l.id), [pid("room"), pid("match")]);
});

test("listings available by the move-in day, today when no dates are searched, rank ahead of cheaper ones that open later", { skip: !url && "needs DATABASE_URL" }, async () => {
  const order = async (input: Record<string, unknown>) =>
    (await searchListings(q({ district: "borek falecki", sort: "cheapest", ...input }))).listings.map((l) => l.id);
  assert.deepEqual(await order({}), [pid("rank-open"), pid("rank-now-dear"), pid("rank-later-cheap")]);
  assert.deepEqual(await order({ from: day(30) }), [pid("rank-later-cheap"), pid("rank-open"), pid("rank-now-dear")]);
});

test("city rent statistics are medians, so a few extreme rents barely move them", { skip: !url && "needs DATABASE_URL" }, async () => {
  const extreme = ["a", "b", "c"].map((k) => row(`extreme-${k}`, { district: "Nowa Huta", priceAmount: 1_000_000, priceMonthly: 1_000_000 }));
  await db.insert(listings).values(extreme);
  const glance = await cityGlance(CITY);
  const overview = await cityOverview(CITY, "pl");
  assert.ok(glance.medianPln !== null && glance.medianPln < 20_000, `city page median ${glance.medianPln}`);
  assert.equal(overview.medianMonthlyRent?.currency, "PLN");
  const api = overview.medianMonthlyRent?.amount ?? Infinity;
  assert.ok(api < 20_000, `api median ${api}`);
  assert.equal(overview.districts.find((d) => d.name === RANKED)?.medianMonthlyRent?.amount, 4000);
});

test("city overview counts active listings per canonical district", { skip: !url && "needs DATABASE_URL" }, async () => {
  const o = await cityOverview(CITY, "pl");
  const district = o.districts.find((d) => d.name === DISTRICT);
  assert.ok((district?.activeListings ?? 0) >= 5);
  assert.equal(district?.medianMonthlyRent?.currency, "PLN");
  assert.equal(o.lowestMonthlyRent?.currency, "PLN");
  const en = await cityOverview(CITY, "en");
  assert.equal(en.districts.find((d) => d.name === DISTRICT)?.medianMonthlyRent?.currency, "EUR");
});
