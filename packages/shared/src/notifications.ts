import { z } from 'zod';

export const pushPlatformSchema = z.enum(['android', 'ios', 'web']);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

export const notificationKindSchema = z.enum([
  'grade_posted',
  'absence_marked',
  'class_starting',
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const registerPushDeviceSchema = z.object({
  platform: pushPlatformSchema,
  token: z.string().trim().min(20).max(4096),
});
export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;

export const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  unreadOnly: z.stringbool().default(false),
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationView[];
  unreadCount: number;
}
