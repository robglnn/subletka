import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { warsawDay } from "@/lib/domain";
import { listings, staleHolds } from "./schema";

export const visible = () =>
  and(
    eq(listings.status, "active"),
    or(eq(listings.origin, "native"), sql`jsonb_array_length(${listings.photos}) > 0`),
    or(isNull(listings.availableTo), gte(listings.availableTo, warsawDay(new Date()))),
    sql`not (${listings.inactive} and exists (select 1 from ${staleHolds} where ${staleHolds.listingId} = ${listings.id}))`,
  );
