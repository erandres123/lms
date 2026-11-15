import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../providers.dart';
import '../widgets/error_view.dart';

class PrivacyScreen extends ConsumerWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final notice = ref.watch(privacyNoticeProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy notice')),
      body: notice.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorView(
          error: error,
          onRetry: () => ref.invalidate(privacyNoticeProvider),
        ),
        data: (settings) {
          final published = settings.notice;
          if (published == null) {
            return ListView(
              padding: const EdgeInsets.all(24),
              children: const [
                SizedBox(height: 80),
                Icon(Icons.privacy_tip_outlined, size: 48),
                SizedBox(height: 16),
                Center(
                  child: Text(
                    'The school has not published a privacy notice yet.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              Text(published.title, style: theme.textTheme.titleLarge),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(
                    label: Text('Version ${settings.version}'),
                    visualDensity: VisualDensity.compact,
                  ),
                  if (settings.updatedAt != null)
                    Chip(
                      label: Text(
                        'Updated ${DateFormat.yMMMMd().format(settings.updatedAt!)}',
                      ),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 12),
              SelectableText(
                published.body,
                style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
              ),
            ],
          );
        },
      ),
    );
  }
}
