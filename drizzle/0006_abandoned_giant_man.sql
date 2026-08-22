CREATE TABLE "block_week_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"block_id" uuid NOT NULL,
	"week_index" smallint NOT NULL,
	"type" text NOT NULL,
	"modifiers" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_week_override" UNIQUE("block_id","week_index"),
	CONSTRAINT "ck_block_week_overrides_week_index" CHECK ("block_week_overrides"."week_index" >= 1),
	CONSTRAINT "ck_block_week_overrides_type" CHECK ("block_week_overrides"."type" in ('deload', 'custom'))
);
--> statement-breakpoint
ALTER TABLE "block_week_overrides" ADD CONSTRAINT "block_week_overrides_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_block_week_overrides_block_id" ON "block_week_overrides" USING btree ("block_id");