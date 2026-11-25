# API, Webhooks & RBAC Reference

## HTTP Endpoints

### 1. Health Check
`GET /api/health`
- **Auth:** Public (read-only liveness/readiness probe)
- **Response (`200 OK`):**
  ```json
  { "ok": true, "db": "ok", "latencyMs": 3, "timestamp": "2026-11-25T03:00:00.000Z" }
  ```

### 2. Daily Automation Cron
`POST /api/cron/daily` (also supports `GET`)
- **Auth:** `Authorization: Bearer <CRON_SECRET>` (or `?secret=<CRON_SECRET>`)
- **Query Params:** `?digest=0` to skip outbound morning digest emails
- **Behavior:** Idempotently runs across all active tenant farms:
  - Auto-transitions `fresh` females to `open` once `voluntaryWaitingDays` has elapsed since calving
  - Creates missing DOB-scheduled vaccination & deworming protocol alerts
  - Raises low-stock and 30-day pharmacy expiry alerts
  - Syncs milk drop alerts and logs execution in `cron_run`

### 3. IoT Hardware Ingest (Milking Parlours, Digital Scales, UHF RFID)
`POST /api/iot/ingest`
- **Auth:**
  - `X-Farm-Slug: <farm-slug>`
  - `X-API-Key: <raw-api-key>` (generated once in **Farm Settings → IoT hardware**, verified via timing-safe SHA-256 hash)
- **Rate Limit:** 120 requests/minute per farm (distributed PostgreSQL bucket)
- **Request Body:**
  ```json
  {
    "milk": [
      { "rfid": "900118001234", "recordedOn": "2026-11-25", "morningLitres": 8.4, "fatPercent": 4.9, "snfPercent": 8.7, "scc": 140000 }
    ],
    "weights": [
      { "code": "SGD-GIR-0001", "weighedOn": "2026-11-25", "kilograms": 412.5, "note": "Walk-over scale" }
    ],
    "rfidScans": [
      { "rfid": "900118001234", "reader": "Parlour-Gate-1" }
    ]
  }
  ```

### 4. WhatsApp Staff Command Webhook
- `GET /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` — Meta Cloud API webhook verification
- `POST /api/webhooks/whatsapp` — Accepts Meta Cloud API payloads or simplified `{ "from": "+91...", "body": "Jamuna 7.5L morning" }`
- **Auth:** Optional `X-Webhook-Secret` header (`WHATSAPP_WEBHOOK_SECRET`), plus sender phone lookup against active `users.phone` in `farm_member` with full RBAC enforcement.
- **Built-in fast commands:** `"summary"`, `"alerts"`, `"<AnimalName|Code> <litres>L morning|evening"`, plus Gemini natural-language fallback when `GEMINI_API_KEY` is configured.

### 5. Razorpay Orders & Subscriptions Webhook
`POST /api/webhooks/razorpay`
- **Auth:** `X-Razorpay-Signature` HMAC-SHA256 verified against `RAZORPAY_WEBHOOK_SECRET`
- **Handled Events:**
  - `payment.captured`, `order.paid` → marks shop order paid, deducts stock transactionally, raises oversell alert if stock depleted concurrently
  - `subscription.activated`, `subscription.charged`, `subscription.authenticated` → upgrades farm plan & quotas (`starter` / `pro` / `enterprise`), sets status `active`
  - `subscription.halted`, `subscription.pending` → marks `past_due`, opens finance alert
  - `subscription.cancelled`, `subscription.completed` → reverts quotas to `starter`

### 6. Offline Shed Sync
`POST /api/offline-sync`
- **Auth:** Active Auth.js farm session
- **Body:** `{ "items": [ { "id": "...", "kind": "milk" | "weight" | "heat", ... } ] }`
- **Behavior:** Enforces per-record RBAC (`canWriteMilk`, `canRecordWeight`, `canRecordHeat`), writes records transactionally with audit entries, returns `{ ok, syncedIds, errors }`.

### 7. AI Assistant
- `GET /api/ai` — Loads user's latest Postgres-backed conversation for the active farm
- `PUT /api/ai` — Persists UI chat transcript to `ai_session`
- `POST /api/ai` — Streams SSE events (`session`, `tool`, `confirm`, `delta`, `replace`, `error`, `done`), supports optional multimodal `{ image: { mimeType, base64 } }` up to 4 MB, rate-limited (20/min) + monthly farm quota enforced.

### 8. Order GST PDF Invoice & Published Media
- `GET /farms/[slug]/orders/[id]/invoice?t=<hmac-token>` — Returns downloadable A4 GST tax invoice PDF (`application/pdf`)
- `GET /farms/[slug]/media/[kind]/[id]` — Public proxy (`kind`: `animal` | `product`) serving images **only** while the listing/product is published (`published = "yes"`).

---

## Role-Based Access Control (RBAC) Matrix

| Module / Capability | Owner | Admin | Manager | Vet | AI Tech | Worker | Accountant | Genetics |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Dashboard, Cattle View, QR Scan | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Add / Edit Cattle, Bulk Shed Move | ✓ | ✓ | ✓ | — | — | — | — | ✓ |
| Milk Sheet & Quality Entry | ✓ | ✓ | ✓ | — | — | ✓ | — | — |
| Heat, Insemination, PD, Calving | ✓ | ✓ | ✓ | ✓ (PD/Calv) | ✓ | ✓ (Heat) | — | ✓ |
| Clinical Health, Pharmacy & Protocols | ✓ | ✓ | ✓ | ✓ | — | —* | — | — |
| Feed & Daily Rations | ✓ | ✓ | ✓ | — | — | ✓ | — | — |
| Bulls, Semen Tanks & Pedigree/Embryos | ✓ | ✓ | ✓ | — | ✓ (View/AI) | — | — | ✓ |
| Finance Ledger & Reports | ✓ | ✓ | ✓ | — | — | — | ✓ | — |
| Public Listings, Shop & Enquiries | ✓ | ✓ | ✓ | — | — | — | — | ✓ |
| Farm Settings, Team & Audit Log | ✓ | ✓ | — | — | — | — | — | — |
| Platform Super-Admin (`/admin`) | Only users with `users.is_super_admin = true` |

*\*Workers granted the per-member `canRecordVaccines` flag can also record vaccinations and dewormings.*
