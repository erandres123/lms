import { z } from 'zod';

const retentionDays = z.number().int().min(1).max(3650);

export const retentionPolicySchema = z.object({
  runHour: z.number().int().min(0).max(23),
  notificationsReadDays: retentionDays.nullable(),
  staleDeviceDays: retentionDays.nullable(),
  processedEventDays: retentionDays.nullable(),
  syncReceiptDays: retentionDays.nullable(),
});

export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

export type RetentionCategoryKey =
  'notificationsReadDays' | 'staleDeviceDays' | 'processedEventDays' | 'syncReceiptDays';

export const RETENTION_CATEGORY_KEYS: RetentionCategoryKey[] = [
  'notificationsReadDays',
  'staleDeviceDays',
  'processedEventDays',
  'syncReceiptDays',
];

export const EMPTY_RETENTION_POLICY: RetentionPolicy = {
  runHour: 2,
  notificationsReadDays: null,
  staleDeviceDays: null,
  processedEventDays: null,
  syncReceiptDays: null,
};

export function isRetentionEnabled(policy: RetentionPolicy): boolean {
  return RETENTION_CATEGORY_KEYS.some((key) => policy[key] !== null);
}

export const retentionUpdateSchema = z.object({
  policy: retentionPolicySchema,
  version: z.number().int().min(0).optional(),
});

export type RetentionUpdateInput = z.infer<typeof retentionUpdateSchema>;

export interface RetentionSettings {
  policy: RetentionPolicy;
  version: number;
  updatedAt: string | null;
}

export interface RetentionCategoryPlan {
  key: RetentionCategoryKey;
  label: string;
  table: string;
  enabled: boolean;
  cutoff: string | null;
  rows: number;
}

export type RetentionRunTrigger = 'manual' | 'schedule';

export interface RetentionRun {
  id: string;
  mode: 'dry_run';
  triggeredBy: RetentionRunTrigger;
  totalRows: number;
  categories: RetentionCategoryPlan[];
  startedAt: string;
  finishedAt: string | null;
}

export interface RetentionOverview {
  settings: RetentionSettings;
  runs: RetentionRun[];
}
