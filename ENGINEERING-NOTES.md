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
   seed a prod demo user (now unblocked, §5.2).
2. **Resend** — account + domain verification + env vars in Render (§5.3).
3. **Plaid** — real `client_id` + secret in Render.
4. **Google OAuth** — real client id/secret + registered redirect URIs.
