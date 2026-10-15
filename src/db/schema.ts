import { CANCELLATIONS, CITIES, CURRENCIES, GENDERS, LOCALES, PLACE_TYPES, PRICE_PERIODS, TERM_KINDS } from "../lib/domain";
import { boolean, customType, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const listings = pgTable(
  "listings",
  {
    id: text("id").primaryKey(),
    publicId: text("public_id").unique(),
    origin: text("origin", { enum: ["imported", "native"] }).notNull(),
    status: text("status", { enum: ["active", "removed"] }).notNull().default("active"),
    source: text("source"),
    sourceId: text("source_id"),
    sourceUrl: text("source_url").unique(),
    sourceName: text("source_name"),
    city: text("city", { enum: CITIES }).notNull(),
    district: text("district"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    title: text("title").notNull(),
    lang: text("lang"),
    description: text("description"),
    priceAmount: integer("price_amount").notNull(),
    priceCurrency: text("price_currency", { enum: CURRENCIES }).notNull(),
    pricePeriod: text("price_period", { enum: PRICE_PERIODS }).notNull(),
    priceMonthly: integer("price_monthly").notNull(),
    billsIncluded: boolean("bills_included"),
    priceStartingAt: boolean("price_starting_at").notNull().default(false),
    deposit: integer("deposit"),
    depositMonths: integer("deposit_months"),
    cancellationPolicy: text("cancellation_policy", { enum: CANCELLATIONS }),
    additionalCosts: text("additional_costs"),
    availableFrom: date("available_from"),
    availableTo: date("available_to"),
    minStayDays: integer("min_stay_days"),
    termKind: text("term_kind", { enum: TERM_KINDS }).notNull(),
    placeType: text("place_type", { enum: PLACE_TYPES }).notNull(),
    rooms: integer("rooms"),
    areaM2: doublePrecision("area_m2"),
    roommatesCount: integer("roommates_count"),
    roommatesGenders: text("roommates_genders", { enum: GENDERS }),
    preferredTenantGender: text("preferred_tenant_gender", { enum: ["female", "male"] }),
    furnished: boolean("furnished"),
    petsAllowed: boolean("pets_allowed"),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    contactEmail: text("contact_email"),
    ownerEmail: text("owner_email"),
    manageTokenHash: text("manage_token_hash").unique(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    lastReviewAt: date("last_review_at"),
    priceOutlier: boolean("price_outlier").notNull().default(false),
    inactive: boolean("inactive").notNull().default(false),
    areaScore: integer("area_score"),
    areaBadge: boolean("area_badge").notNull().default(false),
    minutesToCentre: integer("minutes_to_centre"),
    buildingKey: text("building_key"),
    fitScore: integer("fit_score").notNull().default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listings_browse").on(t.status, t.city, t.postedAt), index("listings_owner").on(t.ownerEmail)],
);

export const photos = pgTable("photos", {
  id: text("id").primaryKey(),
  listingId: text("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const excludedPhotos = pgTable("excluded_photos", {
  url: text("url").primaryKey(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staleHolds = pgTable("stale_holds", {
  listingId: text("listing_id").primaryKey(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportMessages = pgTable("support_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  listingId: text("listing_id"),
  lang: text("lang", { enum: LOCALES }).notNull(),
  delivery: text("delivery", { enum: ["pending", "sent", "failed"] }).notNull().default("pending"),
  deliveryError: text("delivery_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

export type ListingRow = typeof listings.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type ListingInsert = typeof listings.$inferInsert;
