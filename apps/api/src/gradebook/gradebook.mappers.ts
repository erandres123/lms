import type {
  gradeCategories,
  gradeItems,
  gradeOverrides,
  grades,
  gradingPeriods,
} from '../database/schema';

export type GradingPeriodRow = typeof gradingPeriods.$inferSelect;
export type GradeCategoryRow = typeof gradeCategories.$inferSelect;
export type GradeItemRow = typeof gradeItems.$inferSelect;
export type GradeRow = typeof grades.$inferSelect;
export type GradeOverrideRow = typeof gradeOverrides.$inferSelect;

export function toGradingPeriod(row: GradingPeriodRow) {
  return {
    id: row.id,
    name: row.name,
    schoolYear: row.schoolYear,
    sequence: row.sequence,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    version: row.version,
  };
}

export function toGradeCategory(row: GradeCategoryRow) {
  return {
    id: row.id,
    sectionId: row.sectionId,
    periodId: row.periodId,
    name: row.name,
    weight: row.weight,
    sequence: row.sequence,
    version: row.version,
  };
}

export function toGradeItem(row: GradeItemRow) {
  return {
    id: row.id,
    sectionId: row.sectionId,
    periodId: row.periodId,
    categoryId: row.categoryId,
    title: row.title,
    maxScore: row.maxScore,
    competencyCode: row.competencyCode,
    dueDate: row.dueDate,
    version: row.version,
  };
}

export function toGrade(row: GradeRow) {
  return {
    id: row.id,
    itemId: row.itemId,
    studentId: row.studentId,
    score: row.score,
    enteredBy: row.enteredBy,
    version: row.version,
    recordedAt: row.recordedAt.toISOString(),
  };
}

export function toGradeOverride(row: GradeOverrideRow) {
  return {
    id: row.id,
    sectionId: row.sectionId,
    periodId: row.periodId,
    studentId: row.studentId,
    grade: row.grade,
    reason: row.reason,
    overriddenBy: row.overriddenBy,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}
