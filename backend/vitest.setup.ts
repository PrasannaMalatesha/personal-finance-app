// Test env defaults. If a value is already set (e.g. via CI job env or a real
// .env), respect it — this file only fills in blanks for local dev.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3002',
  LOG_LEVEL: 'fatal',
  DATABASE_URL: 'postgres://pfa:pfa_dev_password@localhost:5432/pfa_test',
  JWT_ACCESS_SECRET: 'test-access-secret-must-be-at-least-32-chars-long',
  JWT_REFRESH_SECRET: 'test-refresh-secret-must-be-at-least-32-chars-diff',
  FRONTEND_ORIGIN: 'http://localhost:5173',
  // v2 features on for tests so their endpoints are reachable. Individual
  // test files can override via env before importing.
  FLAG_RECURRING: 'true',
  FLAG_NET_WORTH: 'true',
  FLAG_HIERARCHICAL_CATEGORIES: 'true',
  FLAG_PASSWORD_RESET: 'true',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}
