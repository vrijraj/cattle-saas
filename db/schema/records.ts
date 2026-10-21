import { date, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { animals } from "./animal";
import { farms } from "./farm";

function id() {
  return text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
}

function voidFields() {
  return {
    voidedAt: timestamp("voided_at", { mode: "date" }),
    voidReason: text("void_reason"),
    voidedBy: text("voided_by").references(() => users.id),
  };
}

export const bulls = pgTable(
  "bull",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    breed: text("breed"),
    registrationNumber: text("registration_number"),
    semenCompany: text("semen_company"),
    sireCode: text("sire_code"),
    damCode: text("dam_code"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("bull_farm_code").on(table.farmId, table.code)],
);

export const semenBatches = pgTable("semen_batch", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  bullId: text("bull_id")
    .notNull()
    .references(() => bulls.id, { onDelete: "cascade" }),
  batchNumber: text("batch_number").notNull(),
  semenType: text("semen_type").notNull().default("conventional"),
  collectedOn: date("collected_on"),
  quantityReceived: integer("quantity_received").notNull(),
  pricePerStraw: numeric("price_per_straw", { precision: 12, scale: 2 }),
  receivedOn: date("received_on"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const straws = pgTable(
  "straw",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    batchId: text("batch_id")
      .notNull()
      .references(() => semenBatches.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    tank: text("tank"),
    canister: text("canister"),
    goblet: text("goblet"),
    position: text("position"),
    status: text("status").notNull().default("available"),
    usedOnAnimalId: text("used_on_animal_id").references(() => animals.id),
    usedAt: timestamp("used_at", { mode: "date" }),
  },
  (table) => [uniqueIndex("straw_farm_code").on(table.farmId, table.code)],
);

export const heats = pgTable("heat", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  observedOn: date("observed_on").notNull(),
  signs: text("signs").notNull(),
  note: text("note"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  ...voidFields(),
});

export const inseminations = pgTable("insemination", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  performedOn: date("performed_on").notNull(),
  technicianName: text("technician_name").notNull(),
  bullCode: text("bull_code").notNull(),
  bullName: text("bull_name"),
  batchNumber: text("batch_number"),
  strawCode: text("straw_code"),
  attemptNumber: integer("attempt_number").notNull().default(1),
  note: text("note"),
  ...voidFields(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const pregnancyChecks = pgTable("pregnancy_check", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  inseminationId: text("insemination_id").references(() => inseminations.id),
  checkedOn: date("checked_on").notNull(),
  result: text("result").notNull(),
  method: text("method"),
  ...voidFields(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const calvings = pgTable("calving", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  damId: text("dam_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  inseminationId: text("insemination_id").references(() => inseminations.id),
  calvedOn: date("calved_on").notNull(),
  calfId: text("calf_id").references(() => animals.id),
  outcome: text("outcome").notNull(),
  ease: text("ease"),
  note: text("note"),
  ...voidFields(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const healthEvents = pgTable("health_event", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  eventOn: date("event_on").notNull(),
  problem: text("problem").notNull(),
  signs: text("signs"),
  diagnosis: text("diagnosis"),
  treatment: text("treatment"),
  medicine: text("medicine"),
  dose: text("dose"),
  route: text("route"),
  veterinarian: text("veterinarian"),
  followUpOn: date("follow_up_on"),
  outcome: text("outcome").notNull().default("ongoing"),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  ...voidFields(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const vaccinations = pgTable("vaccination", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  vaccine: text("vaccine").notNull(),
  batch: text("batch"),
  givenOn: date("given_on").notNull(),
  nextDueOn: date("next_due_on"),
  administeredBy: text("administered_by"),
  ...voidFields(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const dewormings = pgTable("deworming", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  product: text("product").notNull(),
  givenOn: date("given_on").notNull(),
  nextDueOn: date("next_due_on"),
  ...voidFields(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const weights = pgTable("weight", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  weighedOn: date("weighed_on").notNull(),
  kilograms: numeric("kilograms", { precision: 6, scale: 1 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const feedItems = pgTable("feed_item", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull().default("kg"),
  minimumQuantity: numeric("minimum_quantity", { precision: 12, scale: 1 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const feedMovements = pgTable("feed_movement", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => feedItems.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 1 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  movedOn: date("moved_on").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const financeEntries = pgTable("finance_entry", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  entryOn: date("entry_on").notNull(),
  animalId: text("animal_id").references(() => animals.id),
  note: text("note"),
  ...voidFields(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const embryos = pgTable(
  "embryo",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    donorId: text("donor_id").references(() => animals.id),
    sireCode: text("sire_code"),
    grade: text("grade"),
    storage: text("storage").notNull().default("fresh"),
    frozenOn: date("frozen_on"),
    location: text("location"),
    status: text("status").notNull().default("in_stock"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("embryo_farm_code").on(table.farmId, table.code)],
);

export const embryoTransfers = pgTable("embryo_transfer", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  embryoId: text("embryo_id")
    .notNull()
    .references(() => embryos.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => animals.id),
  transferredOn: date("transferred_on").notNull(),
  pregnancyResult: text("pregnancy_result"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const listings = pgTable("listing", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  animalId: text("animal_id").references(() => animals.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }),
  published: text("published").notNull().default("no"),
  showPedigree: text("show_pedigree").notNull().default("no"),
  showPregnancy: text("show_pregnancy").notNull().default("no"),
  publicNote: text("public_note"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const enquiries = pgTable("enquiry", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  animalCode: text("animal_code"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const products = pgTable("product", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  published: text("published").notNull().default("yes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const orders = pgTable("order", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending_payment"),
  razorpayOrderId: text("razorpay_order_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const orderItems = pgTable("order_item", {
  id: id(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
});

export const auditLogs = pgTable("audit_log", {
  id: id(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farms.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  summary: text("summary").notNull(),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
