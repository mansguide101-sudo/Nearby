CREATE TABLE "bookings" (
	"id" text PRIMARY KEY,
	"client_id" text NOT NULL,
	"business_id" text NOT NULL,
	"service" text NOT NULL,
	"price" integer NOT NULL,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stars" integer,
	"review" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_status" CHECK ("status" in ('pending', 'confirmed', 'completed', 'late', 'declined', 'cancelled', 'noshow')),
	CONSTRAINT "bookings_stars" CHECK ("stars" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"cat" text NOT NULL,
	"em" text NOT NULL,
	"addr" text NOT NULL,
	"hours" text NOT NULL,
	"about" text NOT NULL,
	"services" jsonb NOT NULL,
	"owner_id" text
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_active_slot" ON "bookings" ("business_id","date","time") WHERE "status" in ('pending', 'confirmed');--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_profiles_id_fkey" FOREIGN KEY ("client_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_profiles_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE SET NULL;