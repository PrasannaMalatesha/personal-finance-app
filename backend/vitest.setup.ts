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
  FLAG_RULE_LEARNING: 'true',
  FLAG_OAUTH: 'true',
  // Enable the OAuth routes in tests. The credentials are fake but valid-
  // shaped — /start only builds a URL string, /callback is covered by unit
  // tests where the adapter is stubbed directly.
  GOOGLE_OAUTH_CLIENT_ID: 'test-google-client-id.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'test-google-client-secret',
  API_BASE_URL: 'http://localhost:3002',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}
