ALTER TABLE "farm" ADD COLUMN "milk_drop_percent" integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bull" ADD COLUMN "photo_key" text;
--> statement-breakpoint
ALTER TABLE "health_event" ADD COLUMN "duration" text;
--> statement-breakpoint
ALTER TABLE "health_event" ADD COLUMN "attachment_key" text;
--> statement-breakpoint
ALTER TABLE "health_event" ADD COLUMN "attachment_name" text;
