/**
 * Idempotent demo seed (PRD §11.2).
 *
 *   npm run seed:demo
 *
 * Creates (or replaces, if already present) a demo user with:
 *   - 3 accounts (checking, savings, credit card)
 *   - ~360 transactions across the last 6 months
 *   - Realistic recurring patterns: monthly salary, rent, Netflix, Spotify
 *   - Budgets for the current month — including one over-budget category
 *     for the "so what" demo moment
 *
 * Re-runnable: if the demo user exists, it's deleted (CASCADE wipes all
 * downstream data) and rebuilt fresh, so the demo always looks the same
 * on prod deploys.
 */
import { pool } from '../db/client';
import { buildContainer } from '../container';
import { env } from '../config/env';
import logger from '../logger';

const DEMO = {
  email: 'demo@finance.app',
  password: 'demo1234',
  baseCurrency: 'USD',
};

/** Deterministic PRNG so the seeded data looks the same every run. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function firstOfMonth(year: number, monthZeroBased: number): Date {
  return new Date(Date.UTC(year, monthZeroBased, 1));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function money(n: number): string {
  return n.toFixed(2);
}

async function main(): Promise<void> {
  const container = buildContainer(pool, logger, {
    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    frontendOrigin: env.FRONTEND_ORIGIN,
  });

  // 1. Wipe the demo user if it exists. CASCADE takes care of everything
  //    downstream (accounts → transactions, categories → budgets + rules).
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [DEMO.email],
  );
  if (existing.rows[0]) {
    logger.info(
      { userId: existing.rows[0].id },
      'Demo user exists — deleting for clean re-seed',
    );
    await pool.query('DELETE FROM users WHERE id = $1', [existing.rows[0].id]);
  }

  // 2. Signup via the real auth service — runs inside a transaction, seeds
  //    default categories + rules atomically. Tokens are discarded.
  const authResult = await container.authService.signup(DEMO);
  const userId = authResult.user.id;
  logger.info({ userId }, 'Demo user created + defaults seeded');

  // 3. Resolve categories by name.
  const cats = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM categories WHERE user_id = $1`,
    [userId],
  );
  const catId = (name: string): string => {
    const row = cats.rows.find((c) => c.name === name);
    if (!row) throw new Error(`Seed expects category "${name}" to exist`);
    return row.id;
  };

  // 4. Accounts — raw SQL for speed; not going through HTTP idempotency layer.
  const accountRows = await pool.query<{ id: string }>(
    `INSERT INTO accounts (user_id, name, type, opening_balance)
     VALUES
       ($1, 'Chase Checking',     'checking',    '2500.00'),
       ($1, 'HDFC Savings',       'savings',     '8000.00'),
       ($1, 'Amex Everyday',      'credit_card', '0.00')
     RETURNING id`,
    [userId],
  );
  const [checking, savings, credit] = accountRows.rows.map((r) => r.id);
  if (!checking || !savings || !credit) throw new Error('Failed to create accounts');
  logger.info({ checking, savings, credit }, 'Accounts created');

  // 5. Transactions across the last 6 months.
  const rand = seededRandom(42);
  const jitter = (base: number, pct: number): number =>
    Math.round(base * (1 + (rand() - 0.5) * 2 * pct) * 100) / 100;

  const now = new Date();
  const currentMonthStart = firstOfMonth(now.getUTCFullYear(), now.getUTCMonth());

  const tx: Array<{
    accountId: string;
    date: string;
    description: string;
    amount: string;
    categoryId: string | null;
  }> = [];

  for (let mBack = 5; mBack >= 0; mBack--) {
    const monthStart = new Date(currentMonthStart);
    monthStart.setUTCMonth(monthStart.getUTCMonth() - mBack);
    const y = monthStart.getUTCFullYear();
    const m = monthStart.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const isCurrentMonth = mBack === 0;
    // For the current month, only seed up to today so trend lines don't
    // project income the demo user hasn't received yet.
    const maxDay = isCurrentMonth ? Math.min(now.getUTCDate(), daysInMonth) : daysInMonth;

    const dayIso = (day: number): string => iso(new Date(Date.UTC(y, m, day)));

    // Recurring — provides the "subscriptions" pattern PRD §11.2 mentions.
    if (maxDay >= 1) {
      tx.push({
        accountId: checking,
        date: dayIso(1),
        description: 'PAYROLL DEPOSIT ACME CORP',
        amount: money(4500),
        categoryId: catId('Salary'),
      });
    }
    if (maxDay >= 2) {
      tx.push({
        accountId: checking,
        date: dayIso(2),
        description: 'RENT PAYMENT',
        amount: money(-1500),
        categoryId: catId('Rent'),
      });
    }
    if (maxDay >= 5) {
      tx.push({
        accountId: credit,
        date: dayIso(5),
        description: 'NETFLIX.COM',
        amount: money(-15.99),
        categoryId: catId('Subscriptions'),
      });
    }
    if (maxDay >= 5) {
      tx.push({
        accountId: credit,
        date: dayIso(5),
        description: 'SPOTIFY USA',
        amount: money(-9.99),
        categoryId: catId('Subscriptions'),
      });
    }
    if (maxDay >= 15) {
      tx.push({
        accountId: checking,
        date: dayIso(15),
        description: 'ELECTRIC UTILITY',
        amount: money(-jitter(85, 0.25)),
        categoryId: catId('Utilities'),
      });
    }

    const merchants: Array<[string, string, number, number]> = [
      // description                         category           base   pct
      ['WHOLE FOODS MARKET',                 'Groceries',       75,    0.4],
      ["TRADER JOE'S",                       'Groceries',       55,    0.4],
      ['STARBUCKS',                          'Dining',          8,     0.3],
      ['SWEETGREEN',                         'Dining',          16,    0.3],
      ['CHIPOTLE',                           'Dining',          14,    0.3],
      ['UBER TRIP',                          'Transport',       22,    0.5],
      ['LYFT RIDE',                          'Transport',       18,    0.5],
      ['SHELL GAS',                          'Transport',       48,    0.3],
      ['AMAZON.COM',                         'Shopping',        45,    0.7],
      ['TARGET',                             'Shopping',        60,    0.5],
      ['AMC THEATRES',                       'Entertainment',   32,    0.2],
      ['STEAM PURCHASE',                     'Entertainment',   20,    0.5],
      ['CVS PHARMACY',                       'Health',          25,    0.4],
    ];

    // Boost Transport on the current month so it visibly blows past budget
    // — gives the demo a real "over budget" wedge to point at.
    const transportBoost = isCurrentMonth ? 2.5 : 1;

    for (let i = 0; i < 55; i++) {
      const [desc, cat, base, pct] = merchants[Math.floor(rand() * merchants.length)]!;
      const day = 1 + Math.floor(rand() * maxDay);
      const boost = cat === 'Transport' ? transportBoost : 1;
      const account = rand() < 0.7 ? credit : checking;
      tx.push({
        accountId: account,
        date: dayIso(day),
        description: desc,
        amount: money(-jitter(base, pct) * boost),
        categoryId: catId(cat),
      });
    }
  }

  logger.info({ count: tx.length }, 'Generating transactions');
  // Bulk insert to keep the seed quick — single INSERT with many VALUES rows.
  const values: unknown[] = [];
  const rowLiterals: string[] = [];
  tx.forEach((t, i) => {
    const base = i * 5;
    rowLiterals.push(
      `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}::numeric(14,2), $${base + 5})`,
    );
    values.push(t.accountId, t.date, t.description, t.amount, t.categoryId);
  });
  await pool.query(
    `INSERT INTO transactions (account_id, date, description, amount, category_id)
     VALUES ${rowLiterals.join(', ')}`,
    values,
  );

  // 6. Budgets for the current month — Transport limit is deliberately below
  //    its actual spend so the "over budget" state renders on the dashboard.
  const currentMonthDate = iso(currentMonthStart);
  const budgets: Array<[string, string]> = [
    ['Dining', '400.00'],
    ['Groceries', '600.00'],
    ['Transport', '150.00'],
    ['Entertainment', '150.00'],
    ['Shopping', '400.00'],
    ['Subscriptions', '50.00'],
  ];
  for (const [name, limit] of budgets) {
    await pool.query(
      `INSERT INTO budgets (user_id, category_id, month, amount_limit)
       VALUES ($1, $2, $3::date, $4)`,
      [userId, catId(name), currentMonthDate, limit],
    );
  }
  logger.info({ budgets: budgets.length, month: currentMonthDate }, 'Budgets set');

  logger.info(
    { email: DEMO.email, password: DEMO.password },
    'Demo seed complete — log in with these credentials',
  );
  await pool.end();
}

main().catch(async (err) => {
  logger.error({ err }, 'Demo seed failed');
  await pool.end().catch(() => undefined);
  process.exit(1);
});
