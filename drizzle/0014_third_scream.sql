DROP INDEX "uq_recs_one_pending";--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "group_key" text;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "group_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recs_one_pending" ON "recommendations" USING btree ("exercise_id",coalesce("block_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("group_key", '')) WHERE "recommendations"."decision_status" = 'pending';