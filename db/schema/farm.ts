import { numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
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
  milkPricePerLitre: numeric("milk_price_per_litre", { precision: 12, scale: 2 }),
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
