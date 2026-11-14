import { z } from 'zod';
import { userRoleSchema } from './tenancy';

/**
 * Claims injected by the Supabase custom access token hook. `app_role` is
 * deliberately not `role`: Supabase uses `role` for `authenticated`/`anon`.
 */
export const authClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.email().optional(),
  tenant_id: z.uuid(),
  app_role: userRoleSchema,
});

export type AuthClaims = z.infer<typeof authClaimsSchema>;
