export interface Me {
  userId: string;
  email?: string;
  tenantId: string;
  role: 'school_admin' | 'teacher' | 'student' | 'parent';
}

export interface Section {
  id: string;
  name: string;
  gradeLevel: number;
  schoolYear: string;
  teacherId: string | null;
  version: number;
}

export interface Period {
  id: string;
  name: string;
  schoolYear: string;
  sequence: number;
  version: number;
}

export interface GradeItem {
  id: string;
  title: string;
  maxScore: number;
  competencyCode: string | null;
  dueDate: string | null;
}

export interface GradeCategory {
  id: string;
  name: string;
  weight: number;
  sequence: number;
  items: GradeItem[];
}

export interface StudentCategoryResult {
  categoryId: string;
  percentage: number | null;
  earned: number;
  possible: number;
}

export interface GradeOverride {
  grade: number;
  reason: string;
  version: number;
  updatedAt: string;
}

export interface StudentRow {
  studentId: string;
  lrn: string | null;
  firstName: string;
  lastName: string;
  categories: StudentCategoryResult[];
  scores: Record<string, { score: number; version: number }>;
  percentage: number | null;
  transmutedGrade: number | null;
  effectiveGrade: number | null;
  override: GradeOverride | null;
}

export interface Gradebook {
  school: { id: string; name: string };
  adviserName: string | null;
  section: Section;
  period: Period;
  transmutationPolicy: string;
  weightsTotal: number;
  categories: GradeCategory[];
  students: StudentRow[];
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface RosterStudent {
  enrollmentId: string;
  enrollmentStatus: 'active' | 'transferred' | 'withdrawn';
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  lrn: string | null;
  version: number;
  createdAt: string;
}

export interface SectionRoster {
  section: Section;
  students: RosterStudent[];
}

export interface AttendanceRecord {
  id: string;
  sectionId: string;
  studentId: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  version: number;
  recordedBy: string;
  recordedAt: string;
}

export interface AttendanceSheet {
  date: string;
  records: AttendanceRecord[];
}

export interface RosterImportRowResult {
  rowNumber: number;
  firstName: string;
  lastName: string;
  lrn: string | null;
  studentId: string;
  status: 'created' | 'updated' | 'unchanged';
  enrolled: boolean;
}

export interface RosterImportReport {
  ok: boolean;
  errors: Array<{ rowNumber: number; message: string }>;
  summary: {
    rows: number;
    created: number;
    updated: number;
    unchanged: number;
    enrolled: number;
    alreadyEnrolled: number;
  } | null;
  results: RosterImportRowResult[];
}

export interface Competency {
  code: string;
  possible: number;
  items: Array<{ id: string; title: string; maxScore: number }>;
}

export interface CompetencyResult {
  code: string;
  earned: number;
  possible: number;
  percentage: number | null;
}

export interface CompetencyStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  lrn: string | null;
  results: CompetencyResult[];
}

export interface CompetencyReport {
  period: Period;
  policy: 'raw-percentage';
  competencies: Competency[];
  students: CompetencyStudent[];
}

export type MeetingStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

export interface Meeting {
  id: string;
  sectionId: string;
  title: string;
  provider: string;
  status: MeetingStatus;
  scheduledFor: string;
  durationMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
  joinable: boolean;
  providerConfigured: boolean;
}

export interface MeetingList {
  providerConfigured: boolean;
  meetings: Meeting[];
}

export interface JoinMeetingResult {
  url: string;
  token: string;
  roomName: string;
  role: 'moderator' | 'viewer';
  meeting: Meeting;
}

export interface MeetingParticipant {
  id: string;
  identity: string;
  userId: string | null;
  studentId: string | null;
  displayName: string | null;
  studentName: string | null;
  role: string;
  firstJoinedAt: string;
  lastLeftAt: string | null;
  totalSeconds: number;
}

export type NotificationKind = 'grade_posted' | 'absence_marked' | 'class_starting';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationInbox {
  items: NotificationItem[];
  unreadCount: number;
}

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

export interface StudentOption {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  lrn: string | null;
  version: number;
  createdAt: string;
}

export interface DsarExport {
  generatedAt: string;
  tenant: { id: string; name: string; timezone: string };
  student: {
    id: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    lrn: string | null;
    createdAt: string;
    updatedAt: string;
  };
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

export interface ErasurePlan {
  dryRun: true;
  studentId: string;
  generatedAt: string;
  categories: Array<{
    table: string;
    label: string;
    rows: number;
    action: ErasureAction;
    reason: string;
  }>;
  warnings: string[];
}

export interface PrivacyNotice {
  title: string;
  body: string;
}

export interface PrivacyNoticeSettings {
  notice: PrivacyNotice | null;
  version: number;
  updatedAt: string | null;
}

export type ConsentStatus = 'granted' | 'withdrawn';

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

export type GuardianAccessMode = 'admin_created' | 'email_invite' | 'magic_link';

export interface GuardianAccessSettings {
  mode: GuardianAccessMode;
  version: number;
  updatedAt: string | null;
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

export type RetentionCategoryKey =
  'notificationsReadDays' | 'staleDeviceDays' | 'processedEventDays' | 'syncReceiptDays';

export interface RetentionPolicy {
  runHour: number;
  notificationsReadDays: number | null;
  staleDeviceDays: number | null;
  processedEventDays: number | null;
  syncReceiptDays: number | null;
}

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

export interface RetentionRun {
  id: string;
  mode: 'dry_run';
  triggeredBy: 'manual' | 'schedule';
  totalRows: number;
  categories: RetentionCategoryPlan[];
  startedAt: string;
  finishedAt: string | null;
}

export interface RetentionOverview {
  settings: RetentionSettings;
  runs: RetentionRun[];
}
