import { inArray, or, sql } from "drizzle-orm";
import { legacyRowId, publicListingId } from "@/lib/listing-id";
import type { ListingFate } from "@/lib/listing-redirect";
import { db } from "./index";
import { listings } from "./schema";
import { visible } from "./visibility";

export const requestedIds = (requested: string[]) => {
  const legacy = requested.flatMap((id) => legacyRowId(id) ?? []);
  return legacy.length ? or(inArray(listings.publicId, requested), inArray(listings.id, legacy)) : inArray(listings.publicId, requested);
};

export async function listingFate(requested: string): Promise<ListingFate> {
  if (!requested) return { state: "unknown" };
  const [row] = await db
    .select({
      id: listings.id,
      publicId: listings.publicId,
      origin: listings.origin,
      city: listings.city,
      status: listings.status,
      visible: sql<boolean>`coalesce(${visible()}, false)`,
    })
    .from(listings)
    .where(requestedIds([requested]))
    .limit(1);
  if (!row) return { state: "unknown" };
  const state = row.status === "removed" ? "removed" : row.visible ? "visible" : "hidden";
  return { state, id: row.publicId ?? publicListingId(row.id, row.origin), city: row.city };
}
