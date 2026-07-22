process.env.NODE_ENV = 'test';
process.env.PORT = '3002';
process.env.LOG_LEVEL = 'fatal';
process.env.DATABASE_URL = 'postgres://pfa:pfa_dev_password@localhost:5432/pfa_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-must-be-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-must-be-at-least-32-chars-diff';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
