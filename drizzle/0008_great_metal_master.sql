CREATE TABLE "volume_presets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"classification" text NOT NULL,
	"source_ref" text,
	"evidence_refs" text[],
	"is_builtin" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_volume_presets_classification" CHECK ("volume_presets"."classification" in ('evidence_supported', 'heuristic', 'user_defined'))
);
--> statement-breakpoint
CREATE TABLE "volume_landmarks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"preset_id" uuid NOT NULL,
	"muscle_group_id" text NOT NULL,
	"key" text NOT NULL,
	"value_min" numeric(5, 1),
	"value_max" numeric(5, 1),
	"open_ended" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "uq_landmark" UNIQUE("preset_id","muscle_group_id","key"),
	CONSTRAINT "ck_volume_landmarks_value_min_nonneg" CHECK ("volume_landmarks"."value_min" >= 0),
	CONSTRAINT "ck_volume_landmarks_value_max_gte_min" CHECK ("volume_landmarks"."value_max" is null or "volume_landmarks"."value_min" is null or "volume_landmarks"."value_max" >= "volume_landmarks"."value_min"),
	CONSTRAINT "ck_volume_landmarks_value_present" CHECK ("volume_landmarks"."value_min" is not null or "volume_landmarks"."value_max" is not null)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_volume_preset_id" uuid;--> statement-breakpoint
ALTER TABLE "volume_presets" ADD CONSTRAINT "volume_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_landmarks" ADD CONSTRAINT "volume_landmarks_preset_id_volume_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."volume_presets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_landmarks" ADD CONSTRAINT "volume_landmarks_muscle_group_id_muscle_groups_id_fk" FOREIGN KEY ("muscle_group_id") REFERENCES "public"."muscle_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_volume_presets_user_id" ON "volume_presets" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_default_volume_preset_id_volume_presets_id_fk" FOREIGN KEY ("default_volume_preset_id") REFERENCES "public"."volume_presets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_volume_preset_id_volume_presets_id_fk" FOREIGN KEY ("volume_preset_id") REFERENCES "public"."volume_presets"("id") ON DELETE set null ON UPDATE no action;