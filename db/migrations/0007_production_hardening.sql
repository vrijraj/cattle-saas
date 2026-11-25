CREATE TABLE IF NOT EXISTS "rate_limit_bucket" (
  "key" text PRIMARY KEY NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  "reset_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rate_limit_reset_at" ON "rate_limit_bucket" ("reset_at");
