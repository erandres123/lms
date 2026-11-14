import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgres://lms:lms@localhost:5432/lms',
};

describe('validateEnv', () => {
  it('applies defaults for optional settings', () => {
    const env = validateEnv(base);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.SUPABASE_URL).toBeUndefined();
  });

  it('splits and trims CORS origins', () => {
    const env = validateEnv({
      ...base,
      CORS_ORIGINS: 'http://localhost:3000, https://school.example.ph ',
    });

    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://school.example.ph']);
  });

  it('coerces PORT from a string', () => {
    const env = validateEnv({ ...base, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('treats empty Supabase values as unset', () => {
    const env = validateEnv({ ...base, SUPABASE_URL: '', SUPABASE_JWT_SECRET: '' });

    expect(env.SUPABASE_URL).toBeUndefined();
    expect(env.SUPABASE_JWT_SECRET).toBeUndefined();
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects an invalid PORT', () => {
    expect(() => validateEnv({ ...base, PORT: '70000' })).toThrow(/PORT/);
  });

  it('requires Supabase auth configuration in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/SUPABASE/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...base, SUPABASE_JWT_SECRET: 'too-short' })).toThrow(
      /SUPABASE_JWT_SECRET/,
    );
  });
});
