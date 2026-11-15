import { z } from 'zod';

export interface DsarStudent {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  lrn: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DsarExport {
  generatedAt: string;
  tenant: { id: string; name: string; timezone: string };
  student: DsarStudent;
  account: { userId: string; email: string; displayName: string | null } | null;
  enrollments: Array<{
    sectionId: string;
    sectionName: string;
    gradeLevel: number;
    schoolYear: string;
    status: string;
    enrolledAt: string;
  }>;
  attendance: Array<{
    date: string;
    sectionId: string;
    sectionName: string;
    status: string;
    note: string | null;
    recordedAt: string;
  }>;
  grades: Array<{
    itemId: string;
    itemTitle: string;
    categoryName: string;
    periodName: string;
    sectionId: string;
    sectionName: string;
    score: number;
    maxScore: number;
    recordedAt: string;
  }>;
  gradeOverrides: Array<{
    sectionId: string;
    sectionName: string;
    periodName: string;
    grade: number;
    reason: string;
    createdAt: string;
  }>;
  notifications: Array<{
    kind: string;
    title: string;
    body: string;
    createdAt: string;
    readAt: string | null;
  }>;
  pushDevices: Array<{ platform: string; createdAt: string; lastSeenAt: string }>;
  meetingParticipation: Array<{
    meetingId: string;
    meetingTitle: string;
    sectionName: string;
    role: string;
    firstJoinedAt: string;
    lastLeftAt: string | null;
    totalSeconds: number;
  }>;
}

export type ErasureAction = 'anonymize' | 'delete' | 'retain';

export interface ErasureCategory {
  table: string;
  label: string;
  rows: number;
  action: ErasureAction;
  reason: string;
}

export interface ErasurePlan {
  dryRun: true;
  studentId: string;
  generatedAt: string;
  categories: ErasureCategory[];
  warnings: string[];
}

export const privacyNoticeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
});

export type PrivacyNotice = z.infer<typeof privacyNoticeSchema>;

export interface PrivacyNoticeSettings {
  notice: PrivacyNotice | null;
  version: number;
  updatedAt: string | null;
}

export const privacyNoticeUpdateSchema = z.object({
  notice: privacyNoticeSchema,
  version: z.number().int().min(0).optional(),
});

export type PrivacyNoticeUpdateInput = z.infer<typeof privacyNoticeUpdateSchema>;

export const consentStatusSchema = z.enum(['granted', 'withdrawn']);
export type ConsentStatus = z.infer<typeof consentStatusSchema>;

export const consentCaptureSchema = z.object({
  guardianName: z.string().trim().min(1).max(200),
  guardianRelationship: z.string().trim().min(1).max(80),
  guardianContact: z.string().trim().max(200).nullish(),
  status: consentStatusSchema,
  note: z.string().trim().max(1000).nullish(),
});

export type ConsentCaptureInput = z.infer<typeof consentCaptureSchema>;

export interface ConsentRecord {
  id: string;
  studentId: string;
  studentName: string;
  guardianName: string;
  guardianRelationship: string;
  guardianContact: string | null;
  status: ConsentStatus;
  noticeVersion: number;
  note: string | null;
  capturedAt: string;
  capturedByName: string | null;
}

export interface PrivacyConsentOverview {
  notice: PrivacyNoticeSettings;
  consents: ConsentRecord[];
}

export const guardianAccessModeSchema = z.enum([
  'admin_created',
  'email_invite',
  'magic_link',
]);
export type GuardianAccessMode = z.infer<typeof guardianAccessModeSchema>;

export const DEFAULT_GUARDIAN_ACCESS_MODE: GuardianAccessMode = 'admin_created';

export interface GuardianAccessSettings {
  mode: GuardianAccessMode;
  version: number;
  updatedAt: string | null;
}

export const guardianAccessUpdateSchema = z.object({
  mode: guardianAccessModeSchema,
  version: z.number().int().min(0).optional(),
});

export type GuardianAccessUpdateInput = z.infer<typeof guardianAccessUpdateSchema>;

export const guardianCreateSchema = z.object({
  email: z.email().max(254),
  displayName: z.string().trim().min(1).max(200),
  relationship: z.string().trim().min(1).max(80),
  studentId: z.uuid(),
});

export type GuardianCreateInput = z.infer<typeof guardianCreateSchema>;

export interface GuardianAccountResult {
  guardianUserId: string;
  email: string;
  displayName: string;
  studentId: string;
  relationship: string;
  mode: GuardianAccessMode;
  invited: boolean;
  temporaryPassword: string | null;
}

export interface GuardianLink {
  id: string;
  guardianUserId: string;
  email: string;
  displayName: string | null;
  studentId: string;
  studentName: string;
  relationship: string;
  createdAt: string;
}

export const guardianConsentCaptureSchema = z.object({
  status: consentStatusSchema,
  note: z.string().trim().max(1000).nullish(),
});

export type GuardianConsentCaptureInput = z.infer<typeof guardianConsentCaptureSchema>;

export interface GuardianStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  consentStatus: ConsentStatus | null;
  consentNoticeVersion: number | null;
  consentAt: string | null;
}

export interface GuardianOverview {
  notice: PrivacyNoticeSettings;
  students: GuardianStudent[];
}

