ALTER TABLE "listings" ADD COLUMN "deposit_months" integer;--> statement-breakpoint
UPDATE "listings" SET "cancellation_policy" = NULL WHERE "cancellation_policy" NOT IN ('flexible', 'moderate', 'strict');
