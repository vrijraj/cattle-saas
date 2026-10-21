# Cattle Management

Multi-farm records for dairy and genetics work. Each farm is a tenant. Staff keep one lifetime record per animal, then log breeding, health, milk, weight, feed, and money against it. A public catalogue can show selected animals and products without exposing private farm data.

The sample farm is **Shree Gir Dairy** (`shree-gir`). Product requirements are in [docs/PRD.md](docs/PRD.md).

## Stack

- Next.js (App Router), React, TypeScript
- Auth.js (Credentials, JWT)
- Drizzle ORM with embedded PGlite, or PostgreSQL
- Tailwind CSS
- Google ADK and Gemini for the farm assistant

## Requirements

- Node.js 20 or newer
- pnpm

## Run locally

```bash
pnpm install
cp .env.example .env
pnpm db:setup
pnpm dev
```

Open [http://localhost:3007](http://localhost:3007). The app listens on port **3007**. `AUTH_URL` in `.env` must match that origin.

`pnpm db:setup` applies migrations and loads the sample farm. Run it again only when you want to refresh seed data. If a dev server is already running, stop it before migrating. PGlite keeps one process on the data directory, and a second process will not see new tables.

### Sample sign-in

Every sample user uses the password `demo-farm-2026`. The sign-in page shows this only in development.

| Name | Email | Roles |
| --- | --- | --- |
| Asha Rao | asha@shreegir.test | Owner, admin |
| Imran Qureshi | imran@shreegir.test | Manager |
| Dr. N. Patil | patil@shreegir.test | Vet |
| S. Jadhav | jadhav@shreegir.test | AI technician |
| Lata More | lata@shreegir.test | Worker |
| K. Shah | shah@shreegir.test | Accountant |
| R. Deshmukh | deshmukh@shreegir.test | Genetics |

The public catalogue is [http://localhost:3007/farms/shree-gir](http://localhost:3007/farms/shree-gir). The shop is under `/farms/shree-gir/shop`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Dev server on port 3007 |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm db:setup` | Migrate, then seed |
| `pnpm db:migrate` | Apply migrations with Drizzle Kit (Postgres URL) |
| `pnpm db:seed` | Seed Shree Gir Dairy |
| `pnpm db:generate` | Write a new Drizzle migration |
| `pnpm db:up` | Start Postgres 16 with Docker Compose |
| `pnpm test` | Unit tests for herd, pedigree, and mating rules |
| `pnpm lint` | ESLint |

## Database

Local development uses embedded PGlite. `.env.example` sets:

```
DATABASE_URL=pglite:.data/pglite
```

The files live in `.data/pglite`. To use a Postgres server instead:

```bash
pnpm db:up
```

Then set `DATABASE_URL=postgres://cattle:cattle@localhost:5432/cattle` and run `pnpm db:setup`. Docker is required for `db:up`. The app already speaks both URLs.

## Optional services

The farm app runs with these left empty. Each feature explains itself in the UI when the keys are missing.

| Service | Used for | Env |
| --- | --- | --- |
| Cloudflare R2 | Animal photos | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_PRIVATE` |
| ZeptoMail | Staff invite email | `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_FROM` |
| Razorpay | Shop checkout | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| Gemini | Assistant at `/ai`, through Google ADK | `GEMINI_API_KEY` |
| WhatsApp / SMS | Optional delivery of an alert | `WHATSAPP_TOKEN`, `WHATSAPP_API_URL`, `SMS_TOKEN`, `SMS_API_URL` |

Without ZeptoMail, an invite still creates a link the owner can copy. Without Razorpay, a cart becomes an order waiting for payment. Without R2, photo upload is refused and the profile says storage is not configured. Without WhatsApp or SMS, the in-app alert stays open and the send is recorded as not configured.

`AUTH_SECRET` must be a long random string before any shared deployment. Do not commit `.env`.

## Features

Sign-in is at `/signin`. The home page sends a signed-in person to the dashboard. On a phone, the farm menu opens from the header. From the `md` breakpoint up, the same menu is a fixed sidebar. Search opens as a command palette. Some items stay hidden until the signed-in roles include them.

### Today

- **Dashboard.** On-farm, lactating, dry, and pregnant counts, milk for the last 7 days, breed and status breakdowns, sheds, isolated animals, upcoming calvings, open alerts, and feed stock.
- **Assistant** at `/ai`. Google ADK with Gemini function calls reads the same records as the workspace. After you confirm, it can add an animal, record breeding, health, milk, weight, feed, finance, semen, and embryos, publish a listing, add a shop product, invite staff, and void a record. Set `GEMINI_API_KEY` (from Google AI Studio) and restart the dev server. `GEMINI_MODEL` defaults to `gemini-flash-latest`. Without a key, `/ai` explains what to add. The conversation is kept in this browser and in `.data/ai-sessions.json`, so a server restart keeps the same chat until you choose New chat.
- **Alerts.** Due work, milk drop, low feed, and medicine reminders. WhatsApp and SMS are optional. If those tokens are empty, the in-app alert stays open and the send is recorded as not configured.

### Herd

- **Cattle.** A register with search, and a dam-line family tree at `/animals?tab=tree`. Each animal has a code such as `MIL-GIR-001`, a profile, and a lifetime timeline.
- **Status.** Presence, life stage, reproduction, and lactation are separate. The list badge shows Sold, Dead, or Transferred first, then Pregnant, then In milk or Dry, then the life stage. Owner, manager, genetics, and admin can change status and basic details. Breeding events still update status when they are recorded.
- **Pedigree.** Dam, sire, offspring, and ancestors through the 8th generation. The diagram zooms from the pointer, drags, and opens full screen. A repeated ancestor stops the line instead of looping. A pedigree PDF downloads from the profile.
- **Identity.** Ear tag, colour, marks, photo, and a QR code. The QR encodes `https://{AUTH_URL}/q/{token}`. A signed-out scan does not show unpublished records. Scan in the header opens an animal or a semen straw from a code.
- **Sheds.** Current location, move history, and an isolation flag.
- **Weight.** Date and kilograms on the animal.
- **Milk.** Morning and evening litres, one row per animal per day. The profile shows lactation number and days in milk from calving and dry-off.
- **Feed.** Stock, purchases, consumption, wastage, and a minimum. The dashboard shows items below that minimum.

### Breeding

- **Breeding register.** Tabs for what is due, pregnant animals, heat, inseminations, pregnancy checks, and calvings (`/breeding?tab=calvings` and the same pattern for the other tabs).
- **Animal breeding history.** Heat, AI, pregnancy check, calving, and dry-off on the profile, with the calf and the insemination linked.
- **Semen.** Bulls, batches, and straws, including tank position and use on an insemination.
- **Genetics.** A mating check against the pedigree, and bull performance.
- **Insights.** Due dates and counts from the farm calendar. These are rules, not a genetic evaluation.
- **Embryos.** Collections, inventory, and transfers.
- **Health.** Due work, treatments, vaccines, and deworming. Clinical notes stay with roles that can see them.

### Business

- **Finance.** An income and expense register. A voided row stays in the list and drops out of the totals.
- **Reports.** Charts for the main registers, with CSV, Excel, and PDF downloads that follow the filters on the page.
- **Shop.** Products, a public catalogue, and a cart. Without Razorpay, a cart becomes an order waiting for payment.
- **Enquiries.** Buyer messages from the catalogue.
- **Listings.** A published animal can appear on `/farms/shree-gir` with the fields the farm chose to show.
- **Audit.** Mutations store the actor, the entity, and a summary.
- **Team.** Invites by email and role. Without ZeptoMail, the owner can still copy the invite link.

### Public

The catalogue, an animal listing, the shop, and the cart are available without a farm session. Money is INR. The farm clock is `Asia/Kolkata`.
