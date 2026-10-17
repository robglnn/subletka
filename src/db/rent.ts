import "server-only";
import { and, eq, max } from "drizzle-orm";
import { connection } from "next/server";
import { districtMinutes } from "@/lib/area";
import type { City, PlaceFilter } from "@/lib/domain";
import { hubPaths, hubStamps } from "@/lib/hubs";
import { cityRent, type CityRent } from "@/lib/rent-stats";
import { db } from "./index";
import { requestedIds } from "./listing-fate";
import { listings } from "./schema";
import { visible } from "./visibility";

const kindOf = (placeType: string, rooms: number | null): PlaceFilter => (placeType !== "whole_place" ? "room" : rooms === 1 ? "studio" : "flat");

export async function rentByCity(city: City): Promise<CityRent> {
  const [rows, [stamp]] = await Promise.all([
    db
      .select()
      .from(listings)
      .where(and(visible(), eq(listings.city, city), eq(listings.pricePeriod, "month"))),
    db.select({ at: max(listings.updatedAt) }).from(listings).where(eq(listings.city, city)),
  ]);
  const inputs = rows.map((r) => ({
    kind: kindOf(r.placeType, r.rooms),
    district: r.district,
    monthlyPln: r.priceMonthly,
    price: { amount: r.priceAmount, currency: r.priceCurrency },
    outlier: r.priceOutlier,
    minutes: r.minutesToCentre,
  }));
  return cityRent(city, inputs, stamp?.at ?? null, (slug) => districtMinutes(city, slug));
}

const hubColumns = { city: listings.city, district: listings.district, lat: listings.lat, lng: listings.lng };

export async function siteStamps() {
  await connection();
  return hubStamps(await db.select({ ...hubColumns, updatedAt: listings.updatedAt }).from(listings));
}

export async function hubPathsFor(publicIds: string[]) {
  if (!publicIds.length) return [];
  return hubPaths(await db.select(hubColumns).from(listings).where(requestedIds(publicIds)));
}
