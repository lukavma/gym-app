CREATE TABLE "dashboard_estimate_selections" (
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_estimate_selections_user_id_exercise_id_pk" PRIMARY KEY("user_id","exercise_id"),
	CONSTRAINT "ck_dashboard_estimate_selections_position" CHECK ("dashboard_estimate_selections"."position" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "dashboard_estimate_selections" ADD CONSTRAINT "dashboard_estimate_selections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_estimate_selections" ADD CONSTRAINT "dashboard_estimate_selections_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dashboard_estimate_selections_position" ON "dashboard_estimate_selections" USING btree ("user_id","position");