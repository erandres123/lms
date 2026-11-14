import { z } from 'zod';
import { isoDateSchema, schoolYearSchema } from './academic';

export const createGradingPeriodSchema = z.object({
  name: z.string().min(1).max(40),
  schoolYear: schoolYearSchema,
  sequence: z.number().int().min(1).max(10),
  startsOn: isoDateSchema.optional(),
  endsOn: isoDateSchema.optional(),
});
export type CreateGradingPeriodInput = z.infer<typeof createGradingPeriodSchema>;

export const createGradeCategorySchema = z.object({
  periodId: z.uuid(),
  name: z.string().min(1).max(60),
  weight: z.number().min(0).max(100),
  sequence: z.number().int().min(1).max(20).default(1),
});
export type CreateGradeCategoryInput = z.infer<typeof createGradeCategorySchema>;

export const createGradeItemSchema = z.object({
  periodId: z.uuid(),
  categoryId: z.uuid(),
  title: z.string().min(1).max(160),
  maxScore: z.number().positive().max(1000),
  competencyCode: z.string().max(40).optional(),
  dueDate: isoDateSchema.optional(),
});
export type CreateGradeItemInput = z.infer<typeof createGradeItemSchema>;

export const saveGradesSchema = z.object({
  itemId: z.uuid(),
  entries: z
    .array(
      z.object({
        studentId: z.uuid(),
        score: z.number().min(0).max(1000),
        baseVersion: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type SaveGradesInput = z.infer<typeof saveGradesSchema>;

export const gradeOverrideSchema = z.object({
  periodId: z.uuid(),
  studentId: z.uuid(),
  grade: z.number().min(0).max(100),
  reason: z.string().min(3).max(300),
  baseVersion: z.number().int().positive().optional(),
});
export type GradeOverrideInput = z.infer<typeof gradeOverrideSchema>;

export const gradebookQuerySchema = z.object({
  periodId: z.uuid(),
});
export type GradebookQuery = z.infer<typeof gradebookQuerySchema>;
