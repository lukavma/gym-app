-- Hand-reordered (same pattern as 0003/0004's DEFERRABLE hand-edits):
-- drizzle-kit emitted both composite FKs before the UNIQUE constraints on
-- their referenced columns (exercises(id, measurement_profile) and
-- session_exercises(id, measurement_profile)), which PostgreSQL rejects —
-- "there is no unique constraint matching given keys for referenced table"
-- (42830) — since a composite FK's target columns must already carry a
-- unique/PK constraint at the time the FK is added. Statements below are
-- reordered per athletic-measurement-profiles-architecture-evaluation.md
-- §14.1's exact table order (exercises cols+CHECKs+unique -> session_exercises
-- cols+CHECKs+unique+mirror FK -> set_logs); no statement's text was changed.
ALTER TABLE "exercises" ADD COLUMN "measurement_profile" text DEFAULT 'load_reps' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "load_basis" text DEFAULT 'unspecified';--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "volume_counting" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "ck_exercises_measurement_profile" CHECK ("exercises"."measurement_profile" in ('load_reps', 'reps', 'load_distance', 'distance_time', 'duration', 'load_duration'));--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "ck_exercises_load_basis" CHECK ("exercises"."load_basis" is null or "exercises"."load_basis" in ('total', 'per_hand', 'assistance', 'unspecified'));--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "ck_exercises_load_basis_presence" CHECK (("exercises"."measurement_profile" in ('load_reps', 'load_distance', 'load_duration')) = ("exercises"."load_basis" is not null));--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "ck_exercises_volume_counting" CHECK ("exercises"."volume_counting" in ('auto', 'off'));--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "uq_exercises_id_profile" UNIQUE("id","measurement_profile");--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "measurement_profile" text DEFAULT 'load_reps' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "load_basis" text DEFAULT 'unspecified';--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "ck_session_exercises_measurement_profile" CHECK ("session_exercises"."measurement_profile" in ('load_reps', 'reps', 'load_distance', 'distance_time', 'duration', 'load_duration'));--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "ck_session_exercises_load_basis" CHECK ("session_exercises"."load_basis" is null or "session_exercises"."load_basis" in ('total', 'per_hand', 'assistance', 'unspecified'));--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "ck_session_exercises_load_basis_presence" CHECK (("session_exercises"."measurement_profile" in ('load_reps', 'load_distance', 'load_duration')) = ("session_exercises"."load_basis" is not null));--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "uq_session_exercises_id_profile" UNIQUE("id","measurement_profile");--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "fk_session_exercises_exercise_profile" FOREIGN KEY ("exercise_id","measurement_profile") REFERENCES "public"."exercises"("id","measurement_profile") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ALTER COLUMN "weight_kg" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "set_logs" ALTER COLUMN "reps" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "distance_m" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "duration_s" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "measurement_profile" text DEFAULT 'load_reps' NOT NULL;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "ck_set_logs_distance_m_range" CHECK ("set_logs"."distance_m" > 0 and "set_logs"."distance_m" <= 99999.99);--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "ck_set_logs_duration_s_range" CHECK ("set_logs"."duration_s" > 0 and "set_logs"."duration_s" <= 86400);--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "fk_set_logs_parent_profile" FOREIGN KEY ("session_exercise_id","measurement_profile") REFERENCES "public"."session_exercises"("id","measurement_profile") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "ck_set_logs_profile_shape" CHECK (
        ("set_logs"."measurement_profile" = 'load_reps'     and "set_logs"."weight_kg" is not null and "set_logs"."reps" is not null and "set_logs"."distance_m" is null     and "set_logs"."duration_s" is null)
        or ("set_logs"."measurement_profile" = 'reps'          and "set_logs"."weight_kg" is null     and "set_logs"."reps" is not null and "set_logs"."distance_m" is null     and "set_logs"."duration_s" is null)
        or ("set_logs"."measurement_profile" = 'load_distance' and "set_logs"."weight_kg" is not null and "set_logs"."reps" is null     and "set_logs"."distance_m" is not null and "set_logs"."rir" is null)
        or ("set_logs"."measurement_profile" = 'distance_time' and "set_logs"."weight_kg" is null     and "set_logs"."reps" is null     and "set_logs"."distance_m" is not null and "set_logs"."duration_s" is not null and "set_logs"."rir" is null)
        or ("set_logs"."measurement_profile" = 'duration'      and "set_logs"."weight_kg" is null     and "set_logs"."reps" is null     and "set_logs"."distance_m" is null     and "set_logs"."duration_s" is not null and "set_logs"."rir" is null)
        or ("set_logs"."measurement_profile" = 'load_duration' and "set_logs"."weight_kg" is not null and "set_logs"."reps" is null     and "set_logs"."distance_m" is null     and "set_logs"."duration_s" is not null and "set_logs"."rir" is null)
      );
