# Engineering Notes

An engineering narrative for this project: the architecture, the decisions behind
it, and a running log of non-obvious work and debugging. Written to be *spoken
from* — in an interview, in a design review, or when onboarding.

For the formal specs see [PRD.md](PRD.md) (product) and [TRD.md](TRD.md)
(technical requirements). This file is the "why and how it actually went" layer
on top of those.

---

## 1. What this app is, in one breath

A personal finance / budget tracker: accounts, transactions, categories,
rule-based auto-categorization, CSV import with duplicate detection, budgets,
and a dashboard (summary, category breakdown, 6-month trend, net worth). Built
full-stack as a portfolio project, then extended with v2/v3 features (recurring
detection, multi-currency + FX, hierarchical categories, password reset, Plaid
bank linking, rule-learning, Google OAuth) each gated behind a feature flag.

Two independent packages, no monorepo tooling (deliberate — KISS):

- `backend/` — Node + Express + TypeScript (strict) + `pg` + `node-pg-migrate`
- `frontend/` — Vite + React 18 + TypeScript (strict) + MUI + TanStack Query
- Postgres 16 (Docker locally, Neon in prod)

---

## 2. Architecture at a glance

### 2.1 Backend — strict layering + dependency injection

```
HTTP → routes/ → controllers/ → services/ → repositories/ → Postgres
                     │              │             │
                  Zod parse    business logic   parameterized SQL
```

- **routes/** — wire URLs to controller methods, attach middleware (auth,
  rate-limit, idempotency).
- **controllers/** — HTTP concerns only: parse/validate the request with a
  **Zod** schema at the boundary, call a service, shape the response.
- **services/** — all business logic. Pure-ish; take repositories + other
  services as dependencies, never import a concrete DB client directly.
- **repositories/** — the *only* place SQL lives. Every query is
  parameterized (`$1/$2`), no string concatenation.

Everything is wired in [`container.ts`](backend/src/container.ts) via a
`buildContainer(pool, logger, config)` factory — a hand-rolled DI container.
`server.ts` builds it from `env`; tests and the seed script build their own with
test doubles. This is why the code is testable without mocking frameworks: swap a
repo or adapter at construction time.

**The adapter pattern shows up three times**, each isolating an external
dependency behind a small interface so the rest of the app doesn't know or care
which implementation is live:

| Interface | Real impl | Fallback / test impl |
|---|---|---|
| `EmailAdapter` | Resend (REST via `fetch`) | console logger |
| FX rates | Frankfurter API | in-memory cache + fixtures |
| Plaid | Plaid SDK | sandbox / stubs |

The email one is the cleanest example: `pickEmailAdapter` in the container
returns the Resend adapter **iff** both `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
are set, else the console adapter. No caller ever branches on this.

### 2.2 Frontend — feature-based, server-state-first

```
src/features/<domain>/    ← page + components + hooks + api + schemas, colocated
src/shared/               ← cross-feature primitives (MoneyCell, PageLoader, …)
```

- **TanStack Query owns server state.** Lists use `useInfiniteQuery` for cursor
  pagination; mutations invalidate the relevant query keys on success. There is
  almost no client-side "store" — the server is the source of truth and the
  query cache is the view of it.
- **MUI + a custom theme** (light/dark, editorial minimalism). Money is always
  rendered through a shared `MoneyCell` so formatting/sign/colour is consistent.

### 2.3 Request lifecycle (a write, end to end)

`POST /transactions` →
1. rate-limit + auth middleware (JWT access token verified)
2. `Idempotency-Key` middleware (replays a cached response if the key was seen)
3. controller Zod-parses the body
4. service: verify account ownership, run the rule engine to auto-categorize if
   no category supplied, insert
5. repository: single parameterized `INSERT ... RETURNING`
6. response shaped back to the client; TanStack Query invalidates the tx list

---

## 3. Core engineering decisions and *why*

These are the ones worth being able to defend in an interview.

### 3.1 Money is never a JS `number`
`NUMERIC(14,2)` in Postgres, **decimal strings on the wire** (`"amount":
"-450.00"`), `decimal.js` in Node. IEEE-754 floats can't represent `0.10 + 0.20`
exactly, and money bugs are the kind that lose real trust. The one place a
`Number` is acceptable is *comparison* (sorting a list by amount) or an
explicitly-documented heuristic (the recurring-detection tolerance check) — never
accumulation of a displayed total.

### 3.2 Timestamps are UTC everywhere
`TIMESTAMPTZ` in the DB, ISO-8601 on the wire, converted to browser-local only at
render time. No ambiguity about "what day did this transaction happen".

### 3.3 Zod at every route boundary
Untrusted input is validated once, at the edge, and the parsed type flows inward.
Auth schemas are `.strict()` so unknown keys are rejected rather than silently
ignored. The same Zod schemas are the source for OpenAPI generation, so the docs
can't drift from the validation.

### 3.4 Idempotency on money-moving POSTs
Every POST that creates money-affecting state accepts an `Idempotency-Key`.
First request runs and caches its response keyed by (user, key, request-hash);
a replay with the same key + same body returns the cached response and does
*not* run again; a same key + *different* body returns 422. This makes retries
(flaky network, double-click) safe. See TRD §7.2.

### 3.5 Cursor pagination, not offset
Transaction lists paginate on `(date, id) < (cursor)` with a covering
`ORDER BY date DESC, id DESC`. Offset pagination degrades on deep pages and
double-counts when rows are inserted mid-scroll; keyset pagination is O(limit)
regardless of depth and stable under concurrent inserts.

### 3.6 Feature flags gate everything post-v1
`FLAG_*` (backend) + `VITE_FLAG_*` (frontend), default off. v2/v3 features are
built behind their flag, merged with the flag off, and flipped on per-environment
when ready. This is how the whole thing ships to `main`/`prod` continuously
without half-built features being visible.

### 3.7 Auth: short access token + rotating refresh token
Access token is short-lived; refresh tokens rotate on use and are stored hashed,
so a stolen refresh token is single-use and detectable. Google OAuth auto-links
to an existing account on a *verified* email match.

### 3.8 Security posture
Explicit Helmet CSP, HSTS, no-referrer, CORP; signup + global rate limits;
parameterized SQL only; PII (`password`, `token`, `email`, `cookie`) redacted in
logs via the pino config. Password reset always returns 200 regardless of
whether the email exists — no account-enumeration oracle.

---

## 4. Delivery workflow

### 4.1 Branch model
`main` is the trunk / source of truth. `dev` is the working branch; `prod`
mirrors `main` for deploys. `main` and `prod` are protected (PR + status checks).

**Ship recipe (per change):**
```
commit on dev → push → open dev→main PR → CI green → merge (--merge)
  → fast-forward dev to origin/main → push dev
  → force-push origin/main's SHA to prod (protection dropped + restored)
```
The prod force-push (rather than a PR) guarantees `prod` SHA == `main` SHA with
no divergence; a rebase-merge was tried and abandoned because it left prod
permanently "1 commit ahead" and eventually conflicting.

### 4.2 CI
GitHub Actions runs a **Backend** job and a **Frontend** job (lint + typecheck +
tests) on every push and PR to `dev`/`main`/`prod`. Only those two contexts gate
merges.

> **Known noise:** a stray `Vercel` check for an unrelated project
> (`control-extractor`) fails on every PR. It is *not* a required context and
> never blocks a merge — confirm only that `Backend` + `Frontend` are green. This
> stray integration should be removed from the repo's Vercel settings.

### 4.3 Testing
- Backend: Vitest + Supertest, **integration tests hitting a real Postgres**
  (not mocks) — 305 tests. This is the deliberate bias: test the real SQL and the
  real HTTP contract, because that's where the bugs are.
- Frontend: Vitest + React Testing Library, happy-path — 52 tests.

---

## 5. Work log — reasoning and debugging

A running record of non-obvious engineering work, kept so the *thinking* survives,
not just the diff.

### 5.1 Optimization / cleanup pass (feature-by-feature)

Goal: make the code more production-ready, modular, and refactorable **without
changing behavior**. Discipline: read each feature end to end, apply only changes
existing tests (or a targeted check) could prove safe, and — critically — *resist
optimizing things that don't need it*. The codebase had already been through a
perf pass, so the honest yield was small and mostly deletion.

**Shipped changes:**

- **transactions repo** — removed a dead `?? pool` fallback where the `executor`
  parameter already defaulted to `pool`. Pure dead-code removal.
- **dashboard repo** — deleted a no-op `JOIN LATERAL (SELECT a.opening_balance
  AS opening)`; `opening_balance` was already in scope from the `CROSS JOIN`, so
  the lateral was indirection with zero effect. Verified equivalent by running
  the exact query against the live DB before and confirming identical output.
  Also moved a net-worth doc comment that had drifted onto the wrong function.
- **dashboard service** — the hierarchical-category rollup summed money via
  hand-rolled `toCents`/`fromCents` `Number` helpers, while the rest of the file
  used `decimal.js`. Replaced them with `Decimal` (already imported), deleting
  the helpers and the IEEE-754 caveat and aligning with the project's own money
  rule. Safe because the rollup total is asserted exactly by an integration test
  (a parent category rolling up two children to `55.00`).
- **frontend transactions page** — an empty-state "Go to Accounts" button
  navigated by `document.querySelector('a[data-nav]').click()` against a hidden
  `<RouterLink>`. Replaced with the `useNavigate` hook already used in seven
  other pages, deleting the hidden element and the fragile DOM coupling.

**Deliberately *not* changed** (the more important discipline):

- **Plaid `/transactions/sync` loop** is a genuine N+1 (per-transaction
  insert/update/delete). Left as-is: it's inside a single pooled transaction, the
  feature is flag-off in prod, it's not a measured bottleneck, and batching means
  rewriting the money-write + idempotency (`23505` unique-violation skip →
  `ON CONFLICT`) semantics. That's real risk for no proven gain — premature.
- **dashboard chart data transforms** run un-memoized on every render, but on
  tiny arrays (6 trend points, ~10 pie slices) that only recompute when query
  data changes. `useMemo` there would be caching without a measured cost.
- **recurring detection's `Number` math** is correct as-is: it's heuristic
  comparison (±5% tolerance, 28–33 day cadence), not money persistence, and it's
  documented as such.

Net across the pass: **−22 lines**. The takeaway worth stating out loud: on a
codebase that's already clean, the right optimization pass mostly *deletes* and
mostly *declines*.

**Second sweep — the parts not yet read** (accounts, auth, budgets, categories,
rules, fx, oauth on the backend; the remaining frontend pages). Method: grep the
whole surface for concrete, gradeable issues, then read only what lights up.

- **Index audit** — the highest-value thing to check, done against the *live* DB
  (`pg_indexes`), not just the migrations. Every hot query filter is covered:
  transactions have `(account_id, date DESC)` for the list, a partial index on
  `category_id`, the `pg_trgm` GIN on `description` for search, the
  `(account_id, date, amount, description)` composite for duplicate detection, and
  partial unique/plain indexes on `plaid_transaction_id` and `recurring_group_id`;
  budgets on `(user_id, month)`; refresh tokens on the hashed token + a partial
  user index. **Nothing missing.** Being able to say "here's how I verified every
  hot filter is indexed" is worth more than any single index.
- **auth.service** — 32 `await`s, but every one is a *dependent* step (find user →
  verify password → issue token; or the refresh rotation find-for-update → revoke →
  re-issue). No parallelizable independent reads, so no `Promise.all` win. Correctly
  sequential — a security path where ordering is the point.
- **SQL-in-service outlier** — the batch category-ownership check in `csvImport`
  was the *one* place raw SQL lived in a service instead of a repository (grep of
  the whole services dir confirmed it — the only other raw queries are the Plaid
  sync loop that's deliberately left). Extracted it to
  `categoriesRepo.countOwnedByIds` so the "repositories own all SQL" claim is
  actually true. Covered by the existing import-commit tests (happy path +
  unowned-category → 404).

**Non-issues correctly left alone:** `SELECT *` on single-row PK lookups (typed
Row interfaces already consume every column; rewriting 18 sites is risk for no
gain), large-but-not-complex components, and `key={r.index}` in the CSV review
step (that's the row's own stable line number, not the `key={mapIndex}`
anti-pattern).

**End of the road.** After two sweeps the well is dry: the remaining "findings"
would all be manufactured work. The honest signal of a mature codebase is that a
thorough optimization pass returns *few* changes and a lot of justified declines.

### 5.2 `seed:demo` NOT-NULL bug — root cause

**Symptom:** `npm run seed:demo` crashed at account creation:
`null value in column "currency" of relation "accounts" violates not-null
constraint`.

**Root cause (not the symptom):** migration `013_accounts_currency_and_fx_rates`
added `accounts.currency CHAR(3) NOT NULL` with a CHECK constraint and **no
default**. The multi-currency feature backfilled existing rows and made the
column required — but the demo seed script's `INSERT INTO accounts (...)` was
written before that migration and never supplied `currency`. So any fresh seed
hit the constraint immediately.

**Fix:** add `currency` to the seed's accounts INSERT, all three demo accounts
`'USD'` — matching the demo base currency and the dollar-denominated seed data
(4500 salary, 1500 rent). Four lines.

**Verification (the part that matters):** reproduced the exact failure first;
then after the fix confirmed a full run seeds 3 accounts / 360 transactions /
6 budgets with exit 0, and that a *second* run cleanly deletes and rebuilds the
demo user (the script's idempotency — it wipes the demo user via CASCADE at the
top — was intact).

**Lesson worth telling:** a `NOT NULL` column added by a later migration is a
foot-gun for any insert path written earlier that doesn't go through the same
service layer. The seed used raw SQL for speed and so bypassed the accounts
service (which *does* set currency). The fix is local, but the general guard is:
either give such columns a DB default, or route all inserts through one place.

### 5.3 Resend email adapter — already built

The handoff listed "wire the Resend adapter" as outstanding. On inspection it was
already implemented end to end: `createResendEmailAdapter` (platform `fetch`, no
SDK, HTML-escaped body, throws on non-2xx), selected by `pickEmailAdapter` in the
container when `RESEND_API_KEY` + `RESEND_FROM_EMAIL` are present, wired from
`env` in `server.ts`, and covered by 3 unit tests (POST shape, HTML escaping,
error path). The password-reset service calls it inside a try/catch and always
returns 200. Nothing to build.

The only remaining step is operational and external: create a Resend account,
verify a sender domain, and set the two env vars in Render. With those unset, the
console adapter runs and logs the reset link — which is fine for local dev and the
portfolio demo.

---

## 6. Interview talking points

Quick-reference for common questions:

- **"Walk me through the architecture."** → §2. Emphasize the strict
  routes→controllers→services→repositories layering, DI via the container, and
  that SQL is confined to repositories.
- **"How do you handle money?"** → §3.1. Decimal strings + `decimal.js` +
  `NUMERIC(14,2)`; never float arithmetic on a displayed total.
- **"How do you make writes safe against retries?"** → §3.4 idempotency keys.
- **"How do you paginate?"** → §3.5 keyset/cursor, and *why* not offset.
- **"How do you integrate third parties without coupling?"** → §2.1 adapter
  pattern; the email console/Resend swap is the cleanest example.
- **"Tell me about a bug you debugged."** → §5.2, the seed NOT-NULL: symptom vs
  root cause, the migration-ordering foot-gun, reproduce-then-fix-then-verify.
- **"Tell me about a time you chose *not* to do something."** → §5.1 "deliberately
  not changed": the Plaid N+1 and the un-memoized charts. Being able to justify
  *not* optimizing is a stronger signal than optimizing everything.
- **"How does it deploy?"** → §4.1 branch model + the prod SHA-parity force-push,
  and *why* rebase-merge to prod was abandoned.

---

## 7. Still open (blocked on external accounts)

1. **Deploy** — Neon → Render → Vercel; then fill README URL placeholders and
   seed a prod demo user (now unblocked, §5.2). *Progress:* Neon provisioned +
   schema migrated + demo data seeded; Render/Vercel await account setup.
2. **Resend** — account + domain verification + env vars in Render (§5.3).
3. **Plaid** — real `client_id` + secret in Render.
4. **Google OAuth** — real client id/secret + registered redirect URIs.

---

## 8. How this maps to big-corp infrastructure

The deploy stack here is **PaaS** (Platform-as-a-Service): Neon, Render, Vercel
hide the infrastructure so a solo dev ships fast. At large scale, teams trade
that convenience for **IaaS + orchestration** — for control, unit cost, and
compliance, *not* because PaaS can't handle the user count (Vercel/Render serve
millions). The architecture doesn't change; only the substrate under it does.

| This stack | Role | Big-corp equivalent (AWS / Azure / GCP) |
|---|---|---|
| Vercel (frontend) | Build SPA + global CDN + CI/CD | Build in CI → **S3 + CloudFront** / Blob + Front Door / GCS + Cloud CDN |
| Render (backend) | Run a container, expose a URL, autoscale | **Kubernetes (EKS/AKS/GKE)** or managed containers (**ECS/Fargate**, Cloud Run, Container Apps); serverless → **Lambda + API Gateway** |
| Neon (database) | Managed serverless Postgres | **RDS / Aurora**, Azure DB for Postgres, Cloud SQL / AlloyDB + read replicas, PgBouncer, sharding, Redis |

**The glue PaaS hides** (owned by a platform/SRE team): IaC (Terraform/Pulumi),
GitOps deploys (ArgoCD/Spinnaker), load balancers + autoscaling (HPA) + WAF +
Route 53, observability (Datadog / Prometheus+Grafana / OpenTelemetry), secrets
(Vault/Secrets Manager), multi-AZ / multi-region HA.

**Interview one-liner:** *Kubernetes is a cost you pay for flexibility you may
not need.* PaaS buys velocity; K8s/IaaS buys control and cost-efficiency at
scale, but you own the ops burden (you need an SRE team). Because this backend
is **12-factor** (stateless, config via env, DB over a URL), it ports cleanly:
containerize it, point `DATABASE_URL` at RDS, push the frontend build to
S3+CloudFront — the layering and data model are unchanged.

**When you actually switch:** custom networking/compliance needs, cost
optimization at high scale, or an existing platform team — not a raw user-count
threshold.

---

## 9. Deploy war stories

The first production deploy (Neon + Render + Vercel) surfaced five failures worth
keeping — each is a "tell me about a hard deployment bug" answer. Pattern for all:
**symptom → root cause → fix → lesson.**

### 9.1 The build that couldn't find its own build tools
**Symptom:** Render build failed — `sh: 1: node-pg-migrate: not found`.
**Root cause:** `render.yaml` sets `NODE_ENV=production`, and modern `npm ci`
omits `devDependencies` under that. But the build *needs* devDeps — `typescript`
(for `tsc`) and `node-pg-migrate` (for migrations) both live there. It passed
GitHub CI because CI doesn't set `NODE_ENV=production`.
**Fix:** `npm ci --include=dev` in the build command. Runtime
(`node dist/server.js`) still only uses `dependencies` + the compiled `dist/`.
**Lesson:** build-time tools in `devDependencies` + `NODE_ENV=production` is a
classic trap, and a CI that doesn't mirror the prod env variable *hides* it.

### 9.2 Login worked in curl, failed in the browser
**Symptom:** `curl` login returned 200 with cookies; in the browser, login
"succeeded" but every next request was unauthenticated.
**Root cause:** cookies were `SameSite=Lax`. Frontend (Vercel) and API (Render)
are different sites, so the browser refuses to send Lax cookies on cross-site
XHR. `curl` doesn't enforce SameSite, so the CLI test gave false confidence.
**Fix:** `sameSite: isProd ? 'none' : 'lax'` (None requires Secure, already set;
dev stays Lax via the Vite proxy).
**Lesson:** split-origin cookie auth needs *four* things aligned — cookie
`SameSite=None; Secure`, CORS `credentials:true` with an exact origin, and the
frontend `fetch(credentials:'include')`. And `curl` is not a proxy for browser
cookie behavior.

### 9.3 The first deploy that canceled itself
**Symptom:** Vercel showed "Deployment canceled" on the very first deploy.
**Root cause:** the monorepo build filter `git diff --quiet HEAD^ HEAD ./`
(skip if the frontend didn't change) — but the commit that triggered it was a
backend-only change, so it correctly-but-unhelpfully skipped the *initial* build.
**Fix:** guard on `VERCEL_GIT_PREVIOUS_SHA` — build unconditionally when there's
no prior successful deploy, and diff against the last *deployed* SHA (not just
`HEAD^`) so multi-commit pushes are handled right.
**Lesson:** "skip if my folder didn't change" logic must special-case the
no-previous-deploy state, or it starves its own first build.

### 9.4 CORS trusting a placeholder, and the boot-order deadlock
**Symptom:** browser API calls blocked; backend returned
`access-control-allow-origin: https://placeholder.vercel.app`.
**Root cause:** two linked issues. (1) The backend requires `FRONTEND_ORIGIN`
(a valid URL) to boot — but the real Vercel URL doesn't exist until the frontend
deploys, which itself wants the backend URL. A **boot-order deadlock**. (2) CORS
matches the origin as an *exact string*, so a trailing slash or the placeholder
silently fails.
**Fix:** boot the backend with a placeholder URL (valid, so it starts + passes
health checks), deploy the frontend, then set `FRONTEND_ORIGIN` to the real
Vercel origin (no trailing slash) and redeploy.
**Lesson:** circular env dependencies between services need a deliberate
bootstrap order; and an "origin" is an exact match, not a fuzzy one.

### 9.5 Node picked the newest, not the LTS
**Symptom:** Render logs — `Using Node.js version 26.7.0`.
**Root cause:** `engines.node: ">=20.0.0"` is a *floor*, not a pin, so Render
installed the newest available — an odd-numbered, non-LTS, bleeding-edge Node,
while CI tested on Node 20.
**Fix:** a `.node-version` file pinning `20` (matches CI → deploy what you test),
in both `backend/` (Render) and `frontend/` (Vercel).
**Lesson:** a version *range* is not a pin. Pin the actual runtime for
reproducible builds and test/prod parity — you want prod running exactly the
Node your test suite ran on.

**Meta-lesson across all five:** each bug passed one check and failed another —
CI hid the NODE_ENV trap, curl hid the cookie trap, the happy path hid the CORS
deadlock. The fix each time was to test in the environment that actually matters,
not the convenient one.
