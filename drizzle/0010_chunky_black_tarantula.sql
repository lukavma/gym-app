CREATE TABLE "warmup_routines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warmup_routine_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"routine_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"label" text NOT NULL,
	"instruction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_warmup_routine_item_position" UNIQUE("routine_id","position")
);
--> statement-breakpoint
CREATE TABLE "workout_template_warmup_routines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_template_warmup_routine" UNIQUE("template_id","routine_id"),
	CONSTRAINT "uq_template_warmup_routine_position" UNIQUE("template_id","position")
);
--> statement-breakpoint
ALTER TABLE "warmup_routines" ADD CONSTRAINT "warmup_routines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_routine_items" ADD CONSTRAINT "warmup_routine_items_routine_id_warmup_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."warmup_routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_template_warmup_routines" ADD CONSTRAINT "workout_template_warmup_routines_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_template_warmup_routines" ADD CONSTRAINT "workout_template_warmup_routines_routine_id_warmup_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."warmup_routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_warmup_routines_name" ON "warmup_routines" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "ix_warmup_routines_user_id" ON "warmup_routines" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_warmup_routine_items_routine_id" ON "warmup_routine_items" USING btree ("routine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_template_warmup_routine_default" ON "workout_template_warmup_routines" USING btree ("template_id") WHERE "workout_template_warmup_routines"."is_default";--> statement-breakpoint
CREATE INDEX "ix_workout_template_warmup_routines_template_id" ON "workout_template_warmup_routines" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "ix_workout_template_warmup_routines_routine_id" ON "workout_template_warmup_routines" USING btree ("routine_id");