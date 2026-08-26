CREATE TABLE "bodyweight_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"weight_kg" numeric(5, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_bodyweight_day" UNIQUE("user_id","date"),
	CONSTRAINT "ck_bodyweight_entries_weight_kg_range" CHECK ("bodyweight_entries"."weight_kg" between 20 and 400)
);
--> statement-breakpoint
CREATE TABLE "recovery_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sleep_hours" numeric(4, 2),
	"sleep_quality" smallint,
	"readiness" smallint,
	"soreness" smallint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_recovery_day" UNIQUE("user_id","date"),
	CONSTRAINT "ck_recovery_entries_sleep_hours_range" CHECK ("recovery_entries"."sleep_hours" between 0 and 24),
	CONSTRAINT "ck_recovery_entries_sleep_quality_range" CHECK ("recovery_entries"."sleep_quality" between 1 and 5),
	CONSTRAINT "ck_recovery_entries_readiness_range" CHECK ("recovery_entries"."readiness" between 1 and 5),
	CONSTRAINT "ck_recovery_entries_soreness_range" CHECK ("recovery_entries"."soreness" between 1 and 5),
	CONSTRAINT "ck_recovery_entries_has_metric" CHECK ("recovery_entries"."sleep_hours" is not null or "recovery_entries"."sleep_quality" is not null or "recovery_entries"."readiness" is not null or "recovery_entries"."soreness" is not null)
);
--> statement-breakpoint
ALTER TABLE "bodyweight_entries" ADD CONSTRAINT "bodyweight_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_entries" ADD CONSTRAINT "recovery_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;