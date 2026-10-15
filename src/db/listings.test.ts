import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { like } from "drizzle-orm";
import { runMigrations } from "../instrumentation-node";
import { warsawDay } from "../lib/domain";
import { publicListingId } from "../lib/listing-id";
import { browseCount, cityGlance, getContactDraft, getOriginalUrl } from "./listings";
import { isActivePhoto, photoKey } from "./photo-source";
import { db } from "./index";
import { listings, type ListingInsert } from "./schema";

const url = process.env.DATABASE_URL;

const row = (id: string, origin: "imported" | "native", photos: string[], availableTo: string | null = null): ListingInsert => ({
  id,
  publicId: publicListingId(id, origin),
  origin,
  status: "active",
  source: origin === "imported" ? "qa_photos" : null,
  sourceUrl: origin === "imported" ? `https://example.com/${id}` : null,
  city: "krakow",
  title: "Room",
  priceAmount: 1,
  priceCurrency: "PLN",
  pricePeriod: "month",
  priceMonthly: 1,
  termKind: "mid_term",
  placeType: "private_room",
  photos,
  availableTo,
  contactEmail: origin === "native" ? "lister@example.com" : null,
});

const today = warsawDay(new Date());
const yesterday = warsawDay(new Date(Date.now() - 86_400_000));

const ROWS = [
  row("qa_photos:with", "imported", ["https://example.com/a.jpg"]),
  row("qa_photos:none", "imported", []),
  row("sub:qaphotonone", "native", []),
];
const DATED = [
  row("sub:qaphotoendstoday", "native", ["https://example.com/c.jpg"], today),
  row("sub:qaphotoended", "native", [], yesterday),
  row("qa_photos:ended", "imported", ["https://example.com/b.jpg"], yesterday),
];
const clean = () => db.delete(listings).where(like(listings.id, "%qa%photo%"));
const query = { city: "krakow" as const, type: [], furnished: false, pets: false };

before(async () => {
  if (!url) return;
  await runMigrations(url);
  await clean();
});
after(async () => {
  if (url) await clean();
  await db.$client.end();
});

test("imported listings without photos are left out of counts and city stats, native ones are not", { skip: !url && "needs DATABASE_URL" }, async () => {
  const baseline = { count: await browseCount(query), glance: (await cityGlance("krakow")).total };
  await db.insert(listings).values(ROWS);

  assert.equal(await browseCount(query), baseline.count + 2);
  assert.equal((await cityGlance("krakow")).total, baseline.glance + 2);
});

test("a listing stays up through its last available day in Warsaw and is hidden everywhere the day after", { skip: !url && "needs DATABASE_URL" }, async () => {
  const baseline = { count: await browseCount(query), glance: (await cityGlance("krakow")).total };
  await db.insert(listings).values(DATED);

  assert.equal(await browseCount(query), baseline.count + 1);
  assert.equal((await cityGlance("krakow")).total, baseline.glance + 1);
  assert.equal((await getContactDraft("sub:qaphotoendstoday"))?.email, "lister@example.com");
  assert.equal(await getContactDraft("sub:qaphotoended"), null);
  assert.equal(await getOriginalUrl(publicListingId("qa_photos:ended", "imported")), null);
  assert.equal(await isActivePhoto(photoKey("https://example.com/c.jpg")), true);
  assert.equal(await isActivePhoto(photoKey("https://example.com/b.jpg")), false);
});
