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
