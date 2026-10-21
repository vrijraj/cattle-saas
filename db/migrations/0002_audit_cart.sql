CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"summary" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "milk_yield" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "milk_yield" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "milk_yield" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "calving" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "calving" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "calving" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "deworming" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "deworming" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "deworming" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "health_event" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "health_event" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "health_event" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "heat" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "heat" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "heat" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "insemination" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "insemination" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "vaccination" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "vaccination" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "vaccination" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milk_yield" ADD CONSTRAINT "milk_yield_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deworming" ADD CONSTRAINT "deworming_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_event" ADD CONSTRAINT "health_event_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heat" ADD CONSTRAINT "heat_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insemination" ADD CONSTRAINT "insemination_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_check" ADD CONSTRAINT "pregnancy_check_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination" ADD CONSTRAINT "vaccination_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;