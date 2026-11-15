import { z } from 'zod';
import { isoDateSchema } from './academic';

export const auditQuerySchema = z.object({
  actorId: z.uuid().optional(),
  action: z.string().trim().min(1).max(80).optional(),
  entity: z.string().trim().min(1).max(80).optional(),
  entityId: z.string().trim().min(1).max(120).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(120).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  nextCursor: string | null;
  timeZone: string;
}
