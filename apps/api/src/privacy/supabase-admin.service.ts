import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { GuardianAccessMode } from '@lms/shared';

export interface GuardianAccountProvision {
  userId: string;
  temporaryPassword: string | null;
  invited: boolean;
}

interface SupabaseUser {
  id?: string;
  email?: string;
}

/**
 * Minimal Supabase Auth admin client. The service-role key is read from the
 * environment and never leaves this process; only the guardian routes use it.
 */
@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(
      this.config.get<string>('SUPABASE_URL') && this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  async provisionGuardian(input: {
    email: string;
    displayName: string;
    mode: GuardianAccessMode;
  }): Promise<GuardianAccountProvision> {
    const existing = await this.findUserIdByEmail(input.email);
    if (existing) {
      return { userId: existing, temporaryPassword: null, invited: false };
    }

    if (input.mode === 'email_invite') {
      const user = await this.request('/auth/v1/invite', {
        method: 'POST',
        body: { email: input.email, data: { display_name: input.displayName } },
      });
      return { userId: this.userId(user), temporaryPassword: null, invited: true };
    }

    const temporaryPassword = input.mode === 'admin_created' ? generatePassword() : null;
    const user = await this.request('/auth/v1/admin/users', {
      method: 'POST',
      body: {
        email: input.email,
        ...(temporaryPassword ? { password: temporaryPassword } : {}),
        email_confirm: true,
        user_metadata: { display_name: input.displayName },
      },
    });

    return {
      userId: this.userId(user),
      temporaryPassword,
      invited: false,
    };
  }

  private async findUserIdByEmail(email: string): Promise<string | null> {
    const data = await this.request(
      `/auth/v1/admin/users?page=1&per_page=200&filter=${encodeURIComponent(email)}`,
      { method: 'GET' },
      { allowNotFound: true },
    );
    const users = (data as { users?: SupabaseUser[] } | null)?.users ?? [];
    const match = users.find(
      (user) =>
        typeof user.id === 'string' &&
        user.id.length > 0 &&
        user.email?.toLowerCase() === email.toLowerCase(),
    );
    return match?.id ?? null;
  }

  private userId(payload: unknown): string {
    const id = (payload as SupabaseUser | null)?.id;
    if (!id) throw new BadRequestException('Supabase did not return a user id');
    return id;
  }

  private async request(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
    options: { allowNotFound?: boolean } = {},
  ): Promise<unknown> {
    const url = this.config.get<string>('SUPABASE_URL')?.replace(/\/+$/, '');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      throw new ServiceUnavailableException(
        'guardian account provisioning is not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${url}${path}`, {
        method: init.method,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      });
    } catch (error) {
      this.logger.error(`Supabase admin request failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('could not reach Supabase Auth');
    }

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (response.ok) return data;
    if (options.allowNotFound && response.status === 404) return null;

    const detail =
      (data as { msg?: string; message?: string; error_description?: string } | null)?.msg ??
      (data as { message?: string } | null)?.message ??
      (data as { error_description?: string } | null)?.error_description ??
      `Supabase Auth responded ${response.status}`;

    if (response.status === 422 || response.status === 409) {
      throw new ConflictException(detail);
    }
    this.logger.warn(`Supabase admin request ${path} failed (${response.status}): ${detail}`);
    throw new BadRequestException(detail);
  }
}

function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}
