import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../api/models.dart';
import '../providers.dart';
import '../widgets/error_view.dart';

class MeetingsPanel extends ConsumerWidget {
  const MeetingsPanel({super.key, required this.sectionId});

  final String sectionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meetings = ref.watch(meetingsProvider(sectionId));
    return RefreshIndicator(
      onRefresh: () => ref.refresh(meetingsProvider(sectionId).future),
      child: meetings.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ListView(
          children: [
            SizedBox(
              height: 320,
              child: ErrorView(
                error: error,
                onRetry: () => ref.invalidate(meetingsProvider(sectionId)),
              ),
            ),
          ],
        ),
        data: (meetings) {
          if (meetings.isEmpty) {
            return ListView(
              children: const [
                SizedBox(height: 120),
                Center(child: Text('No classes scheduled for this section.')),
              ],
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: meetings.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, index) => _MeetingCard(meeting: meetings[index]),
          );
        },
      ),
    );
  }
}

class _MeetingCard extends StatelessWidget {
  const _MeetingCard({required this.meeting});

  final Meeting meeting;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final time = DateFormat.yMMMd().add_jm().format(meeting.scheduledFor.toLocal());
    final canJoin = meeting.status != 'ended' && meeting.status != 'cancelled';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(meeting.title, style: theme.textTheme.titleMedium),
                ),
                _StatusChip(meeting: meeting),
              ],
            ),
            const SizedBox(height: 4),
            Text(time, style: theme.textTheme.bodyMedium),
            Text(
              '${meeting.durationMinutes} minutes',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed: canJoin ? () => context.push('/join/${meeting.id}') : null,
                icon: const Icon(Icons.videocam_outlined),
                label: Text(meeting.isLive ? 'Join now' : 'Join'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.meeting});

  final Meeting meeting;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (label, color) = switch (meeting.status) {
      'live' => ('LIVE', theme.colorScheme.error),
      'scheduled' => ('Scheduled', theme.colorScheme.primary),
      'ended' => ('Ended', theme.colorScheme.outline),
      _ => ('Cancelled', theme.colorScheme.outline),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(color: color),
      ),
    );
  }
}
