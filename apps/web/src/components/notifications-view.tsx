'use client';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { ChipProps } from '@mui/material/Chip';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  enableWebPush,
  listenForPush,
  pushStatus,
  type PushStatus,
} from '@/lib/push';
import type {
  NotificationInbox,
  NotificationItem,
  NotificationKind,
} from '@/lib/types';

const kindLabel: Record<NotificationKind, string> = {
  grade_posted: 'Grade',
  absence_marked: 'Absence',
  class_starting: 'Class',
};

const kindColor: Record<NotificationKind, ChipProps['color']> = {
  grade_posted: 'primary',
  absence_marked: 'warning',
  class_starting: 'info',
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsView({ token }: { token: string }) {
  const [inbox, setInbox] = useState<NotificationInbox | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [push, setPush] = useState<PushStatus>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInbox(await api.notifications(token));
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPush(pushStatus());
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void listenForPush((title) => {
      setNotice(title);
      void load();
    }).then((off) => {
      if (active) unsubscribe = off;
      else off();
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [load]);

  const enablePush = async () => {
    setPushBusy(true);
    setError(null);
    try {
      const status = await enableWebPush(token);
      setPush(status);
      if (status !== 'granted') {
        setNotice(
          status === 'denied'
            ? 'Notifications are blocked in this browser. Allow them in site settings, then try again.'
            : 'Push notifications are not available in this browser.',
        );
      }
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setPushBusy(false);
    }
  };

  const pushLabel: Record<PushStatus, string> = {
    unsupported: 'Push not supported',
    unconfigured: 'Push not configured',
    default: 'Enable notifications',
    granted: 'Notifications on',
    denied: 'Notifications blocked',
  };

  const markRead = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.markNotificationRead(token, id);
      await load();
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    if (!inbox) return;
    const unread = inbox.items.filter((item) => !item.readAt);
    if (unread.length === 0) return;

    setMarkingAll(true);
    setError(null);
    try {
      for (const item of unread) {
        await api.markNotificationRead(token, item.id);
      }
      await load();
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setMarkingAll(false);
    }
  };

  const visible = useMemo(
    () =>
      (inbox?.items ?? []).filter((item) => filter === 'all' || !item.readAt),
    [inbox, filter],
  );

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' } }}
        >
          <Typography variant="h6">Inbox</Typography>
          <Chip
            size="small"
            color={inbox && inbox.unreadCount > 0 ? 'primary' : 'default'}
            label={`${inbox?.unreadCount ?? 0} unread`}
          />
          <Box sx={{ flex: 1 }} />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filter}
            onChange={(_event, value: 'all' | 'unread' | null) => {
              if (value) setFilter(value);
            }}
            aria-label="Filter notifications"
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="unread">Unread</ToggleButton>
          </ToggleButtonGroup>
          <Button
            size="small"
            variant={push === 'default' ? 'contained' : 'outlined'}
            onClick={() => void enablePush()}
            disabled={pushBusy || (push !== 'default' && push !== 'denied')}
          >
            {pushBusy ? 'Enabling…' : pushLabel[push]}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={markAllRead}
            disabled={
              markingAll || loading || !inbox || inbox.unreadCount === 0
            }
          >
            {markingAll ? 'Marking…' : 'Mark all read'}
          </Button>
          <Button size="small" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {notice && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {loading && !inbox ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : visible.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {filter === 'unread'
              ? 'No unread notifications.'
              : 'No notifications yet.'}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1}>
          {visible.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onMarkRead={() => void markRead(item.id)}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function NotificationCard({
  item,
  busy,
  onMarkRead,
}: {
  item: NotificationItem;
  busy: boolean;
  onMarkRead: () => void;
}) {
  const unread = item.readAt === null;

  return (
    <Card
      variant="outlined"
      sx={{
        borderLeft: '4px solid',
        borderLeftColor: unread ? 'primary.main' : 'transparent',
      }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Box
            aria-hidden
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              mt: 1,
              flexShrink: 0,
              bgcolor: unread ? 'primary.main' : 'transparent',
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', flexWrap: 'wrap' }}
            >
              <Chip
                size="small"
                variant="outlined"
                color={kindColor[item.kind] ?? 'default'}
                label={kindLabel[item.kind] ?? item.kind}
              />
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: unread ? 600 : 400 }}
              >
                {item.title}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {item.body}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.5 }}
            >
              {relativeTime(item.createdAt)}
            </Typography>
          </Box>
          {unread && (
            <Button size="small" onClick={onMarkRead} disabled={busy}>
              {busy ? 'Saving…' : 'Mark read'}
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
