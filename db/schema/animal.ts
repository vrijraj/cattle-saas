import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { farms } from "./farm";

export const species = pgEnum("species", ["cattle", "buffalo"]);
export const sex = pgEnum("sex", ["female", "male", "unknown"]);
export const presence = pgEnum("presence", ["on_farm", "sold", "dead", "transferred"]);
export const lifeStage = pgEnum("life_stage", ["calf", "heifer", "cow", "bull", "steer"]);
export const reproduction = pgEnum("reproduction", [
  "not_applicable",
  "open",
  "bred",
  "pregnant",
  "fresh",
]);
export const lactationState = pgEnum("lactation_state", [
  "not_applicable",
  "pre_lactation",
  "lactating",
  "dry",
]);

export const breeds = pgTable(
  "breed",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    species: species("species").notNull(),
    gestationDays: integer("gestation_days").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [uniqueIndex("breed_farm_code").on(table.farmId, table.code)],
);

export const locations = pgTable(
  "location",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [uniqueIndex("location_farm_name").on(table.farmId, table.name)],
);

export const codeCounters = pgTable(
  "code_counter",
  {
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    breedCode: text("breed_code").notNull(),
    nextValue: integer("next_value").notNull(),
  },
  (table) => [primaryKey({ columns: [table.farmId, table.breedCode] })],
);

export const animals = pgTable(
  "animal",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name"),
    species: species("species").notNull(),
    breedId: text("breed_id")
      .notNull()
      .references(() => breeds.id),
    sex: sex("sex").notNull(),
    dob: date("dob"),
    dobEstimated: boolean("dob_estimated").notNull().default(false),
    colour: text("colour"),
    marks: text("marks"),
    presence: presence("presence").notNull().default("on_farm"),
    lifeStage: lifeStage("life_stage").notNull(),
    reproduction: reproduction("reproduction").notNull().default("open"),
    lactation: lactationState("lactation").notNull().default("pre_lactation"),
    locationId: text("location_id").references(() => locations.id),
    earTag: text("ear_tag"),
    rfid: text("rfid"),
    qrToken: text("qr_token").notNull().unique(),
    purchaseSource: text("purchase_source"),
    purchaseDate: date("purchase_date"),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
    geneticDamId: text("genetic_dam_id").references((): AnyPgColumn => animals.id),
    geneticSireCode: text("genetic_sire_code"),
    geneticSireName: text("genetic_sire_name"),
    conceptionOn: date("conception_on"),
    expectedCalving: date("expected_calving"),
    photoKey: text("photo_key"),
    isolationReason: text("isolation_reason"),
    isolatedOn: date("isolated_on"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("animal_farm_code").on(table.farmId, table.code),
    uniqueIndex("animal_farm_ear_tag")
      .on(table.farmId, table.earTag)
      .where(sql`${table.earTag} is not null`),
  ],
);

export const alerts = pgTable("alert", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  animalId: text("animal_id").references(() => animals.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  dueOn: date("due_on"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const milkYields = pgTable(
  "milk_yield",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    recordedOn: date("recorded_on").notNull(),
    morningLitres: numeric("morning_litres", { precision: 6, scale: 1 }),
    eveningLitres: numeric("evening_litres", { precision: 6, scale: 1 }),
    createdBy: text("created_by").references(() => users.id),
    voidedAt: timestamp("voided_at", { mode: "date" }),
    voidReason: text("void_reason"),
    voidedBy: text("voided_by").references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("milk_animal_day").on(table.animalId, table.recordedOn)],
);
