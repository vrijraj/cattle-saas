CREATE TABLE "bull" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"breed" text,
	"registration_number" text,
	"semen_company" text,
	"sire_code" text,
	"dam_code" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calving" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"dam_id" text NOT NULL,
	"insemination_id" text,
	"calved_on" date NOT NULL,
	"calf_id" text,
	"outcome" text NOT NULL,
	"ease" text,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deworming" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"product" text NOT NULL,
	"given_on" date NOT NULL,
	"next_due_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embryo_transfer" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"embryo_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"transferred_on" date NOT NULL,
	"pregnancy_result" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embryo" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"code" text NOT NULL,
	"donor_id" text,
	"sire_code" text,
	"grade" text,
	"storage" text DEFAULT 'fresh' NOT NULL,
	"frozen_on" date,
	"location" text,
	"status" text DEFAULT 'in_stock' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiry" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_code" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_item" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text DEFAULT 'kg' NOT NULL,
	"minimum_quantity" numeric(12, 1),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"item_id" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" numeric(12, 1) NOT NULL,
	"unit_cost" numeric(12, 2),
	"moved_on" date NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"entry_on" date NOT NULL,
	"animal_id" text,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_event" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"event_on" date NOT NULL,
	"problem" text NOT NULL,
	"signs" text,
	"diagnosis" text,
	"treatment" text,
	"medicine" text,
	"dose" text,
	"route" text,
	"veterinarian" text,
	"follow_up_on" date,
	"outcome" text DEFAULT 'ongoing' NOT NULL,
	"cost" numeric(12, 2),
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heat" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"observed_on" date NOT NULL,
	"signs" text NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insemination" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"performed_on" date NOT NULL,
	"technician_name" text NOT NULL,
	"bull_code" text NOT NULL,
	"bull_name" text,
	"batch_number" text,
	"straw_code" text,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"note" text,
	"voided_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text,
	"category" text NOT NULL,
	"price" numeric(12, 2),
	"published" text DEFAULT 'no' NOT NULL,
	"show_pedigree" text DEFAULT 'no' NOT NULL,
	"show_pregnancy" text DEFAULT 'no' NOT NULL,
	"public_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"product_id" text,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"razorpay_order_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pregnancy_check" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"insemination_id" text,
	"checked_on" date NOT NULL,
	"result" text NOT NULL,
	"method" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"published" text DEFAULT 'yes' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semen_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"bull_id" text NOT NULL,
	"batch_number" text NOT NULL,
	"semen_type" text DEFAULT 'conventional' NOT NULL,
	"collected_on" date,
	"quantity_received" integer NOT NULL,
	"price_per_straw" numeric(12, 2),
	"received_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "straw" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"code" text NOT NULL,
	"tank" text,
	"canister" text,
	"goblet" text,
	"position" text,
	"status" text DEFAULT 'available' NOT NULL,
	"used_on_animal_id" text,
	"used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "vaccination" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"vaccine" text NOT NULL,
	"batch" text,
	"given_on" date NOT NULL,
	"next_due_on" date,
	"administered_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weight" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"weighed_on" date NOT NULL,
	"kilograms" numeric(6, 1) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "conception_on" date;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "expected_calving" date;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "photo_key" text;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "isolation_reason" text;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "isolated_on" date;--> statement-breakpoint
ALTER TABLE "bull" ADD CONSTRAINT "bull_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_dam_id_animal_id_fk" FOREIGN KEY ("dam_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_insemination_id_insemination_id_fk" FOREIGN KEY ("insemination_id") REFERENCES "public"."insemination"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_calf_id_animal_id_fk" FOREIGN KEY ("calf_id") REFERENCES "public"."animal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deworming" ADD CONSTRAINT "deworming_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deworming" ADD CONSTRAINT "deworming_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embryo_transfer" ADD CONSTRAINT "embryo_transfer_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embryo_transfer" ADD CONSTRAINT "embryo_transfer_embryo_id_embryo_id_fk" FOREIGN KEY ("embryo_id") REFERENCES "public"."embryo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embryo_transfer" ADD CONSTRAINT "embryo_transfer_recipient_id_animal_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."animal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embryo" ADD CONSTRAINT "embryo_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embryo" ADD CONSTRAINT "embryo_donor_id_animal_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."animal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_item" ADD CONSTRAINT "feed_item_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_movement" ADD CONSTRAINT "feed_movement_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_movement" ADD CONSTRAINT "feed_movement_item_id_feed_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."feed_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_event" ADD CONSTRAINT "health_event_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_event" ADD CONSTRAINT "health_event_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_event" ADD CONSTRAINT "health_event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heat" ADD CONSTRAINT "heat_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heat" ADD CONSTRAINT "heat_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heat" ADD CONSTRAINT "heat_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insemination" ADD CONSTRAINT "insemination_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insemination" ADD CONSTRAINT "insemination_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insemination" ADD CONSTRAINT "insemination_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_insemination_id_insemination_id_fk" FOREIGN KEY ("insemination_id") REFERENCES "public"."insemination"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semen_batch" ADD CONSTRAINT "semen_batch_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semen_batch" ADD CONSTRAINT "semen_batch_bull_id_bull_id_fk" FOREIGN KEY ("bull_id") REFERENCES "public"."bull"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "straw" ADD CONSTRAINT "straw_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "straw" ADD CONSTRAINT "straw_batch_id_semen_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."semen_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "straw" ADD CONSTRAINT "straw_used_on_animal_id_animal_id_fk" FOREIGN KEY ("used_on_animal_id") REFERENCES "public"."animal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination" ADD CONSTRAINT "vaccination_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination" ADD CONSTRAINT "vaccination_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight" ADD CONSTRAINT "weight_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight" ADD CONSTRAINT "weight_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bull_farm_code" ON "bull" USING btree ("farm_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "embryo_farm_code" ON "embryo" USING btree ("farm_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "straw_farm_code" ON "straw" USING btree ("farm_id","code");