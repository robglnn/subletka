import "server-only";
import { eq, sql } from "drizzle-orm";
import { areaFacts } from "@/lib/area";
import { warsawDay } from "@/lib/domain";
import { buildingKeys, fitScore, pricePool, type FitInput } from "@/lib/fit";
import { db } from "./index";
import { listings, type ListingRow } from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function computeMatching(rows: ListingRow[], today: string) {
  const inputs = rows.map((r) => {
    const facts = areaFacts(r.city, r.district, r.lat, r.lng);
    const input: FitInput = {
      id: r.id,
      origin: r.origin,
      city: r.city,
      placeType: r.placeType,
      rooms: r.rooms,
      areaM2: r.areaM2,
      priceMonthly: r.priceMonthly,
      priceOutlier: r.priceOutlier,
      areaScore: facts.score,
      minutes: facts.minutes,
      photos: r.photos.length,
      description: r.description?.length ?? 0,
      hasDeposit: r.deposit !== null || r.depositMonths !== null,
      hasRoommates: r.roommatesCount !== null || r.roommatesGenders !== null,
      availableFrom: r.availableFrom,
      sourceUpdatedAt: r.sourceUpdatedAt,
    };
    return { row: r, facts, input };
  });
  const predict = pricePool(inputs.map((i) => i.input));
  const buildings = buildingKeys(rows);
  return inputs.map(({ row, facts, input }) => ({
    row,
    next: {
      areaScore: facts.score,
      areaBadge: facts.badge,
      minutesToCentre: facts.minutes,
      buildingKey: buildings.get(row.id)!,
      fitScore: fitScore(input, predict(input), today),
    },
  }));
}

export async function refreshMatching(tx: Tx, { only, today = warsawDay(new Date()) }: { only?: string; today?: string } = {}) {
  const rows = await tx.select().from(listings).where(eq(listings.status, "active"));
  const changed = computeMatching(rows, today).filter(
    ({ row, next }) =>
      (only === undefined || row.id === only) &&
      (row.areaScore !== next.areaScore ||
        row.areaBadge !== next.areaBadge ||
        row.minutesToCentre !== next.minutesToCentre ||
        row.buildingKey !== next.buildingKey ||
        row.fitScore !== next.fitScore),
  );
  if (!changed.length) return 0;
  const values = sql.join(
    changed.map(({ row, next }) => sql`(${row.id}, ${next.areaScore}::int, ${next.areaBadge}::boolean, ${next.minutesToCentre}::int, ${next.buildingKey}, ${next.fitScore}::int)`),
    sql`, `,
  );
  await tx.execute(sql`
    update listings l set area_score = v.area_score, area_badge = v.area_badge, minutes_to_centre = v.minutes_to_centre, building_key = v.building_key, fit_score = v.fit_score
    from (values ${values}) as v(id, area_score, area_badge, minutes_to_centre, building_key, fit_score)
    where l.id = v.id
  `);
  return changed.length;
}
