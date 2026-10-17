import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { runMigrations } from "../instrumentation-node";
import { warsawDay } from "../lib/domain";
import { parseIngest } from "../lib/ingest-contract";
import { publicListingId } from "../lib/listing-id";
import { db } from "./index";
import { POST } from "../app/api/ingest/route";
import { applyIngest } from "./ingest";
import { excludedPhotos, listings } from "./schema";
import { visible } from "./visibility";

const SOURCES = ["qa_kept", "qa_pruned"];

const listing = (source: string, n: number) => ({
  id: `${source}:${n}`,
  source,
  sourceId: String(n),
  sourceUrl: `https://example.com/${source}/${n}`,
  sourceName: "Example",
  city: "warszawa",
  title: "Room",
  price: { amount: 2000, currency: "PLN", period: "month", startingAt: true },
  termKind: "mid_term",
  placeType: "private_room",
  photos: ["https://example.com/a.jpg"],
  fetchedAt: "2026-10-14T03:00:00Z",
});

type Pushed = ReturnType<typeof listing> & { availableFrom?: string; sourceUpdatedAt?: string; lastReviewAt?: string; updatedAt?: string };
const push = (items: Pushed[], activeSourceUrls: Record<string, string[]>) => applyIngest(parseIngest({ listings: items, activeSourceUrls })!);
const counts = (r: Awaited<ReturnType<typeof push>>) => ({ upserted: r.upserted, removed: r.removed });
const pid = (id: string) => publicListingId(id, "imported");
const stamp = async (id: string) => (await db.select({ at: listings.updatedAt }).from(listings).where(inArray(listings.id, [id])))[0].at.getTime();
const day = (offset: number) => warsawDay(new Date(Date.now() + offset * 86_400_000));

const statuses = async () =>
  Object.fromEntries(
    (await db.select({ id: listings.id, status: listings.status }).from(listings).where(inArray(listings.source, SOURCES))).map(
      (r) => [r.id, r.status],
    ),
  );

const url = process.env.DATABASE_URL;
const clean = () => db.delete(listings).where(inArray(listings.source, SOURCES));

before(async () => {
  if (!url) return;
  await runMigrations(url);
  await clean();
});
after(async () => {
  if (url) await clean();
  await db.$client.end();
});

test("a push prunes only the sources it lists and leaves an absent source's rows untouched", { skip: !url && "needs DATABASE_URL" }, async () => {
  const kept = listing("qa_kept", 1);
  const [b1, b2] = [listing("qa_pruned", 1), listing("qa_pruned", 2)];
  await push([kept, b1, b2], { qa_kept: [kept.sourceUrl], qa_pruned: [b1.sourceUrl, b2.sourceUrl] });
  assert.deepEqual(await statuses(), { "qa_kept:1": "active", "qa_pruned:1": "active", "qa_pruned:2": "active" });

  const result = await push([b1], { qa_pruned: [b1.sourceUrl] });
  assert.deepEqual(counts(result), { upserted: 1, removed: 1 });
  assert.deepEqual(await statuses(), { "qa_kept:1": "active", "qa_pruned:1": "active", "qa_pruned:2": "removed" });

  const [row] = await db.select({ startingAt: listings.priceStartingAt }).from(listings).where(inArray(listings.id, ["qa_pruned:1"]));
  assert.equal(row.startingAt, true);
});

test("a listing the source still lists but the push leaves out, because it went unavailable, is removed", { skip: !url && "needs DATABASE_URL" }, async () => {
  const [b1, b2] = [listing("qa_pruned", 1), listing("qa_pruned", 2)];
  await push([b1, b2], { qa_pruned: [b1.sourceUrl, b2.sourceUrl] });

  const result = await push([b1], { qa_pruned: [b1.sourceUrl, b2.sourceUrl] });
  assert.deepEqual(counts(result), { upserted: 1, removed: 1 });
  assert.deepEqual(await statuses(), { "qa_kept:1": "active", "qa_pruned:1": "active", "qa_pruned:2": "removed" });

  await push([b1, b2], { qa_pruned: [b1.sourceUrl, b2.sourceUrl] });
  assert.equal((await statuses())["qa_pruned:2"], "active");
});

test("a push that lists a source's ads but carries none of them leaves that source's rows untouched", { skip: !url && "needs DATABASE_URL" }, async () => {
  const [b1, b2] = [listing("qa_pruned", 1), listing("qa_pruned", 2)];
  await push([b1, b2], { qa_pruned: [b1.sourceUrl, b2.sourceUrl] });

  const result = await push([], { qa_pruned: [b1.sourceUrl, b2.sourceUrl] });
  assert.deepEqual(counts(result), { upserted: 0, removed: 0 });
  assert.equal((await statuses())["qa_pruned:2"], "active");
});

test("updatedAt moves only when listing content changes, not on a refetch, euro drift or a rolling available-now date", { skip: !url && "needs DATABASE_URL" }, async () => {
  const base = { ...listing("qa_pruned", 3), price: { amount: 800, currency: "EUR", period: "month", startingAt: false }, availableFrom: day(-1) };
  const active = { qa_pruned: [base.sourceUrl] };
  const first = await push([base], active);
  assert.deepEqual(first.changes.added, [pid("qa_pruned:3")]);
  const created = await stamp("qa_pruned:3");

  const drift = await push([{ ...base, fetchedAt: "2026-10-15T03:00:00Z", price: { ...base.price, amount: 815 }, availableFrom: day(0) }], active);
  assert.deepEqual(drift.changes, { added: [], changed: [], removed: [] });
  assert.equal(await stamp("qa_pruned:3"), created);
  const [stored] = await db.select({ amount: listings.priceAmount }).from(listings).where(inArray(listings.id, ["qa_pruned:3"]));
  assert.equal(stored.amount, 815);

  const repriced = await push([{ ...base, price: { ...base.price, amount: 840 } }], active);
  assert.deepEqual(repriced.changes.changed, [pid("qa_pruned:3")]);
  const afterPrice = await stamp("qa_pruned:3");
  assert.ok(afterPrice > created);

  const moved = await push([{ ...base, price: { ...base.price, amount: 840 }, availableFrom: day(20) }], active);
  assert.deepEqual(moved.changes.changed, [pid("qa_pruned:3")]);
  const retitled = await push([{ ...base, price: { ...base.price, amount: 840 }, availableFrom: day(20), title: "Studio" }], active);
  assert.deepEqual(retitled.changes.changed, [pid("qa_pruned:3")]);
  assert.ok((await stamp("qa_pruned:3")) > afterPrice);
});

test("freshness dates are stored for later ranking but never count as a listing change", { skip: !url && "needs DATABASE_URL" }, async () => {
  const base = { ...listing("qa_pruned", 20), sourceUpdatedAt: "2026-10-14T09:00:00Z", lastReviewAt: "2026-09-01" };
  const active = { qa_pruned: [base.sourceUrl] };
  await push([base], active);
  const created = await stamp("qa_pruned:20");

  const resynced = await push([{ ...base, sourceUpdatedAt: "2026-10-15T08:00:00Z", lastReviewAt: "2026-10-10", updatedAt: "2026-10-15" }], active);
  assert.deepEqual(resynced.changes, { added: [], changed: [], removed: [] });
  assert.equal(await stamp("qa_pruned:20"), created);
  const [row] = await db
    .select({ sourceUpdatedAt: listings.sourceUpdatedAt, lastReviewAt: listings.lastReviewAt })
    .from(listings)
    .where(inArray(listings.id, ["qa_pruned:20"]));
  assert.deepEqual(row, { sourceUpdatedAt: new Date("2026-10-15T08:00:00Z"), lastReviewAt: "2026-10-10" });
});

test("excluded photos never reach a listing, on its first push or any later one, and a listing left with none is hidden", { skip: !url && "needs DATABASE_URL" }, async () => {
  const logo = "https://example.com/qa-logo.jpg";
  const clean = "https://example.com/qa-clean.jpg";
  await db.insert(excludedPhotos).values({ url: logo, reason: "qa brand logo" });
  try {
    const mixed = { ...listing("qa_pruned", 21), photos: [logo, clean] };
    const onlyLogo = { ...listing("qa_pruned", 22), photos: [logo] };
    const active = { qa_pruned: [mixed.sourceUrl, onlyLogo.sourceUrl] };
    await push([mixed, onlyLogo], active);
    await push([mixed, onlyLogo], active);
    const rows = await db.select({ id: listings.id, photos: listings.photos }).from(listings).where(inArray(listings.id, ["qa_pruned:21", "qa_pruned:22"]));
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.id, r.photos])), { "qa_pruned:21": [clean], "qa_pruned:22": [] });
    const shown = await db.select({ id: listings.id }).from(listings).where(and(visible(), inArray(listings.id, ["qa_pruned:21", "qa_pruned:22"])));
    assert.deepEqual(shown.map((r) => r.id), ["qa_pruned:21"]);
  } finally {
    await db.delete(excludedPhotos).where(eq(excludedPhotos.url, logo));
  }
});

test("districts are stored under their official names, filled from coordinates when missing, and kept as sent when neither matches", { skip: !url && "needs DATABASE_URL" }, async () => {
  const items = [
    { ...listing("qa_pruned", 30), lat: 52.199, lng: 21.017 },
    { ...listing("qa_pruned", 31), district: "Praga Południe" },
    { ...listing("qa_pruned", 32), district: "Saska Kępa", lat: 52.199, lng: 21.017 },
    { ...listing("qa_pruned", 33), district: "Nowhere" },
    listing("qa_pruned", 34),
  ];
  await push(items, { qa_pruned: items.map((i) => i.sourceUrl) });
  const rows = await db.select({ id: listings.id, district: listings.district }).from(listings).where(inArray(listings.id, items.map((i) => i.id)));
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.id, r.district])), {
    "qa_pruned:30": "Mokotów",
    "qa_pruned:31": "Praga-Południe",
    "qa_pruned:32": "Praga-Południe",
    "qa_pruned:33": "Nowhere",
    "qa_pruned:34": null,
  });
});

test("the push reports added, changed and removed listings by public id", { skip: !url && "needs DATABASE_URL" }, async () => {
  const [b1, b2, b3] = [listing("qa_pruned", 4), listing("qa_pruned", 5), listing("qa_pruned", 6)];
  await push([b1, b2], { qa_pruned: [b1.sourceUrl, b2.sourceUrl] });
  const result = await push([{ ...b1, title: "Studio" }, b3], { qa_pruned: [b1.sourceUrl, b3.sourceUrl] });
  assert.deepEqual(result.changes, { added: [pid("qa_pruned:6")], changed: [pid("qa_pruned:4")], removed: [pid("qa_pruned:5")] });
});

test("the ingest endpoint pings IndexNow with every added, changed and removed listing and the pages that list them in both languages, and still succeeds when IndexNow is down", { skip: !url && "needs DATABASE_URL" }, async () => {
  const env = { INGEST_TOKEN: "qa-token", SITE_URL: "https://subletka.com", INDEXNOW_KEY: "abababababababababababababababab" };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const realFetch = globalThis.fetch;
  const posted: string[][] = [];
  Object.assign(process.env, env);
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    posted.push(JSON.parse(String(init.body)).urlList);
    return new Response("down", { status: 503 });
  }) as typeof fetch;
  try {
    const [b1, b2, b3] = [listing("qa_pruned", 7), listing("qa_pruned", 8), listing("qa_pruned", 9)];
    await push([b1, b2], { qa_pruned: [b1.sourceUrl, b2.sourceUrl] });
    const body = JSON.stringify({ listings: [{ ...b1, title: "Studio" }, b3], activeSourceUrls: { qa_pruned: [b1.sourceUrl, b3.sourceUrl] } });
    const res = await POST(new Request("http://localhost/api/ingest", { method: "POST", headers: { authorization: "Bearer qa-token" }, body }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual([json.upserted, json.removed, json.indexnow], [2, 1, { submitted: 0, failed: 12 }]);
    const link = (id: string, lang: string) => `https://subletka.com/${lang}/l/${pid(id)}`;
    const hubs = ["", "/warszawa", "/warszawa/rent"].flatMap((p) => [`https://subletka.com/pl${p}`, `https://subletka.com/en${p}`]);
    assert.deepEqual(posted, [
      [link("qa_pruned:9", "pl"), link("qa_pruned:9", "en"), link("qa_pruned:7", "pl"), link("qa_pruned:7", "en"), link("qa_pruned:8", "pl"), link("qa_pruned:8", "en"), ...hubs],
    ]);
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
