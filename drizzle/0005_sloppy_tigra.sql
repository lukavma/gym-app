CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"block_id" uuid,
	"source_session_id" uuid NOT NULL,
	"source_session_exercise_id" uuid NOT NULL,
	"strategy_id" text NOT NULL,
	"strategy_version" smallint NOT NULL,
	"classification" text NOT NULL,
	"config" jsonb NOT NULL,
	"inputs" jsonb NOT NULL,
	"action" text NOT NULL,
	"target" jsonb,
	"reason_codes" text[] NOT NULL,
	"confidence" text NOT NULL,
	"computed_by" text NOT NULL,
	"decision_status" text DEFAULT 'pending' NOT NULL,
	"decision_chosen" jsonb,
	"decided_at" timestamp with time zone,
	"decision_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_recommendations_classification" CHECK ("recommendations"."classification" in ('evidence_supported', 'heuristic', 'user_defined')),
	CONSTRAINT "ck_recommendations_action" CHECK ("recommendations"."action" in ('increase_load', 'decrease_load', 'hold', 'increase_reps', 'none')),
	CONSTRAINT "ck_recommendations_confidence" CHECK ("recommendations"."confidence" in ('low', 'medium', 'high')),
	CONSTRAINT "ck_recommendations_computed_by" CHECK ("recommendations"."computed_by" in ('server', 'client')),
	CONSTRAINT "ck_recommendations_decision_status" CHECK ("recommendations"."decision_status" in ('pending', 'accepted', 'modified', 'rejected', 'superseded')),
	CONSTRAINT "ck_recommendations_decision_source" CHECK ("recommendations"."decision_source" in ('explicit', 'implicit_first_set'))
);
--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_source_session_id_workout_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_source_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("source_session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recs_one_pending" ON "recommendations" USING btree ("exercise_id",coalesce("block_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "recommendations"."decision_status" = 'pending';--> statement-breakpoint
CREATE INDEX "ix_recs_exercise" ON "recommendations" USING btree ("exercise_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_recs_pending" ON "recommendations" USING btree ("user_id") WHERE "recommendations"."decision_status" = 'pending';