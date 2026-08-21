import rateLimit from 'express-rate-limit';

// Tests share one long-lived process and one apparent IP, so a real rate
// limiter would blackhole the suite after a handful of signups. Bump every
// ceiling in test env; the limiter behavior itself gets its own dedicated
// test (see tests/integration/rateLimit.test.ts) that mounts a fresh app
// with tight limits.
const isTest = process.env.NODE_ENV === 'test';

export const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 10_000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many login attempts. Try again in a minute.',
    },
  },
});

/**
 * Signup is expensive (bcrypt + seeds + inserts) and is a common target for
 * mass-account creation scripts. 3-per-hour-per-IP is generous for humans
 * and hostile to bots.
 */
export const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isTest ? 10_000 : 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many accounts created from this IP. Try again in an hour.',
    },
  },
});

/**
 * Blanket ceiling on the entire API surface — catches enumeration scans,
 * credential-stuffing spread across endpoints, misbehaving clients. 200
 * req/min is far above any legitimate UI usage (dashboard refresh spikes
 * at ~10 requests) but bites obvious abuse.
 */
export const globalApiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 100_000 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Slow down and try again shortly.',
    },
  },
  // Skip the health endpoint so uptime pings don't count against the ceiling.
  skip: (req) => req.path === '/healthz',
});

// A little slower than login — this one triggers side effects (email
// sends). Same 5-per-minute-per-IP ceiling protects against enumeration
// scans and mail-bomb attempts on someone else's inbox.
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 10_000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many reset requests. Try again in a minute.',
    },
  },
});
