import { z } from 'zod';

const booleanFromString = z
  .string()
  .default('false')
  .transform((s) => s === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32, 'must be >= 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'must be >= 32 chars'),
    COOKIE_DOMAIN: z.string().default(''),
    FRONTEND_ORIGIN: z.string().url(),
    SENTRY_DSN: z.string().optional(),
    FLAG_PLAID: booleanFromString,
    FLAG_RECURRING: booleanFromString,
    FLAG_MULTI_CURRENCY: booleanFromString,
    FLAG_NET_WORTH: booleanFromString,
    FLAG_HIERARCHICAL_CATEGORIES: booleanFromString,
    FLAG_PASSWORD_RESET: booleanFromString,
    FLAG_RULE_LEARNING: booleanFromString,
    FLAG_OAUTH: booleanFromString,
    // Optional. When set, password reset emails are sent via Resend; when
    // absent, the console adapter logs the reset URL to stdout instead.
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().optional(),
    // Plaid — sandbox tier for the demo. Both keys required together to
    // enable the /plaid/* routes; when either is missing, the service throws
    // a clear "not configured" error and the frontend hides the Connect UI.
    PLAID_CLIENT_ID: z.string().optional(),
    PLAID_SECRET: z.string().optional(),
    PLAID_ENV: z.enum(['sandbox', 'development', 'production']).default('sandbox'),
    // Google OAuth — both required together to enable /auth/oauth/google/*.
    // API_BASE_URL is the public origin of this backend, used to build the
    // Google redirect URI (must exactly match what's registered in the
    // Google console). Defaults to http://localhost:3001 in dev.
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    API_BASE_URL: z.string().url().default('http://localhost:3001'),
  })
  .refine((data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ',
    path: ['JWT_REFRESH_SECRET'],
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Environment validation failed:');
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
