CREATE TABLE "location_move" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"location_id" text,
	"moved_on" date NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dry_off" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"dried_on" date NOT NULL,
	"note" text,
	"voided_at" timestamp,
	"void_reason" text,
	"voided_by" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "location_move" ADD CONSTRAINT "location_move_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_move" ADD CONSTRAINT "location_move_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_move" ADD CONSTRAINT "location_move_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_move" ADD CONSTRAINT "location_move_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dry_off" ADD CONSTRAINT "dry_off_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dry_off" ADD CONSTRAINT "dry_off_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dry_off" ADD CONSTRAINT "dry_off_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dry_off" ADD CONSTRAINT "dry_off_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
