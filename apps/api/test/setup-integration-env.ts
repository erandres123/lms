const testUrl = process.env.TEST_DATABASE_URL;

if (testUrl) {
  process.env.DATABASE_URL = testUrl;
}
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://lms:lms@localhost:5432/lms';
process.env.SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ?? 'test-only-secret-change-me-0123456789';
process.env.SUPABASE_JWT_AUDIENCE = process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated';
