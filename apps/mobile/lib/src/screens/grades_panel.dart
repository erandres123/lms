import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../api/models.dart';
import '../providers.dart';
import '../widgets/error_view.dart';

class GradesPanel extends ConsumerStatefulWidget {
  const GradesPanel({super.key, required this.sectionId});

  final String sectionId;

  @override
  ConsumerState<GradesPanel> createState() => _GradesPanelState();
}

class _GradesPanelState extends ConsumerState<GradesPanel> {
  String? _periodId;

  @override
  Widget build(BuildContext context) {
    final periods = ref.watch(periodsProvider);
    return periods.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ErrorView(
        error: error,
        onRetry: () => ref.invalidate(periodsProvider),
      ),
      data: (periods) {
        if (periods.isEmpty) {
          return const Center(child: Text('No grading periods configured.'));
        }
        final selected = periods
            .where((period) => period.id == _periodId)
            .firstOrNull ?? periods.first;
        final gradebook = ref.watch(
          gradebookProvider((sectionId: widget.sectionId, periodId: selected.id)),
        );
        return RefreshIndicator(
          onRefresh: () => ref.refresh(
            gradebookProvider((sectionId: widget.sectionId, periodId: selected.id)).future,
          ),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DropdownButtonFormField<String>(
                initialValue: selected.id,
                decoration: const InputDecoration(labelText: 'Grading period'),
                items: [
                  for (final period in periods)
                    DropdownMenuItem(value: period.id, child: Text(period.name)),
                ],
                onChanged: (value) => setState(() => _periodId = value),
              ),
              const SizedBox(height: 16),
              gradebook.when(
                loading: () => const Padding(
                  padding: EdgeInsets.all(48),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (error, _) => SizedBox(
                  height: 280,
                  child: ErrorView(
                    error: error,
                    onRetry: () => ref.invalidate(
                      gradebookProvider(
                        (sectionId: widget.sectionId, periodId: selected.id),
                      ),
                    ),
                  ),
                ),
                data: (gradebook) => _GradebookBody(gradebook: gradebook),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _GradebookBody extends ConsumerWidget {
  const _GradebookBody({required this.gradebook});

  final Gradebook gradebook;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final roster = ref.watch(rosterProvider(gradebook.section.id));
    if (roster.isLoading && roster.value == null) {
      return const Padding(
        padding: EdgeInsets.all(48),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final userId = Supabase.instance.client.auth.currentUser?.id;
    final ownStudentId = roster.value
        ?.where((student) => student.userId == userId)
        .map((student) => student.id)
        .firstOrNull;
    final ownRow = gradebook.students
        .where((row) => row.studentId == ownStudentId)
        .firstOrNull;

    if (ownRow == null) {
      if (gradebook.students.isEmpty) {
        return const Padding(
          padding: EdgeInsets.all(24),
          child: Text('No students are enrolled in this section yet.'),
        );
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Class grades', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final row in gradebook.students.take(20))
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(row.fullName),
              trailing: Text(
                row.effectiveGrade?.toStringAsFixed(0) ?? '—',
                style: theme.textTheme.titleMedium,
              ),
            ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Expanded(
                  child: _Metric(
                    label: 'Final grade',
                    value: ownRow.effectiveGrade?.toStringAsFixed(0) ?? '—',
                    emphasized: true,
                  ),
                ),
                Expanded(
                  child: _Metric(
                    label: 'Percentage',
                    value: ownRow.percentage == null
                        ? '—'
                        : '${ownRow.percentage!.toStringAsFixed(1)}%',
                  ),
                ),
                Expanded(
                  child: _Metric(
                    label: 'Transmuted',
                    value: ownRow.transmutedGrade?.toStringAsFixed(0) ?? '—',
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        Text('Category breakdown', style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        for (final category in gradebook.categories)
          _CategoryTile(
            category: category,
            result: ownRow.categories
                .where((result) => result.categoryId == category.id)
                .firstOrNull,
          ),
        const SizedBox(height: 12),
        Text(
          'Weights total ${gradebook.weightsTotal.toStringAsFixed(0)}%. '
          'Final grade uses the school transmutation policy.',
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value, this.emphasized = false});

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Text(
          value,
          style: emphasized
              ? theme.textTheme.headlineMedium?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.bold,
                )
              : theme.textTheme.headlineSmall,
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: theme.textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.category, this.result});

  final GradeCategory category;
  final CategoryResult? result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final percentage = result?.percentage;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(category.name)),
              Text(
                percentage == null ? '—' : '${percentage.toStringAsFixed(1)}%',
                style: theme.textTheme.bodyMedium,
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (percentage ?? 0) / 100,
              minHeight: 6,
            ),
          ),
          if (result != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '${result!.earned.toStringAsFixed(1)} / ${result!.possible.toStringAsFixed(1)} '
                '• ${category.weight.toStringAsFixed(0)}% of grade',
                style: theme.textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }
}
