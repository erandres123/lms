import { z } from 'zod';

export const userRoleSchema = z.enum(['school_admin', 'teacher', 'student', 'parent']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const tenantIdSchema = z.uuid();

export const tenantSchema = z.object({
  id: tenantIdSchema,
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(160),
  timezone: z.string().min(1).default('Asia/Manila'),
});
export type Tenant = z.infer<typeof tenantSchema>;
