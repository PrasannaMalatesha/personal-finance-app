# Codebase Reference

A complete map of the code: what every part is, where it lives, and how the
pieces wire together. This is the "navigate the code" companion to the other
docs — read alongside:

- [PRD.md](PRD.md) — product scope by phase (v1/v2/v3)
- [TRD.md](TRD.md) — technical requirements: data model, API contract, sequence diagrams, invariants
- [ENGINEERING-NOTES.md](ENGINEERING-NOTES.md) — the *why* behind decisions + the deploy war stories
- [README.md](README.md) — quickstart + deploy recipe

Scale: ~9.1k lines backend + ~8.5k lines frontend across ~150 source files.

---

## 1. System topology

Three independently-deployed tiers, one repo (monorepo, no workspace tooling):

```
Browser
   │  HTTPS (JSON + httpOnly cookies, credentials: include)
   ▼
Vercel ── React SPA (Vite build, static + CDN)          root dir: frontend/
   │  XHR to VITE_API_BASE_URL, cross-site
   ▼
Render ── Express API (Node 20, us-east-1)              root dir: backend/
   │  pg (parameterized SQL, SSL)
   ▼
Neon ──── PostgreSQL 16 (us-east-1, pooled)
```

Cross-site auth works via `SameSite=None; Secure` cookies + CORS
`credentials:true` scoped to `FRONTEND_ORIGIN`. See ENGINEERING-NOTES §9.2/§9.4.

---

## 2. Repo layout

```
backend/            Node + Express + TypeScript API
frontend/           Vite + React 18 + MUI SPA
docker-compose.yml  Postgres 16 for local dev
render.yaml         Render blueprint (backend service + env manifest)
frontend/vercel.json  SPA rewrite + monorepo ignore step
*.md                PRD / TRD / README / ENGINEERING-NOTES / CODEBASE / CLAUDE
```

---

## 3. Backend

### 3.1 Layering + request pipeline

Strict one-way layering — each layer only knows the one below:

```
routes/ → controllers/ → services/ → repositories/ → Postgres
   │           │              │             │
 mount +    HTTP concerns  business logic  the ONLY place SQL lives
 middleware  + Zod parse   (pure-ish, DI)  (parameterized only)
```

The Express middleware pipeline, in order ([app.ts](backend/src/app.ts)):

1. `helmet` — explicit CSP (`default-src 'self'`), HSTS 180d, `no-referrer`, CORP same-site
2. `cors` — `origin: FRONTEND_ORIGIN`, `credentials: true`
3. `globalApiRateLimit` on `/api/v1` — blanket ceiling over per-endpoint limiters
4. `express.json({ limit: '1mb' })`
5. `cookieParser`
6. `requestLogger` — pino-http, PII-redacted
7. `csrfMiddleware`
8. Route handlers (mounted per feature; v2/v3 conditionally mounted by flag)
9. `errorHandler` — terminal; maps `AppError` subclasses → status + shape

`/` returns a friendly JSON banner; `/healthz` returns `{status, db, uptime}`
(the `db` field runs `SELECT 1`, so a green health check proves DB connectivity).

### 3.2 Dependency injection — [container.ts](backend/src/container.ts)

`buildContainer(pool, logger, config)` is a hand-rolled DI container: it
instantiates every repo, adapter, service, and controller once and wires them by
constructor injection. This is why the code is testable without mocking
frameworks — a test builds its own container with fakes.

Wiring order: repos → adapters (fx/plaid/crypto) → services → controllers →
middleware. Key wiring facts:

- **Signup seeds defaults transactionally:** `authService` takes an
  `onUserCreated(userId, client)` hook that seeds default categories *then* rules
  (rules resolve category IDs by name, so order matters), inside the signup tx.
- **Optional integrations are null-gated:** `plaidController` / `oauthController`
  are `null` unless their env creds are present; `app.ts` only mounts the routes
  when both the flag AND the controller exist → routes 404 cleanly when off.
- **Plaid safety gate:** if `PLAID_ENV` is development/production but no
  `PLAID_ENCRYPTION_KEY`, the container *throws* — refuses to store access tokens
  in plaintext (sandbox may run keyless for zero-config dev).
- **Email adapter is swapped in `pickEmailAdapter`:** Resend iff
  `RESEND_API_KEY` + `RESEND_FROM_EMAIL`, else the console adapter.
- `server.ts` builds the container from `env`; `scripts/seedDemo.ts` builds its
  own; tests build theirs — same factory, different config.

### 3.3 Directory-by-directory

| Dir | Responsibility |
|---|---|
| `config/` | `env.ts` — Zod-validated env schema; `loadEnv()` exits(1) on invalid config (fail fast at boot). Required: `DATABASE_URL`, both JWT secrets (≥32, must differ), `FRONTEND_ORIGIN`. |
| `db/` | `client.ts` — the `pg` Pool (honors `sslmode` from URL, sets `statement_timeout` per connection); `migrations/` — 18 SQL up/down migrations via node-pg-migrate. |
| `routes/` | One router factory per feature; maps URLs → controller methods, attaches `authMiddleware` / `idempotent` / rate-limiters. |
| `controllers/` | HTTP-only: Zod-parse the request, call a service, shape the response. Thin. |
| `services/` | All business logic. Take repos/other services as deps. Where transactions (`withTransaction`), rule evaluation, FX conversion, dedup, etc. live. |
| `repositories/` | The only place SQL lives. Every query parameterized (`$1/$2`). Return typed `*Row` interfaces. |
| `middleware/` | `auth` (JWT verify), `idempotency`, `rateLimit`, `csrf`, `errorHandler`, `requestLogger`, `upload` (multer CSV). |
| `lib/` | Framework-free helpers + adapters: `tokens`/`previewToken` (JWT), `crypto` (AES-256-GCM), `password` (bcrypt), `clock`, `tx` (withTransaction), `csv/*` (parser + 6 bank presets), `csvExport`, `rulePattern`, and the external adapters (`fxAdapter`, `plaidAdapter`, `googleOAuthAdapter`, `emailAdapter`). |
| `schemas/` | Zod schemas per feature — the request-validation source of truth, also exported for types. |
| `errors/` | `AppError.ts` — `NotFoundError`, `ValidationError`, `PayloadTooLargeError`, etc.; carry HTTP status + code. |
| `scripts/` | `seedDemo.ts` — idempotent demo seed (deletes + rebuilds `demo@finance.app`: 3 accounts, 360 tx, 6 budgets). |

### 3.4 Complete API surface

All under `/api/v1` unless noted. `✓` = requires `Idempotency-Key`. Auth = access
cookie required. v2/v3 rows mount only when their flag is on.

| Method | Path | Notes |
|---|---|---|
| GET | `/` , `/healthz` , `/api/v1/flags` | public: banner, health, flag states |
| POST | `/auth/signup` ✓, `/auth/login` | rate-limited; seeds defaults on signup |
| POST | `/auth/refresh`, `/auth/logout` | refresh-token rotation + revoke |
| GET/PATCH | `/auth/me` | profile (base currency) |
| POST | `/auth/change-password` | rotates password, revokes sessions |
| DELETE | `/auth/me`, `/auth/oauth/google/link` | delete account (email-confirm); unlink Google |
| GET/POST/PATCH/DELETE | `/accounts` (POST ✓) | account CRUD |
| GET/POST/PATCH/DELETE | `/categories` (POST ✓) | category CRUD (depth-2 hierarchy behind flag) |
| GET/POST/PATCH/DELETE | `/transactions` (POST ✓) | list (cursor + filters + `?q=`), CRUD |
| GET | `/transactions/export.csv` | streamed CSV, 10k-row cap |
| POST | `/imports/preview`, `/imports/commit` ✓ | CSV upload→preview→commit; `/imports/:id/undo` |
| GET/PUT/DELETE | `/budgets` | monthly caps per category |
| GET | `/dashboard/summary`, `/by-category`, `/trend`, `/net-worth`† | †flag-gated |
| GET/POST/PATCH/DELETE | `/rules` (POST ✓); `/rules/learned`† | auto-categorization rules; †rule-learning |
| GET/POST/DELETE | `/recurring`† , `/recurring/detect`, `/:id/dismiss` | †subscriptions |
| POST | `/auth/request-reset`, `/auth/reset-password`† | †password reset |
| POST/GET/DELETE | `/plaid/*`† | †link_token, exchange, items, sync, remove |
| GET | `/auth/oauth/google/start`, `/callback`† | †Google OAuth redirect flow |

### 3.5 Data model

14 tables (Postgres 16). Full DDL in TRD §4; the shape + cascade rules:

- **`users`** — email (citext, unique), password_hash (nullable for OAuth-only), `google_sub`, `base_currency` (10-currency whitelist).
- **`accounts`** → users (CASCADE). `opening_balance NUMERIC(14,2)`, per-account `currency`, optional `plaid_item_id`/`plaid_account_id`.
- **`categories`** → users (CASCADE). Self-ref `parent_category_id` (SET NULL) for depth-2 hierarchy. `UNIQUE(user_id, name)`.
- **`rules`** → users + categories (CASCADE). Substring/exact match, priority-ordered.
- **`transactions`** → accounts (CASCADE), category (SET NULL), import_batch (CASCADE), recurring_group (SET NULL). `amount NUMERIC(14,2)`, `date`, `description`, `plaid_transaction_id` (partial unique).
- **`budgets`** → users + categories (CASCADE). `UNIQUE(user_id, category_id, month)`, `CHECK(day=1)`, `amount_limit ≥ 0`.
- **`import_batches`** → accounts (CASCADE). `undone_at` for undo.
- **`recurring_groups`** → users (CASCADE), category (SET NULL). `UNIQUE(user_id, merchant_key)`.
- **`refresh_tokens`** → users (CASCADE). Hashed token, `revoked_at`, rotation.
- **`password_reset_tokens`** → users (CASCADE). Hashed token, `expires_at`, `used_at`.
- **`plaid_items`** → users (CASCADE). Encrypted access token (BYTEA), cursor.
- **`fx_rates`** — `PK(base, quote, rate_date)`, `rate NUMERIC(18,8)`.
- **`idempotency_keys`** — `PK(user_id, key)`, cached response.
- **`pgmigrations`** — node-pg-migrate tracking table.

Deletion strategy: user deletion cascades everything; category deletion nulls
transactions' category (keeps the money, drops the label). Indexes: see
ENGINEERING-NOTES §5.1 (every hot filter covered).

### 3.6 Cross-cutting conventions

- **Money:** `NUMERIC(14,2)` in DB, decimal strings on the wire, `decimal.js` in code. Never `Number` arithmetic on a displayed total (see ENGINEERING-NOTES §5.1 for the one place this was fixed). FX rates `NUMERIC(18,8)`.
- **Time:** `TIMESTAMPTZ` UTC everywhere; frontend converts to local at render.
- **Validation:** Zod at every route boundary; auth schemas `.strict()`.
- **Idempotency:** `Idempotency-Key` on money-affecting POSTs; `(user_id, key)` unique; replay returns cached response, mismatched body → 422. ([middleware/idempotency.ts](backend/src/middleware/idempotency.ts))
- **Auth:** short-lived access JWT + rotating refresh JWT, both httpOnly cookies. Refresh rotation with reuse detection (`findByHashForUpdate` locks the row). `previewToken` reuses the access secret with a distinct `aud` claim so a CSV-preview token can't be used as an access token.
- **Errors:** `AppError` subclasses → `errorHandler` maps to `{error:{code,message}}` + status.
- **SQL:** parameterized only; multi-statement work wrapped in `withTransaction(pool, fn)`.
- **Logging:** pino, structured, with redact paths for `password`/`token`/`email`/`cookie`.

### 3.7 Adapters & external integrations

Each isolates a third party behind a small interface (swap real/fake at
construction):

- **FX** — `fxAdapter` (Frankfurter REST, no key) + `fxRatesRepo` cache; `fxService.convert()` uses a per-request cache and month-anchor rates.
- **Plaid** — `plaidAdapter` (Plaid SDK) + `plaidService` (link/exchange/sync loop). Access tokens AES-256-GCM encrypted at rest via `crypto.createAesGcm`.
- **Google OAuth** — `googleOAuthAdapter` (google-auth-library); `oauthService` auto-links on verified-email match. Redirect URI built from `API_BASE_URL`.
- **Email** — `EmailAdapter` interface; Resend (REST via `fetch`) or console fallback.

---

## 4. Frontend

### 4.1 Structure — feature-based

```
src/
  app/         providers, router, theme, tokens, ColorMode, ProtectedRoute
  features/<domain>/   page + components + hooks + api + schemas (colocated)
  shared/      components (AppShell, MoneyCell, PageLoader, EmptyState, …),
               api/client.ts, lib/format.ts
  flags.ts     reads VITE_FLAG_* → typed flags object
```

Features: `auth`, `accounts`, `transactions`, `categories`, `rules`, `budgets`,
`imports`, `dashboard`, `recurring`, `plaid`, `settings`, `health`.

### 4.2 Routing — [app/router.tsx](frontend/src/app/router.tsx)

`createBrowserRouter`. Auth pages eager; **all authenticated feature pages are
`React.lazy`** (code-split per page) behind one `<Suspense>` at the `AppShell`
`<Outlet>` (fallback = `PageLoader` skeleton). `ProtectedRoute` / `PublicOnlyRoute`
gate by auth state. v2/v3 routes registered only when the flag is on (mirrors the
backend mount). See ENGINEERING-NOTES §5.1 for the bundle-splitting work.

### 4.3 Server state — [shared/api/client.ts](frontend/src/shared/api/client.ts)

**TanStack Query owns all server state** — there's almost no client store. The
`client.ts` fetch wrapper sends `credentials: 'include'`, and on a 401 it
transparently calls `/auth/refresh` once (single-flight `refreshPromise`) and
retries. Lists use `useInfiniteQuery` (cursor pagination). Mutations invalidate
the relevant query keys `onSuccess`.

### 4.4 Theming — [app/theme.ts](frontend/src/app/theme.ts), [app/tokens.ts](frontend/src/app/tokens.ts)

Custom MUI theme with light + dark palettes; system-follow with a localStorage
override (`ColorModeContext`). Design tokens (radius, spacing, easing) in
`tokens.ts`, exposed on the theme as `theme.pfa.*`. Editorial-minimalist look;
custom ease-out easing + tactile press-scale (Emil pass).

### 4.5 Feature notes

- **transactions** — the richest page: filters + `?q=` search (debounced), cursor "Load more", CSV export, create/edit dialog, rule-learning snackbar. O(1) account/category lookup Maps for the render loop.
- **dashboard** — summary card, category donut (`ByCategoryPie`), 6-month trend (`TrendLine`), net-worth area (`NetWorthChart`, recharts — lazy-loaded as its own ~400KB chunk). Multi-currency converts per bucket via FX.
- **imports** — 3-step wizard (Upload → Review → commit); preview-token round-trip; per-row skip/categorize; duplicate flags; undo.
- **settings** — profile, change/set password (OAuth-only "set password" path), unlink Google, delete account with email confirm.

---

## 5. Testing

- **Backend:** Vitest + Supertest, **integration tests against a real Postgres** (not mocks) — 305 tests. Bias: test the real SQL + HTTP contract. `vitest.setup.ts` seeds env (`NODE_ENV=test`, so prod-only branches like `SameSite=None` stay off in tests). Unit tests for pure logic (rulePattern, crypto, csv, fx).
- **Frontend:** Vitest + React Testing Library, happy-path — 52 tests.
- Target ≥70% backend coverage on services + repos.

---

## 6. CI/CD + deploy

- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) — `Backend` + `Frontend` jobs (lint + typecheck + tests) on push/PR to dev/main/prod, Node 20. Only these two contexts gate merges. (A stray `Vercel`/`control-extractor` check is unrelated — see ENGINEERING-NOTES §4.2.)
- **Branch model** — `main` is trunk; `dev` is the working branch; `prod` mirrors `main` via a SHA-parity force-push after each merge (see ENGINEERING-NOTES §4.1).
- **Deploy** — Neon (DB) → Render (backend, `render.yaml` blueprint, migrations run in build) → Vercel (frontend, `vercel.json`). Node pinned to 20 via `.node-version` in both packages. Full recipe: README §Deploy; the debugging saga: ENGINEERING-NOTES §9.

---

## 7. Feature flags

`FLAG_*` (backend env) + `VITE_FLAG_*` (frontend build) — a feature shows only
when **both** agree. Enabled in prod: recurring, multi-currency, net-worth,
hierarchical-categories, rule-learning. Off (need external creds): Plaid,
Google OAuth, password-reset email. Backend routes and frontend routes/nav are
both conditionally registered, so a disabled feature has zero exposed surface.

---

## 8. Local dev

```bash
docker compose up -d postgres
cd backend  && npm install && cp .env.example .env && npm run migrate:up && npm run dev   # :3001
cd frontend && npm install && cp .env.example .env && npm run dev                          # :5173
```

Local `.env` runs all flags on; the Vite dev server proxies `/api` + `/healthz`
to `:3001` (same-origin, so `SameSite=Lax` cookies work locally). Test user:
`demo@finance.app` / `demo1234` after `npm run seed:demo`.
