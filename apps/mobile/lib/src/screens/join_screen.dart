import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../join_link.dart';
import '../providers.dart';
import '../widgets/error_view.dart';

class JoinScreen extends ConsumerWidget {
  const JoinScreen({super.key, required this.meetingId});

  final String meetingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final join = ref.watch(joinProvider(meetingId));
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Live class')),
      body: join.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _JoinError(
          error: error,
          onRetry: () => ref.invalidate(joinProvider(meetingId)),
        ),
        data: (result) => ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.videocam, color: theme.colorScheme.primary),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            result.meeting.title,
                            style: theme.textTheme.titleLarge,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      DateFormat.yMMMd()
                          .add_jm()
                          .format(result.meeting.scheduledFor),
                    ),
                    Text(
                      '${result.meeting.durationMinutes} minutes • '
                      'You join as ${result.role}',
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: () => _open(context, result),
                      icon: const Icon(Icons.open_in_new),
                      label: const Text('Open live class'),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => ref.invalidate(joinProvider(meetingId)),
                      child: const Text('Get a fresh link'),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'The class opens in your browser. Each link is valid for a '
                      'short time; come back here to rejoin.',
                      style: theme.textTheme.bodySmall,
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context, JoinResult result) async {
    final messenger = ScaffoldMessenger.of(context);
    final link = buildJoinLink(result);
    final opened = await launchUrl(link, mode: LaunchMode.externalApplication);
    if (!opened) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not open the browser for this meeting.')),
      );
    }
  }
}

class _JoinError extends StatelessWidget {
  const _JoinError({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (error is ApiException && (error as ApiException).statusCode == 403) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.hourglass_top,
                size: 40,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 12),
              const Text(
                'Your teacher has not started this class yet. '
                'Come back once it starts.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton.tonal(onPressed: onRetry, child: const Text('Check again')),
            ],
          ),
        ),
      );
    }
    return ErrorView(error: error, onRetry: onRetry);
  }
}
