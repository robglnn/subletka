import { asc, desc, inArray, sql, type SQL } from "drizzle-orm";
import { diversify } from "@/lib/diversify";
import { warsawDay, type Sort } from "@/lib/domain";
import { db } from "./index";
import { listings, type ListingRow } from "./schema";

export const FAR_OFF_DAYS = 182;
export const OLD_POST_BEFORE = "2025-01-01";
export const SAME_BUILDING_RUN = 2;

const newestFirst = desc(sql`coalesce(${listings.postedAt}, ${listings.createdAt})`);

export const demoted = (today = warsawDay(new Date())) =>
  sql<boolean>`(${listings.priceOutlier} or ${listings.inactive} or coalesce(${listings.availableFrom} > ${today}::date + ${FAR_OFF_DAYS}::int, false) or coalesce(${listings.postedAt} < ${OLD_POST_BEFORE}::timestamptz, false))`;

const readyBy = (q: { from?: string }) => {
  const moveIn = q.from ?? warsawDay(new Date());
  return sql<boolean>`(${listings.availableFrom} is null or ${listings.availableFrom} <= ${moveIn})`;
};

const WITHIN: Record<Sort, SQL[]> = {
  best: [desc(listings.fitScore)],
  newest: [newestFirst],
  cheapest: [asc(listings.priceMonthly), newestFirst],
};

export const rankOrder = (q: { from?: string }, sort: Sort): SQL[] => [desc(readyBy(q)), asc(demoted()), ...WITHIN[sort], asc(listings.id)];

export async function rankedRows(where: SQL | undefined, q: { from?: string }, sort: Sort, limit: number): Promise<ListingRow[]> {
  if (sort !== "best") return db.select().from(listings).where(where).orderBy(...rankOrder(q, sort)).limit(limit);
  const keys = await db
    .select({
      id: listings.id,
      ready: readyBy(q),
      down: demoted(),
      building: sql<string>`coalesce(${listings.buildingKey}, ${listings.id})`,
      kind: sql<string>`case when ${listings.placeType} = 'whole_place' then 'whole' else 'room' end`,
    })
    .from(listings)
    .where(where)
    .orderBy(...rankOrder(q, sort));
  const ids = diversify(
    keys.map((k) => ({ ...k, group: (k.ready ? 0 : 2) + (k.down ? 1 : 0) })),
    SAME_BUILDING_RUN,
  )
    .slice(0, limit)
    .map((k) => k.id);
  if (!ids.length) return [];
  const rows = await db.select().from(listings).where(inArray(listings.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
