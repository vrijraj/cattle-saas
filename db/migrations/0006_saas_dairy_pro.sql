ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "locale" text DEFAULT 'en' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_super_admin" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_token" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "whatsapp_number" text;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "locale" text DEFAULT 'en' NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "voluntary_waiting_days" integer DEFAULT 45 NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'pro' NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "subscription_status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "razorpay_subscription_id" text;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "max_animals" integer DEFAULT 250 NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "max_members" integer DEFAULT 25 NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "ai_monthly_limit" integer DEFAULT 500 NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "iot_api_key_hash" text;
--> statement-breakpoint
ALTER TABLE "milk_yield" ADD COLUMN IF NOT EXISTS "fat_percent" numeric(4, 2);
--> statement-breakpoint
ALTER TABLE "milk_yield" ADD COLUMN IF NOT EXISTS "snf_percent" numeric(4, 2);
--> statement-breakpoint
ALTER TABLE "milk_yield" ADD COLUMN IF NOT EXISTS "scc" integer;
--> statement-breakpoint
ALTER TABLE "milk_yield" ADD COLUMN IF NOT EXISTS "cmt_score" text;
--> statement-breakpoint
ALTER TABLE "straw" ADD COLUMN IF NOT EXISTS "transferred_to" text;
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "unit_label" text;
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "photo_key" text;
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "gst_percent" numeric(5, 2);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "milk_price_history" (
  "id" text PRIMARY KEY NOT NULL,
  "farm_id" text NOT NULL REFERENCES "farm"("id") ON DELETE cascade,
  "effective_from" date NOT NULL,
  "price_per_litre" numeric(12, 2) NOT NULL,
  "fat_bonus_per_point" numeric(8, 2),
  "snf_bonus_per_point" numeric(8, 2),
  "note" text,
  "created_by" text REFERENCES "user"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "milk_price_farm_date" ON "milk_price_history" ("farm_id", "effective_from");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vaccine_protocol" (
  "id" text PRIMARY KEY NOT NULL,
  "farm_id" text NOT NULL REFERENCES "farm"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "kind" text DEFAULT 'vaccine' NOT NULL,
  "species" text DEFAULT 'all' NOT NULL,
  "start_age_days" integer DEFAULT 120 NOT NULL,
  "repeat_every_days" integer,
  "active" boolean DEFAULT true NOT NULL,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vaccine_protocol_farm" ON "vaccine_protocol" ("farm_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medicine_item" (
  "id" text PRIMARY KEY NOT NULL,
  "farm_id" text NOT NULL REFERENCES "farm"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "category" text DEFAULT 'antibiotic' NOT NULL,
  "unit" text DEFAULT 'ml' NOT NULL,
  "batch_number" text,
  "expires_on" date,
  "minimum_quantity" numeric(12, 1),
  "unit_cost" numeric(12, 2),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medicine_item_farm" ON "medicine_item" ("farm_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medicine_movement" (
  "id" text PRIMARY KEY NOT NULL,
  "farm_id" text NOT NULL REFERENCES "farm"("id") ON DELETE cascade,
  "item_id" text NOT NULL REFERENCES "medicine_item"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "quantity" numeric(12, 1) NOT NULL,
  "unit_cost" numeric(12, 2),
  "moved_on" date NOT NULL,
  "animal_id" text REFERENCES "animal"("id"),
  "note" text,
  "voided_at" timestamp,
  "void_reason" text,
  "voided_by" text REFERENCES "user"("id"),
  "created_by" text REFERENCES "user"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medicine_movement_farm" ON "medicine_movement" ("farm_id", "item_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ration_group" (
  "id" text PRIMARY KEY NOT NULL,
  "farm_id" text NOT NULL REFERENCES "farm"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "target_stage" text DEFAULT 'lactating' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ration_group_farm" ON "ration_group" ("farm_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ration_group_item" (
  "id" text PRIMARY KEY NOT NULL,
  "farm_id" text NOT NULL REFERENCES "farm"("id") ON DELETE cascade,
  "group_id" text NOT NULL REFERENCES "ration_group"("id") ON DELETE cascade,
  "feed_item_id" text NOT NULL REFERENCES "feed_item"("id") ON DELETE cascade,
  "kg_per_head_per_day" numeric(8, 2) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ration_group_item_group" ON "ration_group_item" ("group_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_session" (
  "id" text PRIMARY KEY NOT NULL,
  "farm_id" text NOT NULL REFERENCES "farm"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "app_name" text NOT NULL,
  "state_json" jsonb NOT NULL,
  "events_json" jsonb NOT NULL,
  "messages_json" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_session_farm_user" ON "ai_session" ("farm_id", "user_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cron_run" (
  "id" text PRIMARY KEY NOT NULL,
  "farm_id" text NOT NULL REFERENCES "farm"("id") ON DELETE cascade,
  "run_date" date NOT NULL,
  "kind" text NOT NULL,
  "summary_json" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cron_run_farm_date_kind" ON "cron_run" ("farm_id", "run_date", "kind");
