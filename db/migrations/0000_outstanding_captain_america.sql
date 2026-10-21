CREATE TYPE "public"."lactation_state" AS ENUM('not_applicable', 'pre_lactation', 'lactating', 'dry');--> statement-breakpoint
CREATE TYPE "public"."life_stage" AS ENUM('calf', 'heifer', 'cow', 'bull', 'steer');--> statement-breakpoint
CREATE TYPE "public"."presence" AS ENUM('on_farm', 'sold', 'dead', 'transferred');--> statement-breakpoint
CREATE TYPE "public"."reproduction" AS ENUM('not_applicable', 'open', 'bred', 'pregnant', 'fresh');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('female', 'male', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."species" AS ENUM('cattle', 'buffalo');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"password_hash" text,
	"disabled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "farm_member" (
	"farm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"roles" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "farm_member_farm_id_user_id_pk" PRIMARY KEY("farm_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "farm" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"animal_prefix" text DEFAULT 'MIL' NOT NULL,
	"milk_price_per_litre" numeric(12, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "farm_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"email" text NOT NULL,
	"roles" text[] NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"due_on" date,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animal" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"species" "species" NOT NULL,
	"breed_id" text NOT NULL,
	"sex" "sex" NOT NULL,
	"dob" date,
	"dob_estimated" boolean DEFAULT false NOT NULL,
	"colour" text,
	"marks" text,
	"presence" "presence" DEFAULT 'on_farm' NOT NULL,
	"life_stage" "life_stage" NOT NULL,
	"reproduction" "reproduction" DEFAULT 'open' NOT NULL,
	"lactation" "lactation_state" DEFAULT 'pre_lactation' NOT NULL,
	"location_id" text,
	"ear_tag" text,
	"rfid" text,
	"qr_token" text NOT NULL,
	"purchase_source" text,
	"purchase_date" date,
	"purchase_price" numeric(12, 2),
	"genetic_dam_id" text,
	"genetic_sire_code" text,
	"genetic_sire_name" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "animal_qr_token_unique" UNIQUE("qr_token")
);
--> statement-breakpoint
CREATE TABLE "breed" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"species" "species" NOT NULL,
	"gestation_days" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_counter" (
	"farm_id" text NOT NULL,
	"breed_code" text NOT NULL,
	"next_value" integer NOT NULL,
	CONSTRAINT "code_counter_farm_id_breed_code_pk" PRIMARY KEY("farm_id","breed_code")
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milk_yield" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"recorded_on" date NOT NULL,
	"morning_litres" numeric(6, 1),
	"evening_litres" numeric(6, 1),
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_member" ADD CONSTRAINT "farm_member_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_member" ADD CONSTRAINT "farm_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_breed_id_breed_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."breed"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_genetic_dam_id_animal_id_fk" FOREIGN KEY ("genetic_dam_id") REFERENCES "public"."animal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breed" ADD CONSTRAINT "breed_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_counter" ADD CONSTRAINT "code_counter_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milk_yield" ADD CONSTRAINT "milk_yield_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milk_yield" ADD CONSTRAINT "milk_yield_animal_id_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milk_yield" ADD CONSTRAINT "milk_yield_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animal_farm_code" ON "animal" USING btree ("farm_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "animal_farm_ear_tag" ON "animal" USING btree ("farm_id","ear_tag") WHERE "animal"."ear_tag" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "breed_farm_code" ON "breed" USING btree ("farm_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "location_farm_name" ON "location" USING btree ("farm_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "milk_animal_day" ON "milk_yield" USING btree ("animal_id","recorded_on");