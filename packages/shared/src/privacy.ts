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
