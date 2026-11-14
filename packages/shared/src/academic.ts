import { z } from 'zod';

export const attendanceStatusSchema = z.enum(['present', 'absent', 'late', 'excused']);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const enrollmentStatusSchema = z.enum(['active', 'transferred', 'withdrawn']);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

export const schoolYearSchema = z.string().regex(/^\d{4}-\d{4}$/, 'use YYYY-YYYY');
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'invalid calendar date');

export const createStudentSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  lrn: z
    .string()
    .regex(/^\d{12}$/, 'LRN must be 12 digits')
    .optional(),
  userId: z.uuid().optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const createSectionSchema = z.object({
  name: z.string().min(1).max(80),
  gradeLevel: z.number().int().min(0).max(12),
  schoolYear: schoolYearSchema,
  teacherId: z.uuid().optional(),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const enrollStudentsSchema = z.object({
  studentIds: z.array(z.uuid()).min(1).max(200),
});
export type EnrollStudentsInput = z.infer<typeof enrollStudentsSchema>;

export const attendanceEntrySchema = z.object({
  studentId: z.uuid(),
  status: attendanceStatusSchema,
  note: z.string().max(200).optional(),
  baseVersion: z.number().int().positive().optional(),
});
export type AttendanceEntryInput = z.infer<typeof attendanceEntrySchema>;

export const saveAttendanceSchema = z.object({
  date: isoDateSchema,
  entries: z.array(attendanceEntrySchema).min(1).max(200),
});
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
