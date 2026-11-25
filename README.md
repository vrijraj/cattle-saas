# Milkometer — Dairy & Breeding SaaS Platform

Multi-tenant farm operating system for commercial dairy farms, indigenous cattle & buffalo breeders (Gir, Sahiwal, Murrah, Kankrej, HF/Jersey), and gaushalas.

Built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Auth.js v5**, **Drizzle ORM + PostgreSQL 16 (with PGlite for zero-config local dev)**, **Tailwind CSS v4**, **Google ADK (Gemini)**, **Razorpay**, **Cloudflare R2**, and **PDF/Excel reporting**.

## Highlights

- **Multi-Tenant SaaS Ready:** Self-serve farm onboarding (`/signup`), password recovery (`/forgot-password`), subscription plan quotas (`starter`, `pro`, `enterprise`), Razorpay Subscriptions checkout & webhooks, PostgreSQL Row-Level Security (`db/rls.sql`), distributed PostgreSQL rate limiting, and Platform Super-Admin console (`/admin`).
- **Complete Herd & Genetics:** Lifetime animal register with SQL pagination/search, 31 preloaded Indian breeds, 8-generation interactive pedigree tree, inbreeding detection, LN2 semen tank/canister/goblet map, bull directory, and embryo/OPU transfer tracking.
- **Milk Production & Quality:** Interactive mobile-friendly milk sheet with shed filter, yesterday hints, Fat % / SNF % / CMT mastitis screening, effective-dated milk procurement rates with Fat/SNF bonuses, 305-day lactation projections, per-cow profitability margin, and milk withdrawal enforcement.
- **Veterinary Health, Pharmacy & Nutrition:** Clinical treatment records with prescription uploads, preloaded Indian vaccination schedules (FMD, HS, BQ, Brucellosis, Theileriosis, Deworming), veterinary pharmacy stock with low-stock & expiry alerts, TMR ration groups, one-click daily feeding, and 30-day feed cost per litre.
- **Field & Shed Mobility:** Bulk vaccinate/deworm, bulk shed transfers, CSV import wizard (cattle & milk with dry-run validation), A4 & thermal printable QR ear-tag sheets (`/animals/labels`), offline-first PWA with queued shed entry sync (`/api/offline-sync`), and **English, हिन्दी (Hindi), ગુજરાતી (Gujarati), and मराठी (Marathi)** localization.
- **Storefront, Automation & Integrations:** Public cattle catalogue & dairy shop (`/farms/[slug]`), WhatsApp enquiry buttons, Razorpay checkout with oversell protection, downloadable GST PDF invoices, multimodal Gemini AI assistant (Postgres-synced chat + voice + prescription/bill vision), daily automation cron (`/api/cron/daily`), WhatsApp staff command webhook (`/api/webhooks/whatsapp`), and hardware IoT ingest API (`/api/iot/ingest`).

## Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Production deployment (Docker, PostgreSQL 16 + RLS, Cloud Run, backups, webhooks, security checklist)
- **[docs/API.md](docs/API.md)** — REST/Webhook API reference and 7-role RBAC permission matrix
- **[docs/PRD.md](docs/PRD.md)** — Product specification

## Quick Start (Local Development)

Requirements: **Node.js 20+** and **pnpm 10+**.

```bash
pnpm install
cp .env.example .env
pnpm db:setup
pnpm dev
```

Open [http://localhost:3007](http://localhost:3007). The app runs on port **3007** with embedded PGlite (`.data/pglite`) — no external database needed for local testing.

### Demo Accounts (`Shree Gir Dairy`)

Password for all demo users: `demo-farm-2026`

| Name | Email | Roles | Notes |
| --- | --- | --- | --- |
| Asha Rao | `asha@shreegir.test` | Owner, Admin | Also Platform Super-Admin (`/admin`) |
| Imran Qureshi | `imran@shreegir.test` | Manager | Day-to-day farm operations |
| Dr. N. Patil | `patil@shreegir.test` | Vet | Clinical treatments, pharmacy, protocols |
| S. Jadhav | `jadhav@shreegir.test` | AI Technician | Breeding, inseminations, semen |
| Lata More | `lata@shreegir.test` | Worker | Milk sheet, heats, weights, QR scan |
| K. Shah | `shah@shreegir.test` | Accountant | Finance ledger, reports |
| R. Deshmukh | `deshmukh@shreegir.test` | Genetics | Pedigree, bulls, embryos, listings |

Public demo catalogue: [http://localhost:3007/farms/shree-gir](http://localhost:3007/farms/shree-gir)

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run Next.js dev server on port 3007 |
| `pnpm build` | Build standalone production bundle |
| `pnpm start` | Start production server |
| `pnpm db:setup` | Apply migrations `0000`–`0007` and seed sample farm |
| `pnpm db:up` | Start PostgreSQL 16 container (`docker-compose.yml`) |
| `pnpm test` | Run Vitest unit + live migration/isolation integration suite |
| `pnpm lint` | Run ESLint across entire codebase |
| `npx playwright test` | Run desktop + 375px mobile E2E smoke tests (`e2e/smoke.spec.ts`) |
