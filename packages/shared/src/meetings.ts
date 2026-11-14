import { z } from 'zod';

export const meetingStatusSchema = z.enum(['scheduled', 'live', 'ended', 'cancelled']);
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;

export const createMeetingSchema = z.object({
  title: z.string().min(1).max(120),
  scheduledFor: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(240).default(60),
});
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

export const meetingQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type MeetingQuery = z.infer<typeof meetingQuerySchema>;

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
  participantCount?: number;
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
