# Build & Execution Instructions (`run_instruction.md`)

Complete step-by-step guide to install, configure, migrate, build, test, and run **Milkometer (Cattle Management SaaS)** locally, in production (Node.js), and with Docker + PostgreSQL 16.

---

## 1. System Prerequisites

| Tool | Required Version | Check Command |
| --- | --- | --- |
| **Node.js** | `20.x` or `22.x` (LTS recommended) | `node -v` |
| **pnpm** | `10.x` | `pnpm -v` |
| **Docker & Docker Compose** *(optional)* | Latest (for PostgreSQL 16 / containerized run) | `docker compose version` |
| **Git** | Any recent version | `git --version` |

> **macOS note:** If `pnpm` fails via Corepack/nvm shim, install Homebrew pnpm (`brew install pnpm`) and ensure `/opt/homebrew/bin` is ahead of nvm in `PATH`.

---

## 2. Clone & Install Dependencies

```bash
git clone <your-repo-url> cattle-mgmt-saas
cd cattle-mgmt-saas
pnpm install --frozen-lockfile
```

---

## 3. Environment Configuration

Copy the environment template and generate a secure `AUTH_SECRET`:

```bash
cp .env.example .env
```

Minimum required variables in `.env` for local development:

```env
DATABASE_URL=pglite:.data/pglite
AUTH_SECRET=replace-with-32-byte-random-string
AUTH_URL=http://localhost:3007
```

Generate a cryptographically secure secret:

```bash
openssl rand -base64 32
```

For production integrations (Cloudflare R2, ZeptoMail, Razorpay Orders & Subscriptions, Google Gemini AI, Daily Cron, WhatsApp/SMS), fill in the corresponding variables documented in [`.env.example`](.env.example) and [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## 4. Database Setup (Two Options)

### Option A — Local Development (Embedded PGlite, Zero Docker Needed)

With `DATABASE_URL=pglite:.data/pglite` in `.env`:

```bash
pnpm db:setup
```

This runs:
1. `tsx db/setup.ts` — applies all SQL migrations (`0000` through `0007`) into `.data/pglite`
2. `tsx db/seed/index.ts` — seeds the demo farm **Shree Gir Dairy** (`shree-gir`), 31 Indian breeds, sheds, sample cattle, milk logs, Indian vaccination protocols, pharmacy items, and TMR ration groups

Verify database state:

```bash
pnpm exec tsx db/verify.ts
```

> **Important (PGlite):** Stop any running dev server before re-running `pnpm db:setup` on PGlite, since embedded PGlite uses single-process directory locking.

### Option B — PostgreSQL 16 Server (Recommended for Staging / Production)

1. Start PostgreSQL 16 via Docker Compose (or point `DATABASE_URL` to Cloud SQL / Neon / RDS / Supabase):
   ```bash
   pnpm db:up
   ```
2. Update `.env`:
   ```env
   DATABASE_URL=postgres://cattle:cattle@localhost:5432/cattle
   ```
3. Apply migrations and (optionally) seed demo data:
   ```bash
   pnpm exec tsx db/setup.ts
   # Optional demo seed (skip for clean production):
   pnpm db:seed
   ```
4. Optional — enable PostgreSQL Row-Level Security policies for defense-in-depth tenant isolation:
   ```bash
   psql "$DATABASE_URL" -f db/rls.sql
   ```

---

## 5. Run in Development Mode

```bash
pnpm dev
```

- **App URL:** [http://localhost:3007](http://localhost:3007)
- **Public Demo Catalogue:** [http://localhost:3007/farms/shree-gir](http://localhost:3007/farms/shree-gir)
- **Public Demo Shop:** [http://localhost:3007/farms/shree-gir/shop](http://localhost:3007/farms/shree-gir/shop)
- **Health Endpoint:** [http://localhost:3007/api/health](http://localhost:3007/api/health)
- **Self-Serve Farm Signup:** [http://localhost:3007/signup](http://localhost:3007/signup)

### Demo Sign-In Credentials

Password for all demo users: `demo-farm-2026`

| Email | Role(s) |
| --- | --- |
| `asha@shreegir.test` | Owner, Admin, Platform Super-Admin (`/admin`) |
| `imran@shreegir.test` | Manager |
| `patil@shreegir.test` | Vet |
| `jadhav@shreegir.test` | AI Technician |
| `lata@shreegir.test` | Worker |
| `shah@shreegir.test` | Accountant |
| `deshmukh@shreegir.test` | Genetics |

---

## 6. Build & Execute in Production Mode

### Method 1 — Standard Node.js Build & Run

1. Build the optimized production bundle (`output: "standalone"`):
   ```bash
   pnpm build
   ```
2. Start the production server on port `3007` (matching `AUTH_URL`):
   ```bash
   PORT=3007 pnpm start -- -p 3007
   ```
   Or execute the standalone Node server directly (after copying `.next/static` and `public` if deploying standalone outside the repo):
   ```bash
   PORT=3007 HOSTNAME=0.0.0.0 node .next/standalone/server.js
   ```

### Method 2 — Full Docker Compose Production Stack (PostgreSQL 16 + App)

1. Ensure `.env` has a strong `AUTH_SECRET` and your production `AUTH_URL`.
2. Build and start both PostgreSQL 16 and the Next.js container:
   ```bash
   docker compose --profile app up -d --build
   ```
3. Apply database migrations against the running Postgres container:
   ```bash
   DATABASE_URL="postgres://cattle:cattle@localhost:5432/cattle" pnpm exec tsx db/setup.ts
   ```
4. Verify live health:
   ```bash
   curl -fsS http://localhost:3007/api/health
   ```
5. View logs or stop the stack:
   ```bash
   docker compose --profile app logs -f app
   docker compose --profile app down
   ```

### Method 3 — Standalone Docker Image Build (Cloud Run / Kubernetes / ECS)

```bash
docker build -t cattle-mgmt-saas:latest .
docker run --rm -p 3007:3000 --env-file .env cattle-mgmt-saas:latest
```

---

## 7. Verification, Testing & Code Quality

Run the complete verification suite before every release:

```bash
# 1. TypeScript strict type check (0 errors expected)
pnpm exec tsc --noEmit

# 2. Unit & live DB migration / multi-tenant isolation tests (27 files, 88 tests)
pnpm test

# 3. ESLint across the entire repository (0 warnings/errors expected)
pnpm lint

# 4. Production build check (all 54 App Router routes)
pnpm build
```

### End-to-End Browser Smoke Tests (Playwright)

With the app running locally on `http://localhost:3007` (and demo farm seeded):

```bash
npx playwright test
```

Tests run across desktop (`1280×800`) and mobile (`375×812`) viewports, validating `/api/health`, public storefront isolation, auth redirects, owner module journeys, overflow checks, and worker RBAC restrictions.

---

## 8. Operations & Maintenance Commands

- **Trigger daily farm automation manually via API:**
  ```bash
  curl -fsS -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    "http://localhost:3007/api/cron/daily"
  ```
- **Run automated PostgreSQL backup (`pg_dump` + gzip + retention):**
  ```bash
  DATABASE_URL="postgres://..." BACKUP_DIR=./backups RETENTION_DAYS=14 ./scripts/backup-db.sh
  ```
- **Reset local PGlite database cleanly:**
  ```bash
  rm -rf .data/pglite
  pnpm db:setup
  ```

---

## 9. Troubleshooting

| Symptom | Cause & Fix |
| --- | --- |
| `AUTH_URL` redirect loop or cookie sign-in issue | Ensure `AUTH_URL` in `.env` matches the exact protocol, host, and port you open in the browser (e.g., `http://localhost:3007`). |
| PGlite lock / stale schema after running `db:setup` | Stop `pnpm dev` first, run `pnpm db:setup`, then restart `pnpm dev`. |
| Photo uploads show "storage not configured" in production | Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, and `R2_BUCKET_PRIVATE`. Local dev automatically uses `.data/storage`. |
| AI Assistant shows setup banner | Add `GEMINI_API_KEY` from Google AI Studio to `.env` and restart the server. |
| Razorpay checkout stays in "pending payment" / upgrade requests go to admin approval | Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `RAZORPAY_PLAN_*` IDs in `.env`. |
