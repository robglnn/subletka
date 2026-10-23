import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { like } from "drizzle-orm";
import { runMigrations } from "../instrumentation-node";
import { KIND_FILTERS } from "../lib/domain";
import { publicListingId } from "../lib/listing-id";
import { Filters } from "../lib/search-params";
import { browseCount, browseWhere, PAGE_SIZE } from "./listings";
import { rankedRows } from "./ranking";
import { db } from "./index";
import { listings, type ListingInsert } from "./schema";

const url = process.env.DATABASE_URL;
const CITY = "krakow" as const;

const row = (id: string, over: Partial<ListingInsert>): ListingInsert => ({
  id: `qa_kind:${id}`,
  publicId: publicListingId(`qa_kind:${id}`, "imported"),
  origin: "imported",
  status: "active",
  source: "qa_kind",
  sourceUrl: `https://example.com/qa-kind/${id}`,
  city: CITY,
  title: "Room",
  priceAmount: 2000,
  priceCurrency: "PLN",
  pricePeriod: "month",
  priceMonthly: 2000,
  termKind: "mid_term",
  placeType: "whole_place",
  photos: ["https://example.com/qa-kind.jpg"],
  ...over,
});

const ROWS = [
  row("private", { placeType: "private_room" }),
  row("shared", { placeType: "shared_room" }),
  row("studio", { rooms: 1 }),
  row("flat", { rooms: 3 }),
  row("unknown-rooms", { rooms: null }),
];

const clean = () => db.delete(listings).where(like(listings.id, "qa_kind:%"));
const count = (type: Filters["type"]) => browseCount({ city: CITY, type, furnished: false, pets: false });

before(async () => {
  if (!url) return;
  await runMigrations(url);
  await clean();
});
after(async () => {
  if (url) await clean();
  await db.$client.end();
});

test("room and whole place split every listing in two, and a whole place without a room count is a whole place", { skip: !url && "needs DATABASE_URL" }, async () => {
  const baseline = { any: await count(KIND_FILTERS.any), room: await count(KIND_FILTERS.room), whole: await count(KIND_FILTERS.whole) };
  await db.insert(listings).values(ROWS);

  assert.equal(await count(KIND_FILTERS.any), baseline.any + 5);
  assert.equal(await count(KIND_FILTERS.room), baseline.room + 2);
  assert.equal(await count(KIND_FILTERS.whole), baseline.whole + 3);
  assert.equal((await count(KIND_FILTERS.room)) + (await count(KIND_FILTERS.whole)), await count(KIND_FILTERS.any));
});

test("a type=whole URL filters the listings, total and pages the same way as the count", { skip: !url && "needs DATABASE_URL" }, async () => {
  const page = async (type: string) => {
    const f = Filters.parse({ type });
    const q = { ...f, city: CITY };
    return { rows: await rankedRows(browseWhere(q), q, f.sort, PAGE_SIZE * f.page), total: await browseCount(q) };
  };
  const whole = await page("whole");
  assert.equal(whole.total, await count(KIND_FILTERS.whole));
  assert.equal(whole.rows.length, Math.min(whole.total, PAGE_SIZE));
  assert.ok(whole.rows.every((r) => r.placeType === "whole_place"));
  assert.ok((await page("room")).rows.every((r) => r.placeType !== "whole_place"));
});
