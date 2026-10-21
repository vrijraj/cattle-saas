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

## What the app covers

Sign-in is at `/signin`. The home page sends a signed-in person to the dashboard.

**Today:** dashboard, assistant at `/ai`, and alerts.

**Herd:** cattle register and dam-line family tree (`/animals` and `/animals?tab=tree`), sheds, milk, and feed.

**Breeding:** one register with tabs for what is due, pregnant animals, heat, inseminations, pregnancy checks, and calvings (`/breeding?tab=calvings` and the same pattern for the other tabs). Health uses the same pattern for due work, treatments, vaccines, and deworming. Semen uses the same pattern for batches, straws, and bulls. Also genetics (mating check and bull performance), insights, and embryos (collections, inventory, and transfers).

**Business:** finance, reports (CSV, PDF, Excel), shop products, buyer enquiries, the audit log, and team invites.

The header has scan and the account menu. Scan opens an animal or a semen straw from a code. On a phone, the farm menu opens from the header. From the `md` breakpoint up, the same menu is a fixed sidebar. Some items stay hidden until the signed-in roles include them.

The assistant at `/ai` uses Google ADK with Gemini function calls. It looks up the same records as the workspace. After you confirm, it can add an animal, record breeding, health, milk, weight, feed, finance, semen, and embryos, publish a listing, add a shop product, invite staff, and void a record. Set `GEMINI_API_KEY` (from Google AI Studio) and restart the dev server. `GEMINI_MODEL` defaults to `gemini-flash-latest`. Without a key, `/ai` explains what to add. The conversation is kept in this browser and in `.data/ai-sessions.json`, so a server restart keeps the same chat until you choose New chat.

**Public:** farm catalogue, animal listing, shop, and cart. A QR code encodes `https://{AUTH_URL}/q/{token}`. A signed-out scan does not show unpublished records.

Dates display as `21 Oct 2026`. Money is INR. The farm clock is `Asia/Kolkata`.
