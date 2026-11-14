import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types';
import type { Database } from '../database/database.service';
import * as schema from '../database/schema';

export type SectionRow = typeof schema.sections.$inferSelect;

@Injectable()
export class SectionAccessService {
  async requireSection(
    tx: Database,
    tenantId: string,
    sectionId: string,
  ): Promise<SectionRow> {
    const [section] = await tx
      .select()
      .from(schema.sections)
      .where(and(eq(schema.sections.id, sectionId), eq(schema.sections.tenantId, tenantId)))
      .limit(1);

    if (!section) throw new NotFoundException('section not found');
    return section;
  }

  async requireReadAccess(
    tx: Database,
    user: AuthUser,
    section: SectionRow,
  ): Promise<void> {
    if (user.role === 'school_admin') return;

    if (user.role === 'teacher') {
      if (section.teacherId === user.userId) return;
      throw new ForbiddenException('not assigned to this section');
    }

    if (user.role === 'student') {
      const [row] = await tx
        .select({ id: schema.enrollments.id })
        .from(schema.enrollments)
        .innerJoin(schema.students, eq(schema.students.id, schema.enrollments.studentId))
        .where(
          and(
            eq(schema.enrollments.tenantId, user.tenantId),
            eq(schema.enrollments.sectionId, section.id),
            eq(schema.enrollments.status, 'active'),
            eq(schema.students.userId, user.userId),
          ),
        )
        .limit(1);

      if (row) return;
      throw new ForbiddenException('not enrolled in this section');
    }

    throw new ForbiddenException();
  }

  requireWriteAccess(user: AuthUser, section: SectionRow): void {
    if (user.role === 'school_admin') return;
    if (user.role === 'teacher' && section.teacherId === user.userId) return;
    throw new ForbiddenException('not assigned to this section');
  }
}
