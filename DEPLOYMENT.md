# Production Deployment Guide

This guide covers deploying **Milkometer** to production with PostgreSQL 16, Docker / Cloud Run / VPS, Cloudflare R2, Razorpay, ZeptoMail, and automated daily cron & backups.

## 1. Environment Variables

Copy `.env.example` to `.env` and set production values:

- **Required**
  - `DATABASE_URL`: PostgreSQL 16 connection string (`postgres://user:pass@host:5432/cattle?sslmode=require`)
  - `AUTH_SECRET`: 32+ random bytes (`openssl rand -base64 32`)
  - `AUTH_URL`: Exact public HTTPS origin (`https://app.yourdomain.com`)
- **Recommended Production Integrations**
  - **Storage (Cloudflare R2):** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_PRIVATE`
  - **Email (ZeptoMail):** `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_FROM`, `PLATFORM_BILLING_EMAIL`
  - **Payments & SaaS Subscriptions (Razorpay):** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_STARTER`, `RAZORPAY_PLAN_PRO`, `RAZORPAY_PLAN_ENTERPRISE`
  - **Daily Automation:** `CRON_SECRET` (`openssl rand -hex 32`)
  - **AI Assistant:** `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-flash-latest`
  - **WhatsApp Cloud API:** `WHATSAPP_TOKEN`, `WHATSAPP_API_URL`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`

## 2. Database Migration & Row-Level Security (PostgreSQL 16)

1. Apply migrations `0000` through `0007`:
   ```bash
   DATABASE_URL="postgres://..." pnpm exec tsx db/setup.ts
   ```
2. Optional — enable PostgreSQL Row-Level Security (defense-in-depth multi-tenant isolation):
   ```bash
   psql "$DATABASE_URL" -f db/rls.sql
   ```
   *(Ensure the application connects with a non-superuser role when enforcing RLS, and sets `app.current_farm_id` via session config where used.)*
3. Seed sample demo farm (optional, staging/demo environments only):
   ```bash
   DATABASE_URL="postgres://..." pnpm exec tsx db/seed/index.ts
   ```

## 3. Deploy with Docker Compose (Single VPS / Dedicated Server)

```bash
docker compose --profile app up -d --build
```

Verify health:
```bash
curl -fsS http://localhost:3007/api/health
# {"ok":true,"db":"ok","latencyMs":...}
```

## 4. Deploy to Google Cloud Run / Container Platforms

The repository includes a multi-stage non-root [Dockerfile](Dockerfile) configured with `output: "standalone"` and built-in `/api/health` checks:

```bash
docker build -t gcr.io/<PROJECT_ID>/cattle-mgmt-saas:latest .
docker push gcr.io/<PROJECT_ID>/cattle-mgmt-saas:latest
```

Deploy pointing to your managed Cloud SQL / Neon / Supabase PostgreSQL 16 instance, with `PORT=3000`, `AUTH_URL=https://...`, and secrets stored in your cloud secret manager.

## 5. Webhooks & Scheduled Cron Jobs

1. **Daily Automation Cron (06:00 IST):**
   Configure Cloud Scheduler, GitHub Actions, or system crontab:
   ```bash
   0 6 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "https://app.yourdomain.com/api/cron/daily"
   ```
2. **Razorpay Webhook:**
   Point Razorpay Dashboard → Webhooks to `https://app.yourdomain.com/api/webhooks/razorpay` with secret `RAZORPAY_WEBHOOK_SECRET` and subscribe to:
   - `payment.captured`, `order.paid` (shop orders)
   - `subscription.activated`, `subscription.charged`, `subscription.halted`, `subscription.pending`, `subscription.cancelled` (SaaS farm tiers)
3. **WhatsApp Cloud API Webhook:**
   Configure Meta Developer Dashboard webhook URL `https://app.yourdomain.com/api/webhooks/whatsapp` with verify token `WHATSAPP_VERIFY_TOKEN`.

## 6. Automated Database Backups

Schedule `scripts/backup-db.sh` daily via cron or systemd timer:

```bash
0 2 * * * DATABASE_URL="postgres://..." BACKUP_DIR=/var/backups/dairy RETENTION_DAYS=30 /app/scripts/backup-db.sh
```

## 7. Pre-Launch Security Checklist

- [ ] `AUTH_SECRET` rotated to a fresh 32-byte random value
- [ ] HTTPS enforced (HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` are preconfigured in `next.config.ts`)
- [ ] `NODE_ENV=production` verified (hides dev credential hint on `/signin` and dev reset link preview)
- [ ] Default demo password changed or demo farm removed in production
- [ ] `CRON_SECRET` and `RAZORPAY_WEBHOOK_SECRET` set
- [ ] Daily backup script tested with a restore drill
