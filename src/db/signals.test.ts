import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, inArray, like } from "drizzle-orm";
import { runMigrations } from "../instrumentation-node";
import { SearchQuery } from "../lib/agent-query";
import { warsawDay } from "../lib/domain";
import { publicListingId } from "../lib/listing-id";
import { cityOverview, searchListings } from "./agent-search";
import { db } from "./index";
import { cityGlance } from "./listings";
import { listings, staleHolds, type ListingInsert } from "./schema";
import { refreshSignals } from "./signals";
import { visible } from "./visibility";

const url = process.env.DATABASE_URL;
const day = (offset: number) => warsawDay(new Date(Date.now() + offset * 86_400_000));
const DISTRICT = "Wesoła";

const row = (id: string, over: Partial<ListingInsert> = {}): ListingInsert => ({
  id,
  publicId: publicListingId(id, "imported"),
  origin: "imported",
  status: "active",
  source: id.split(":")[0],
  sourceUrl: `https://example.com/${id}`,
  city: "warszawa",
  district: DISTRICT,
  title: "Room",
  priceAmount: 3000,
  priceCurrency: "PLN",
  pricePeriod: "month",
  priceMonthly: 3000,
  termKind: "mid_term",
  placeType: "whole_place",
  areaM2: 40,
  photos: ["https://example.com/a.jpg"],
  ...over,
});

const ROWS = [
  row("qa_sig:calendar", { sourceUpdatedAt: new Date() }),
  row("qa_sig:reviewed", { lastReviewAt: day(-30) }),
  row("qa_sig:silent", { priceAmount: 2000, priceMonthly: 2000 }),
  row("qa_sig:old-review", { lastReviewAt: day(-400) }),
  row("qa_sig:held"),
  row("qa_sig:outlier", { priceAmount: 900, priceMonthly: 900, areaM2: 1, sourceUpdatedAt: new Date() }),
  row("qa_sig:soon", { availableFrom: day(30), sourceUpdatedAt: new Date(), priceAmount: 2500, priceMonthly: 2500 }),
  row("qa_sig:far", { availableFrom: day(200), sourceUpdatedAt: new Date(), priceAmount: 1500, priceMonthly: 1500 }),
  row("qa_sig:old-post", { sourceUpdatedAt: new Date(), postedAt: new Date("2024-06-01T00:00:00Z"), priceAmount: 1000, priceMonthly: 1000 }),
  row("qa_quiet:never-signals"),
];
const IDS = ROWS.map((r) => r.id);

const clean = async () => {
  await db.delete(staleHolds).where(like(staleHolds.listingId, "qa_sig:%"));
  await db.delete(listings).where(inArray(listings.id, IDS));
};
const flags = async () =>
  Object.fromEntries(
    (await db.select({ id: listings.id, outlier: listings.priceOutlier, inactive: listings.inactive }).from(listings).where(inArray(listings.id, IDS))).map(
      (r) => [r.id, [r.outlier, r.inactive]],
    ),
  );
const refresh = () => db.transaction((tx) => refreshSignals(tx));
const order = async (input: Record<string, unknown> = {}) =>
  (await searchListings(SearchQuery.parse({ city: "warszawa", district: "wesola", sort: "cheapest", limit: 50, ...input }))).listings
    .map((l) => l.id)
    .filter((id) => IDS.some((i) => publicListingId(i, "imported") === id));
const pid = (id: string) => publicListingId(`qa_sig:${id}`, "imported");

before(async () => {
  if (!url) return;
  await runMigrations(url);
  await clean();
  await db.insert(listings).values(ROWS);
  await db.insert(staleHolds).values({ listingId: "qa_sig:held", reason: "qa" });
  await refresh();
});
after(async () => {
  if (url) await clean();
  await db.$client.end();
});

test("a listing is inactive only when its source sends calendar updates and it has neither one nor a review in the past year, and a price far above its city's typical rent per m² is an outlier", { skip: !url && "needs DATABASE_URL" }, async () => {
  const f = await flags();
  assert.deepEqual(f["qa_sig:calendar"], [false, false]);
  assert.deepEqual(f["qa_sig:reviewed"], [false, false]);
  assert.deepEqual(f["qa_sig:silent"], [false, true]);
  assert.deepEqual(f["qa_sig:old-review"], [false, true]);
  assert.deepEqual(f["qa_sig:outlier"], [true, false]);
  assert.deepEqual(f["qa_sig:far"], [false, false]);
  assert.deepEqual(f["qa_quiet:never-signals"], [false, false]);
});

test("a held stale listing is hidden only while it stays inactive", { skip: !url && "needs DATABASE_URL" }, async () => {
  const shown = async () => (await db.select({ id: listings.id }).from(listings).where(and(visible(), inArray(listings.id, ["qa_sig:held", "qa_sig:silent"])))).map((r) => r.id).sort();
  assert.deepEqual(await shown(), ["qa_sig:silent"]);
  await db.update(listings).set({ sourceUpdatedAt: new Date() }).where(inArray(listings.id, ["qa_sig:held"]));
  await refresh();
  assert.deepEqual(await shown(), ["qa_sig:held", "qa_sig:silent"]);
  await db.update(listings).set({ sourceUpdatedAt: null }).where(inArray(listings.id, ["qa_sig:held"]));
  await refresh();
  assert.deepEqual(await shown(), ["qa_sig:silent"]);
});

test("demoted listings stay visible but rank after the rest of their availability group, even when cheaper", { skip: !url && "needs DATABASE_URL" }, async () => {
  assert.deepEqual(await order(), [
    publicListingId("qa_quiet:never-signals", "imported"),
    pid("calendar"),
    pid("reviewed"),
    pid("outlier"),
    pid("old-post"),
    pid("silent"),
    pid("old-review"),
    pid("soon"),
    pid("far"),
  ]);
});

test("price outliers are left out of the lowest and median rents but still counted", { skip: !url && "needs DATABASE_URL" }, async () => {
  const overview = await cityOverview("warszawa", "pl");
  const district = overview.districts.find((d) => d.name === DISTRICT);
  assert.equal(district?.activeListings, ROWS.length - 1);
  assert.equal(district?.medianMonthlyRent?.amount, 2750);
  assert.deepEqual((await cityGlance("warszawa")).lowest, { amount: 1000, currency: "PLN" });
  assert.deepEqual(overview.lowestMonthlyRent, { amount: 1000, currency: "PLN" });
});
