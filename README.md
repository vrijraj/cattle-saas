# Milkometer — Multi-Tenant Dairy & Breeding SaaS Platform

**Milkometer** is a full-stack, multi-tenant dairy farm management and cattle breeding SaaS platform built for commercial dairy farms, indigenous cattle & buffalo breeders (Gir, Sahiwal, Murrah, Kankrej, HF, Jersey), and gaushalas.

Each farm operates as an isolated tenant with lifetime animal records, breeding & pedigree genetics, milk production & quality tracking, veterinary pharmacy & Indian vaccination protocols, nutrition & TMR rations, accounting & PDF/Excel reports, a public cattle catalogue & e-commerce storefront with GST invoices, offline mobile shed entry, regional Indian language support, and a multimodal Gemini AI farm assistant.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Framework** | Next.js `16.4.6` (App Router, Turbopack, Standalone Output), React `19.3`, TypeScript |
| **Styling & UI** | Tailwind CSS v4, Base UI, Lucide Icons, Mobile-first Responsive + Printable A4/Thermal Views |
| **Authentication & Security** | Auth.js v5 (Credentials + Argon2 hashing), 7-role RBAC, Audit Trail, Security Headers, Atomic PostgreSQL Rate Limiting |
| **Database & ORM** | Drizzle ORM + PostgreSQL 16 (with embedded PGlite for zero-config local dev) + Optional PostgreSQL Row-Level Security (`db/rls.sql`) |
| **AI Assistant** | Google ADK (`@google/adk`) + Gemini (`gemini-flash-latest`) with Postgres-persisted sessions, voice input, prescription/bill vision, and confirmation-gated write tools |
| **Payments & Storefront** | Razorpay Orders (cart checkout + oversell protection) & Razorpay Subscriptions (recurring SaaS tiers), `pdf-lib` GST Tax Invoices |
| **Storage & Comms** | Cloudflare R2 / S3-compatible private storage (local `.data/storage` fallback in dev), ZeptoMail transactional email, WhatsApp Cloud API & SMS |
| **Reporting & Exports** | ExcelJS (`.xlsx`), RFC-4180 CSV import/export, `pdf-lib` pedigree charts & GST invoices, `qrcode` ear-tag labels |
| **Testing & CI/CD** | Vitest (unit + live migration & tenant-isolation integration tests), Playwright E2E (`1280px` & `375px`), ESLint, GitHub Actions CI, Multi-stage Docker |

---

## Documentation Index

| Document | Purpose |
| --- | --- |
| **[run_instruction.md](run_instruction.md)** | Full step-by-step build, local dev, Docker, testing, and execution guide |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Production deployment runbook (PostgreSQL 16 + RLS, Docker/Cloud Run, webhooks, backups, security checklist) |
| **[docs/API.md](docs/API.md)** | HTTP/Webhook API specs (`/api/iot/ingest`, `/api/cron/daily`, `/api/webhooks/whatsapp`, `/api/webhooks/razorpay`, `/api/offline-sync`, `/api/ai`) & 7-role RBAC matrix |
| **[docs/PRD.md](docs/PRD.md)** | Product domain requirements & design reference |
| **[.env.example](.env.example)** | Complete documented environment variable template |

---

## Core Modules & Capabilities

### Multi-Tenant SaaS & Platform Administration
- **Product Landing & Self-Serve Onboarding:** Marketing home page (`/`), self-serve farm signup (`/signup`) that auto-provisions 31 Indian breeds, starter sheds, and default vaccination schedules, plus SHA-256 expiring password reset (`/forgot-password`, `/reset-password/[token]`).
- **Subscription Quotas & Billing:** Tiered limits (`starter`, `pro`, `enterprise`) enforced on animals, team seats, and monthly AI usage; Razorpay Subscriptions checkout + HMAC webhook lifecycle (`activated`, `charged`, `halted`, `cancelled`) with billing-approval fallback.
- **Platform Super-Admin Console (`/admin`):** Cross-tenant dashboard showing all farms, active herd/member/AI usage, subscription status, and quota overrides.
- **Security & Multi-Replica Scale:** Atomic PostgreSQL rate limiting (`rate_limit_bucket`), PostgreSQL RLS script (`db/rls.sql`), full audit trail (`/audit`), and hardened HTTP security headers.

### Herd, Genetics & Breeding
- **Cattle Register (`/animals`):** SQL-filtered & paginated register (code, name, ear tag, RFID, breed, sex, shed, lactation), dam-line family tree, lifetime animal timeline, and photo/document uploads.
- **Bulk Operations & QR Labels:** Bulk vaccinate/deworm, bulk shed transfers, dry-run validated CSV import wizard for cattle & milk (`/animals/bulk`), and bulk A4/thermal printable QR ear-tag sheets (`/animals/labels`).
- **Breeding & Embryos (`/breeding`, `/embryos`):** Heat observation, AI service with automatic straw consumption, pregnancy diagnosis (PD), expected calving calculation from breed gestation days, calving with automatic calf registration, dry-off scheduling, and embryo OPU/transfer tracking.
- **Semen & Pedigree Genetics (`/semen`, `/genetics`, `/insights`):** Bull directory, LN2 tank → canister → goblet inventory map, straw move/transfer/discard audit, 8-generation interactive zoomable pedigree tree + PDF export, inbreeding relationship warnings, 305-day lactation projections, and per-cow net profitability ranking.

### Milk, Veterinary Health & Nutrition
- **Milk Production & Quality (`/milk`):** Fast keyboard-navigable milk sheet with shed filter, yesterday hints, optional Fat % / SNF % / CMT mastitis screening, automatic milk drop & CMT alerts, milk withdrawal enforcement, and effective-dated procurement pricing with Fat/SNF bonuses.
- **Veterinary Health & Pharmacy (`/health`):** Clinical treatments with quarter tracking, milk withdrawal locks, prescription attachments, configurable Indian vaccination protocols (FMD, HS, BQ, Brucellosis, Theileriosis, Deworming), and pharmacy stock balances with low-stock & 30-day expiry alerts.
- **Feed & Nutrition (`/feed`):** Feed stock ledger, TMR daily ration groups by herd stage, one-click daily ration consumption posting, and 30-day feed cost per litre KPI.

### Mobility, Storefront, AI & Integrations
- **Offline-First PWA & Regional Indian i18n:** Installable Web App Manifest + Service Worker + offline shed queue (`/api/offline-sync`), plus **English, हिन्दी (Hindi), ગુજરાતી (Gujarati), and मराठी (Marathi)** localization across navigation and core daily worker screens (`/dashboard`, `/milk`, `/animals`, `/scan`).
- **Public Farm Catalogue & Shop (`/farms/[slug]`, `/farms/[slug]/shop`):** Published-only cattle listings & media proxy, WhatsApp buyer enquiry buttons, honeypot-protected enquiry forms, shopping cart, Razorpay checkout with concurrent oversell alerting, order tracking, and downloadable GST PDF tax invoices.
- **Multimodal Gemini AI Assistant (`/ai`):** Postgres-synced cross-device chat history, Web Speech voice input, prescription/bill photo analysis, and human-in-the-loop confirmation cards before every database write.
- **Automation, WhatsApp & IoT APIs:** Daily cron automation (`/api/cron/daily`) for VWP `fresh → open` transitions, protocol reminders, pharmacy alerts, and morning email digests; WhatsApp staff command webhook (`/api/webhooks/whatsapp`); and API-key-authenticated hardware ingest (`/api/iot/ingest`) for milking parlours, scales, and UHF RFID readers.

---

## Quick Start

For complete build, Docker, PostgreSQL 16, testing, and troubleshooting steps, see **[run_instruction.md](run_instruction.md)**.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:setup
pnpm dev
```

Open **[http://localhost:3007](http://localhost:3007)** (landing page & sign-in) or **[http://localhost:3007/farms/shree-gir](http://localhost:3007/farms/shree-gir)** (public demo catalogue).

### Sample Farm Credentials (`Shree Gir Dairy`)

Password for all demo accounts: `demo-farm-2026`

| Name | Email | Roles |
| --- | --- | --- |
| Asha Rao | `asha@shreegir.test` | Owner, Admin, Platform Super-Admin (`/admin`) |
| Imran Qureshi | `imran@shreegir.test` | Manager |
| Dr. N. Patil | `patil@shreegir.test` | Vet |
| S. Jadhav | `jadhav@shreegir.test` | AI Technician |
| Lata More | `lata@shreegir.test` | Worker |
| K. Shah | `shah@shreegir.test` | Accountant |
| R. Deshmukh | `deshmukh@shreegir.test` | Genetics |

---

## Project Structure

```text
app/
  (farm)/           Authenticated multi-tenant farm workspace (dashboard, animals, milk, breeding,
                    health, feed, semen, genetics, insights, embryos, finance, reports, alerts,
                    shop, listings, enquiries, locations, scan, settings, team, audit, profile, admin, ai)
  farms/[slug]/     Public farm catalogue, animal pages, shop, cart, orders, GST PDF invoices & media proxy
  api/              REST & webhook routes (health, ai, herd-search, cron/daily, iot/ingest,
                    offline-sync, webhooks/razorpay, webhooks/whatsapp, auth)
  signup/           Self-serve farm onboarding wizard
  forgot-password/  & reset-password/[token]/  SHA-256 token password recovery
components/         Shared UI primitives, milk sheet, CSV import wizard, AI chat, offline banner, nav
db/
  schema/           Drizzle PostgreSQL schema (auth, farm, animal, records, saas)
  migrations/       SQL migrations 0000–0007
  seed/             31 Indian breeds + Shree Gir Dairy sample farm & pro module seeds
  rls.sql           PostgreSQL 16 Row-Level Security tenant isolation policies
lib/                Domain rules, RBAC permissions, pricing, lactation, pedigree, subscriptions, i18n, AI, tests
e2e/                Playwright desktop & 375px mobile E2E smoke suite
scripts/            Automated PostgreSQL backup script (backup-db.sh)
docs/               API & RBAC reference (API.md) and PRD (PRD.md)
```

---

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start Next.js dev server on port `3007` |
| `pnpm build` | Compile standalone production build (`next build`) |
| `pnpm start` | Start production Next.js server |
| `pnpm db:setup` | Run migrations `0000`–`0007` and seed Shree Gir Dairy |
| `pnpm db:migrate` | Apply Drizzle migrations to PostgreSQL |
| `pnpm db:seed` | Seed sample farm (`Shree Gir Dairy`) |
| `pnpm db:up` | Start PostgreSQL 16 container (`docker-compose.yml`) |
| `pnpm test` | Run Vitest unit + live migration/isolation integration tests (88 tests) |
| `pnpm lint` | Run ESLint across entire project |
| `npx playwright test` | Run Playwright E2E smoke tests against running app |
