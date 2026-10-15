import "server-only";
import { sql } from "drizzle-orm";
import { warsawDay } from "@/lib/domain";
import type { db } from "./index";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const PRICE_OUTLIER_FACTOR = 2;
export const INACTIVE_AFTER_DAYS = 365;

export async function refreshSignals(tx: Tx, today = warsawDay(new Date())) {
  await tx.execute(sql`
    with typical as (
      select city, place_type, percentile_cont(0.5) within group (order by price_monthly / area_m2) as per_m2
      from listings
      where status = 'active' and area_m2 > 0
      group by city, place_type
    ),
    signalling as (
      select distinct source from listings where status = 'active' and source_updated_at is not null
    ),
    next as (
      select
        l.id,
        coalesce(
          l.area_m2 > 0 and l.price_monthly / l.area_m2 > ${PRICE_OUTLIER_FACTOR} * (select t.per_m2 from typical t where t.city = l.city and t.place_type = l.place_type),
          false
        ) as price_outlier,
        coalesce(
          l.origin = 'imported'
            and l.source in (select source from signalling)
            and l.source_updated_at is null
            and (l.last_review_at is null or l.last_review_at < ${today}::date - ${INACTIVE_AFTER_DAYS}::int),
          false
        ) as inactive
      from listings l
      where l.status = 'active'
    )
    update listings l set price_outlier = n.price_outlier, inactive = n.inactive
    from next n
    where l.id = n.id and (l.price_outlier, l.inactive) is distinct from (n.price_outlier, n.inactive)
  `);
}
