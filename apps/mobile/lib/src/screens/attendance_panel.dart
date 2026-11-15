import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../api/models.dart';
import '../providers.dart';
import '../widgets/attendance_status.dart';
import '../widgets/error_view.dart';
import 'teacher_attendance_panel.dart';

class AttendancePanel extends ConsumerStatefulWidget {
  const AttendancePanel({super.key, required this.sectionId});

  final String sectionId;

  @override
  ConsumerState<AttendancePanel> createState() => _AttendancePanelState();
}

class _AttendancePanelState extends ConsumerState<AttendancePanel> {
  DateTime _date = DateTime.now();

  String get _isoDate => DateFormat('yyyy-MM-dd').format(_date);

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(sessionRoleProvider);
    if (role != null && role != 'student') {
      return TeacherAttendancePanel(sectionId: widget.sectionId);
    }
    final theme = Theme.of(context);
    final key = (sectionId: widget.sectionId, date: _isoDate);
    final records = ref.watch(attendanceProvider(key));
    final roster = ref.watch(rosterProvider(widget.sectionId)).value;
    final userId = Supabase.instance.client.auth.currentUser?.id;
    final ownStudentId = roster
        ?.where((student) => student.userId == userId)
        .map((student) => student.id)
        .firstOrNull;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  DateFormat.yMMMMd().format(_date),
                  style: theme.textTheme.titleMedium,
                ),
              ),
              TextButton.icon(
                onPressed: _pickDate,
                icon: const Icon(Icons.event),
                label: const Text('Change date'),
              ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => ref.refresh(attendanceProvider(key).future),
            child: records.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => ListView(
                children: [
                  SizedBox(
                    height: 320,
                    child: ErrorView(
                      error: error,
                      onRetry: () => ref.invalidate(attendanceProvider(key)),
                    ),
                  ),
                ],
              ),
              data: (records) {
                final own = records
                    .where((record) => record.studentId == ownStudentId)
                    .firstOrNull;
                if (own != null) {
                  return ListView(
                    padding: const EdgeInsets.all(16),
                    children: [_OwnRecordCard(record: own)],
                  );
                }
                if (records.isEmpty) {
                  return ListView(
                    children: const [
                      SizedBox(height: 120),
                      Center(child: Text('No attendance recorded for this date.')),
                    ],
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: records.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final record = records[index];
                    final student = roster
                        ?.where((entry) => entry.id == record.studentId)
                        .firstOrNull;
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        student == null
                            ? 'Student'
                            : '${student.firstName} ${student.lastName}'.trim(),
                      ),
                      subtitle: record.note == null ? null : Text(record.note!),
                      trailing: AttendanceStatusChip(status: record.status),
                    );
                  },
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _OwnRecordCard extends StatelessWidget {
  const _OwnRecordCard({required this.record});

  final AttendanceRecord record;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(
              attendanceStatusIcon(record.status),
              color: attendanceStatusColor(context, record.status),
              size: 36,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(record.status.label, style: theme.textTheme.titleLarge),
                  if (record.note != null)
                    Text(record.note!, style: theme.textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
