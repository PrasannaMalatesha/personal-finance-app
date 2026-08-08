import rateLimit from 'express-rate-limit';

export const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many login attempts. Try again in a minute.',
    },
  },
});

// A little slower than login — this one triggers side effects (email
// sends). Same 5-per-minute-per-IP ceiling protects against enumeration
// scans and mail-bomb attempts on someone else's inbox.
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many reset requests. Try again in a minute.',
    },
  },
});
