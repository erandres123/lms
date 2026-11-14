import type { attendance, enrollments, sections, students } from '../database/schema';

export type SectionRow = typeof sections.$inferSelect;
export type StudentRow = typeof students.$inferSelect;
export type EnrollmentRow = typeof enrollments.$inferSelect;
export type AttendanceRow = typeof attendance.$inferSelect;

export function toSection(row: SectionRow) {
  return {
    id: row.id,
    name: row.name,
    gradeLevel: row.gradeLevel,
    schoolYear: row.schoolYear,
    teacherId: row.teacherId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toStudent(row: StudentRow) {
  return {
    id: row.id,
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    lrn: row.lrn,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toEnrollment(row: EnrollmentRow) {
  return {
    id: row.id,
    sectionId: row.sectionId,
    studentId: row.studentId,
    status: row.status,
    version: row.version,
    enrolledAt: row.enrolledAt.toISOString(),
  };
}

export function toAttendance(row: AttendanceRow) {
  return {
    id: row.id,
    sectionId: row.sectionId,
    studentId: row.studentId,
    date: row.date,
    status: row.status,
    note: row.note,
    version: row.version,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt.toISOString(),
  };
}
