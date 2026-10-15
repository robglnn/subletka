import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { like } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET as contact } from "../app/api/contact/[id]/route";
import { GET as go } from "../app/api/go/[id]/route";
import { runMigrations } from "../instrumentation-node";
import { publicListingId } from "../lib/listing-id";
import { db } from "./index";
import { listings, type ListingInsert } from "./schema";

const url = process.env.DATABASE_URL;
const skip = !url && "needs DATABASE_URL";

const base = {
  status: "active",
  city: "warszawa",
  title: "Room",
  priceAmount: 1,
  priceCurrency: "PLN",
  pricePeriod: "month",
  priceMonthly: 1,
  termKind: "mid_term",
  placeType: "private_room",
  photos: ["https://example.com/a.jpg"],
} satisfies Partial<ListingInsert>;

const IMPORTED = "qa_linkout:1";
const NATIVE = "sub:qalinkout";
const clean = () => db.delete(listings).where(like(listings.id, "%qa%linkout%"));
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const call = (path: string) => new NextRequest(`http://localhost:3000${path}`, { headers: { "x-forwarded-for": "203.0.113.9" } });

before(async () => {
  if (!url) return;
  await runMigrations(url);
  await clean();
  await db.insert(listings).values([
    { ...base, id: IMPORTED, publicId: publicListingId(IMPORTED, "imported"), origin: "imported", source: "qa_linkout", sourceUrl: "https://example.com/ad/1?ref=x" },
    { ...base, id: NATIVE, publicId: NATIVE, origin: "native", contactEmail: "lister@example.com" },
  ]);
});
after(async () => {
  if (url) await clean();
  await db.$client.end();
});

test("the imported call to action is a direct server redirect to the ad that sends no referrer", { skip }, async () => {
  const id = publicListingId(IMPORTED, "imported");
  const res = await go(call(`/api/go/${id}`), params(id));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://example.com/ad/1?ref=x");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(await res.text(), "");

  const unknown = await go(call("/api/go/nope?lang=en"), params("nope"));
  assert.equal(unknown.status, 301);
  assert.equal(unknown.headers.get("location"), "/en");
});

test("the native call to action redirects to an email draft in the page language and can return the address alone", { skip }, async () => {
  const en = await contact(call(`/api/contact/${NATIVE}?lang=en`), params(NATIVE));
  assert.equal(en.status, 302);
  assert.equal(en.headers.get("referrer-policy"), "no-referrer");
  const mail = new URL(en.headers.get("location") ?? "");
  assert.equal(mail.protocol, "mailto:");
  assert.equal(mail.pathname, "lister@example.com");
  assert.match(mail.searchParams.get("subject") ?? "", /^Subletka: /);
  assert.match(mail.searchParams.get("body") ?? "", /^Hi, .*\/en\/l\/sub%3Aqalinkout$/);

  const pl = new URL((await contact(call(`/api/contact/${NATIVE}`), params(NATIVE))).headers.get("location") ?? "");
  assert.match(pl.searchParams.get("body") ?? "", /^Dzień dobry/);

  const json = await contact(call(`/api/contact/${NATIVE}?format=json`), params(NATIVE));
  assert.deepEqual(await json.json(), { email: "lister@example.com" });

  assert.equal((await contact(call(`/api/contact/${IMPORTED}?format=json`), params(IMPORTED))).status, 404);
});
