import { authClaimsSchema } from '@lms/shared';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AuthUser } from './auth.types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly secret?: Uint8Array;
  private readonly audience: string;
  private readonly issuer?: string;

  constructor(config: ConfigService) {
    const supabaseUrl = config.get<string>('SUPABASE_URL');
    const secret = config.get<string>('SUPABASE_JWT_SECRET');
    this.audience = config.get<string>('SUPABASE_JWT_AUDIENCE', 'authenticated');

    if (supabaseUrl) {
      const base = supabaseUrl.replace(/\/$/, '');
      this.jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
      this.issuer = `${base}/auth/v1`;
    }
    if (secret) {
      this.secret = new TextEncoder().encode(secret);
    }
    if (!this.jwks && !this.secret) {
      this.logger.warn('No Supabase auth configured; protected routes will reject every request.');
    }
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    const invalid = () => new UnauthorizedException('invalid or expired token');

    if (this.jwks) {
      try {
        const { payload } = await jwtVerify(token, this.jwks, {
          algorithms: ['ES256', 'RS256'],
          audience: this.audience,
          ...(this.issuer ? { issuer: this.issuer } : {}),
        });
        return this.toAuthUser(payload);
      } catch (error) {
        // A validly signed token with bad claims is final; otherwise a local
        // dev token may be HS256, so fall through when a dev secret exists.
        if (error instanceof UnauthorizedException) throw error;
        if (!this.secret) throw invalid();
      }
    }

    if (!this.secret) {
      throw new UnauthorizedException('auth is not configured');
    }

    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
        audience: this.audience,
      });
      return this.toAuthUser(payload);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw invalid();
    }
  }

  private toAuthUser(payload: JWTPayload): AuthUser {
    const claims = authClaimsSchema.safeParse(payload);
    if (!claims.success) {
      throw new UnauthorizedException('token is missing tenant claims');
    }

    return {
      userId: claims.data.sub,
      email: claims.data.email,
      tenantId: claims.data.tenant_id,
      role: claims.data.app_role,
    };
  }
}
