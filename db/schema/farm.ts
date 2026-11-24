import { boolean, integer, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const farms = pgTable("farm", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  currency: text("currency").notNull().default("INR"),
  animalPrefix: text("animal_prefix").notNull().default("MIL"),
  enquiryEmail: text("enquiry_email"),
  milkPricePerLitre: numeric("milk_price_per_litre", { precision: 12, scale: 2 }),
  milkDropPercent: integer("milk_drop_percent").notNull().default(30),
  requireBothMilkSessions: boolean("require_both_milk_sessions").notNull().default(true),
  pdDueDaysCattle: integer("pd_due_days_cattle").notNull().default(35),
  pdDueDaysBuffalo: integer("pd_due_days_buffalo").notNull().default(40),
  dryOffLeadCattle: integer("dry_off_lead_cattle").notNull().default(60),
  dryOffLeadBuffalo: integer("dry_off_lead_buffalo").notNull().default(90),
  matingGenerationWindow: integer("mating_generation_window").notNull().default(4),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const farmMembers = pgTable(
  "farm_member",
  {
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roles: text("roles").array().notNull(),
    canRecordVaccines: boolean("can_record_vaccines").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.farmId, table.userId] })],
);

export const invites = pgTable("invite", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  roles: text("roles").array().notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  acceptedAt: timestamp("accepted_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
