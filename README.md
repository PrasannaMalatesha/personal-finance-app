# Personal Finance / Budget Tracker

Full-stack personal finance app: accounts, transactions (manual + CSV import), rule-based categorization, monthly budgets, spending dashboard. Portfolio project.

**Stack:** Node.js + Express + TypeScript · React + Vite + MUI · PostgreSQL · deployed on Vercel + Render + Neon.

## Status

Day 1 scaffold. See:
- [PRD.md](PRD.md) — product requirements (v1 / v2 / v3 phased plan)
- [TRD.md](TRD.md) — technical design (data model, API contract, sequence diagrams, security, consistency & idempotency invariants)

## Quickstart (local)

```bash
# 1. Start Postgres
docker compose up -d postgres

# 2. Backend
cd backend
cp .env.example .env
npm install
npm run migrate:up
npm run dev              # http://localhost:3001/healthz

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev              # http://localhost:5173
```

## Deploy

- **Frontend:** Vercel — https://personal-finance-app.vercel.app *(coming soon)*
- **Backend:**  Render  — https://personal-finance-api.onrender.com *(coming soon)*
- **Demo login:** `demo@finance.app` / `demo1234` *(seeded on prod deploys)*

## License

MIT — see [LICENSE](LICENSE).
