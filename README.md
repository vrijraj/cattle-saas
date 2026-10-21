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

Without ZeptoMail, an invite still creates a link the owner can copy. Without Razorpay, a cart becomes an order waiting for payment. Without R2, photo upload is refused and the profile says storage is not configured.

`AUTH_SECRET` must be a long random string before any shared deployment. Do not commit `.env`.

## What the app covers

**Farm workspace** (signed in): dashboard, cattle register and profile, dam-line family tree, heat / AI / pregnancy / calving, health, milk, feed, semen, mating check, embryos, finance, alerts, reports (CSV, PDF, Excel), shop products, team invites, an audit log, and an assistant at `/ai`.

The assistant at `/ai` uses Google ADK with Gemini function calls. It looks up the same records as the workspace. Heat, insemination, pregnancy, calving, health, milk, weight, feed, and finance can be saved from the chat after you confirm. Set `GEMINI_API_KEY` (from Google AI Studio) and restart the dev server. `GEMINI_MODEL` defaults to `gemini-flash-latest`. Without a key, `/ai` explains what to add. The chat stays in this browser tab until you choose New chat. A server restart starts a new model session.

On a phone, the farm menu opens from the header. From the `md` breakpoint up, the same menu is a fixed sidebar.

**Public:** farm catalogue, animal listing, shop, and cart. A QR code encodes `https://{AUTH_URL}/q/{token}`. A signed-out scan does not show unpublished records.

Dates display as `21 Oct 2026`. Money is INR. The farm clock is `Asia/Kolkata`.
