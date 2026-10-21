# Product Requirements Document

**Product:** Cattle Management SaaS  
**Document status:** Draft v1.3  
**Date:** 21 October 2026  
**Audience:** Product, design, engineering, and farm stakeholders

---

## 1. Summary

Build a multi-farm SaaS for dairy and genetics operations. Farm staff record each animal once, then log breeding, health, milk, weight, feed, and money against that animal. The system keeps the pedigree, semen inventory, and reproductive timeline consistent, and it surfaces what is due today.

The product has two surfaces:

1. **Farm workspace** — authenticated, role-based, mobile-friendly operations.
2. **Public catalogue** — selected animals, semen, and embryos shown for enquiry, with product checkout added later.

Phase 1 is daily farm work: animal identity, pedigree, semen, breeding, health, milk, weight, feed stock, reminders, and exports. Embryo workflows, finance, the public site, ecommerce, and predictive models are designed into the data model and shipped in later phases. Mating checks and milk-drop alerts are decision support. They do not make veterinary or genetic claims.

The application is Next.js, NextAuth, PostgreSQL, Drizzle, Tailwind CSS, and shadcn/ui. Section 7 is the full stack.

---

## 2. Problem

Commercial dairy and indigenous-breed farms (for example Gir herds using IDs such as `MIL-GIR-001`) still split records across notebooks, spreadsheets, and staff memory. That creates four failures:

- A calf is born and nobody can reliably name the dam, the sire, and the straw that produced it.
- Semen straws are stored in liquid nitrogen by tank, canister, goblet, and position, and stock drifts from what was actually used.
- Pregnancy checks, dry-off, vaccination, and calving dates are missed because they live in someone’s head.
- Genetics, milk, and cost data cannot be compared across years, so mating and culling decisions stay anecdotal.

Staff work in sheds with a phone, not at a desk. If recording an event takes more than a few taps after scanning an ear-tag QR, they will not record it.

---

## 3. Goals

| Goal | What success looks like |
| --- | --- |
| One lifetime record per animal | Ear tag, RFID, name, photo, status, location, purchase, and full event history live on one profile. |
| Pedigree that stays true | Dam, sire, offspring, and a visual tree are created from breeding and calving events, not retyped. |
| Breeding loop is closed | Heat → AI → straw consumption → pregnancy diagnosis → expected calving → calving → calf linked to dam and sire. |
| Health is a timeline | Vaccination, deworming, treatment, and vet notes are dated, due-dated, and visible as alerts. |
| Milk and weight are usable | Daily yield and weight charts exist per animal and per herd, with a configurable milk-drop alert. |
| Field staff can keep up | Scan QR → profile → one-tap event. Phone layout is a primary surface, not a shrunk desktop page. |
| Genetics compound over time | Bull-wise offspring, daughter milk, reproduction, and health can be queried as the herd history grows. |
| Selected stock can be shown and sold | Public listings and, later, catalogue checkout without exposing private farm data. |

## 4. Non-goals

- Phase 1 does not include machine-learning heat prediction, disease-risk models, body-condition scoring, or automated animal valuation.
- The mating check does not certify an animal, compute a regulatory inbreeding coefficient for official papers, or replace a genetics manager’s judgement.
- The product does not control milking-parlour hardware, LN2 tank sensors, or laboratory instruments in Phase 1.
- Phase 1 does not send WhatsApp or SMS. The alert model must allow those channels later without redesigning events.
- This is not a general accounting suite. Farm income and expense tracking is in scope; payroll tax, GST filing, and full double-entry accounting are not, unless added explicitly later.
- Native iOS and Android apps are out of Phase 1. The field system is a responsive web app, structured so a later app can use the same APIs.

---

## 5. Users

The tenant is a **farm** (organization). A person belongs to one or more farms. Data never leaks across farms. A platform admin exists only to operate the SaaS, not to act as farm staff.

| Persona | Needs |
| --- | --- |
| Owner | Herd snapshot, money, and who is allowed to change records. |
| Farm manager | Daily operations, locations, tasks, and staff activity. |
| Veterinarian | Clinical timeline, prescriptions, follow-ups, isolation. |
| AI technician | Heat, insemination, straw used, pregnancy checks. |
| Farm worker | Fast mobile entry: milk, feed, weight, and simple events. |
| Accountant | Income, expense, milk value, and exports. |
| Genetics manager | Pedigree, bull and semen database, mating check, performance. |
| Admin | Users, roles, farm settings, ID formats, alert rules, published listings. |

A typical farm has one owner, one manager, and several workers. The same person may hold more than one role. Permissions are the union of assigned roles, with explicit denies unavailable in Phase 1 (role grants only).

---

## 6. Product principles

1. **The animal is the root.** Every breeding, health, milk, weight, and sale event hangs off an animal. Herd totals are aggregates, not a second source of truth.
2. **Record once, derive the rest.** Expected calving, days in milk, straw balance, offspring links, and due dates are calculated from events.
3. **History is append-only.** Corrections create a new version or a voided event with a reason. Animals are never hard-deleted. Sold, dead, and transferred animals stay searchable.
4. **Phone first for entry, desk first for analysis.** Event capture is a short mobile flow. Pedigree, genetics, finance, and exports can be denser screens.
5. **Decision support stays labelled.** Alerts and mating flags state the rule that fired and the inputs used. They do not say an animal is infertile, diseased, or genetically unfit.
6. **Private by default.** Nothing appears on the public site until someone with publish permission marks those fields public.
7. **Leave seams for later work.** Embryo identity, notification channels, and analytics fields exist in the model before the full UI ships.

---

## 7. Tech stack

One Next.js application serves the farm workspace, the public catalogue, and the later shop. PostgreSQL is the system of record. Drizzle is the only way application code reads and writes it. Tailwind CSS and shadcn/ui are the only UI system.

### 7.1 Choices

| Layer | Choice | Job |
| --- | --- | --- |
| Application | Next.js App Router, TypeScript | Pages, Server Actions, Route Handlers, public site |
| Auth | NextAuth (Auth.js v5, package `next-auth`) | Email and password, database sessions, active farm on the session |
| Database | PostgreSQL 16 | Animals, events, stock, files metadata, orders |
| Data access | Drizzle ORM and drizzle-kit | Schema, SQL migrations, typed queries |
| UI | Tailwind CSS and shadcn/ui | Layout, forms, sheets, tables, charts |
| Validation | Zod | One schema for the form and the server action |
| Forms | React Hook Form | Field entry, including the mobile quick actions |
| Charts | Recharts through the shadcn chart component | Milk and weight |
| Registers | TanStack Table | Herd, semen, health, and export preview tables |
| Files | Cloudflare R2 | Photos, videos, and prescriptions. Private bucket by default. |
| QR | `qrcode` to print, `html5-qrcode` to scan | Animal cards and straw lookup in the phone browser |
| Excel | ExcelJS | Register exports |
| PDF | `@react-pdf/renderer` | Pedigree sheets and PDF registers |
| Email | ZeptoMail | Invites, enquiry notices, and later alert mail |
| Schedule | Host cron, once a day | Open due alerts. Saving an event also opens or closes alerts in the same request. |
| Payments | Razorpay, Phase 3 | Checkout plus a signed webhook |
| Tests | Vitest and Playwright | Domain rules, and the phone-width flows in §12 |
| Host | Vercel, Neon Postgres, Cloudflare R2 | App, database, and file storage. The app stays standard Next.js and Postgres so the app host can change. R2 remains the file store. |

Package manager is pnpm. Node is the current Active LTS.

### 7.2 How requests are handled

| Kind of work | Where it runs |
| --- | --- |
| Dashboard, profile, lists | Server Components reading through Drizzle |
| Heat, AI, PD, calving, milk, health, stock | Server Actions |
| QR image, Excel, PDF | Route Handlers that check the role, then stream the file |
| Razorpay webhook (Phase 3) | Route Handler that verifies the signature before it writes an order |
| Camera scan | Client component. It only resolves a code. Saving still goes through a Server Action. |

There is no second backend service in Phase 1. The phone UI is this same app at a narrow width.

Route groups:

```text
app/
  (public)/          catalogue, enquiry, signed-out QR result
  (auth)/            sign in, accept invite, set password
  (app)/             farm workspace
  api/webhooks/      Razorpay later
  q/[token]/         QR landing
```

### 7.3 Auth

- Adapter: `@auth/drizzle-adapter` on the same Postgres database.
- Provider: Credentials, email plus password. The password hash is Argon2id.
- Session strategy: database. Disabling a user or revoking a session takes effect on the next request.
- The session stores the user id and the active farm id. A person in two farms switches farm explicitly. The switch reloads the workspace.
- Roles live in `farm_member`. They are loaded on the server for every action. They are not trusted from a hidden form field.
- Invite: admin creates a single-use invite row. ZeptoMail sends the link. The invite expires in 7 days. If sending fails, the admin can still copy the link. Production launch requires ZeptoMail delivery.
- Platform operator accounts are separate from farm memberships and have no default read of clinical records.

### 7.4 Database

- Schema files live in `db/schema/`, one file per area: farm, animal, breeding, semen, health, milk, feed, finance, alert, listing, commerce.
- `drizzle-kit` generates SQL migrations. Migrations are committed and applied in order. Schema changes do not rely on a push-to-production shortcut.
- Every farm-owned table has `farm_id` (uuid, not null) and a foreign key to `farm`.
- Queries go through `lib/farm.ts`. The helper requires a farm id and adds it to the `where` clause. Calling Drizzle from a Server Action without that helper is a review failure.
- These writes are single transactions: AI plus straw consumption, void plus optional straw restore, calving plus calf rows plus pedigree links plus lactation, finance confirmation plus its source event.
- Events are voided with `voided_at`, `void_reason`, and `voided_by`. Application code does not `DELETE` animals, breeding events, health events, milk rows, or finance rows.
- The audit row is inserted in the same transaction as the change.
- Before the first farm outside the building team uses production, Postgres row-level security is enabled on farm-owned tables using the same `farm_id` rule. The application helper still filters. The database policy is the second check.

Identifier and money columns follow §10.8: timestamps `timestamptz`, money `numeric(12,2)`, milk and weight `numeric(6,1)`, straw counts `integer`.

### 7.5 UI

shadcn/ui components are copied into `components/ui` and maintained in the repo. Tailwind utility classes are the styling layer.

Components to add at the start: button, input, label, textarea, select, checkbox, form, calendar, popover, dialog, sheet, dropdown-menu, table, tabs, badge, card, sonner, sidebar, chart, avatar, separator, skeleton.

Mobile quick actions open in a sheet. A save uses sonner for the success line and stays on the animal. Registers use the table component with a sticky first column for the animal code on narrow screens.

English strings live in a message catalog from the first screen, so Hindi can be added later without rewriting components.

### 7.6 Files, QR, exports

Files go to Cloudflare R2. The Next.js app talks to R2 with the S3-compatible API (`@aws-sdk/client-s3` pointed at the account’s `r2.cloudflarestorage.com` endpoint). There is no second storage product.

Two buckets:

| Bucket | Contents | Access |
| --- | --- | --- |
| `cattle-private` | Animal photos, clinical attachments, unpublished media | No public URL. Download only through the app after a role check, then a signed URL that expires within 10 minutes. |
| `cattle-public` | Media copied when a listing is published | Read via a Cloudflare custom domain. Unpublishing deletes the public object. |

The database stores the bucket, object key, file name, content type, byte size, and the event or listing it belongs to. It does not store the file bytes. Object keys are prefixed with `farm_id` so one farm’s files are not addressed by another farm’s key.

ZeptoMail sends transactional mail over its HTTPS API. The India endpoint is the default (`https://api.zeptomail.in/v1.1/email`) because the product’s farms, currency, and timezone are Indian. The sender address is a verified mailbox on the product domain. Mail types in Phase 1 are invite and, from Phase 2, public enquiry notification to the farm. Alert channels in Phase 3 may add ZeptoMail for email beside WhatsApp and SMS. A failed send is logged and does not roll back the invite or the enquiry row.

- Animal QR encodes `https://{AUTH_URL}/q/{token}` as specified in §21.3. The PNG is generated on demand and cached.
- Straw scan accepts the supplier barcode or `STR-…`. Lookup is a Server Action scoped to the active farm.
- Excel and PDF routes use the same filters and the same role rules as the on-screen register.

### 7.7 Repository layout

```text
app/
components/
  ui/                 shadcn/ui
  animals/
  breeding/
  health/
  milk/
db/
  schema/
  migrations/
  seed/               demo farm from §29, not loaded into customer farms by default
lib/
  auth.ts
  farm.ts
  storage.ts          Cloudflare R2 client
  email.ts            ZeptoMail client
  validation/         Zod schemas
emails/               HTML and text templates ZeptoMail sends
```

### 7.8 Environment

| Variable | When |
| --- | --- |
| `DATABASE_URL` | Always |
| `AUTH_SECRET` | Always |
| `AUTH_URL` | Always. Public origin used in QR links and invites. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` | Always, once photos are enabled |
| `R2_BUCKET_PRIVATE`, `R2_BUCKET_PUBLIC`, `R2_PUBLIC_BASE_URL` | With the R2 keys. Public base URL is the Cloudflare domain in front of `cattle-public`. |
| `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_FROM`, `ZEPTOMAIL_API_URL` | Production invites and enquiries. Token is the ZeptoMail send-mail token. API URL defaults to the India endpoint. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, webhook secret | Phase 3 |

Secrets stay in the host’s environment. They are not committed. `.env` is not a source of sample animal data.

### 7.9 Tests that lock the stack to the rules

Vitest covers gestation dates from §22, straw balance, pedigree cycles, sire chosen from the confirmed conception, milk-drop thresholds, and dashboard counts for the §29 fixture.

Playwright covers a phone-width session for the §12 workflows: create animal, AI with a straw, pregnancy check, calving, and a milk entry. A second farm’s user opening the first farm’s QR URL while signed in is denied.

### 7.10 What stays out of the codebase

Phase 1 is this Next.js app, this Postgres database, Drizzle, Tailwind CSS, and shadcn/ui. Prisma, a second CSS framework, a standalone Express or Nest API, and a native app project are outside the product until this document is revised.

---

## 8. Release phases

### Phase 1 — Farm system of record

Ship a usable daily product:

- Farm, users, roles, sheds
- Cattle master profile, identifiers, QR
- Pedigree links and visual tree (sire, dam, offspring, three generations where data exists)
- Bull and semen database
- Straw inventory with tank → canister → goblet → position, including barcode/QR lookup
- Heat, AI, pregnancy diagnosis, calving, and automatic calf linkage
- Health timeline, vaccination, deworming, medication schedules, isolation flag
- Milk (morning, evening, daily) and weight logs with charts
- Rule-based milk-drop alert
- Feed items, stock movements, and animal or group allocations
- Dashboard, due lists, in-app notifications
- PDF and Excel export for the Phase 1 registers
- Audit log for create, update, and void

Embryo tables and notification-channel interfaces are created but not exposed as full workflows.

### Phase 2 — Genetics, money, and public presence

- Genetics performance views (bull-wise offspring and daughter outcomes)
- Mating check: female + proposed bull or semen, common ancestors, configured flags
- Donor, recipient, OPU/flush, oocyte, embryo, and transfer workflows
- Income, expense, and profitability reports, including animal-level figures where events support them
- Public cattle and genetics pages with enquiry
- Configurable gestation, dry-off, pregnancy-check, and alert thresholds already used in Phase 1 get a settings UI if any were hardcoded

### Phase 3 — Commerce and outbound alerts

- Product catalogue, cart, checkout, Razorpay, orders
- WhatsApp and SMS providers behind the existing notification interface
- Remaining exports (embryo, donor/recipient, finance, genetics)

### Phase 4 — Advanced assistance

Architecture only until this phase: heat prediction, disease-risk signals, weight and body-condition assistance, deeper genetic analysis, mating suggestions, animal valuation. Each feature ships only with a stated method, a confidence or rule explanation, and the same decision-support labelling as Phase 1 alerts.

---

## 9. Farm workspace map

```text
Dashboard
Animals
  Profile
  Timeline
  Pedigree
  QR
Breeding
  Heat / AI / PD / Calving
  Due lists
Semen
  Bulls
  Batches and straws
  Locations (tank → position)
Health
  Timeline, vaccines, deworming, treatments
Milk & weight
Feed
Finance          (Phase 2)
Genetics         (Phase 2)
  Performance
  Mating check
Embryos          (Phase 2)
Alerts
Reports
Public listings  (Phase 2)
Shop admin       (Phase 3)
Settings
  Farm, sheds, breeds, ID format, alert rules, users
```

Mobile primary actions, available from the animal profile and from a persistent action sheet:

**Heat · AI · PD · Calving · Vaccine · Treatment · Milk · Weight · Feed**

---

## 10. Core concepts and business rules

These rules apply across modules. If a screen and a rule disagree, the rule wins.

### 10.1 Animal identity

- Every animal has an internal immutable ID and a human **animal code** unique within the farm.
- Default code pattern is configurable per farm: `{PREFIX}-{BREED}-{SEQUENCE}` (example `MIL-GIR-001`). Sequence does not reuse numbers after archive.
- An animal may also have an ear tag and an RFID. Ear tag and RFID are unique within the farm when present. They can be replaced; previous values stay in identifier history.
- QR encodes a farm-scoped token that resolves to the animal. It does not embed private fields. Scanning while signed in opens the profile if the user’s role can view that animal. Scanning while signed out opens the public page only when a listing is published; otherwise it shows a sign-in prompt.

### 10.2 Status is three fields, not one label

A single exclusive status hides real animals. A cow can be pregnant and lactating. Store:

| Dimension | Values |
| --- | --- |
| Presence | On farm, Sold, Dead, Transferred |
| Sex class | Male, Female, Unknown |
| Life stage | Calf, Heifer, Cow, Bull, Steer |
| Reproduction | Not applicable, Open, Bred, Pregnant, Fresh |
| Lactation | Not applicable, Pre-lactation, Lactating, Dry |

The UI may show a short combined label (“Lactating · Pregnant”). Filters must still query the underlying fields. Dashboard counts use these definitions:

- **Total cattle:** presence = On farm.
- **Lactating / Dry / Pregnant / Calves:** on-farm animals matching that dimension. An animal may be counted in more than one card when that is true (pregnant and lactating). Cards must not be designed as parts that sum to total.
- **Sold / Dead / Transferred** leave the on-farm totals and remain in history and reports.

### 10.3 Parents: genetic versus birth

- **Genetic dam** and **genetic sire** drive pedigree and genetics.
- **Recipient / birth dam** is recorded when the calf was carried by a different female (embryo transfer). Pedigree uses genetic parents. The calving event still belongs to the recipient’s reproductive history.
- If the sire is an on-farm bull, link the animal record. If the sire is an external bull, link the bull/semen record. Both must appear the same way on the pedigree tree.
- On calving, the new calf’s genetic sire is the sire of the **conception that was confirmed pregnant**, not “the latest AI on the dam” if a later AI exists. If conception source is ambiguous, staff must choose the breeding event before the calf is saved. The system must not guess.

### 10.4 Derived reproductive dates

All offsets are farm settings, with defaults:

| Rule | Default |
| --- | --- |
| Cattle gestation used for expected calving | Breed default from §21.2 (280 days when the breed has no row), counted from the conception AI or embryo-transfer date. The farm can override any breed. |
| Pregnancy-check due | 35 days after AI. Reminder stays until a PD result is recorded or the breeding is voided. |
| Re-check option | Optional second due date, default 60 days, off unless enabled. |
| Dry-off due | 60 days before expected calving, only for animals currently lactating. |
| “Fresh” window | 14 days after calving, then reproduction returns to Open unless staff set otherwise. |

Expected calving recalculates if the conception date is corrected. Actual calving date does not change the original expected date; both are stored.

### 10.5 Semen stock

- A straw (or straw unit inside a batch) is **available, reserved, used, discarded, or transferred**.
- Recording an AI that references a straw moves it to used and writes the animal, date, and technician onto that straw.
- Voiding the AI returns the straw to available only if the user confirms the straw was not consumed. Otherwise it stays used or becomes discarded.
- Balance = received − used − discarded − transferred. The UI shows that equation; it does not allow a typed “balance” that can drift.

### 10.6 Milk-drop alert (Phase 1 rule, not a model)

For a lactating animal with at least 7 prior milking days in the current lactation:

- Baseline = mean daily total over the previous 7 recorded days, excluding days already marked as an explained drop.
- Alert when today’s total is at least **30%** below that baseline (farm-configurable, default 30%).
- Do not alert on the first 14 days in milk, or when no morning or evening value was entered if the farm requires both.
- The alert shows today’s yield, the baseline, the percent change, and a dismiss or “explained” action. Dismissing does not delete the milk row.

Herd-level anomaly (same rule applied to herd daily total versus herd 7-day mean) is on the dashboard as a secondary alert.

### 10.7 Permissions and publication

- Role checks are server-side on every read and write.
- Public fields are an allow-list per listing: photos, videos, animal code, breed, date of birth, pedigree to a chosen depth, sire, dam, milk summary, lactation summary, pregnancy status, selected health notes, genetics notes, price, enquiry contact.
- Clinical notes, purchase price, buyer details, exact shed, RFID, and finance are never public unless a future setting says otherwise. Phase 1–2 default is never.

### 10.8 Time, units, and money

- Store timestamps in UTC. Display in the farm timezone. Default timezone `Asia/Kolkata`. Display dates as `DD MMM YYYY`.
- Milk in litres, weight in kilograms, money in INR. Units are stored explicitly so a later farm can differ.
- All measured quantities accept one decimal unless a module says otherwise. Straw counts are integers.

---

## 11. Functional requirements

Requirements use **Must** (phase they ship in) and **Should** (same phase if time allows). IDs are stable for tickets.

### 11.1 Platform, farm, and access

| ID | Phase | Requirement |
| --- | --- | --- |
| PLT-01 | 1 | A farm has a name, timezone, currency, animal-code pattern, and gestation/alert defaults. |
| PLT-02 | 1 | Users sign in with email and password. Session expires and can be revoked. |
| PLT-03 | 1 | An admin invites a user by email and assigns one or more roles. Removing a user disables access and keeps their historical authorship. |
| PLT-04 | 1 | Every mutation stores actor, timestamp, entity, and before/after for audited entities (animals, breeding, health, semen, milk, finance). |
| PLT-05 | 1 | Sheds or locations can be created, renamed, and deactivated. An animal has one current location and a location history. |
| PLT-06 | 2 | Farm settings UI covers gestation length by breed, PD due offset, dry-off offset, and milk-drop percent. |
| PLT-07 | 3 | Notification preferences exist per user and per alert type: in-app now; WhatsApp and SMS as selectable channels when configured. |

**Phase 1 roles**

| Capability | Owner | Manager | Vet | AI tech | Worker | Accountant | Genetics | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View herd and profiles | Yes | Yes | Yes | Yes | Yes | View | Yes | Yes |
| Edit animal identity | Yes | Yes | No | No | No | No | Yes | Yes |
| Record breeding | Yes | Yes | View | Yes | Heat only | No | View | Yes |
| Record PD and calving | Yes | Yes | Yes | Yes | No | No | View | Yes |
| Health and vaccines | Yes | Yes | Yes | No | Vaccine entry if granted | No | View | Yes |
| Milk, weight, feed entry | Yes | Yes | View | No | Yes | View | View | Yes |
| Semen inventory | Yes | Yes | View | Use straw on AI | No | View cost | Yes | Yes |
| Finance | Yes | View | No | No | No | Yes | No | Yes |
| Genetics and mating check | Yes | View | View | View | No | No | Yes | Yes |
| Publish listings | Yes | Yes | No | No | No | No | Yes | Yes |
| Users and roles | Yes | No | No | No | No | No | No | Yes |
| Export | Yes | Yes | Health | Breeding | No | Finance | Genetics | Yes |

“View” means read-only. Worker vaccine entry is off unless an admin enables that single grant. Accountant animal view excludes clinical notes. Genetics manager does not edit clinical treatments.

### 11.2 Cattle master profile

**Purpose:** the lifetime folder for one animal.

| ID | Phase | Requirement |
| --- | --- | --- |
| ANM-01 | 1 | Create and edit: animal code, name, sex, breed, date of birth or estimated DOB with an estimated flag, colour, identification marks, current location, purchase source, purchase date, purchase price. |
| ANM-02 | 1 | Photo: at least one primary image, additional images, capture from phone camera. |
| ANM-03 | 1 | Identifiers: ear tag, RFID, and generated QR. Reprint/download QR as PNG and as a printable sheet. |
| ANM-04 | 1 | Presence, life stage, reproduction, and lactation are visible and editable only through events where an event exists (calving sets Fresh; PD sets Pregnant; dry-off sets Dry). Manual override is allowed for Owner, Manager, and Admin and is audited. |
| ANM-05 | 1 | Profile shows a reverse-chronological lifetime timeline merging breeding, health, milk summaries, weights, movements, and status changes. |
| ANM-06 | 1 | Search and filter by code, name, tag, RFID, breed, sex, location, presence, reproduction, lactation, and pregnancy due window. |
| ANM-07 | 1 | Record sale, death, or transfer with date, counterparty or reason, and amount where relevant. Animal leaves on-farm counts the same day. |
| ANM-08 | 1 | Empty profile still renders: no events, unknown parents, estimated DOB. |

**Acceptance:** creating an animal assigns the next code, generates a QR, and the QR opens that profile for an authorized user in under one navigation after scan.

### 11.3 Pedigree and genetics records

| ID | Phase | Requirement |
| --- | --- | --- |
| PED-01 | 1 | Each animal stores genetic sire and genetic dam, each pointing at an on-farm animal or an external bull/dam record. |
| PED-02 | 1 | Offspring list is derived from animals whose genetic dam or sire is this animal. It is not a separately typed list. |
| PED-03 | 1 | Visual pedigree shows the animal, parents, grandparents, and great-grandparents when present, plus a toggle to list progeny. |
| PED-04 | 1 | Adding a parent link updates both sides immediately and is blocked if it would create a cycle (an animal cannot be its own ancestor). |
| PED-05 | 1 | Breed is stored on the animal. A free-text genetics note can hold registration numbers and remarks until structured traits arrive. |
| PED-06 | 1 | External ancestors can be created with name, breed, registration number, and photo without making them on-farm cattle. |
| PED-07 | 2 | Performance facts (daughter milk, calving interval, stillbirth) attach to the animal or bull so they accumulate. Phase 2 reads them; Phase 1 only stores links needed so later facts have a place to hang. |
| PED-08 | 2 | Export a pedigree sheet (PDF) for one animal to the available generation depth. |

**Acceptance:** recording a calving with a known conception creates the calf, sets dam and sire, and the dam’s offspring list and the sire’s offspring list show the calf without a second form.

### 11.4 Bull and semen database

A bull may be an on-farm male or an external sire used only as a semen source.

| ID | Phase | Requirement |
| --- | --- | --- |
| SEM-01 | 1 | Bull record: code, name, breed, registration number, photo, genetic sire and dam, semen company, notes on performance. |
| SEM-02 | 1 | Semen batch: bull, batch number, collection or production date, type (conventional or sexed), quantity received, price, received date. |
| SEM-03 | 1 | Derived quantities: received, used, discarded, transferred, balance. |
| SEM-04 | 1 | Batches can be searched by bull, batch, company, type, and “balance greater than zero”. |

### 11.5 Semen straw inventory

| ID | Phase | Requirement |
| --- | --- | --- |
| STR-01 | 1 | Location hierarchy: LN2 tank → canister → goblet → position. Names are farm-defined. |
| STR-02 | 1 | Straws belong to a batch and optionally sit in one position. A position shows what it holds. |
| STR-03 | 1 | Each straw or straw label can store a barcode or QR value. Lookup opens the bull and batch, then offers “use in AI” if the user can breed. |
| STR-04 | 1 | Using a straw on an AI requires an animal, date, and technician, and decrements balance. |
| STR-05 | 1 | Filters: bull, tank, type, expiring or low balance, available only. |
| STR-06 | 1 | Staff can record a physical count adjustment with a reason. The adjustment is audited and does not silently rewrite history. |

**Acceptance:** scanning a straw code on a phone opens that bull/batch. Completing an AI from that screen reduces balance by the units used.

### 11.6 Breeding and reproduction

Female reproductive history is a timeline of events, not a single “current breeding” blob. Current state is derived from the latest non-voided events.

| ID | Phase | Requirement |
| --- | --- | --- |
| BRD-01 | 1 | Heat event: date and time, signs (standing, discharge, mounting, other note), observed by. Sets nothing permanent besides history. Optional “schedule AI” creates a task. |
| BRD-02 | 1 | AI event: date and time, technician, bull or semen batch, straw, attempt number within the current open cycle, notes. |
| BRD-03 | 1 | Attempt number increments per open breeding cycle. A new cycle starts after a calving or after staff close the previous cycle as not pregnant. |
| BRD-04 | 1 | Pregnancy diagnosis: date, result (pregnant, not pregnant, doubtful, recheck), method note, diagnosed by. Pregnant sets reproduction to Pregnant and computes expected calving from the linked AI. Not pregnant returns the animal to Open. Doubtful leaves Bred and creates a recheck task. |
| BRD-05 | 1 | A PD must link to an AI or, later, an embryo transfer. If multiple open AIs exist, the user picks one. |
| BRD-06 | 1 | Calving event: actual date, ease, outcome (live, dead, twin), calf count, notes. Creates one animal per live calf (dead calves may be recorded as offspring with presence Dead, farm setting default: record them). |
| BRD-07 | 1 | Calf form is pre-filled with genetic dam, genetic sire, birth date, and location. User confirms sex, code, and tag before save. |
| BRD-08 | 1 | The dam’s profile shows the full cycle: heats, AIs, PDs, expected calving, actual calving, calves. |
| BRD-09 | 1 | Due lists: PD due, expected calving in the next 30 days, dry-off due, AI follow-up (bred with no PD after the due offset). |
| BRD-10 | 2 | Embryo transfer can be the conception event in place of AI, with the same PD and calving chain. |

**Acceptance:** AI today → dashboard shows PD due at farm offset → PD pregnant → expected calving visible on the profile and dashboard → calving creates a linked calf. Voiding the PD removes the pregnancy state and the expected date.

### 11.7 Embryo management (architecture in Phase 1, workflow in Phase 2)

Phase 1 schema must represent the following even if the only UI is hidden behind a feature flag for internal testing:

- Donor program and recipient program on female animals
- OPU or flush record: donor, date, oocytes recovered
- Embryo: ID, donor, sire, grade, fresh or frozen, freezing date, straw or location, status (in stock, transferred, discarded)
- Transfer: date, recipient, embryo, pregnancy result, calf outcome

| ID | Phase | Requirement |
| --- | --- | --- |
| EMB-01 | 1 | Data model and internal constraints exist. No production menu entry. |
| EMB-02 | 2 | Genetics manager can record donor, recipient, OPU/flush, embryo, freeze location, and transfer. |
| EMB-03 | 2 | Transfer uses the same pregnancy and calving flow as AI. Calf genetic parents are donor and sire; recipient is birth dam. |
| EMB-04 | 2 | Embryo inventory supports search by ID, donor, sire, grade, fresh/frozen, and location. |
| EMB-05 | 3 | Embryo register export. |

### 11.8 Veterinary and health

| ID | Phase | Requirement |
| --- | --- | --- |
| HLT-01 | 1 | Health event: problem, clinical signs, diagnosis, treatment, veterinarian, follow-up date, outcome (ongoing, resolved, died, referred), notes. |
| HLT-02 | 1 | Medicine lines on a health event: name, dose, route, duration, start date. Optional schedule generates due reminders for each remaining dose or day. |
| HLT-03 | 1 | Attachments: photo or PDF prescription, stored private to the farm. |
| HLT-04 | 1 | Vaccination: vaccine name, batch, date given, next due date, administered by. Next due appears on the dashboard until recorded or skipped with a reason. |
| HLT-05 | 1 | Deworming uses the same shape as vaccination (product, date, next due). |
| HLT-06 | 1 | Isolation flag on an animal with reason and start date. Dashboard lists animals currently isolated. Clearing isolation is audited. |
| HLT-07 | 1 | Health timeline on the animal merges events, vaccinations, deworming, and visits. |
| HLT-08 | 1 | Veterinarian can filter the herd by follow-up due and vaccination due. |

### 11.9 Milk

| ID | Phase | Requirement |
| --- | --- | --- |
| MLK-01 | 1 | Daily milk row per animal: date, morning litres, evening litres, computed total. One row per animal per date. Editing is audited. |
| MLK-02 | 1 | Lactation: starts at calving, has a lactation number (1, 2, 3…), ends at dry-off or when the animal leaves. Days in milk = today − calving date while lactating. |
| MLK-03 | 1 | Herd daily total is the sum of animal rows. Missing animals are “not entered”, not zero, until someone enters zero. |
| MLK-04 | 1 | Quick entry: date defaults to today, last animal remembered, numeric keypad friendly, save and next animal. |
| MLK-05 | 1 | Animal chart: daily total for the current lactation. Herd chart: daily total for a selected range. |
| MLK-06 | 1 | Milk-drop alert per §10.6. |
| MLK-07 | 1 | Optional price per litre on the farm, effective-dated, used to value milk income. |
| MLK-08 | 2 | Lactation summary: total yield, peak daily yield, days in milk, average per day. Shown on the profile and available to public listings as a summary only. |
| MLK-09 | 2 | Reports for day, week, and month by animal and herd. |

### 11.10 Weight

| ID | Phase | Requirement |
| --- | --- | --- |
| WGT-01 | 1 | Weight event: date, kilograms, optional note. Chart on the profile. |
| WGT-02 | 1 | Latest weight is shown on the animal header. |
| WGT-03 | 4 | Body-condition score can be added beside weight without breaking the weight series. |

### 11.11 Feed

| ID | Phase | Requirement |
| --- | --- | --- |
| FED-01 | 1 | Feed items in categories: green fodder, dry fodder, silage, concentrate, mineral/supplement, other. Unit kg or as configured. |
| FED-02 | 1 | Stock movements: opening balance, purchase (quantity, cost, date, supplier), consumption, wastage, closing balance derived as opening + purchase − consumption − wastage for the period. |
| FED-03 | 1 | Consumption can be logged against the herd, a shed, a group, or an animal. |
| FED-04 | 1 | Dashboard shows items at or below a minimum quantity set by the farm. |
| FED-05 | 2 | Cost per animal per day is a report: allocated feed cost divided by animal-days in the period. If allocation is only at herd level, the report says it is an average, not an individual measurement. |

### 11.12 Finance and profitability

Phase 2. Do not block Phase 1 milk price capture (MLK-07); that value is an input.

**Income categories:** milk, cattle sales, calves, semen, embryos, ghee and dairy products, farmhouse, other.  
**Expense categories:** feed, medicine, veterinary, labour, breeding, semen, embryo work, electricity, transport, other.

| ID | Phase | Requirement |
| --- | --- | --- |
| FIN-01 | 2 | Manual income and expense entries with date, category, amount, note, optional animal, optional attachment. |
| FIN-02 | 2 | Suggested entries the user can confirm: milk value from yield × price, cattle sale amount from the sale event, semen purchase from batch price, medicine cost if entered on the health event. Confirming creates the finance row so it is not double-counted on refresh. |
| FIN-03 | 2 | Monthly and yearly income, expense, and surplus by category. |
| FIN-04 | 2 | Animal profitability where possible: attributed milk value + sale − attributed feed (if allocated) − medicine − breeding cost linked to that animal. Unattributed farm overhead stays in a farm-level bucket and is not forced onto animals. |
| FIN-05 | 3 | Finance export. |

### 11.13 Alerts and reminders

An alert is a row with type, subject (animal or stock item), due date, status (open, done, dismissed), and the rule text.

| Type | Created from |
| --- | --- |
| Pregnancy check due | AI or transfer date + PD offset |
| AI follow-up | Bred, PD overdue |
| Expected calving | Expected date, shown from 30 days prior and on the day |
| Dry-off | Expected calving − dry-off offset, if lactating |
| Vaccination due | Next due date |
| Deworming due | Next due date |
| Health follow-up | Follow-up date on a health event |
| Medication due | Schedule lines |
| Milk drop | §10.6 |
| Low feed stock | Quantity ≤ minimum |
| Custom task | User-created farm task with due date |

| ID | Phase | Requirement |
| --- | --- | --- |
| ALT-01 | 1 | Dashboard lists open alerts grouped by type, soonest first. |
| ALT-02 | 1 | Completing the underlying event (PD, vaccine, dose) closes the matching alert. |
| ALT-03 | 1 | In-app notification list for the signed-in user, limited to alerts their role can see. Workers see milk, feed, and tasks assigned to them, not clinical detail. |
| ALT-04 | 1 | Each alert stores a stable type code and payload so a later WhatsApp or SMS sender can subscribe without schema changes. |
| ALT-05 | 3 | Delivery attempts to external channels are logged with success or failure. Failure does not delete the in-app alert. |

### 11.14 Farm dashboard

Phase 1 home screen, scoped to on-farm animals and the current calendar month in the farm timezone:

- Total cattle, lactating, dry, pregnant, calves (definitions in §10.2)
- Today’s milk entered and today’s milk total; monthly milk total
- AI count this month
- Expected calving count (next 30 days)
- Open health alerts, vaccination due, deworming due
- Feed items below minimum
- Pending tasks / open alerts
- Income and expense month-to-date appears when finance ships (Phase 2); the card slot can show “Not set up” until then

The dashboard must load as summaries. It must not require opening each animal.

### 11.15 Genetics performance

Phase 2 reads history accumulated from Phase 1. For each bull (on-farm or semen sire):

- Offspring count, female offspring count
- Daughters with lactation summaries: average yield, number of lactations contributing
- Reproductive outcomes of mates and daughters where recorded: conception result, calving interval, calving outcome
- Health events are listed as counts, not interpreted as genetic defects

| ID | Phase | Requirement |
| --- | --- | --- |
| GEN-01 | 2 | Bull performance page with the counts above and links to the underlying animals. |
| GEN-02 | 2 | Empty states explain that figures appear only after offspring and milk exist. No fabricated benchmarks. |
| GEN-03 | 2 | Filters by birth year of offspring and by lactation number. |
| GEN-04 | 4 | Further genetic analysis may be added. It must cite method and sample size on screen. |

### 11.16 Mating check

Phase 2. Decision support only.

| ID | Phase | Requirement |
| --- | --- | --- |
| MAT-01 | 2 | User selects a female and a proposed bull or semen batch. |
| MAT-02 | 2 | System shows both pedigrees to the stored depth and lists common ancestors within a configurable generation window (default 4). |
| MAT-03 | 2 | If the proposed sire is already the sire, grandsire, or son of the female, show a clear flag. Additional flags are data the genetics manager configures (for example “same dam line”); the product does not ship a hidden universal inbreeding law. |
| MAT-04 | 2 | On-screen text states that the result is relationship information for the farm’s genetics team, not a veterinary or genetic certification. |
| MAT-05 | 2 | The check can be saved as a note on the female. It does not block creating an AI. |

### 11.17 Mobile field system

| ID | Phase | Requirement |
| --- | --- | --- |
| MOB-01 | 1 | Layouts from 360px wide support the quick actions without horizontal scrolling. |
| MOB-02 | 1 | Scan QR (camera) or type a code. Result is the profile header plus the eight quick actions. |
| MOB-03 | 1 | Each quick action opens a short form with date defaulted to now and as few required fields as possible: Heat (date, signs), AI (date, bull/straw, technician), PD (result), Calving (outcome, calf sex), Vaccine (vaccine, batch, next due), Treatment (problem, medicine), Milk (morning, evening), Weight (kg), Feed (item, quantity). |
| MOB-04 | 1 | After save, stay on the animal with a success confirmation. “Next animal” returns to scan. |
| MOB-05 | 1 | Required fields and permission errors are inline. A worker never sees a disabled breeding form that looks broken; they see only the actions they can perform. |
| MOB-06 | 2 | If the network drops mid-save, the client keeps the form values and retries. Full offline queues are not required in Phase 1. |

### 11.18 Public catalogue

Phase 2.

| ID | Phase | Requirement |
| --- | --- | --- |
| PUB-01 | 2 | A farm can publish a listing for an animal, semen batch, or embryo in a category: cows, bulls, calves, heifers, pregnant animals, semen, embryos. |
| PUB-02 | 2 | Listing content is chosen from the allow-list in §10.7. Unselected fields are omitted, not shown as blank private labels. |
| PUB-03 | 2 | Public pages are readable without an account. Enquiry sends a message to the farm (stored in the workspace and emailed if the farm sets an address). |
| PUB-04 | 2 | Unpublishing hides the page immediately. Historical enquiries remain in the farm inbox. |
| PUB-05 | 2 | Pregnancy status, milk figures, and health lines appear only when explicitly included and only as the summary the farm wrote or selected. |

### 11.19 Ecommerce

Phase 3. Sells farm products (semen, embryos, ghee, other catalogue items), not a silent sale of an on-farm cow. Live animals stay enquiry-led in Phase 2; a later setting may mark a listing as purchasable.

| ID | Phase | Requirement |
| --- | --- | --- |
| ECO-01 | 3 | Catalogue: product, category, price, photos, stock count, published flag. |
| ECO-02 | 3 | Cart and checkout collect customer name, phone, address. |
| ECO-03 | 3 | Razorpay payment. Order is paid only after payment confirmation from the provider, not when the browser redirects. |
| ECO-04 | 3 | Order statuses: pending payment, paid, packed, shipped, completed, cancelled, refunded. |
| ECO-05 | 3 | Farm staff see orders and customer details. Customers see their own order status via a link sent after payment. |
| ECO-06 | 3 | Selling a semen batch through the shop decrements a designated sellable quantity and does not consume farm AI straws unless staff linked that stock on purpose. |

### 11.20 Reports and export

Exports respect role visibility (an accountant export does not include clinical notes).

| Report | Phase | Formats |
| --- | --- | --- |
| Cattle register | 1 | PDF, Excel |
| Pedigree (single animal) | 1 | PDF |
| Breeding, AI, pregnancy, calving | 1 | PDF, Excel |
| Milk | 1 | Excel; PDF summary |
| Health and vaccination | 1 | PDF, Excel |
| Weight | 1 | Excel |
| Feed stock | 1 | Excel |
| Semen inventory | 1 | PDF, Excel |
| Embryo inventory, donor/recipient | 3 | PDF, Excel |
| Finance | 3 | PDF, Excel |
| Genetics performance | 3 | PDF, Excel |

Each export records who ran it and the filters used.

---

## 12. Key workflows

### 12.1 Register an animal

1. Manager enters sex, breed, DOB or estimated DOB, tag, location.
2. System assigns the next animal code and QR.
3. Optional photo, colour, marks, purchase details, parents.
4. Animal appears in on-farm counts.

### 12.2 Inseminate and confirm

1. Technician scans the cow QR, taps AI.
2. Scans or searches the straw. System shows bull, batch, type, and balance.
3. Saves AI. Straw balance decreases. Reproduction becomes Bred. PD alert is scheduled.
4. On the due day, vet or technician records PD.
5. If pregnant, expected calving and dry-off alerts appear.

### 12.3 Calving

1. Manager opens the dam from the expected-calving list and taps Calving.
2. Enters date, outcome, and calf count.
3. Confirms each calf’s sex and tag. Dam and sire are already filled from the confirmed conception.
4. Dam becomes Fresh and, if she will be milked, Lactating. Lactation number increments. Days in milk start.
5. Calf appears under both parents.

### 12.4 Morning milk with a drop alert

1. Worker opens Milk, enters morning and evening litres for each cow, or a single session if the farm milks once (farm setting: sessions required).
2. If a cow’s daily total falls below the configured threshold versus her 7-day baseline, an alert opens for manager and vet.
3. Manager marks it explained or leaves it open. The yield itself stays.

### 12.5 Publish a heifer

1. Genetics manager opens the animal, chooses Public listing, category Heifers.
2. Ticks photos, pedigree to grandparents, breed, DOB, and price. Leaves health and purchase price off.
3. Public page shows only those fields and an enquiry form.

---

## 13. Conceptual data model

Names are concepts, not a promise of table spellings.

```text
Farm
  UserMembership → User, Role
  Location
  Animal
    IdentifierHistory (code, ear tag, RFID, QR token)
    Photo
    StatusHistory
    GeneticSire, GeneticDam, BirthDam (recipient)
  Bull (external or linked Animal)
  SemenBatch → Straw → StoragePosition
  Storage: Tank → Canister → Goblet → Position
  HeatEvent, AIEvent, PregnancyCheck, CalvingEvent
  Lactation
  MilkYield (animal, date, am, pm)
  WeightEvent
  HealthEvent → MedicineLine → Attachment
  Vaccination, Deworming
  FeedItem → StockMovement
  FeedAllocation (herd | location | group | animal)
  FinanceEntry
  Alert
  NotificationDelivery (later)
  Embryo, OpuFlush, EmbryoTransfer
  PublicListing
  Product, Cart, Order, Payment
  MatingCheck
  AuditEvent
```

Groups used for feed are named sets of animals (for example “high yielders”). Phase 1 needs the group entity only if animal-wise feed is implemented; herd and shed allocation are enough to start.

---

## 14. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Stack | Implemented as specified in §7. A second ORM, a separate API service, or a second UI kit is a change to this document. |
| Tenancy | Every query is scoped by farm through the Drizzle tenant helper. Tests must cover cross-farm access and expect denial. |
| Authorization | Enforced on the server. Hiding a button is not the control. |
| Performance | Dashboard and animal search return within 2 seconds for a farm of 2,000 on-farm animals and 10 years of milk rows, on a normal broadband connection. Milk bulk entry of one session for 200 cows is completable without a full page reload per cow. |
| Availability | Target 99.5% monthly for the production app, excluding planned maintenance announced in advance. |
| Backups | Daily backups, 30-day retention, restore tested before launch. |
| Audit | Breeding, health, semen balance, identity, and finance changes are auditable. |
| Privacy | Clinical attachments and RFID are private. Public pages use a separate read model of published fields only. |
| Uploads | Images and PDFs limited by size (start at 10 MB per file) and type. Strip location metadata from photos optionally later; Phase 1 stores the file as uploaded and serves it only to authorized users. |
| Accessibility | Core field flows usable with large tap targets (at least 44px), visible labels, and contrast sufficient for outdoor screens. |
| Languages | English UI in Phase 1. User-facing strings live in a message catalog so Hindi can be added without rewriting screens. |
| Devices | Current versions of Chrome and Safari on Android and iOS, plus desktop Chrome. |
| Payments | No card data stored. Razorpay handles payment details. Orders reconcile to payment IDs. |
| Legal copy | Mating check and milk-drop alerts include the decision-support wording in §10 and MAT-04. The product does not claim to diagnose disease or certify genetics. |

---

## 15. Analytics the product itself should capture

For the SaaS operator, not shown to farms as surveillance:

- Active farms, weekly active users, events recorded per farm per week
- Share of AI events that include a straw
- Share of calvings that auto-linked a sire
- Alert open and completion counts by type
- Time from QR scan to saved event (mobile)

These tell us whether staff actually record the breeding loop.

---

## 16. Success metrics

Measured 90 days after a farm’s Phase 1 go-live, on farms that finish onboarding (animals loaded, at least one user in each of manager and worker):

| Metric | Target |
| --- | --- |
| Animals with a code and QR | 100% of on-farm animals |
| Calvings in the period with dam and sire linked | ≥ 90% |
| AI events that reference a semen batch | ≥ 80% where the farm uses AI |
| Milk days with herd entry | ≥ 90% of days the farm milks |
| PD alerts completed or dismissed within 14 days of due | ≥ 75% |
| Worker mobile event share | ≥ 50% of milk and weight events created from a phone-width session |

Phase 2 adds: at least one saved mating check on farms that use external semen; public enquiries delivered to the farm inbox; monthly finance report generated without spreadsheet re-entry for milk and feed.

---

## 17. Risks and open decisions

| Item | Plan until decided |
| --- | --- |
| Gestation length differs by breed and is not a medical determination | Seed defaults in §21.2, overridable per breed. Label expected calving as calculated, not a prediction of the birth day. |
| Farms have weak connectivity in sheds | Phase 1 is online with form values preserved on failure. Offline queue is a later project if field tests show data loss. |
| Exclusive status labels in the original brief | Implement the three-part status in §10.2 so pregnant lactating cows are representable. Combined labels can still read naturally on screen. |
| Twins and stillbirths | Support calf count greater than one. Dead-at-birth calves are recorded so genetics are not biased toward only live calves. Farm can turn off auto-creating a dead calf record and keep the outcome on the calving event only. |
| Who may correct a straw balance | Owner, manager, genetics manager, admin. AI technicians can use straws but cannot post a stock adjustment. |
| Public pregnancy status can be sensitive | Off unless the listing explicitly includes it. |
| Ecommerce of live animals | Not in the first commerce release. Enquiry only. |
| GST invoices | Not in Phase 3 unless added. Orders store amounts; they are not tax invoices. |
| Multi-farm breeding (animal transferred between customer farms) | Phase 1 transfer closes the animal on the origin farm. The destination farm creates its own animal and may record the origin code in a note. A shared global animal identity is out of scope. |
| Regulatory pedigree certificates | The PDF pedigree is a farm record, not a breed-society certificate, until a society format is specified. |

---

## 18. Phase 1 acceptance for launch

The Phase 1 release is ready when:

1. Two roles (manager and worker) can use one farm, and a user in another farm cannot read it.
2. The five workflows in §12.1–§12.4 work on a phone-width browser.
3. Pedigree cycle prevention and “do not guess the sire” on calving are covered by tests.
4. Straw used on an AI cannot be used again, and a void with “straw not consumed” restores it.
5. Dashboard counts match the §10.2 definitions on a sample herd that includes a pregnant lactating cow, a dry cow, a calf, and a sold animal.
6. Milk-drop alert fires only outside the fresh window and shows the numbers used.
7. Cattle, breeding, milk, health, vaccination, feed, and semen exports download for an authorized user and fail for a worker.
8. QR for an unpublished animal does not reveal profile data to a signed-out visitor.

---

## 19. Glossary

| Term | Meaning |
| --- | --- |
| AI | Artificial insemination |
| Dam | Genetic mother |
| Sire | Genetic father |
| PD | Pregnancy diagnosis |
| DIM | Days in milk |
| Dry | Not being milked, usually before the next calving |
| Fresh | Recently calved |
| LN2 | Liquid nitrogen storage for semen or embryos |
| Straw | A single semen (or embryo) dose in inventory |
| OPU | Ovum pick-up |
| Recipient | Female who carries an embryo and may not be the genetic dam |
| Sexed semen | Semen processed to bias calf sex |
| Ear tag | Visual tag number on the animal |
| RFID | Electronic identifier |

---

## 20. Source of this document

This PRD turns the requested cattle-management scope into phased requirements. Where the original list implied a single status or an immediate AI feature, sections 4, 7, and 9 record the product decision so engineering does not invent a second behaviour later.

Sections 21 through 32 are seed data and worked examples. They are starting content for a new farm, not veterinary protocols and not genetic certifications. A farm admin can edit or delete every seeded row.

---

## 21. Species, breeds, and identity seed data

### 21.1 Species

Phase 1 records **cattle** and **buffalo** on the same farm. Buffalo is included because many Indian dairy farms keep both, and gestation, milk, and life stage must not assume a cow. The public categories and the word “cattle” in the product name stay as they are; the animal form has a species field.

| Species | Code | Default gestation (days) | Default dry-off lead (days) | Notes |
| --- | --- | --- | --- | --- |
| Cattle | `cattle` | See breed table, else 280 | 60 | Bos indicus and Bos taurus, including crosses |
| Buffalo | `buffalo` | 310 | 90 | Riverine dairy buffalo. Farm can split breeds below. |

Life stage suggestions (the system may suggest a change; it does not reclassify silently):

| Species | Suggestion | When |
| --- | --- | --- |
| Cattle or buffalo | Calf → Heifer | Female, not yet calved, and age ≥ 12 months |
| Cattle or buffalo | Calf → Bull | Male, not castrated, and age ≥ 12 months |
| Either | Heifer → Cow, or Bull stays Bull | First calving event for a female. Males stay Bull unless marked Steer. |
| Either | Cow lactation → Lactating | Live calving and “will be milked” left on (default on) |
| Either | Lactating → Dry | Dry-off event, or auto-suggest when the dry-off alert is completed |

Age bands used only for filters and the calf dashboard card:

| Band | Default age |
| --- | --- |
| Calf | On farm, under 12 months, no calving recorded as dam |
| Heifer | Female, 12 months or older, no calving recorded |
| Cow | Female with at least one calving |
| Bull | Male, life stage Bull |
| Steer | Male marked castrated |

The **Calves** tile counts animals that are on farm, under 12 months old, and have never calved as a dam. Life stage on the profile should match that rule. When it does not, the profile shows a suggestion. The tile does not recount animals to make the cards add up to the herd total.

### 21.2 Breed catalogue

Seeded on farm creation. `Gestation` is the expected-calving offset. `Code` is the token in `{PREFIX}-{BREED}-{SEQUENCE}`. Birth-weight hints are optional form placeholders, not growth standards.

| Breed | Code | Species | Gestation (days) | Typical birth weight hint (kg) |
| --- | --- | --- | --- | --- |
| Gir | GIR | cattle | 287 | 22 |
| Sahiwal | SAH | cattle | 286 | 22 |
| Red Sindhi | RSD | cattle | 286 | 21 |
| Tharparkar | THR | cattle | 285 | 23 |
| Rathi | RAT | cattle | 285 | 22 |
| Kankrej | KAN | cattle | 286 | 24 |
| Hariana | HAR | cattle | 284 | 23 |
| Ongole | ONG | cattle | 290 | 26 |
| Deoni | DEO | cattle | 285 | 23 |
| Khillar | KHI | cattle | 285 | 24 |
| Amritmahal | AMR | cattle | 285 | 23 |
| Hallikar | HAL | cattle | 285 | 23 |
| Holstein Friesian | HF | cattle | 279 | 40 |
| Jersey | JER | cattle | 279 | 25 |
| Brown Swiss | BS | cattle | 290 | 42 |
| Ayrshire | AYR | cattle | 279 | 33 |
| HF cross | HFX | cattle | 280 | 30 |
| Jersey cross | JEX | cattle | 280 | 24 |
| Gir cross | GIX | cattle | 283 | 25 |
| Sahiwal cross | SAX | cattle | 283 | 25 |
| Non-descript cattle | ND | cattle | 280 | — |
| Murrah | MUR | buffalo | 310 | 30 |
| Mehsana | MEH | buffalo | 310 | 28 |
| Jaffarabadi | JAF | buffalo | 315 | 32 |
| Surti | SUR | buffalo | 308 | 26 |
| Bhadawari | BHA | buffalo | 310 | 27 |
| Nili-Ravi | NIL | buffalo | 310 | 32 |
| Pandharpuri | PAN | buffalo | 308 | 26 |
| Banni | BAN | buffalo | 310 | 28 |
| Non-descript buffalo | NDB | buffalo | 310 | — |
| Other | OTH | cattle | 280 | — |

Farms add breeds without a code deploy. Deactivating a breed hides it on new animals and keeps it on historical ones.

### 21.3 Animal code examples

Default prefix `MIL`. Sequence is at least 3 digits and expands past 999 (`MIL-GIR-1000`).

| Animal | Code |
| --- | --- |
| First Gir cow | `MIL-GIR-001` |
| First Holstein Friesian | `MIL-HF-001` |
| First Murrah buffalo | `MIL-MUR-001` |
| External bull, not on farm | `BULL-GIR-014` using prefix `BULL` for the bull register. This sequence is separate from on-farm animals. |

Printed QR card, 50 mm square plus caption:

```text
MIL-GIR-001
Ganga
Gir · Female
[QR]
```

The QR encodes an HTTPS URL, not the animal code:

```text
https://{farm-host}/q/{token}
```

`token` is at least 128 bits of randomness, unique, and rotatable if a tag is copied. The human code is printed so staff can type it when the camera fails. Typing the code requires a signed-in user. The public URL reveals a profile only when a listing is published (§11.18).

Straw barcodes are the supplier’s existing code when it is unique on the farm. If it is not unique, the farm prints an internal code `STR-{batch}-{nnn}` (example `STR-G14-2026-014`).

### 21.4 Coat, marks, and horns

Multi-select suggestions:

**Colour:** white, fawn, red, grey, black, brown, dun, black-and-white, red-and-white, spotted, patched, mixed.

**Marks:** star, blaze, speckled face, white switch, white feet, hump, loose skin, brand, tattoo, ear notch, scar, other (note).

**Head:** horned, polled, dehorned. Dehorned stores a date.

### 21.5 Default locations

| Location | Used for |
| --- | --- |
| Milking shed | Lactating animals |
| Dry shed | Dry cows and pregnant heifers |
| Calving pen | Animals within 14 days of expected calving, or freshly calved |
| Calf pen | Calves |
| Bull pen | Breeding bulls on the farm |
| Isolation | Animals with the isolation flag |
| Hospital | Active health events marked “hospitalised” |

Moving an animal writes location history. The isolation flag does not by itself move the animal; the form asks “Move to Isolation?” and defaults to yes.

---

## 22. Reproductive reference data

These offsets are farm settings. Defaults below are the values a new farm starts with. Expected dates are arithmetic, labelled **calculated**.

| Setting | Cattle default | Buffalo default |
| --- | --- | --- |
| Gestation | Breed table, else 280 days | Breed table, else 310 days |
| Voluntary waiting period after calving before the next AI is expected | 60 days | 60 days |
| Oestrus cycle length used for “heat expected” | 21 days | 21 days |
| Heat window shown on the calendar | Cycle day 18 through 24 | Same |
| Pregnancy check due | 35 days after AI or transfer | 40 days after AI or transfer |
| Optional recheck | Off. If enabled, 60 days (cattle) or 75 days (buffalo) | |
| Dry-off lead | 60 days before expected calving | 90 days before expected calving |
| Fresh period (no milk-drop alert) | 14 days after calving | 14 days |
| Close-up calving list | Expected calving within 21 days | Same |
| Dashboard “expected calving” card | Within 30 days | Same |
| Twin entry | Calf count 1–4 | Same |

### 22.1 Heat signs

Stored as a set on the heat event. At least one is required.

| Code | Label |
| --- | --- |
| `standing` | Standing to be mounted |
| `mounting` | Mounting other animals |
| `discharge` | Clear vaginal discharge |
| `restless` | Restless, bellowing, reduced feed |
| `drop_milk` | Sudden drop in milk |
| `swollen_vulva` | Swollen vulva |
| `tail_paint` | Tail paint or heat-detection aid rubbed |
| `detector` | Pressure patch or activity signal noted by staff |
| `other` | Free-text note required |

### 22.2 Insemination form

| Field | Required | Values |
| --- | --- | --- |
| Date and time | Yes | Default now. Cannot be in the future. |
| Female | Yes | On-farm female. Warning, not a block, if she is inside the voluntary waiting period or already Pregnant. |
| Technician | Yes | User with AI technician, manager, owner, or admin role. Name can also be typed for a visiting technician. |
| Semen source | Yes | On-farm bull **or** semen batch. One of the two. |
| Straw | Yes if a batch is chosen and the batch still has individual straws. Optional if the farm tracks only batch quantity. |
| Deposition | No | Cervical, uterine body, deep uterine. Default uterine body. |
| Attempt number | Yes | System proposes the next integer for the open cycle. User can override. |
| Difficulty | No | Easy, difficult, repeated pass. |
| Notes | No | |

Saving with a straw in status `available` sets that straw to `used`. Saving against a batch that is quantity-only decrements batch balance by 1.

### 22.3 Pregnancy diagnosis

| Result | Effect |
| --- | --- |
| Pregnant | Reproduction = Pregnant. Expected calving = conception datetime + gestation days, date in the farm timezone. Dry-off alert created if lactating. |
| Not pregnant | Reproduction = Open. Expected calving cleared. Cycle can be bred again. |
| Doubtful | Stays Bred. Recheck alert at +14 days (configurable). |
| Recheck pregnant | Same as Pregnant. |
| Recheck not pregnant | Same as Not pregnant. |

Methods (optional): rectal palpation, ultrasound, blood or milk test, other.

Days pregnant on the profile = today − conception date, shown only while Pregnant and before actual calving.

### 22.4 Calving details

| Field | Values |
| --- | --- |
| Outcome per calf | Live, dead, mummified |
| Calving ease | 1 unassisted, 2 easy pull, 3 hard pull, 4 surgical, 5 abnormal presentation |
| Presentation | Anterior, posterior, breech, transverse, unknown |
| Calf size | Small, medium, large, unknown |
| Sex | Female, male, unknown |
| Placenta | Passed, retained. Retained creates a health follow-up due the next day. |
| Assistance | None, staff, veterinarian |

Dam after a calving with at least one live calf and “start lactation” checked (default checked for cows, unchecked for heifers only if the farm turns that off — default is checked for every female):

- Reproduction = Fresh for 14 days, then the nightly job sets Open unless she is already bred again.
- Lactation = Lactating.
- New lactation row, number = previous lactation number + 1 (heifer becomes 1).
- Days in milk start at 0 on the calving date.

If every calf is dead, staff choose whether to open a lactation. Default is no.

### 22.5 Worked breeding dates

Farm timezone Asia/Kolkata. Breed Gir, gestation 287 days. PD offset 35. Dry-off lead 60. Animal `MIL-GIR-004` Ganga, lactating.

| Step | Date | What the system stores |
| --- | --- | --- |
| Heat observed | 2 Jan 2026, 06:40 | Heat event, signs standing + discharge |
| AI, straw `STR-G14-2026-014`, bull GIR-SAGAR | 2 Jan 2026, 09:10 | AI attempt 1. Straw used. State Bred. PD due **6 Feb 2026**. |
| PD pregnant by ultrasound | 8 Feb 2026 | Conception remains 2 Jan 2026. Expected calving **16 Oct 2026** (2 Jan + 287 days). Dry-off due **17 Aug 2026**. |
| Dry-off recorded | 18 Aug 2026 | Lactation = Dry. Current lactation closed. |
| Calving, one live female | 14 Oct 2026 | Actual calving stored separately from 16 Oct expected. Calf `MIL-GIR-018` dam Ganga, sire GIR-SAGAR. Ganga lactation  number increments, state Fresh + Lactating. |

If a second AI had been entered on 23 Jan and the 8 Feb PD was linked to the 2 Jan AI, the calf’s sire stays GIR-SAGAR. The 23 Jan straw stays used. Staff must not relink the PD without an audited edit.

### 22.6 Mating flags (Phase 2)

Compare the female’s pedigree with the proposed sire up to 4 generations (farm setting, range 3–6).

| Flag | When it appears |
| --- | --- |
| Parent | Proposed sire is the female’s sire or son |
| Grandparent | Proposed sire is a grandsire, or the female is his granddaughter |
| Full sibling | They share both genetic parents |
| Half sibling | They share exactly one genetic parent |
| Common dam line | Same genetic dam within the window, excluding the animals themselves |
| Common ancestor | Any other shared ancestor inside the window |
| Unknown parent | Either side is missing a parent inside generation 2. Informational, not a risk flag. |

Sort flags with parent first, then grandparent, full sibling, half sibling, common ancestor, unknown. Show the ancestor’s name and code and the path (`Ganga → MIL-GIR-001 → GIR-SAGAR`). Saving the check stores the flag list and the generation setting used. It does not block AI.

On-screen sentence, not optional:

> This check lists pedigree overlaps from data entered on this farm. It is not a veterinary opinion, an inbreeding coefficient, or a breed-society approval.

---

## 23. Health seed data

The starter protocols ship **disabled**. A veterinarian or admin turns a protocol on. Enabling it creates next-due dates only for animals that match the rule and have no future vaccination of that type. It does not invent historical doses.

This is a reminder calendar, not a prescription. The farm’s veterinarian decides product, batch, dose, and whether the animal should be vaccinated.

### 23.1 Vaccination protocols

| Protocol | Species | Who | Starter interval | Default enabled |
| --- | --- | --- | --- | --- |
| FMD | Cattle and buffalo | All on-farm animals over 4 months | 6 months | No |
| Haemorrhagic septicaemia (HS) | Cattle and buffalo | All over 6 months | 12 months | No |
| Black quarter (BQ) | Cattle and buffalo | All from 6 months to 3 years, then stop suggesting | 12 months | No |
| Brucellosis | Cattle and buffalo | Female calves once, age 4–8 months, if not previously recorded | Once | No |
| Theileriosis | Cattle | Farm-defined group, default off | 12 months | No |
| Anthrax | Cattle and buffalo | Only if the farm names an endemic area in settings | 12 months | No |
| Custom | Either | Age and sex rule the farm writes | Farm-defined | No |

Each given dose stores vaccine name, manufacturer (optional), batch, dose text, route, date, administered by, next due, and attachment.

### 23.2 Deworming

Starter, disabled: all young stock under 12 months every 90 days; adults every 180 days. Product is free text plus a suggestion list the farm can extend:

Albendazole, Fenbendazole, Ivermectin, Closantel, Levamisole, Oxyclozanide, other.

### 23.3 Routes and health outcomes

**Routes:** oral, intramuscular, intravenous, subcutaneous, intramammary, intrauterine, topical, pour-on, other.

**Outcomes:** ongoing, resolved, died, culled, referred, unknown.

**Problem suggestions (not a closed list):** mastitis, milk fever, ketosis, retained placenta, metritis, lameness, bloat, diarrhoea, pneumonia, theileriosis, fever, injury, dystocia follow-up, other.

Mastitis adds optional quarter checkboxes (LF, RF, LH, RH) and a withdrawal note. If withdrawal days &gt; 0, milk entry for that animal shows a banner until the withdrawal end date. The milk row can still be saved. Reports can exclude withdrawal milk from saleable litres. Default is to count it in production and exclude it from saleable milk value.

### 23.4 Isolation

Required: reason, start date. Optional review date. Dashboard section “Isolated” shows code, reason, days isolated, and location. Clearing isolation requires a note.

---

## 24. Milk, weight, and feed seed data

### 24.1 Milk

| Setting | Default |
| --- | --- |
| Sessions | Morning and evening required. Optional third session off. |
| Morning label | Morning |
| Evening label | Evening |
| Price per litre | Unset. Until set, yield is stored and milk income is not suggested. Example a farm might enter: ₹55.00 from 1 Apr 2026. |
| Saleable vs produced | Produced = morning + evening + extra. Saleable = produced, minus litres marked discarded or withdrawal. |
| Drop rule | 30% below the previous 7 recorded daily totals in the same lactation |
| Minimum history | 7 recorded days |
| Suppressed | First 14 days in milk, animals not lactating, days marked explained |

**Worked drop.** Ganga’s previous 7 daily totals average 12.0 L. Today morning 3.0 and evening 4.0, total 7.0. Change = (7 − 12) / 12 = −41.7%. Alert opens because 41.7 ≥ 30 and DIM &gt; 14. Alert text:

> MIL-GIR-004 Ganga produced 7.0 L today. Her previous 7-day average is 12.0 L (−42%). Rule: drop of 30% or more after day 14 in milk.

Herd alert uses the same percent on the sum of animals that have a row today versus those same animals’ 7-day means. Animals with no row today are left out of both sides.

Lactation summary fields (Phase 2 display, values computable as soon as milk exists):

| Field | Definition |
| --- | --- |
| Days in milk | Completed days from calving date to dry-off, leave, or today if still lactating |
| Total yield | Sum of daily totals in that lactation |
| Peak | Maximum daily total, with the date |
| Average per day | Total yield ÷ number of days that have a milk row, not ÷ calendar DIM |
| 305-day actual | Sum of the first 305 calendar days only when those days are complete. No projection in Phase 1 or 2. |

### 24.2 Weight

Kilograms, one decimal. Chart is date on the x-axis and kg on the y-axis. No standard growth curve is drawn in Phase 1. The form may show the breed’s birth-weight hint when age is under 7 days, as placeholder text only.

### 24.3 Feed items

Seeded inactive until the farm enters an opening quantity. Units default to kg.

| Category | Seed items |
| --- | --- |
| Green fodder | Maize fodder, Napier, Berseem, Lucerne, Jowar green, Sugarcane tops, Pasture grass |
| Dry fodder | Wheat straw, Paddy straw, Groundnut haulm, Kadbi |
| Silage | Maize silage, Jowar silage |
| Concentrate | Compound cattle feed, Cottonseed cake, Mustard cake, Maize grain, Wheat bran, Rice bran, Gram churi |
| Mineral and supplement | Mineral mixture, Salt, Bypass fat, Calcium supplement |
| Other | Empty. Farm adds items. |

Movement types: `opening`, `purchase`, `consumption`, `wastage`, `adjustment`.

Closing for a period = opening + purchase + positive adjustment − consumption − wastage − negative adjustment.

Low-stock alert when current quantity ≤ item minimum. Seed minimum is unset, so nothing alerts until the farm sets one.

**Example stock line.** Compound cattle feed, opening 1,000 kg on 1 Apr 2026, purchase 500 kg at ₹28/kg on 10 Apr, consumption 40 kg/day recorded as one herd line of 1,200 kg for 1–30 Apr, wastage 15 kg. Closing = 1,000 + 500 − 1,200 − 15 = **285 kg**. Feed cost in the period for this item = 500 × 28 = **₹14,000** of purchases. Consumption cost for profitability uses a moving average: purchases and opening value. If opening value was not entered, cost per animal is marked incomplete rather than treated as zero.

Animal-wise Phase 1 allocation is optional. If the farm only logs herd consumption, profitability later shows a herd average and says so.

---

## 25. Semen, embryo, and storage seed data

### 25.1 Semen types and companies

**Type:** conventional, sexed female, sexed male, unknown.

**Seed company list (editable, not an endorsement):** farm’s own bull, BAIF, NDDB / dairy-board stud, ABS, Semex, Genus, CRV, other.

### 25.2 Example tank map

One tank is enough to prove the hierarchy. Positions are strings so a farm can use their own labels.

| Tank | Canister | Goblet | Position | Contents |
| --- | --- | --- | --- | --- |
| Tank A | 1 | A | 1 | `STR-G14-2026-001` … `013` available, bull GIR-SAGAR, batch G14-2026, conventional |
| Tank A | 1 | A | 2 | `STR-G14-2026-014` used on MIL-GIR-004 on 2 Jan 2026 |
| Tank A | 1 | B | 1 | Batch HF-SX-88, sexed female, quantity-only, received 20, used 4, balance 16 |
| Tank A | 2 | A | 1 | Empty |

Bull register row for the sire:

| Field | Value |
| --- | --- |
| Code | `BULL-GIR-014` |
| Name | Sagar |
| Breed | Gir |
| Registration | Farm-entered, example `GIR-REG-2291` |
| Sire / dam | External ancestors with names only, until more pedigree is typed |
| Company | Farm’s own bull |
| Batch | G14-2026 |
| Collection date | 12 Dec 2025 |
| Type | Conventional |
| Received | 40 straws |
| Price | ₹350 per straw |
| Used | 1 |
| Balance | 39 |

### 25.3 Embryo grades and stages

Stored when Phase 2 opens. Codes follow common IETS practice so later imports match lab sheets.

**Grade:** 1 excellent, 2 good, 3 fair, 4 poor, 5 degenerate or dead.

**Stage:** 1 unfertilised or 1-cell through 9 expanded hatched blastocyst, plus `unknown`. The form shows the short label and the number.

**Status:** in stock, transferred, discarded, shipped.

**Embryo code:** `EMB-{YYYY}-{nnnn}` example `EMB-2026-0007`.

A transferred embryo points at one recipient and one pregnancy case. The calf’s genetic dam is the donor, genetic sire is the embryo sire, birth dam is the recipient.

---

## 26. Finance categories and a sample month

### 26.1 Categories

| Kind | Code | Label | Typical source |
| --- | --- | --- | --- |
| Income | `milk` | Milk | Suggested from saleable litres × price |
| Income | `cattle_sales` | Cattle sales | Suggested from sale events |
| Income | `calves` | Calves | Suggested from calf sale events |
| Income | `semen` | Semen | Manual or shop order |
| Income | `embryos` | Embryos | Manual or shop order |
| Income | `dairy_products` | Ghee and dairy products | Manual or shop order |
| Income | `farmhouse` | Farmhouse | Manual |
| Income | `other_income` | Other | Manual |
| Expense | `feed` | Feed | Suggested from feed purchases |
| Expense | `medicine` | Medicine | Suggested when a health event has a cost |
| Expense | `veterinary` | Veterinary | Manual professional fees |
| Expense | `labour` | Labour | Manual |
| Expense | `breeding` | Breeding | AI technician fees not already in semen |
| Expense | `semen_purchase` | Semen | Suggested from batch receipt cost |
| Expense | `embryo_work` | Embryo work | Manual |
| Expense | `electricity` | Electricity | Manual |
| Expense | `transport` | Transport | Manual |
| Expense | `other_expense` | Other | Manual |

### 26.2 Sample April 2026 for one Gir cow

Illustrative numbers for report layout tests, not a benchmark.

| Line | Amount (INR) |
| --- | --- |
| Ganga saleable milk 300 L × ₹55 | 16,500 income, attributed to MIL-GIR-004 |
| Compound feed purchase | 14,000 expense, herd bucket, not attributed |
| Mineral mixture | 2,200 expense, herd bucket |
| Vet visit, Ganga mastitis fee | 1,500 expense, attributed |
| Medicine on that visit | 860 expense, attributed |
| Semen straw consumed at ₹350 | 350 expense, attributed to the AI on Ganga |
| Labour (farm, monthly) | 40,000 expense, farm bucket |

Animal card for Ganga that month: income 16,500 − medicine 860 − vet 1,500 − semen 350 = **13,790** before feed. Feed stays in the farm bucket because it was not allocated. The report states “feed not included for this animal”.

Farm month: income 16,500, expense 14,000 + 2,200 + 1,500 + 860 + 350 + 40,000 = **58,910**, surplus **−42,410**. A one-cow sample is supposed to look like this so nobody mistakes the layout for a healthy dairy P&L.

---

## 27. Alerts, dashboard, and message templates

### 27.1 Alert copy

Placeholders are filled in the farm’s language catalog. English defaults:

| Type | Title | Body |
| --- | --- | --- |
| `pd_due` | Pregnancy check due | {code} {name} was inseminated on {ai_date}. Check due {due_date}. |
| `ai_followup` | AI follow-up | {code} {name} is still bred and the pregnancy check was due {due_date}. |
| `calving_due` | Expected calving | {code} {name} expected calving {due_date} (calculated, {gestation_days} days from {conception_date}). |
| `dry_off` | Dry-off due | {code} {name} dry-off due {due_date},  {lead_days} days before expected calving. |
| `vaccine_due` | Vaccination due | {code} {name} {vaccine} due {due_date}. Last dose {last_date}, batch {batch}. |
| `deworm_due` | Deworming due | {code} {name} deworming due {due_date}. |
| `health_followup` | Health follow-up | {code} {name} follow-up for {problem} due {due_date}. |
| `medication_due` | Medication due | {code} {name} {medicine} dose due {due_date}. |
| `milk_drop` | Milk drop | See §24.1. |
| `low_feed` | Feed stock low | {item} balance {qty} {unit}. Minimum is {min}. |
| `heat_expected` | Heat window | {code} {name} is around day {cycle_day} since {last_event}. Window is day 18–24. |
| `withdrawal` | Milk withdrawal | {code} {name} withdrawal until {end_date} ({medicine}). |
| `custom` | {title} | {note} |

`heat_expected` is off by default. When enabled, it is created from the last heat or AI at day 18 and closes at day 25 or when a new heat, AI, or pregnancy is recorded.

### 27.2 Who sees which alert

| Alert | Owner | Manager | Vet | AI tech | Worker | Accountant | Genetics | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PD, AI follow-up, calving, dry-off, heat window | Yes | Yes | Yes | Yes | No | No | Yes | Yes |
| Vaccine, deworm, health, medication, withdrawal, milk drop | Yes | Yes | Yes | No | Milk drop and withdrawal only | No | No | Yes |
| Low feed, custom task | Yes | Yes | No | No | If assigned | No | No | Yes |
| Finance-related custom tasks | Yes | Yes | No | No | No | Yes | No | Yes |

### 27.3 Dashboard tile definitions

All counts are presence = On farm unless the tile says otherwise. Month means the current calendar month in the farm timezone.

| Tile | Definition |
| --- | --- |
| Total cattle | On farm, any species. A second line splits cattle and buffalo when both exist. |
| Lactating | Lactation state = Lactating |
| Dry | Lactation state = Dry |
| Pregnant | Reproduction = Pregnant |
| Calves | On farm, under 12 months, no calving recorded as dam |
| Today’s milk | Sum of today’s daily totals, plus “n animals not entered” |
| Monthly milk | Sum of daily totals from the 1st through today |
| AI this month | Non-voided AI events with date in the month |
| Expected calving | Pregnant, expected date within the next 30 days |
| Health alerts | Open alerts of type health follow-up, medication, isolation count as a separate number beside this tile |
| Vaccination due | Open vaccine alerts due today or overdue |
| Feed stock | Count of items at or below minimum |
| Income / expense | Month-to-date confirmed finance rows. Hidden until the first finance entry exists (Phase 2). |
| Pending tasks | Open alerts the current user is allowed to see |

Sample tile strip for the demo herd in §29 on the morning of 21 Oct 2026, after Ganga has calved and before that day’s milk is entered. Radha is counted in both Lactating and Pregnant.

| Tile | Value |
| --- | --- |
| Total | 11 on farm (Tulsi sold, excluded) |
| Lactating | 5 (Jamuna, Radha, Ganga, Godavari, Holi) |
| Dry | 2 (Savitri, Meera) |
| Pregnant | 3 (Savitri, Radha, Kaveri) |
| Calves | 1 (MIL-GIR-018). Narmada is 20 months, so she is a heifer, not a calf. |
| Today’s milk | 0 L entered, 5 lactating animals not entered |
| AI this month | 1 (Holi on 1 Oct) |
| Expected calving | 0 within 30 days. Kaveri’s calculated date is 4 Jul 2027. Ganga already calved. |
| Vaccination due | 2 (Narmada, Krishna, due 15 Oct, still open) |
| Feed below minimum | 1 (compound cattle feed at 285 kg, minimum 300 kg) |

---

## 28. Field validation, exports, and public fields

### 28.1 Validation

| Object | Rule |
| --- | --- |
| Animal code | Matches the farm pattern, unique, immutable after save except by owner or admin, who must give a reason. Old code remains searchable. |
| DOB | Not in the future. Estimated flag required if the user picks “estimated”. Age over 30 years shows a warning. |
| Ear tag, RFID | Unique among non-voided identifiers on the farm. |
| Purchase price, semen price, finance amount | ≥ 0, two decimal places, INR. |
| Milk session | ≥ 0 and ≤ 80 litres per session. Above 40 litres warns and requires confirm. |
| Weight | &gt; 0 and ≤ 1,200 kg. Birth weight above 80 kg warns. |
| Straw use | Quantity is a positive integer. Cannot exceed available balance. |
| PD date | On or after the linked AI or transfer. |
| Calving date | On or after conception. More than 21 days before or after the expected date warns and requires confirm. |
| Next due | On or after the dose date. |
| Attachment | JPEG, PNG, WEBP, or PDF. Max 10 MB. Max 8 files per event. |
| Public price | Optional. If set, ≥ 0. |

### 28.2 Export columns

Filters common to herd exports: date range, species, breed, location, presence, sex. Exports use the same permission scope as the screen.

**Cattle register:** code, name, species, breed, sex, DOB, DOB estimated, colour, marks, presence, life stage, reproduction, lactation, location, ear tag, RFID, sire code, sire name, dam code, dam name, purchase date, purchase source, purchase price, latest weight, latest weight date.

**AI register:** date, female code, female name, attempt, technician, bull code, batch, straw code, type, deposition, cycle id, void reason.

**Pregnancy register:** PD date, female code, result, method, linked AI or transfer date, conception date, expected calving, diagnosed by.

**Calving register:** actual date, expected date, dam code, sire code, birth dam if different, calf codes, sex, outcome, ease, presentation, lactation number opened.

**Milk:** date, animal code, morning, evening, extra, total, discarded, saleable, lactation number, DIM, withdrawal flag.

**Vaccination:** date, animal code, vaccine, batch, dose, route, next due, by.

**Health:** date, animal code, problem, diagnosis, vet, outcome, follow-up, medicine names, cost.

**Feed:** date, item, category, movement type, quantity, unit, value, supplier, allocation target.

**Semen:** bull, batch, type, tank, canister, goblet, position, straw or quantity, status, received, used, balance, price.

**Finance (Phase 3 file, Phase 2 on screen):** date, kind, category, amount, animal code, note, source event id, confirmed by.

**Genetics (Phase 3 file):** bull code, offspring count, female offspring, daughters with a lactation, average daughter total yield, average daughter DIM, calvings as sire, live calves, dead calves.

### 28.3 Public listing allow-list

Default ticks for a new listing are photos, animal code, breed, sex, and DOB only. Everything else starts off.

| Field | Public label |
| --- | --- |
| Photos and videos | Gallery |
| Animal code | Animal ID |
| Name | Name |
| Breed and species | Breed |
| Sex | Sex |
| DOB | Date of birth, without the estimated flag unless the farm also publishes it |
| Pedigree depth 1, 2, or 3 | Sire and dam names and codes only, repeated up to the chosen depth. No purchase data. |
| Milk summary | Lactation number, total yield, peak, DIM. No daily rows. |
| Pregnancy | One line: pregnant, and expected month (not the full date) if the farm ticks “include expected month”. |
| Health | Only lines the farm writes in a public health note. Structured clinical records cannot be toggled on in bulk. |
| Genetics note | The public genetics blurb, separate from the private note. |
| Price | Price on enquiry, or a number. |
| Contact | Farm enquiry recipient. |

---

## 29. Demo farm used for tests and screenshots

Seed farm **Shree Gir Dairy**, timezone Asia/Kolkata, currency INR, prefix `MIL`, milk price ₹55 from 1 Apr 2026. This data is a fixture. It is not loaded into a real customer farm unless they choose “load sample herd”.

Dates below are absolute so dashboard tests do not depend on “today”, except §27.3 which freezes today as **21 Oct 2026**.

### 29.1 People

| Name | Role |
| --- | --- |
| Asha Rao | Owner and admin |
| Imran Qureshi | Farm manager |
| Dr. N. Patil | Veterinarian |
| S. Jadhav | AI technician |
| Lata More | Farm worker |
| K. Shah | Accountant |
| R. Deshmukh | Genetics manager |

### 29.2 Animals on 21 Oct 2026

| Code | Name | Breed | Sex | DOB | Presence | Stage | Reproduction | Lactation | Location | Parents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MIL-GIR-001 | Jamuna | Gir | F | 12 Mar 2019 | On farm | Cow | Open | Lactating (3) | Milking shed | Sire BULL-GIR-002 Dam external |
| MIL-GIR-002 | Savitri | Gir | F | 4 Jul 2020 | On farm | Cow | Pregnant | Dry | Dry shed | Sire BULL-GIR-002 Dam MIL-GIR-001 |
| MIL-GIR-003 | Radha | Gir | F | 19 Jan 2021 | On farm | Cow | Pregnant | Lactating (2) | Milking shed | Sire BULL-HF-010 Dam MIL-GIR-001 |
| MIL-GIR-004 | Ganga | Gir | F | 2 Nov 2021 | On farm | Cow | Fresh | Lactating (2) | Milking shed | Sire BULL-GIR-014 Dam MIL-GIR-001 |
| MIL-GIR-005 | Godavari | Gir | F | 15 May 2022 | On farm | Cow | Open | Lactating (1) | Milking shed | Sire BULL-GIR-014 Dam external |
| MIL-GIR-006 | Kaveri | Gir | F | 9 Sep 2023 | On farm | Heifer | Pregnant | Pre-lactation | Dry shed | Sire BULL-GIR-014 Dam MIL-GIR-002 |
| MIL-GIR-007 | Narmada | Gir | F | 1 Feb 2025 | On farm | Calf | Open | Pre-lactation | Calf pen | Sire BULL-GIR-014 Dam MIL-GIR-003 |
| MIL-GIR-008 | Krishna | Gir | M | 20 Aug 2024 | On farm | Bull | Not applicable | Not applicable | Bull pen | Sire BULL-GIR-002 Dam MIL-GIR-005 |
| MIL-HF-001 | Holi | HF cross | F | 11 Dec 2022 | On farm | Cow | Bred | Lactating (1) | Milking shed | Sire BULL-HF-010 Dam external |
| MIL-MUR-001 | Meera | Murrah | F | 8 Apr 2021 | On farm | Cow | Open | Dry | Dry shed | Sire BULL-MUR-001 Dam external |
| MIL-GIR-018 | Ganga’s calf | Gir | F | 14 Oct 2026 | On farm | Calf | Open | Pre-lactation | Calf pen | Sire BULL-GIR-014 Dam MIL-GIR-004 |
| MIL-GIR-009 | Tulsi | Gir | F | 3 Jun 2018 | Sold 1 Sep 2026 | Cow | Open | Dry | — | Sire external Dam external |

On-farm totals match §27.3: 11 animals, 5 lactating, 2 dry, 3 pregnant, 1 calf. Krishna is the only bull and is not one of those four cards. Holi is lactating and bred, so she appears under Lactating and not under Pregnant. Radha appears under both Lactating and Pregnant. Narmada (born 1 Feb 2025) is about 20 months old on this date, so she is a heifer and is excluded from Calves.

### 29.3 Pedigree slice

```text
BULL-GIR-002
    └── MIL-GIR-001 Jamuna
            ├── MIL-GIR-002 Savitri × BULL-GIR-002
            │       └── MIL-GIR-006 Kaveri × BULL-GIR-014
            ├── MIL-GIR-003 Radha × BULL-HF-010
            │       └── MIL-GIR-007 Narmada × BULL-GIR-014
            └── MIL-GIR-004 Ganga × BULL-GIR-014
                    └── MIL-GIR-018 × BULL-GIR-014
```

Mating check that must flag a parent relationship: female MIL-GIR-002 Savitri × proposed sire BULL-GIR-002 (he is her sire).

Mating check that must flag a common ancestor and not a parent: female MIL-GIR-006 Kaveri × proposed sire BULL-GIR-002 (he is her great-grandsire through Jamuna and also her dam’s sire). Flag level: grandparent or common ancestor, not parent.

Cycle that must be rejected: setting MIL-GIR-001’s dam to MIL-GIR-004.

### 29.4 Events that must exist in the fixture

| Date | Event |
| --- | --- |
| 2 Jan 2026 | Heat and AI for Ganga, straw `STR-G14-2026-014`, sire BULL-GIR-014, technician S. Jadhav |
| 8 Feb 2026 | PD pregnant for that AI, Dr. N. Patil, ultrasound |
| 18 Aug 2026 | Ganga dried off |
| 14 Oct 2026 | Ganga calved, live female MIL-GIR-018 |
| 1 Oct 2026 | AI for Holi, batch HF-SX-88, sexed female, attempt 1, no PD yet. PD due 5 Nov 2026 (35 days). |
| 20 Sep 2026 | AI for Kaveri linked to a pregnant PD on 1 Nov is **not** in October. Her pregnancy is already confirmed with expected calving in June 2027 using Gir 287 days. Fixture stores conception 20 Sep 2026, PD pregnant 28 Oct is in the future relative to 21 Oct, so instead store PD pregnant on **18 Oct 2026**. Expected calving = 20 Sep 2026 + 287 days = **4 Jul 2027**. |
| 12 Oct 2026 | FMD vaccination for Jamuna and Godavari, batch `FMD-26-118`, next due 12 Apr 2027 |
| 1 Oct 2026 | Vaccine due fixture: Narmada and Krishna have next due 15 Oct 2026, still open on 21 Oct |
| 19 Oct 2026 | Health event Radha, problem mastitis, quarter RH, withdrawal 4 days, so banner through 23 Oct 2026, cost medicine ₹860, vet fee ₹1,500 |
| Milk | 7–20 Oct 2026 daily totals for each lactating cow except the drop day. Ganga has no milk before 14 Oct in this lactation. From 15 Oct her yields exist but DIM &lt; 14 so no drop alert. Jamuna’s 7-day mean before 21 Oct is 12.0 L and 21 Oct is not yet entered. |
| Weight | Jamuna 385 kg on 1 Oct 2026. Calf MIL-GIR-018 22.4 kg on 14 Oct 2026. |
| Feed | Compound cattle feed as in §24.3, minimum set to 300 kg so 285 kg alerts. |
| Sale | Tulsi sold 1 Sep 2026 for ₹90,000, presence Sold, excluded from totals. |

AI this month on 21 Oct 2026 = **1** (Holi on 1 Oct), unless the fixture also includes a second October AI. Keep it at one so the tile is stable.

### 29.5 Milk-drop fixture

Do not fire on Ganga. Fire on a dedicated row for Jamuna if today’s date in the test is 20 Oct 2026 and that day’s total is 7.0 L against a prior 7-day mean of 12.0 L, with DIM well above 14. The test freezes time. Production dashboards on a real 21 Oct 2026 do not need this alert present in the demo until that day’s milk is saved.

---

## 30. Permissions in more detail

Grants stack when a person has two roles. Phase 1 has no explicit deny.

| Action | Owner | Manager | Vet | AI tech | Worker | Accountant | Genetics | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Invite or remove users | Yes | No | No | No | No | No | No | Yes |
| Edit farm defaults and breeds | Yes | No | No | No | No | No | No | Yes |
| Enable a vaccine protocol | Yes | No | Yes | No | No | No | No | Yes |
| Create or edit animal identity | Yes | Yes | No | No | No | No | Yes | Yes |
| Override status without an event | Yes | Yes | No | No | No | No | No | Yes |
| Record heat | Yes | Yes | Yes | Yes | Yes | No | No | Yes |
| Record AI and consume a straw | Yes | Yes | No | Yes | No | No | No | Yes |
| Adjust semen stock | Yes | Yes | No | No | No | No | Yes | Yes |
| Record PD or calving | Yes | Yes | Yes | Yes | No | No | No | Yes |
| Record treatment | Yes | Yes | Yes | No | No | No | No | Yes |
| Record vaccine or deworming | Yes | Yes | Yes | No | Only if the extra grant is on | No | No | Yes |
| Set or clear isolation | Yes | Yes | Yes | No | No | No | No | Yes |
| Enter milk, weight, feed | Yes | Yes | No | No | Yes | No | No | Yes |
| Confirm finance rows | Yes | No | No | No | No | Yes | No | Yes |
| View finance | Yes | Yes | No | No | No | Yes | No | Yes |
| View purchase price and semen price | Yes | Yes | No | No | No | Yes | Yes | Yes |
| Run mating check | Yes | Yes | No | No | No | No | Yes | Yes |
| Publish a listing | Yes | Yes | No | No | No | No | Yes | Yes |
| Export cattle, breeding, milk, feed, semen | Yes | Yes | No | Breeding only | No | No | Semen and cattle | Yes |
| Export health | Yes | Yes | Yes | No | No | No | No | Yes |
| Export finance | Yes | No | No | No | No | Yes | No | Yes |
| See clinical notes | Yes | Yes | Yes | No | No | No | No | Yes |
| Void an event | Yes | Yes | Own health events | Own AI, heat, PD, calving | Own milk, weight, feed within 24 hours | Own finance rows | Own mating notes and stock adjustments | Yes |

Worker extra grant `worker.health.vaccine` is a single boolean on the membership, default off.

---

## 31. Notification payload reserved for later channels

Phase 1 writes this object when an alert opens. Nothing sends it externally until Phase 3.

```json
{
  "farm_id": "farm_01",
  "alert_id": "alt_01",
  "type": "pd_due",
  "due_on": "2026-11-05",
  "animal_code": "MIL-HF-001",
  "title": "Pregnancy check due",
  "body": "MIL-HF-001 Holi was inseminated on 1 Oct 2026. Check due 5 Nov 2026.",
  "href": "/animals/MIL-HF-001",
  "roles": ["owner", "manager", "vet", "ai_technician", "genetics", "admin"]
}
```

Phase 3 adds `channels_requested` such as `["in_app","whatsapp"]` and a delivery log. The alert row itself stays the source of truth if delivery fails.

---

## 32. SaaS packaging sketch

Not a price list. It stops a later build from assuming one farm is the whole database.

| | Starter | Herd | Genetics |
| --- | --- | --- | --- |
| Farms | 1 | 1 | 1, with a second holding optional later |
| On-farm animals | Up to 100 | Up to 1,000 | 2,000 and above by agreement |
| Users | 5 | 25 | 50 |
| Phase 1 modules | Yes | Yes | Yes |
| Genetics dashboard and mating check | No | Yes | Yes |
| Public catalogue | Enquiry link | Yes | Yes |
| Ecommerce | No | No | Yes |
| Sample herd | Yes | Yes | Yes |

Platform admin (the SaaS operator) can suspend a farm, reset a lockout, and read billing metadata. They do not get a default grant to open animal clinical records. Support access, if ever added, is time-limited and audited. It is not part of Phase 1.

---

## 33. What was added in v1.1

- Cattle and buffalo as species, with a breed catalogue and gestation defaults.
- Identity, coat, location, heat, AI, PD, and calving vocabularies.
- Disabled starter vaccine and deworming protocols.
- Feed item seed, a stock equation with rupee figures, and milk-drop wording.
- Semen tank example, embryo grade codes, finance categories, and a one-cow month that shows unallocated feed honestly.
- Alert templates, role visibility, export columns, public-field defaults.
- A 12-animal demo fixture with pedigree traps (parent mating, cycle, sire-of-conception).
- A reserved notification payload and a packaging sketch so tenancy limits have a place to live.

---

## 34. What was added in v1.2

- The application stack: Next.js, NextAuth, PostgreSQL, Drizzle, Tailwind CSS, and shadcn/ui, plus the libraries those depend on for forms, charts, files, QR, exports, email, tests, and Razorpay.
- Tenancy, sessions, transactions, and file storage rules so the stack cannot drift into a second API or a second database style.
- Default hosting called out as Vercel and Neon, with the app kept on standard Next.js and Postgres.

---

## 35. What was added in v1.3

- File storage is Cloudflare R2: a private bucket for farm files and a public bucket for published listing media.
- Transactional email is ZeptoMail, using the India API endpoint, for invites and farm enquiry notices.

