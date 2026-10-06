# Setup

## Prerequisites

- Node.js 20+ (built and tested on Node 22)
- PostgreSQL 16 (via Docker Compose, or a local install)
- A Chromium-based browser (Chrome 116+) to load the extension
- A Google Cloud project (for Google Sign-In) and a Stripe account (for Premium) — only needed for those two features; everything else works without them

## 1. Postgres

```bash
docker compose up -d        # starts postgres:16 on localhost:5432
```

Or point `DATABASE_URL` at any Postgres 16 instance you already have. Create the `pgcrypto` and `pg_trgm` extensions are created automatically by the first migration — no manual setup needed beyond the empty database existing.

## 2. Backend

```bash
cd backend
cp .env.example .env        # then fill in the values below
npm install
npm run migrate:up          # creates users, sponsors, app_config, daily_usage, subscriptions
npm run seed:config         # seeds app_config.free_daily_quota (default 20)
npm run refresh:sponsors -- --source <url-or-local-csv-path>   # see "Sponsor data" below
npm run dev                 # starts the API on :3000
```

Run the test suite (unit tests are pure functions; integration tests need a real Postgres — point `TEST_DATABASE_URL` at a second database, e.g. `visa_checker_test`, and run the same migration against it):

```bash
npm test
```

### Env vars (`backend/.env`)

| Var | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | everything | `postgres://user:pass@host:5432/dbname` |
| `JWT_SECRET` | everything | long random string; signs the backend's own session tokens |
| `JWT_EXPIRY` | — | default `7d` |
| `GOOGLE_OAUTH_CLIENT_ID` | Google sign-in | see step 3 below — must match `extension/manifest.json`'s `oauth2.client_id` |
| `ADMIN_API_KEY` | admin config endpoint | long random string; sent as `X-Admin-Key` header |
| `STRIPE_SECRET_KEY` | Premium checkout | from the Stripe dashboard (test or live) |
| `STRIPE_WEBHOOK_SECRET` | Premium status updates | from the Stripe CLI (`stripe listen`) in dev, or the webhook endpoint's signing secret in production |
| `STRIPE_PRICE_ID` | Premium checkout | the recurring Price you create for the premium subscription |
| `SPONSOR_REGISTER_CSV_URL` | scheduled sponsor refresh | the real gov.uk publication URL — its direct CSV download link changes on every gov.uk refresh, so this needs to stay current (see `docs/DATA_SOURCES.md`) |
| `FREE_DAILY_QUOTA_DEFAULT` | first-run seed only | the *live* quota value lives in the `app_config` table after that, not this env var |
| `CORS_ALLOWED_ORIGINS` | production | comma-separated `chrome-extension://<id>` origins; leave empty in dev to allow any origin |
| `PORT`, `NODE_ENV`, `LOG_LEVEL` | — | standard |

### Sponsor data

`scripts/refresh-sponsors.ts` fully replaces the `sponsors` table on every run (the register has no stable per-row key across releases) and rebuilds the backend's in-memory fuzzy-match index:

```bash
npm run refresh:sponsors -- --source https://assets.publishing.service.gov.uk/.../Worker_and_Temporary_Worker.csv
# or, offline/for testing:
npm run refresh:sponsors -- --source ./src/data/sponsors.sample.csv
```

Schedule this (cron, a scheduled cloud job, etc.) to match gov.uk's publish cadence. The running backend also polls and rebuilds its in-memory index every 30 minutes on its own, so a refresh run doesn't require a redeploy — just a wait of up to 30 minutes, or a restart for immediate effect.

### Admin: adjusting the free daily quota

No admin UI in v1 — use the protected endpoint directly:

```bash
curl -X PUT http://localhost:3000/api/admin/config/free_daily_quota \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"value": "30"}'
```

## 3. Google OAuth (Sign-In)

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a project, then **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Chrome Extension**.
3. You need your extension's ID *before* this step, and the extension's ID is normally only stable once published or once you've pinned a `key` in `manifest.json`. For local development: load the unpacked extension once (step 5) to get its temporary ID, generate a persistent key pair, and add `"key": "<base64-public-key>"` to `manifest.json` so the ID stays stable across rebuilds — otherwise `chrome.identity.getAuthToken` will keep breaking as the ID changes. (Chrome's docs cover generating this key from the Extensions page's "Pack extension" flow, or via `openssl`.)
4. Add the resulting Client ID to **both**:
   - `backend/.env` → `GOOGLE_OAUTH_CLIENT_ID`
   - `extension/manifest.json` → `oauth2.client_id`
5. Scopes used: `userinfo.email`, `userinfo.profile` — already set in `manifest.json`, no extra configuration needed in Cloud Console beyond enabling the OAuth consent screen for your project.

This step can't be exercised inside this build's own sandbox (no network egress to `accounts.google.com`) — the auth flow and JWT issuance are covered by backend tests with an injected/mocked Google verifier instead; a real sign-in needs real credentials per the above.

## 4. Stripe (Premium)

1. Create a recurring **Price** (e.g. "Premium — unlimited searches", monthly) in the Stripe dashboard → copy its ID into `STRIPE_PRICE_ID`.
2. Copy your **Secret key** into `STRIPE_SECRET_KEY`.
3. For local webhook testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook` — copy the printed signing secret into `STRIPE_WEBHOOK_SECRET`. In production, create the webhook endpoint in the Stripe dashboard pointed at `https://<your-api>/api/stripe/webhook` and use its signing secret instead.
4. Events the webhook handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Like Google OAuth, this can't be exercised live from this sandbox — the webhook handler is covered by a test that signs a payload locally with `stripe.webhooks.generateTestHeaderString` (pure signature math, no network call), which fully exercises the handler logic.

## 5. Extension

```bash
cd extension
npm install
echo "VITE_API_BASE_URL=http://localhost:3000" > .env   # or your deployed API URL
npm run build
```

Load it in Chrome: **chrome://extensions → Developer mode → Load unpacked → select `extension/dist`**.

Click the extension's toolbar icon to open the side panel (it opens directly, there's no popup — see `docs/ARCHITECTURE.md` for why).

## 6. Running the real end-to-end check

`e2e/run-e2e.mjs` boots the real backend, loads the real built extension into real headless Chromium, and drives the full "Select from Page" + sponsorship-check flow against real data. It bypasses only the parts this sandbox genuinely cannot reach (live Google consent screen, live Stripe Checkout) by injecting a real backend-issued JWT directly, exactly as described in the script's own header comment.

```bash
cd extension && npm run build   # if you haven't already
cd ../e2e && npm install && npm test
```
