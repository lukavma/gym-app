CREATE TABLE "exercise_catalog_seed_log" (
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_catalog_seed_log_user_id_slug_pk" PRIMARY KEY("user_id","slug")
);
--> statement-breakpoint
ALTER TABLE "exercise_catalog_seed_log" ADD CONSTRAINT "exercise_catalog_seed_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;