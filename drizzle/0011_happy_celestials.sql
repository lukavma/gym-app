ALTER TABLE "exercises" ADD COLUMN "strength_estimate" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "ck_exercises_strength_estimate" CHECK ("exercises"."strength_estimate" in ('auto', 'off'));
