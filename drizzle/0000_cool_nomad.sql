CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Ljubljana' NOT NULL,
	"week_starts_on" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_users_week_starts_on" CHECK ("users"."week_starts_on" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "auth_throttle" (
	"identifier" text PRIMARY KEY NOT NULL,
	"failure_count" smallint DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree ("email");