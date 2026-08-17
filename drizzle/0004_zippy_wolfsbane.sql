CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"block_id" uuid,
	"template_id" uuid,
	"template_name" text,
	"week_index" smallint,
	"is_deload" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"client_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_sessions_status" CHECK ("workout_sessions"."status" in ('in_progress', 'completed', 'discarded'))
);
--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"source" text NOT NULL,
	"prescription" jsonb,
	"skipped" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_session_exercise_position" UNIQUE("session_id","position") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ck_session_exercises_source" CHECK ("session_exercises"."source" in ('template', 'adhoc'))
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"set_number" smallint NOT NULL,
	"is_warmup" boolean DEFAULT false NOT NULL,
	"weight_kg" numeric(6, 2) NOT NULL,
	"reps" smallint NOT NULL,
	"rir" smallint,
	"logged_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_set_number" UNIQUE("session_exercise_id","set_number") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ck_set_logs_set_number_positive" CHECK ("set_logs"."set_number" >= 1),
	CONSTRAINT "ck_set_logs_weight_kg_nonneg" CHECK ("set_logs"."weight_kg" >= 0),
	CONSTRAINT "ck_set_logs_reps_range" CHECK ("set_logs"."reps" between 1 and 100),
	CONSTRAINT "ck_set_logs_rir_range" CHECK ("set_logs"."rir" between 0 and 10)
);
--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sessions_one_in_progress" ON "workout_sessions" USING btree ("user_id") WHERE "workout_sessions"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "ix_sessions_user_started" ON "workout_sessions" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_sessions_block" ON "workout_sessions" USING btree ("block_id","started_at");--> statement-breakpoint
CREATE INDEX "ix_session_exercises_exercise" ON "session_exercises" USING btree ("exercise_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_session_exercises_session_id" ON "session_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ix_set_logs_session_exercise" ON "set_logs" USING btree ("session_exercise_id","set_number");