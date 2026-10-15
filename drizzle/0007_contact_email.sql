ALTER TABLE "listings" ADD COLUMN "contact_email" text;--> statement-breakpoint
UPDATE "listings" SET "contact_email" = trim("contact_value") WHERE "origin" = 'native' AND "contact_kind" = 'email' AND "contact_email" IS NULL;
