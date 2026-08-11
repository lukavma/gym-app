CREATE TABLE "muscle_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"equipment" text NOT NULL,
	"movement_pattern" text,
	"mechanics" text NOT NULL,
	"laterality" text DEFAULT 'bilateral' NOT NULL,
	"load_step_kg" numeric(4, 2) NOT NULL,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_exercises_equipment" CHECK ("exercises"."equipment" in ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other')),
	CONSTRAINT "ck_exercises_mechanics" CHECK ("exercises"."mechanics" in ('compound', 'isolation')),
	CONSTRAINT "ck_exercises_laterality" CHECK ("exercises"."laterality" in ('bilateral', 'unilateral')),
	CONSTRAINT "ck_exercises_load_step_kg_positive" CHECK ("exercises"."load_step_kg" > 0)
);
--> statement-breakpoint
CREATE TABLE "exercise_muscle_contributions" (
	"exercise_id" uuid NOT NULL,
	"muscle_group_id" text NOT NULL,
	"role" text NOT NULL,
	"weight" numeric(3, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_muscle_contributions_exercise_id_muscle_group_id_pk" PRIMARY KEY("exercise_id","muscle_group_id"),
	CONSTRAINT "ck_emc_role" CHECK ("exercise_muscle_contributions"."role" in ('primary', 'secondary')),
	CONSTRAINT "ck_emc_weight_range" CHECK ("exercise_muscle_contributions"."weight" > 0 AND "exercise_muscle_contributions"."weight" <= 1)
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscle_contributions" ADD CONSTRAINT "exercise_muscle_contributions_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscle_contributions" ADD CONSTRAINT "exercise_muscle_contributions_muscle_group_id_muscle_groups_id_fk" FOREIGN KEY ("muscle_group_id") REFERENCES "public"."muscle_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exercises_active_name" ON "exercises" USING btree ("user_id",lower("name")) WHERE "exercises"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "ix_exercises_user_id" ON "exercises" USING btree ("user_id");