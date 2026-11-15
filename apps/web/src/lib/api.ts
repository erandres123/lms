import type {
  AttendanceSheet,
  AttendanceStatus,
  AuditPage,
  CompetencyReport,
  DsarExport,
  ErasurePlan,
  Gradebook,
  GuardianAccessMode,
  GuardianAccessSettings,
  GuardianAccountResult,
  GuardianLink,
  JoinMeetingResult,
  Me,
  Meeting,
  MeetingList,
  MeetingParticipant,
  NotificationInbox,
  NotificationItem,
  Period,
  PrivacyConsentOverview,
  PrivacyNotice,
  PrivacyNoticeSettings,
  RetentionOverview,
  RetentionPolicy,
  RetentionRun,
  RetentionSettings,
  RosterImportReport,
  Section,
  SectionRoster,
  StudentOption,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

export interface SyncConflictPayload {
  message: string;
  studentId?: string;
  current?: { status?: AttendanceStatus; version?: number } | null;
}

export type SyncPushOutcomeApi =
  | { clientOpId: string; status: 'applied' }
  | {
      clientOpId: string;
      status: 'duplicate';
      storedStatus: 'applied' | 'conflict';
      conflict?: SyncConflictPayload;
    }
  | { clientOpId: string; status: 'conflict'; conflict: SyncConflictPayload }
  | { clientOpId: string; status: 'rejected'; message: string };

export interface SyncPushResponse {
  results: SyncPushOutcomeApi[];
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as {
        message?: unknown;
        issues?: Array<{ path: string; message: string }>;
      };
      if (typeof body.message === 'string') message = body.message;
      if (Array.isArray(body.issues) && body.issues.length > 0) {
        message = body.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
      }
    } catch {
      // keep the generic message
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export const api = {
  me: (token: string) => request<Me>('/me', token),
  sections: (token: string) => request<Section[]>('/sections', token),
  periods: (token: string) => request<Period[]>('/grading-periods', token),
  gradebook: (token: string, sectionId: string, periodId: string) =>
    request<Gradebook>(`/sections/${sectionId}/gradebook?periodId=${periodId}`, token),
  competencies: (token: string, sectionId: string, periodId: string) =>
    request<CompetencyReport>(`/sections/${sectionId}/competencies?periodId=${periodId}`, token),
  saveGrades: (
    token: string,
    sectionId: string,
    body: {
      itemId: string;
      entries: Array<{ studentId: string; score: number; baseVersion?: number }>;
    },
  ) =>
    request(`/sections/${sectionId}/grades`, token, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  setOverride: (
    token: string,
    sectionId: string,
    body: {
      periodId: string;
      studentId: string;
      grade: number;
      reason: string;
      baseVersion?: number;
    },
  ) =>
    request(`/sections/${sectionId}/grade-overrides`, token, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  meetings: (token: string, sectionId: string) =>
    request<MeetingList>(`/sections/${sectionId}/meetings`, token),
  createMeeting: (
    token: string,
    sectionId: string,
    body: { title: string; scheduledFor: string; durationMinutes: number },
  ) =>
    request<Meeting>(`/sections/${sectionId}/meetings`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  startMeeting: (token: string, meetingId: string) =>
    request<Meeting>(`/meetings/${meetingId}/start`, token, { method: 'POST' }),
  endMeeting: (token: string, meetingId: string) =>
    request<Meeting>(`/meetings/${meetingId}/end`, token, { method: 'POST' }),
  joinMeeting: (token: string, meetingId: string) =>
    request<JoinMeetingResult>(`/meetings/${meetingId}/join`, token, { method: 'POST' }),
  meetingParticipants: (token: string, meetingId: string) =>
    request<MeetingParticipant[]>(`/meetings/${meetingId}/participants`, token),
  roster: (token: string, sectionId: string) =>
    request<SectionRoster>(`/sections/${sectionId}/roster`, token),
  attendance: (token: string, sectionId: string, date: string) =>
    request<AttendanceSheet>(`/sections/${sectionId}/attendance?date=${date}`, token),
  saveAttendance: (
    token: string,
    sectionId: string,
    body: {
      date: string;
      entries: Array<{
        studentId: string;
        status: AttendanceStatus;
        note?: string;
        baseVersion?: number;
      }>;
    },
  ) =>
    request(`/sections/${sectionId}/attendance`, token, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  importRoster: async (token: string, sectionId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);

    const response = await fetch(`${API_URL}/sections/${sectionId}/roster/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (!response.ok) {
      let message = `Import failed (${response.status})`;
      try {
        const body = (await response.json()) as { message?: unknown };
        if (typeof body.message === 'string') message = body.message;
      } catch {
        // keep the generic message
      }
      throw new ApiError(message, response.status);
    }

    return (await response.json()) as RosterImportReport;
  },
  notifications: (token: string, { limit = 50, unreadOnly = false } = {}) =>
    request<NotificationInbox>(
      `/notifications?limit=${limit}${unreadOnly ? '&unreadOnly=true' : ''}`,
      token,
    ),
  markNotificationRead: (token: string, notificationId: string) =>
    request<NotificationItem>(`/notifications/${notificationId}/read`, token, {
      method: 'POST',
    }),
  registerPushDevice: (token: string, deviceToken: string) =>
    request<{ id: string; platform: string }>('/notifications/devices', token, {
      method: 'POST',
      body: JSON.stringify({ platform: 'web', token: deviceToken }),
    }),
  audit: (
    token: string,
    filters: {
      actorId?: string;
      action?: string;
      entity?: string;
      entityId?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) => {
    const search = new URLSearchParams();
    for (const key of [
      'actorId',
      'action',
      'entity',
      'entityId',
      'from',
      'to',
      'cursor',
    ] as const) {
      const value = filters[key];
      if (value) search.set(key, value);
    }
    if (filters.limit) search.set('limit', String(filters.limit));
    return request<AuditPage>(`/audit?${search.toString()}`, token);
  },
  students: (token: string) => request<StudentOption[]>('/students', token),
  dsarExport: (token: string, studentId: string) =>
    request<DsarExport>(`/privacy/students/${studentId}/export`, token),
  erasureDryRun: (token: string, studentId: string) =>
    request<ErasurePlan>(`/privacy/students/${studentId}/erasure-dry-run`, token),
  privacyNotice: (token: string) => request<PrivacyNoticeSettings>('/privacy/notice', token),
  savePrivacyNotice: (token: string, notice: PrivacyNotice, version: number) =>
    request<PrivacyNoticeSettings>('/privacy/notice', token, {
      method: 'PUT',
      body: JSON.stringify({ notice, version }),
    }),
  privacyConsents: (token: string) => request<PrivacyConsentOverview>('/privacy/consents', token),
  guardianAccess: (token: string) =>
    request<GuardianAccessSettings>('/privacy/guardian-access', token),
  saveGuardianAccess: (token: string, mode: GuardianAccessMode, version: number) =>
    request<GuardianAccessSettings>('/privacy/guardian-access', token, {
      method: 'PUT',
      body: JSON.stringify({ mode, version }),
    }),
  guardians: (token: string) => request<GuardianLink[]>('/privacy/guardians', token),
  createGuardian: (
    token: string,
    input: {
      email: string;
      displayName: string;
      relationship: string;
      studentId: string;
    },
  ) =>
    request<GuardianAccountResult>('/privacy/guardians', token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  captureConsent: (
    token: string,
    studentId: string,
    input: {
      guardianName: string;
      guardianRelationship: string;
      guardianContact?: string | null;
      status: 'granted' | 'withdrawn';
      note?: string | null;
    },
  ) =>
    request<PrivacyConsentOverview['consents'][number]>(
      `/privacy/students/${studentId}/consents`,
      token,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  retention: (token: string) => request<RetentionOverview>('/retention', token),
  saveRetention: (token: string, policy: RetentionPolicy, version: number) =>
    request<RetentionSettings>('/retention', token, {
      method: 'PUT',
      body: JSON.stringify({ policy, version }),
    }),
  retentionDryRun: (token: string) =>
    request<RetentionRun>('/retention/dry-run', token, { method: 'POST' }),
  syncPush: (
    token: string,
    body: {
      operations: Array<{
        clientOpId: string;
        kind: 'attendance.save';
        sectionId: string;
        date: string;
        entries: Array<{
          studentId: string;
          status: AttendanceStatus;
          note?: string;
          baseVersion?: number;
        }>;
      }>;
    },
  ) =>
    request<SyncPushResponse>('/sync/push', token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  downloadSf9: async (token: string, sectionId: string, periodId: string) => {
    const response = await fetch(
      `${API_URL}/sections/${sectionId}/reports/sf9-draft?periodId=${periodId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) {
      throw new ApiError(`Export failed (${response.status})`, response.status);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'SF9-draft.xlsx';
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
