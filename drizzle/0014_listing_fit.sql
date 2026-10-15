ALTER TABLE "listings" ADD COLUMN "area_score" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "area_badge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "minutes_to_centre" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "building_key" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "fit_score" integer DEFAULT 0 NOT NULL;