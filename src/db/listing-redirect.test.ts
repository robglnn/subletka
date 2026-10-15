import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { like } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET as contact } from "../app/api/contact/[id]/route";
import { GET as go } from "../app/api/go/[id]/route";
import { runMigrations } from "../instrumentation-node";
import { publicListingId } from "../lib/listing-id";
import { awayFromListing, listingRedirect } from "../lib/listing-redirect";
import { proxy } from "../proxy";
import { db } from "./index";
import { listings, staleHolds, type ListingInsert } from "./schema";

const url = process.env.DATABASE_URL;
const skip = !url && "needs DATABASE_URL";

const imported = (key: string, over: Partial<ListingInsert> = {}): ListingInsert => ({
  id: `qa_gone:${key}`,
  publicId: publicListingId(`qa_gone:${key}`, "imported"),
  origin: "imported",
  status: "active",
  source: "qa_gone",
  sourceUrl: `https://example.com/qa-gone/${key}`,
  city: "krakow",
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

const native = (key: string, over: Partial<ListingInsert> = {}): ListingInsert => ({
  ...imported(key, over),
  id: `sub:qagone${key}`,
  publicId: `sub:qagone${key}`,
  origin: "native",
  source: "subletka",
  sourceUrl: null,
  city: "warszawa",
  contactEmail: "lister@example.com",
  ...over,
});

const ROWS = [
  imported("live", { city: "warszawa" }),
  imported("removed", { status: "removed" }),
  imported("stale", { inactive: true }),
  imported("past", { availableTo: "2020-01-31" }),
  imported("bare", { photos: [] }),
  native("live"),
  native("removed", { status: "removed" }),
];
const pub = (key: string) => publicListingId(`qa_gone:${key}`, "imported");

const clean = async () => {
  await db.delete(staleHolds).where(like(staleHolds.listingId, "qa_gone:%"));
  await db.delete(listings).where(like(listings.id, "%qa%gone%"));
};

before(async () => {
  if (!url) return;
  await runMigrations(url);
  await clean();
  await db.insert(listings).values(ROWS);
  await db.insert(staleHolds).values({ listingId: "qa_gone:stale", reason: "qa" });
});
after(async () => {
  if (url) await clean();
  await db.$client.end();
});

const page = async (path: string) => {
  const res = await proxy(new NextRequest(`http://localhost:3000${path}`, { headers: { host: "localhost:3000" } }));
  if (res.headers.get("x-middleware-next") === "1") return "served";
  const location = res.headers.get("location") ?? "";
  return `${res.status} ${location.replace("http://localhost:3000", "")}`;
};

type Handler = (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

const api = async (handler: Handler, path: string, id: string) => {
  const res = await handler(new NextRequest(`http://localhost:3000${path}`, { headers: { "x-forwarded-for": "203.0.113.7" } }), {
    params: Promise.resolve({ id: encodeURIComponent(id) }),
  });
  return `${res.status} ${res.headers.get("location") ?? ""}`.trim();
};

test("a removed or unknown city falls back to the language home", () => {
  assert.deepEqual(awayFromListing("en", { state: "removed", id: "x", city: "gdansk" }), { status: 301, location: "/en" });
  assert.deepEqual(awayFromListing("pl", { state: "hidden", id: "x", city: "gdansk" }), { status: 302, location: "/pl" });
  assert.equal(listingRedirect("pl", "x", { state: "visible", id: "x", city: "gdansk" }), null);
});

test("a live listing is served and its legacy ids move to it in one hop", { skip }, async () => {
  assert.equal(await page(`/pl/l/${pub("live")}`), "served");
  assert.equal(await page("/pl/l/sub%3Aqagonelive"), "served");
  assert.equal(await page(`/en/l/${encodeURIComponent("qa_gone:live")}`), `301 /en/l/${pub("live")}`);
  assert.equal(await page(`/pl/l/${Buffer.from("qa_gone:live").toString("base64url")}`), `301 /pl/l/${pub("live")}`);
});

test("removed listings move permanently to their city page in the same language", { skip }, async () => {
  assert.equal(await page(`/pl/l/${pub("removed")}`), "301 /pl/krakow");
  assert.equal(await page(`/en/l/${pub("removed")}`), "301 /en/krakow");
  assert.equal(await page("/en/l/sub%3Aqagoneremoved"), "301 /en/warszawa");
  assert.equal(await page(`/pl/l/${encodeURIComponent("qa_gone:removed")}`), "301 /pl/krakow");
  assert.equal(await page(`/en/l/${Buffer.from("qa_gone:removed").toString("base64url")}`), "301 /en/krakow");
});

test("hidden listings that can come back move temporarily to their city page", { skip }, async () => {
  assert.equal(await page(`/pl/l/${pub("stale")}`), "302 /pl/krakow");
  assert.equal(await page(`/en/l/${pub("past")}`), "302 /en/krakow");
  assert.equal(await page(`/pl/l/${pub("bare")}`), "302 /pl/krakow");
  assert.equal(await page(`/en/l/${Buffer.from("qa_gone:stale").toString("base64url")}`), "302 /en/krakow");
});

test("made-up and malformed ids move permanently to the language home", { skip }, async () => {
  assert.equal(await page("/pl/l/AAAAAAAAAAAAAAAA"), "301 /pl");
  assert.equal(await page("/en/l/nope:does-not-exist"), "301 /en");
  assert.equal(await page("/en/l/%E0%A4%A"), "301 /en");
  assert.equal(await page("/pl/audit-no-such-page"), "served");
});

test("the outbound link never reaches the ad of a removed or hidden listing", { skip }, async () => {
  assert.equal(await api(go, `/api/go/${pub("live")}`, pub("live")), "302 https://example.com/qa-gone/live");
  assert.equal(await api(go, `/api/go/${pub("removed")}?lang=en`, pub("removed")), "301 /en/krakow");
  assert.equal(await api(go, `/api/go/${pub("stale")}?lang=pl`, pub("stale")), "302 /pl/krakow");
  assert.equal(await api(go, "/api/go/AAAAAAAAAAAAAAAA?lang=en", "AAAAAAAAAAAAAAAA"), "301 /en");
  assert.equal(await api(go, "/api/go/sub%3Aqagonelive", "sub:qagonelive"), "302 /pl/l/sub%3Aqagonelive");
});

test("the lister contact link of a removed or hidden listing goes to the city page", { skip }, async () => {
  assert.match(await api(contact, "/api/contact/sub%3Aqagonelive?lang=en", "sub:qagonelive"), /^302 mailto:lister@example\.com\?/);
  assert.equal(await api(contact, "/api/contact/sub%3Aqagoneremoved?lang=en", "sub:qagoneremoved"), "301 /en/warszawa");
  assert.equal(await api(contact, "/api/contact/sub%3Aqagoneremoved?lang=en&format=json", "sub:qagoneremoved"), "404");
  assert.equal(await api(contact, `/api/contact/${pub("live")}?lang=pl`, pub("live")), `302 /pl/l/${pub("live")}`);
  assert.equal(await api(contact, "/api/contact/nope?lang=pl", "nope"), "301 /pl");
});
