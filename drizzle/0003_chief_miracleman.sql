CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_programs_status" CHECK ("programs"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_prescriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"scheme" jsonb NOT NULL,
	"target_rir" jsonb,
	"baseline_load_kg" numeric(6, 2),
	"rest_seconds" smallint,
	"progression" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_prescriptions_position" UNIQUE("template_id","position") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ck_exercise_prescriptions_baseline_load_kg_nonneg" CHECK ("exercise_prescriptions"."baseline_load_kg" >= 0),
	CONSTRAINT "ck_exercise_prescriptions_rest_seconds_positive" CHECK ("exercise_prescriptions"."rest_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sequence" smallint NOT NULL,
	"goal" text DEFAULT 'hypertrophy' NOT NULL,
	"start_date" date NOT NULL,
	"weeks_planned" smallint NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"volume_preset_id" uuid,
	"deload" jsonb,
	"planned_progression" jsonb,
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_blocks_sequence" UNIQUE("program_id","sequence"),
	CONSTRAINT "ck_blocks_goal" CHECK ("blocks"."goal" in ('hypertrophy', 'strength', 'general')),
	CONSTRAINT "ck_blocks_status" CHECK ("blocks"."status" in ('planned', 'active', 'completed', 'abandoned')),
	CONSTRAINT "ck_blocks_weeks_planned_range" CHECK ("blocks"."weeks_planned" between 1 and 16)
);
--> statement-breakpoint
CREATE TABLE "block_schedule_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"block_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"weekdays" smallint[],
	CONSTRAINT "uq_schedule_position" UNIQUE("block_id","position") DEFERRABLE INITIALLY DEFERRED
);
--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_prescriptions" ADD CONSTRAINT "exercise_prescriptions_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_prescriptions" ADD CONSTRAINT "exercise_prescriptions_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_schedule_entries" ADD CONSTRAINT "block_schedule_entries_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_schedule_entries" ADD CONSTRAINT "block_schedule_entries_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_programs_one_active" ON "programs" USING btree ("user_id") WHERE "programs"."status" = 'active';--> statement-breakpoint
CREATE INDEX "ix_programs_user_id" ON "programs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_templates_active_name" ON "workout_templates" USING btree ("program_id",lower("name")) WHERE "workout_templates"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "ix_workout_templates_program_id" ON "workout_templates" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "ix_exercise_prescriptions_template_id" ON "exercise_prescriptions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "ix_exercise_prescriptions_exercise_id" ON "exercise_prescriptions" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_blocks_one_active" ON "blocks" USING btree ("program_id") WHERE "blocks"."status" = 'active';--> statement-breakpoint
CREATE INDEX "ix_blocks_program_id" ON "blocks" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "ix_block_schedule_entries_block_id" ON "block_schedule_entries" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "ix_block_schedule_entries_template_id" ON "block_schedule_entries" USING btree ("template_id");