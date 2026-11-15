import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../api/models.dart';
import '../providers.dart';
import '../widgets/error_view.dart';

class GuardianConsentScreen extends ConsumerStatefulWidget {
  const GuardianConsentScreen({super.key});

  @override
  ConsumerState<GuardianConsentScreen> createState() =>
      _GuardianConsentScreenState();
}

class _GuardianConsentScreenState extends ConsumerState<GuardianConsentScreen> {
  String? _busyStudentId;

  Future<void> _capture(GuardianStudent student, String status) async {
    setState(() => _busyStudentId = student.studentId);
    try {
      await ref
          .read(apiClientProvider)
          .captureGuardianConsent(student.studentId, status: status);
      ref.invalidate(guardianOverviewProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              status == 'granted'
                  ? 'Consent granted for ${student.firstName}.'
                  : 'Consent withdrawn for ${student.firstName}.',
            ),
          ),
        );
      }
    } on Exception catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Could not record consent: $error')));
      }
    } finally {
      if (mounted) setState(() => _busyStudentId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final overview = ref.watch(guardianOverviewProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Consent')),
      body: overview.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorView(
          error: error,
          onRetry: () => ref.invalidate(guardianOverviewProvider),
        ),
        data: (data) => _body(context, data),
      ),
    );
  }

  Widget _body(BuildContext context, GuardianOverview overview) {
    final theme = Theme.of(context);
    final notice = overview.notice.notice;
    if (notice == null) {
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

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(guardianOverviewProvider);
        await ref.read(guardianOverviewProvider.future);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Text(notice.title, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              Chip(
                label: Text('Notice version ${overview.notice.version}'),
                visualDensity: VisualDensity.compact,
              ),
              ActionChip(
                avatar: const Icon(Icons.open_in_new, size: 16),
                label: const Text('Read the notice'),
                onPressed: () => context.push('/privacy'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Consent is recorded against the version above. The school can see who '
            'consented and when.',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          if (overview.students.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'No student is linked to your account yet. Ask the school office to link your child.',
                textAlign: TextAlign.center,
              ),
            )
          else
            for (final student in overview.students)
              _studentCard(context, overview, student),
          const SizedBox(height: 24),
          Text(
            'Withdrawing consent stops new processing that relies on it. Records already '
            'made may be retained under the school retention schedule.',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  Widget _studentCard(
    BuildContext context,
    GuardianOverview overview,
    GuardianStudent student,
  ) {
    final theme = Theme.of(context);
    final busy = _busyStudentId == student.studentId;
    final status = student.consentStatus;
    final currentVersion =
        status == 'granted' && student.consentNoticeVersion == overview.notice.version;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(student.displayName, style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('Relationship: ${student.relationship}'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                _statusChip(context, status),
                if (student.consentAt != null)
                  Text(
                    'Recorded ${DateFormat.yMMMd().add_jm().format(student.consentAt!)}'
                    '${student.consentNoticeVersion != null ? ' · v${student.consentNoticeVersion}' : ''}',
                    style: theme.textTheme.bodySmall,
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                FilledButton(
                  onPressed: busy || currentVersion
                      ? null
                      : () => _capture(student, 'granted'),
                  child: Text(
                    status == 'withdrawn' ? 'Grant consent again' : 'Grant consent',
                  ),
                ),
                const SizedBox(width: 12),
                if (status == 'granted')
                  OutlinedButton(
                    onPressed: busy ? null : () => _capture(student, 'withdrawn'),
                    child: const Text('Withdraw'),
                  ),
                if (busy) ...[
                  const SizedBox(width: 16),
                  const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _statusChip(BuildContext context, String? status) {
    final (label, color) = switch (status) {
      'granted' => ('Consent granted', Colors.green),
      'withdrawn' => ('Consent withdrawn', Colors.orange),
      _ => ('No consent on file', Colors.grey),
    };
    return Chip(
      label: Text(label),
      visualDensity: VisualDensity.compact,
      side: BorderSide(color: color),
      labelStyle: TextStyle(color: color),
    );
  }
}
