import type { AuditEntry, AuditPage, AuditQuery } from '@lms/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import * as schema from '../database/schema';

const CURSOR_DELIMITER = '|';

function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const index = cursor.indexOf(CURSOR_DELIMITER);
  if (index < 0) return null;

  const createdAt = new Date(cursor.slice(0, index));
  const id = cursor.slice(index + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  list(user: AuthUser, query: AuditQuery): Promise<AuditPage> {
    const cursor = query.cursor ? parseCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new BadRequestException('invalid audit cursor');

    return this.database.withTenant(user.tenantId, async (tx) => {
      const [tenant] = await tx
        .select({ timezone: schema.tenants.timezone })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, user.tenantId))
        .limit(1);
      const timezone = tenant?.timezone ?? 'Asia/Manila';

      const filters: SQL[] = [eq(schema.auditLog.tenantId, user.tenantId)];
      if (query.actorId) filters.push(eq(schema.auditLog.actorId, query.actorId));
      if (query.action) filters.push(eq(schema.auditLog.action, query.action));
      if (query.entity) filters.push(eq(schema.auditLog.entity, query.entity));
      if (query.entityId) filters.push(eq(schema.auditLog.entityId, query.entityId));
      if (query.from) {
        filters.push(
          sql`(${schema.auditLog.createdAt} at time zone ${timezone})::date >= ${query.from}::date`,
        );
      }
      if (query.to) {
        filters.push(
          sql`(${schema.auditLog.createdAt} at time zone ${timezone})::date <= ${query.to}::date`,
        );
      }
      if (cursor) {
        filters.push(
          or(
            lt(schema.auditLog.createdAt, cursor.createdAt),
            and(
              eq(schema.auditLog.createdAt, cursor.createdAt),
              lt(schema.auditLog.id, cursor.id),
            ),
          )!,
        );
      }

      const rows = await tx
        .select({
          id: schema.auditLog.id,
          actorId: schema.auditLog.actorId,
          action: schema.auditLog.action,
          entity: schema.auditLog.entity,
          entityId: schema.auditLog.entityId,
          metadata: schema.auditLog.metadata,
          createdAt: schema.auditLog.createdAt,
          actorEmail: schema.users.email,
          actorName: schema.users.displayName,
        })
        .from(schema.auditLog)
        .leftJoin(schema.users, eq(schema.auditLog.actorId, schema.users.id))
        .where(and(...filters))
        .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
        .limit(query.limit + 1);

      const hasMore = rows.length > query.limit;
      const page = hasMore ? rows.slice(0, query.limit) : rows;
      const last = page[page.length - 1];

      const entries: AuditEntry[] = page.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorEmail: row.actorEmail ?? null,
        actorName: row.actorName ?? null,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      }));

      return {
        entries,
        nextCursor: hasMore && last ? `${last.createdAt.toISOString()}${CURSOR_DELIMITER}${last.id}` : null,
        timeZone: timezone,
      };
    });
  }
}
