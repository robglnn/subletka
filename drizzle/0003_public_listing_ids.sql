ALTER TABLE "listings" ADD COLUMN "public_id" text;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_public_id_unique" UNIQUE("public_id");