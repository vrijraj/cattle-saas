ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "enquiry_email" text;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "require_both_milk_sessions" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "pd_due_days_cattle" integer DEFAULT 35 NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "pd_due_days_buffalo" integer DEFAULT 40 NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "dry_off_lead_cattle" integer DEFAULT 60 NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "dry_off_lead_buffalo" integer DEFAULT 90 NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN IF NOT EXISTS "mating_generation_window" integer DEFAULT 4 NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm_member" ADD COLUMN IF NOT EXISTS "can_record_vaccines" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN IF NOT EXISTS "exit_on" date;
--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN IF NOT EXISTS "exit_reason" text;
--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN IF NOT EXISTS "exit_amount" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN IF NOT EXISTS "birth_dam_id" text REFERENCES "animal"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "animal_farm_rfid" ON "animal" USING btree ("farm_id","rfid") WHERE "animal"."rfid" is not null;
--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD COLUMN IF NOT EXISTS "embryo_transfer_id" text REFERENCES "embryo_transfer"("id");
--> statement-breakpoint
ALTER TABLE "calving" ADD COLUMN IF NOT EXISTS "embryo_transfer_id" text REFERENCES "embryo_transfer"("id");
--> statement-breakpoint
ALTER TABLE "calving" ADD COLUMN IF NOT EXISTS "expected_calving" date;
--> statement-breakpoint
ALTER TABLE "health_event" ADD COLUMN IF NOT EXISTS "quarters" text;
--> statement-breakpoint
ALTER TABLE "health_event" ADD COLUMN IF NOT EXISTS "withdrawal_days" integer;
--> statement-breakpoint
ALTER TABLE "health_event" ADD COLUMN IF NOT EXISTS "withdrawal_until" date;
--> statement-breakpoint
ALTER TABLE "vaccination" ADD COLUMN IF NOT EXISTS "created_by" text REFERENCES "user"("id");
--> statement-breakpoint
ALTER TABLE "deworming" ADD COLUMN IF NOT EXISTS "created_by" text REFERENCES "user"("id");
--> statement-breakpoint
ALTER TABLE "weight" ADD COLUMN IF NOT EXISTS "voided_at" timestamp;
--> statement-breakpoint
ALTER TABLE "weight" ADD COLUMN IF NOT EXISTS "void_reason" text;
--> statement-breakpoint
ALTER TABLE "weight" ADD COLUMN IF NOT EXISTS "voided_by" text REFERENCES "user"("id");
--> statement-breakpoint
ALTER TABLE "weight" ADD COLUMN IF NOT EXISTS "created_by" text REFERENCES "user"("id");
--> statement-breakpoint
ALTER TABLE "feed_movement" ADD COLUMN IF NOT EXISTS "voided_at" timestamp;
--> statement-breakpoint
ALTER TABLE "feed_movement" ADD COLUMN IF NOT EXISTS "void_reason" text;
--> statement-breakpoint
ALTER TABLE "feed_movement" ADD COLUMN IF NOT EXISTS "voided_by" text REFERENCES "user"("id");
--> statement-breakpoint
ALTER TABLE "feed_movement" ADD COLUMN IF NOT EXISTS "created_by" text REFERENCES "user"("id");
--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN IF NOT EXISTS "source_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_farm_source_key" ON "finance_entry" USING btree ("farm_id","source_key") WHERE "finance_entry"."source_key" is not null and "finance_entry"."voided_at" is null;
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN IF NOT EXISTS "show_name" text DEFAULT 'yes' NOT NULL;
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN IF NOT EXISTS "pedigree_depth" integer DEFAULT 2 NOT NULL;
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN IF NOT EXISTS "show_milk" text DEFAULT 'no' NOT NULL;
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN IF NOT EXISTS "public_health_note" text;
--> statement-breakpoint
ALTER TABLE "enquiry" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'new' NOT NULL;
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "razorpay_payment_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_animal_farm" ON "animal" USING btree ("farm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_milk_farm_date" ON "milk_yield" USING btree ("farm_id","recorded_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alert_farm_status" ON "alert" USING btree ("farm_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_farm_created" ON "audit_log" USING btree ("farm_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_farm_animal" ON "insemination" USING btree ("farm_id","animal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pd_farm_animal" ON "pregnancy_check" USING btree ("farm_id","animal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calving_farm_dam" ON "calving" USING btree ("farm_id","dam_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_health_farm_animal" ON "health_event" USING btree ("farm_id","animal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vaccine_farm_animal" ON "vaccination" USING btree ("farm_id","animal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deworm_farm_animal" ON "deworming" USING btree ("farm_id","animal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_weight_farm_animal" ON "weight" USING btree ("farm_id","animal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feed_move_farm_item" ON "feed_movement" USING btree ("farm_id","item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_finance_farm_entry" ON "finance_entry" USING btree ("farm_id","entry_on");
