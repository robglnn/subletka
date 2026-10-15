import "server-only";
import { and, eq, getTableColumns, inArray, notInArray, sql } from "drizzle-orm";
import { importedCancellation } from "@/lib/booking-terms";
import { districtAt } from "@/lib/area";
import { findDistrict, warsawDay } from "@/lib/domain";
import { publicListingId } from "@/lib/listing-id";
import { monthlyPln } from "@/lib/money";
import type { ImportedListing, IngestBatch } from "@/lib/ingest-contract";
import { db } from "./index";
import { excludedPhotos, listings, type ListingInsert } from "./schema";
import { refreshMatching } from "./matching";
import { refreshSignals } from "./signals";

const officialDistrict = (l: ImportedListing) =>
  (l.district ? findDistrict(l.city, l.district)?.name : undefined) ??
  (l.lat != null && l.lng != null ? districtAt(l.city, l.lat, l.lng) : null) ??
  l.district ??
  null;

const toRow = (l: ImportedListing, excluded: Set<string>): ListingInsert => ({
  id: l.id,
  publicId: publicListingId(l.id, "imported"),
  origin: "imported",
  status: "active",
  source: l.source,
  sourceId: l.sourceId,
  sourceUrl: l.sourceUrl,
  sourceName: l.sourceName,
  city: l.city,
  district: officialDistrict(l),
  lat: l.lat ?? null,
  lng: l.lng ?? null,
  title: l.title,
  lang: l.lang ?? null,
  description: l.description ?? null,
  priceAmount: l.price.amount,
  priceCurrency: l.price.currency,
  pricePeriod: l.price.period,
  priceMonthly: monthlyPln(l.price),
  billsIncluded: l.price.billsIncluded ?? null,
  priceStartingAt: l.price.startingAt ?? false,
  deposit: l.deposit ?? null,
  cancellationPolicy: importedCancellation(l.cancellationPolicy),
  availableFrom: l.availableFrom ?? null,
  availableTo: l.availableTo ?? null,
  minStayDays: l.minStayDays ?? null,
  termKind: l.termKind,
  placeType: l.placeType,
  rooms: l.rooms ?? null,
  areaM2: l.areaM2 ?? null,
  roommatesCount: l.roommates?.count ?? null,
  roommatesGenders: l.roommates?.genders ?? null,
  preferredTenantGender: l.roommates?.preferredTenantGender ?? null,
  furnished: l.furnished ?? null,
  petsAllowed: l.petsAllowed ?? null,
  photos: l.photos.filter((url) => !excluded.has(url)),
  postedAt: l.postedAt ? new Date(l.postedAt) : null,
  sourceUpdatedAt: l.sourceUpdatedAt ? new Date(l.sourceUpdatedAt) : null,
  lastReviewAt: l.lastReviewAt ?? null,
  fetchedAt: new Date(l.fetchedAt),
});

const COLUMNS = getTableColumns(listings);
type Column = keyof typeof COLUMNS;

const PRICE_TOLERANCE = 0.02;

const EXACT = [
  "status",
  "city",
  "district",
  "lat",
  "lng",
  "title",
  "lang",
  "description",
  "priceCurrency",
  "pricePeriod",
  "billsIncluded",
  "priceStartingAt",
  "availableTo",
  "minStayDays",
  "termKind",
  "placeType",
  "rooms",
  "areaM2",
  "roommatesCount",
  "roommatesGenders",
  "preferredTenantGender",
  "furnished",
  "petsAllowed",
  "photos",
  "postedAt",
  "cancellationPolicy",
] as const satisfies Column[];
const DRIFTING = ["priceAmount", "deposit"] as const satisfies Column[];

const incoming = (key: Column) => sql.raw(`excluded."${COLUMNS[key].name}"`);

const contentChanged = (today: string) =>
  sql.join(
    [
      ...EXACT.map((k) => sql`${COLUMNS[k]} is distinct from ${incoming(k)}`),
      ...DRIFTING.map(
        (k) => sql`(${COLUMNS[k]} is null) <> (${incoming(k)} is null) or abs(${incoming(k)} - ${COLUMNS[k]}) > ${PRICE_TOLERANCE}::numeric * abs(${COLUMNS[k]})`,
      ),
      sql`(${listings.availableFrom} is null) <> (${incoming("availableFrom")} is null) or greatest(${listings.availableFrom}, ${today}::date) <> greatest(${incoming("availableFrom")}, ${today}::date)`,
    ].map((part) => sql`(${part})`),
    sql` or `,
  );

const updateSet = (sample: ListingInsert, today: string) =>
  Object.fromEntries([
    ...Object.keys(sample)
      .filter((key): key is Column => key in COLUMNS && key !== "id")
      .map((key) => [key, incoming(key)]),
    ["updatedAt", sql`case when ${contentChanged(today)} then now() else ${listings.updatedAt} end`],
  ]);

export type IngestChanges = { added: string[]; changed: string[]; removed: string[] };

const touched = { id: listings.id, publicId: listings.publicId };
const publicIds = (rows: { id: string; publicId: string | null }[]) => rows.map((r) => r.publicId ?? publicListingId(r.id, "imported"));

const CHUNK = 250;

export async function applyIngest(batch: IngestBatch) {
  const today = warsawDay(new Date());
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('listings-ingest'))`);
    const excluded = new Set((await tx.select({ url: excludedPhotos.url }).from(excludedPhotos)).map((r) => r.url));
    const rows = batch.listings.map((l) => toRow(l, excluded));
    const ids = rows.map((r) => r.id);
    const urls = rows.map((r) => r.sourceUrl!);
    const added: string[] = [];
    const changed: string[] = [];
    const removed: string[] = [];
    if (urls.length) {
      const displaced = await tx
        .update(listings)
        .set({ sourceUrl: null, status: "removed", updatedAt: new Date() })
        .where(and(inArray(listings.sourceUrl, urls), notInArray(listings.id, ids)))
        .returning(touched);
      removed.push(...publicIds(displaced));
    }
    for (let i = 0; i < rows.length; i += CHUNK) {
      const upserted = await tx
        .insert(listings)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: listings.id,
          set: updateSet(rows[0], today),
          setWhere: eq(listings.origin, "imported"),
        })
        .returning({ ...touched, inserted: sql<boolean>`(xmax::text = '0')`, bumped: sql<boolean>`(${listings.updatedAt} = now())` });
      added.push(...publicIds(upserted.filter((r) => r.inserted)));
      changed.push(...publicIds(upserted.filter((r) => !r.inserted && r.bumped)));
    }
    const carried = new Set(urls);
    for (const [source, listedUrls] of Object.entries(batch.activeSourceUrls)) {
      const activeUrls = listedUrls.filter((u) => carried.has(u));
      if (activeUrls.length === 0) continue;
      const pruned = await tx
        .update(listings)
        .set({ status: "removed", updatedAt: new Date() })
        .where(
          and(
            eq(listings.origin, "imported"),
            eq(listings.source, source),
            eq(listings.status, "active"),
            sql`(${listings.sourceUrl} is null or ${notInArray(listings.sourceUrl, activeUrls)})`,
          ),
        )
        .returning(touched);
      removed.push(...publicIds(pruned));
    }
    await refreshSignals(tx, today);
    await refreshMatching(tx, { today });
    const gone = new Set(removed);
    const changes: IngestChanges = {
      added: added.filter((id) => !gone.has(id)),
      changed: changed.filter((id) => !gone.has(id)),
      removed,
    };
    return { upserted: rows.length, removed: removed.length, changes };
  });
}
