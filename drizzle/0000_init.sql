CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text,
	"source_id" text,
	"source_url" text,
	"source_name" text,
	"city" text NOT NULL,
	"district" text,
	"lat" double precision,
	"lng" double precision,
	"title" text NOT NULL,
	"lang" text,
	"description" text,
	"price_amount" integer NOT NULL,
	"price_currency" text NOT NULL,
	"price_period" text NOT NULL,
	"price_monthly" integer NOT NULL,
	"bills_included" boolean,
	"deposit" integer,
	"available_from" date,
	"available_to" date,
	"min_stay_days" integer,
	"term_kind" text NOT NULL,
	"place_type" text NOT NULL,
	"rooms" integer,
	"area_m2" double precision,
	"roommates_count" integer,
	"roommates_genders" text,
	"preferred_tenant_gender" text,
	"furnished" boolean,
	"pets_allowed" boolean,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact_name" text,
	"contact_kind" text,
	"contact_value" text,
	"owner_email" text,
	"manage_token_hash" text,
	"posted_at" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_source_url_unique" UNIQUE("source_url"),
	CONSTRAINT "listings_manage_token_hash_unique" UNIQUE("manage_token_hash")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"position" integer NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_browse" ON "listings" USING btree ("status","city","posted_at");--> statement-breakpoint
CREATE INDEX "listings_owner" ON "listings" USING btree ("owner_email");