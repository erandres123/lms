import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseAdminService } from './supabase-admin.service';

const values: Record<string, string | undefined> = {
  SUPABASE_URL: 'https://example.supabase.co/',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

function service(): SupabaseAdminService {
  return new SupabaseAdminService({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

describe('SupabaseAdminService', () => {
  it('creates a password account and returns the one-time password', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ users: [] }))
      .mockResolvedValueOnce(json({ id: 'user-1', email: 'a@school.ph' }));

    const result = await service().provisionGuardian({
      email: 'a@school.ph',
      displayName: 'Guardian A',
      mode: 'admin_created',
    });

    expect(result).toMatchObject({ userId: 'user-1', invited: false });
    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe('https://example.supabase.co/auth/v1/admin/users');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ apikey: 'service-role-key' });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      email: 'a@school.ph',
      password: result.temporaryPassword,
      email_confirm: true,
      user_metadata: { display_name: 'Guardian A' },
    });
  });

  it('sends an invite without a password', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ users: [] }))
      .mockResolvedValueOnce(json({ id: 'user-2' }));

    const result = await service().provisionGuardian({
      email: 'b@school.ph',
      displayName: 'Guardian B',
      mode: 'email_invite',
    });

    expect(result).toEqual({ userId: 'user-2', temporaryPassword: null, invited: true });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe('https://example.supabase.co/auth/v1/invite');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'b@school.ph',
      data: { display_name: 'Guardian B' },
    });
  });

  it('creates a passwordless account for magic-link sign-in', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ users: [] }))
      .mockResolvedValueOnce(json({ id: 'user-3' }));

    const result = await service().provisionGuardian({
      email: 'c@school.ph',
      displayName: 'Guardian C',
      mode: 'magic_link',
    });

    expect(result).toEqual({ userId: 'user-3', temporaryPassword: null, invited: false });
    const [, init] = fetchMock.mock.calls[1]!;
    const body = JSON.parse(String(init?.body));
    expect(body.password).toBeUndefined();
    expect(body.email_confirm).toBe(true);
  });

  it('reuses an existing Supabase user instead of creating another', async () => {
    fetchMock.mockResolvedValueOnce(json({ users: [{ id: 'existing-1', email: 'd@school.ph' }] }));

    const result = await service().provisionGuardian({
      email: 'd@school.ph',
      displayName: 'Guardian D',
      mode: 'admin_created',
    });

    expect(result).toEqual({ userId: 'existing-1', temporaryPassword: null, invited: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/auth/v1/admin/users?');
  });

  it('ignores fuzzy search hits for a different email', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ users: [{ id: 'other-1', email: 'dee@school.ph' }] }))
      .mockResolvedValueOnce(json({ id: 'new-1', email: 'd@school.ph' }));

    const result = await service().provisionGuardian({
      email: 'd@school.ph',
      displayName: 'Guardian D',
      mode: 'admin_created',
    });

    expect(result.userId).toBe('new-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('turns a duplicate-email rejection into a conflict', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ users: [] }))
      .mockResolvedValueOnce(json({ msg: 'User already registered' }, 422));

    await expect(
      service().provisionGuardian({
        email: 'e@school.ph',
        displayName: 'Guardian E',
        mode: 'admin_created',
      }),
    ).rejects.toThrow(/already registered/);
  });

  it('refuses to provision when the service-role key is missing', async () => {
    const previous = values.SUPABASE_SERVICE_ROLE_KEY;
    values.SUPABASE_SERVICE_ROLE_KEY = undefined;
    try {
      await expect(
        service().provisionGuardian({
          email: 'f@school.ph',
          displayName: 'Guardian F',
          mode: 'admin_created',
        }),
      ).rejects.toThrow(/not configured/);
    } finally {
      values.SUPABASE_SERVICE_ROLE_KEY = previous;
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
