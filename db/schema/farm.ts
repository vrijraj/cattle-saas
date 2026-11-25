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
  whatsappNumber: text("whatsapp_number"),
  locale: text("locale").notNull().default("en"),
  milkPricePerLitre: numeric("milk_price_per_litre", { precision: 12, scale: 2 }),
  milkDropPercent: integer("milk_drop_percent").notNull().default(30),
  requireBothMilkSessions: boolean("require_both_milk_sessions").notNull().default(true),
  pdDueDaysCattle: integer("pd_due_days_cattle").notNull().default(35),
  pdDueDaysBuffalo: integer("pd_due_days_buffalo").notNull().default(40),
  dryOffLeadCattle: integer("dry_off_lead_cattle").notNull().default(60),
  dryOffLeadBuffalo: integer("dry_off_lead_buffalo").notNull().default(90),
  voluntaryWaitingDays: integer("voluntary_waiting_days").notNull().default(45),
  matingGenerationWindow: integer("mating_generation_window").notNull().default(4),
  plan: text("plan").notNull().default("pro"),
  subscriptionStatus: text("subscription_status").notNull().default("active"),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  maxAnimals: integer("max_animals").notNull().default(250),
  maxMembers: integer("max_members").notNull().default(25),
  aiMonthlyLimit: integer("ai_monthly_limit").notNull().default(500),
  iotApiKeyHash: text("iot_api_key_hash"),
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
