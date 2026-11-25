import { boolean, date, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { animals } from "./animal";
import { farms } from "./farm";
import { feedItems } from "./records";

function id() {
  return text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
}

export const milkPriceHistory = pgTable(
  "milk_price_history",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from").notNull(),
    pricePerLitre: numeric("price_per_litre", { precision: 12, scale: 2 }).notNull(),
    fatBonusPerPoint: numeric("fat_bonus_per_point", { precision: 8, scale: 2 }),
    snfBonusPerPoint: numeric("snf_bonus_per_point", { precision: 8, scale: 2 }),
    note: text("note"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("milk_price_farm_date").on(table.farmId, table.effectiveFrom)],
);

export const vaccineProtocols = pgTable("vaccine_protocol", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("vaccine"),
  species: text("species").notNull().default("all"),
  startAgeDays: integer("start_age_days").notNull().default(120),
  repeatEveryDays: integer("repeat_every_days"),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const medicineItems = pgTable("medicine_item", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull().default("antibiotic"),
  unit: text("unit").notNull().default("ml"),
  batchNumber: text("batch_number"),
  expiresOn: date("expires_on"),
  minimumQuantity: numeric("minimum_quantity", { precision: 12, scale: 1 }),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const medicineMovements = pgTable("medicine_movement", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => medicineItems.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 1 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  movedOn: date("moved_on").notNull(),
  animalId: text("animal_id").references(() => animals.id),
  note: text("note"),
  voidedAt: timestamp("voided_at", { mode: "date" }),
  voidReason: text("void_reason"),
  voidedBy: text("voided_by").references(() => users.id),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const rationGroups = pgTable("ration_group", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetStage: text("target_stage").notNull().default("lactating"),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const rationGroupItems = pgTable("ration_group_item", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  groupId: text("group_id")
    .notNull()
    .references(() => rationGroups.id, { onDelete: "cascade" }),
  feedItemId: text("feed_item_id")
    .notNull()
    .references(() => feedItems.id, { onDelete: "cascade" }),
  kgPerHeadPerDay: numeric("kg_per_head_per_day", { precision: 8, scale: 2 }).notNull(),
});

export const aiSessions = pgTable("ai_session", {
  id: text("id").primaryKey(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  appName: text("app_name").notNull(),
  stateJson: jsonb("state_json").notNull(),
  eventsJson: jsonb("events_json").notNull(),
  messagesJson: jsonb("messages_json").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const cronRuns = pgTable(
  "cron_run",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    runDate: date("run_date").notNull(),
    kind: text("kind").notNull(),
    summaryJson: jsonb("summary_json").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("cron_run_farm_date_kind").on(table.farmId, table.runDate, table.kind)],
);

export const rateLimitBuckets = pgTable("rate_limit_bucket", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  resetAt: timestamp("reset_at", { mode: "date" }).notNull(),
});
