# Personal Finance / Budget Tracker — PRD

**Status:** Draft v1
**Date:** 2026-07-20
**Type:** Portfolio / learning project
**Owner:** malatesha378@gmail.com

---

## 1. TL;DR

A responsive web app for tracking personal finances end-to-end: multiple accounts, transaction ingestion (manual + CSV), rule-based categorization, monthly budgets with overspend awareness, and a spending dashboard. Built as a portfolio piece showcasing full-stack skills (Node/Express + React + Postgres), shipped as a live-deployed demo with a seeded demo account.

Delivered in **three phases**:
- **v1 (2 weeks)** — polished end-to-end thin slice. Breadth over depth.
- **v2 (~2 weeks)** — Plaid sandbox, recurring detection, multi-currency + FX, hierarchical categories, net-worth chart.
- **v3 (~2 weeks)** — PDF/OCR import, rule-learning ("teach the system"), Plaid Development, OAuth.

## 2. Problem & Vision

**Problem.** People juggle multiple accounts (checking, credit cards, savings) and have three overlapping questions they can't easily answer at once:
1. *"Where did my money go?"* (retrospective categorization)
2. *"Am I on track this month?"* (forward-looking budgeting)
3. *"What's my full financial picture?"* (net worth over time)

Existing tools each optimize for one of these (Mint = tracking, YNAB = budgeting, Copilot/Monarch = aggregation). This project is an opinionated all-three-in-one for a single user.

**Vision.** A finance app that leads with *"so what"* (are you over budget this month?) before showing raw data — with a CSV import flow that never feels risky and empty states that guide new users instead of dumping them into a blank dashboard.

## 3. Portfolio Context & Success Metrics

This is a **portfolio-first** build. It does not need real users. Success is measured by what a technical reviewer sees when they visit the repo and demo:

**Success criteria for v1:**
- Live deployed URL that loads in <3s cold
- Seeded demo account (`demo@finance.app`) — reviewer logs in in one click, sees populated data
- README with: 30-second GIF, architecture diagram, deploy instructions, tech-decision rationale
- Green CI badge (GitHub Actions running tests on push)
- ≥70% test coverage on backend business logic (categorization, budgets, CSV parsing)
- Passes a code-review sanity check: layered architecture, no secrets committed, migrations reversible

**Explicit non-goals:**
- Real user acquisition, marketing, or monetization
- Regulatory compliance (PCI, SOC2, GDPR — noted as v3+ if it ever went commercial)
- Mobile-native apps (responsive web only)
- Multi-tenancy beyond single-user isolation

## 4. Target User

**Primary persona:** *Alex, 28, salaried professional.* Has one checking account, one credit card, one savings account. Uses their bank's website to check balances but has no system for budgeting. Downloads CSVs occasionally, tries a budgeting app for two weeks, abandons it because entry is tedious.

**Portfolio persona (real audience):** *A hiring engineer / recruiter.* Wants to see, in under five minutes, that the builder can design a data model, structure a backend, wire a frontend, and think about UX. The app itself is the artifact.

## 5. Scope by Phase

### 5.1 v1 — Polished thin slice (2 weeks)

**In scope:**

| Area | Feature | Acceptance |
|---|---|---|
| Auth | Email/password signup + login | Passwords hashed (bcrypt, cost 12). JWT access (15min) + refresh (7d) in httpOnly, SameSite=Lax cookies. Logout revokes refresh. |
| Auth | Signup collects base currency (dropdown: INR, USD, EUR, GBP, JPY, CAD, AUD, SGD, AED, CHF) | Stored on user; used as display currency everywhere in v1. |
| Accounts | Create/edit/delete accounts (name, type: checking/savings/credit_card, opening balance) | User can hold ≥3 accounts. Deleting an account with transactions requires confirm. |
| Categories | 18 pre-seeded flat categories on signup (Dining, Groceries, Rent, Utilities, Transport, Shopping, Entertainment, Health, Travel, Salary, Refund, Transfer, Fees, Subscriptions, Gifts, Education, Other Income, Other Expense) | User can add/rename/delete their own. No hierarchy in v1. Colors auto-assigned. |
| Transactions | Manual entry form (date, account, amount, description, category) | Sub-second submit. Amount supports negative (expense) and positive (income). |
| Transactions | List view with filter by account + date range + category, sort by date | Pagination (50/page). Inline category edit. |
| CSV Import | Upload CSV → column-mapping step → preview table with auto-categorized rows → confirm | User can fix category/description per row before commit. Import creates one `import_batch` row for traceability. Duplicate detection by (account, date, amount, description) — flagged in preview, not silently skipped. |
| Categorization | Rule engine: substring match on description → category (e.g. `STARBUCKS` → Dining) | ~15 seed rules ship with the app. User can add/edit rules in Settings. Rules apply at import time and on manual entry. |
| Budgets | Set monthly budget per category | One row per (user, category, month). Editable. |
| Budgets | Budget page shows: progress bar per category, spent / limit / remaining, over-budget rows highlighted | Numbers recompute on transaction change. |
| Dashboard | Single dashboard with three widgets: (1) "This month" summary card (income, expenses, net, budget status), (2) spending-by-category pie for current month, (3) 6-month spending trend line | Empty-state copy when user has no data yet, with CTA to add an account. |
| Non-functional | Deployed live (Vercel + Render/Railway + Neon Postgres), seeded demo user, README, CI running tests | See §6 for deployment details. |

**Out of scope for v1 (explicitly deferred):**
- Recurring transaction detection → v2
- Hierarchical categories (parent → sub) → v2
- Rule-learning / "teach the system" → v3
- Net-worth-over-time chart → v2
- Multi-currency + FX → v2
- Plaid / bank aggregators → v2 (sandbox), v3 (dev)
- PDF/OCR import → v3
- OAuth (Google sign-in) → v3
- Password reset via email → v2

### 5.2 v2 — Depth (~2 weeks)

- **Plaid Sandbox integration.** Full Link → Item → transactions sync flow using Plaid's sandbox institutions. Zero cost, no real credentials. Demo shows "Connect a bank" button using sandbox creds.
- **Recurring transaction detection.** Heuristic: same (merchant or description-normalized, amount ±5%, cadence 28–33 days) recurring ≥2 times → flagged as recurring. UI shows a "Subscriptions" page.
- **Hierarchical categories.** Add `parent_category_id`. Dashboard rolls up subcategories. Migration script for existing users.
- **Multi-currency + FX rates.** Each account has its own currency. Base currency (user's signup choice) is display currency. Daily FX rates from a free provider (e.g. `exchangerate.host`) cached in a `fx_rates` table. Historical transactions converted at their transaction-date rate.
- **Net-worth chart.** Nightly job snapshots account balances into `balance_snapshots`. Dashboard adds a net-worth-over-time line chart.
- **Password reset via email** (Resend or Postmark free tier).

### 5.3 v3 — Ambitious (~2 weeks)

- **PDF/OCR import.** Upload bank PDF → server-side extraction (`pdf-parse` for text-native PDFs, Tesseract for scanned). Same preview/confirm UX as CSV. Explicitly best-effort with a "some transactions may need manual entry" disclaimer.
- **Rule-learning.** When a user recategorizes a transaction, prompt: "Apply this to all similar transactions?" and "Save as a rule?" Rules get promoted from user actions.
- **Plaid Development.** Real bank connections (limited to Plaid's free-tier institution cap). Requires Plaid dashboard approval + real bank credentials for demo.
- **OAuth (Google sign-in)** alongside email/password.

## 6. Key User Flows (v1)

**Onboarding (new user):**
1. Sign up (email, password, base currency) → land on empty dashboard with "Add your first account" CTA.
2. Create first account → prompted to either "Import CSV" or "Add a transaction manually."
3. If CSV: upload → column-map (auto-detects common bank formats) → preview with auto-categorized rows → fix → confirm.
4. Dashboard now populated. Prompted to set at least one budget.

**Monthly check-in (returning user):**
1. Land on dashboard → "This month" card leads: "You've spent ₹42,300 of ₹50,000. On track."
2. Click into any over-budget category → filtered transaction list.

**CSV import (safety-first):**
1. Upload → server parses, returns preview.
2. UI shows table with: date, description, amount, *proposed* category (from rules), duplicate flag (if match found).
3. User edits inline. Clicks "Import N transactions." No commit before confirm.
4. Batch recorded in `import_batches` — user can view/undo the entire batch from Settings.

## 7. Data Model (v1)

```
users
  id, email (unique), password_hash, base_currency, created_at, updated_at

refresh_tokens
  id, user_id, token_hash, expires_at, revoked_at

accounts
  id, user_id, name, type (checking|savings|credit_card),
  opening_balance, created_at, updated_at
  # currency omitted in v1 — inherits user.base_currency

categories
  id, user_id, name, color, is_system_default, created_at
  # parent_category_id deferred to v2

rules
  id, user_id, match_type (substring|exact), match_value,
  category_id, priority, created_at

transactions
  id, account_id, date, description, amount, category_id,
  import_batch_id (nullable), created_at, updated_at

budgets
  id, user_id, category_id, month (DATE, first-of-month),
  amount_limit, created_at, updated_at
  UNIQUE (user_id, category_id, month)

import_batches
  id, account_id, filename, row_count, imported_at, undone_at
```

**v2 additions:** `parent_category_id` on `categories`; `currency` on `accounts`; `fx_rates` table; `is_recurring` and `recurring_group_id` on `transactions`; `balance_snapshots` table; `plaid_items` table.

## 8. Technical Decisions

| Area | Choice | Rationale |
|---|---|---|
| Backend | Node.js + Express | Matches architecture notes. Familiar. |
| Layering | routes → controllers → services → repositories | Keeps business logic testable and out of route handlers. |
| Migrations | `node-pg-migrate` | Plain SQL migrations, no ORM lock-in. Reversible. |
| DB access | `pg` (node-postgres) + hand-written SQL | No ORM in v1 — SQL is the interface, keeps the demo transparent to reviewers. |
| Auth | JWT (access + refresh) in httpOnly cookies, SameSite=Lax | Per architecture notes. Refresh token rotation on use. |
| Frontend | React + Vite | Fast dev loop. |
| Server state | TanStack Query | Standard. |
| Forms | React Hook Form + Zod | Zod schemas shared between frontend and backend for validation. |
| Charts | Recharts | Enough for pie + line in v1. |
| CSV parsing | `csv-parse` | Streaming, robust. |
| Testing | Vitest + Supertest (backend), React Testing Library (frontend) | ≥70% backend coverage on services/repositories. Happy-path RTL for critical components. |
| CI | GitHub Actions | Lint + test on every push. Green badge in README. |
| Deployment | Vercel (frontend) + Render or Railway (backend) + Neon (Postgres) | All free tiers. |
| Local dev | `docker compose` for Postgres | Frontend/backend run natively via `npm run dev`. |

## 9. Non-Functional Requirements

- **Security.** Bcrypt (cost 12). HttpOnly + SameSite=Lax cookies. CSRF token on state-changing routes. Input validation via Zod at every route. Rate limit login endpoint (5/min/IP). No secrets in repo — `.env.example` documents required vars. Parameterized SQL only.
- **Performance.** Dashboard loads in <500ms on a 5k-transaction demo dataset. CSV import handles 10k rows in <10s.
- **Observability.** Centralized error-handling middleware. Structured logging (`pino`). No user PII in logs.
- **Accessibility.** All forms keyboard-navigable. Semantic HTML. Contrast ratio ≥4.5:1 for text.
- **Browser support.** Latest 2 versions of Chrome, Safari, Firefox. Mobile Safari + Chrome Android for responsive.

## 10. Milestones (v1, 2 weeks)

| Day | Deliverable |
|---|---|
| 1 | Repo scaffold, docker-compose Postgres, migrations, CI green |
| 2 | Auth: signup, login, refresh, logout. Tests pass. |
| 3 | Accounts + categories CRUD. Seed defaults on signup. |
| 4 | Transactions CRUD (manual entry). |
| 5–6 | CSV import: parse, preview endpoint, commit endpoint. Duplicate detection. Rule engine. |
| 7 | Budgets CRUD + budget page backend. |
| 8 | React scaffold, auth flow, protected routes. |
| 9 | Transactions list + manual entry UI. |
| 10 | CSV import UI (upload → column-map → preview → confirm). |
| 11 | Budgets UI. |
| 12 | Dashboard: summary card, category pie, trend line. Empty states. |
| 13 | Deployment (Vercel + Render + Neon), seeded demo user, README, GIF. |
| 14 | Buffer / polish / bug bash. |

## 11. Resolved Decisions (2026-07-21)

1. **Base currency list** — **10 curated currencies**: INR, USD, EUR, GBP, JPY, CAD, AUD, SGD, AED, CHF. Enough coverage without an unwieldy dropdown. Full ISO 4217 deferred.
2. **Demo seed data** — **6 months synthetic, 3 accounts, active budgets** (~400 transactions across realistic categories, one over-budget category for the current month, one recurring subscription pattern). Idempotent seed script.
3. **CSV column-mapping** — **India + US presets: HDFC, ICICI, SBI, Chase, Bank of America, Wells Fargo** — plus a generic column-mapper fallback. Adds ~1 day of parsing/testing work; consumes the day-14 buffer in TRD §10.
4. **Domain** — **free platform subdomains** for v1 (`*.vercel.app` for frontend, `*.onrender.com` for backend). Custom domain deferred.
5. **Analytics** — **none in v1**. Adds privacy noise for negligible portfolio signal. Revisit in v2 if demo traffic warrants.

---

**Sign-off checklist (before writing code):**
- [ ] Scope in §5.1 is agreed
- [ ] Data model in §7 is agreed
- [ ] Tech stack in §8 is agreed
- [ ] Open questions in §11 have answers


