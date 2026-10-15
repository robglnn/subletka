UPDATE "listings" SET "contact_email" = trim("contact_value") WHERE "origin" = 'native' AND "contact_kind" = 'email' AND "contact_email" IS NULL;--> statement-breakpoint
UPDATE "listings" SET "status" = 'removed' WHERE "origin" = 'native' AND "contact_email" IS NULL;--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "contact_name";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "contact_kind";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "contact_value";