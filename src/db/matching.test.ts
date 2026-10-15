import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { inArray, like } from "drizzle-orm";
import { runMigrations } from "../instrumentation-node";
import { SearchQuery } from "../lib/agent-query";
import { publicListingId } from "../lib/listing-id";
import { searchListings } from "./agent-search";
import { db } from "./index";
import { betterNearby, browseWhere, toListing } from "./listings";
import { rankedRows } from "./ranking";
import { refreshMatching } from "./matching";
import { listings, type ListingInsert } from "./schema";

const url = process.env.DATABASE_URL;
const DISTRICT = "Wzgórza Krzesławickie";
const BUILDING = [50.09, 20.07] as const;

const row = (id: string, over: Partial<ListingInsert> = {}): ListingInsert => ({
  id: `qa_match:${id}`,
  publicId: publicListingId(`qa_match:${id}`, "imported"),
  origin: "imported",
  status: "active",
  source: "qa_match",
  sourceUrl: `https://example.com/qa-match/${id}`,
  city: "krakow",
  district: DISTRICT,
  lat: BUILDING[0],
  lng: BUILDING[1],
  title: "Room",
  priceAmount: 2000,
  priceCurrency: "PLN",
  pricePeriod: "month",
  priceMonthly: 2000,
  termKind: "mid_term",
  placeType: "private_room",
  photos: ["https://example.com/a.jpg"],
  ...over,
});

const rich = { description: "x".repeat(400), photos: Array.from({ length: 8 }, (_, i) => `https://example.com/${i}.jpg`) };
const ROWS = [
  ...Array.from({ length: 6 }, (_, i) => row(`same-${i}`, rich)),
  row("other-a", { lat: 50.095, lng: 20.06 }),
  row("other-b", { lat: 50.085, lng: 20.075 }),
  row("other-c", { lat: 50.1, lng: 20.08 }),
  row("plain", { placeType: "whole_place", rooms: 3, priceAmount: 77_000, priceMonthly: 77_000, lat: 50.1, lng: 20.08 }),
  row("nicer", { placeType: "whole_place", rooms: 3, priceAmount: 80_000, priceMonthly: 80_000, district: "Krowodrza", lat: 50.075, lng: 19.92 }),
  row("dearer", { placeType: "whole_place", rooms: 3, priceAmount: 99_000, priceMonthly: 99_000, district: "Krowodrza", lat: 50.075, lng: 19.921 }),
];

const clean = () => db.delete(listings).where(like(listings.id, "qa_match:%"));
const building = (id: string) => (id.includes("same") ? "same" : id);

before(async () => {
  if (!url) return;
  await runMigrations(url);
  await clean();
  await db.insert(listings).values(ROWS);
  await db.transaction((tx) => refreshMatching(tx));
});
after(async () => {
  if (url) await clean();
  await db.$client.end();
});

test("each listing stores its area badge and minutes to the centre from its own spot", { skip: !url && "needs DATABASE_URL" }, async () => {
  const rows = await db
    .select({ id: listings.id, badge: listings.areaBadge, minutes: listings.minutesToCentre, key: listings.buildingKey })
    .from(listings)
    .where(inArray(listings.id, ["qa_match:plain", "qa_match:nicer", "qa_match:same-0", "qa_match:same-1"]));
  const by = Object.fromEntries(rows.map((r) => [r.id.split(":")[1], r]));
  assert.equal(by.plain.badge, false);
  assert.equal(by.nicer.badge, true);
  assert.ok(by.nicer.minutes !== null && by.plain.minutes !== null && by.nicer.minutes < by.plain.minutes);
  assert.equal(by["same-0"].key, by["same-1"].key);
});

test("best fit never shows more than two listings in a row from one building, and leads with the best one", { skip: !url && "needs DATABASE_URL" }, async () => {
  const where = browseWhere({ city: "krakow", district: DISTRICT, type: ["room"], furnished: false, pets: false });
  const page = (await rankedRows(where, {}, "best", 50)).map(toListing);
  const ids = page.map((l) => ROWS.find((r) => r.publicId === l.id)!.id.split(":")[1]);
  assert.equal(ids.length, 9);
  assert.equal(building(ids[0]), "same");
  let run = 1;
  for (let i = 1; i < ids.length; i++) {
    run = building(ids[i]) === building(ids[i - 1]) ? run + 1 : 1;
    assert.ok(run <= 2, ids.join(" "));
  }
  const api = await searchListings(SearchQuery.parse({ city: "krakow", district: "wzgorza krzeslawickie", type: ["room"], limit: 50 }));
  assert.deepEqual(api.listings.map((l) => l.id), page.map((l) => l.id));
});

test("a listing in a weaker area suggests one similar, slightly dearer place in a much better one, and a badge listing suggests nothing", { skip: !url && "needs DATABASE_URL" }, async () => {
  const alt = await betterNearby(publicListingId("qa_match:plain", "imported"));
  assert.equal(alt?.listing.id, publicListingId("qa_match:nicer", "imported"));
  assert.equal(alt?.morePln, 3000);
  assert.equal(await betterNearby(publicListingId("qa_match:nicer", "imported")), null);
});
