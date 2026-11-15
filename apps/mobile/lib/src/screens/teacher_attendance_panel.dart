import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../api/models.dart';
import '../data/outbox.dart';
import '../providers.dart';
import '../widgets/attendance_status.dart';
import '../widgets/error_view.dart';

class TeacherAttendancePanel extends ConsumerStatefulWidget {
  const TeacherAttendancePanel({super.key, required this.sectionId});

  final String sectionId;

  @override
  ConsumerState<TeacherAttendancePanel> createState() =>
      _TeacherAttendancePanelState();
}

class _TeacherAttendancePanelState
    extends ConsumerState<TeacherAttendancePanel> {
  DateTime _date = DateTime.now();
  final Map<String, AttendanceStatus> _draft = {};
  List<AttendanceOutboxOp> _pending = const [];
  List<AttendanceOutboxConflict> _conflicts = const [];
  bool _busy = false;
  String? _notice;

  String get _isoDate => DateFormat('yyyy-MM-dd').format(_date);

  @override
  void initState() {
    super.initState();
    _refreshOutbox();
  }

  Future<void> _refreshOutbox() async {
    final store = await ref.read(localStoreProvider.future);
    final pending = await store.listPendingOps();
    final conflicts = await store.listConflicts();
    if (!mounted) return;
    setState(() {
      _pending = pending;
      _conflicts = conflicts;
    });
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _date = picked;
      _draft.clear();
      _notice = null;
    });
  }

  Future<void> _save(List<RosterStudent> roster, List<AttendanceRecord> records) async {
    final recorded = {for (final record in records) record.studentId: record};
    final entries = [
      for (final student in roster)
        AttendanceOutboxEntry(
          studentId: student.id,
          status:
              _draft[student.id] ??
              recorded[student.id]?.status ??
              AttendanceStatus.present,
          baseVersion: recorded[student.id]?.version,
        ),
    ];
    if (entries.isEmpty) return;

    final op = AttendanceOutboxOp(
      clientOpId: newClientOpId(),
      sectionId: widget.sectionId,
      date: _isoDate,
      entries: entries,
      createdAt: DateTime.now(),
    );
    final store = await ref.read(localStoreProvider.future);
    await store.enqueueOp(op);
    if (!mounted) return;
    setState(() {
      _pending = [..._pending, op];
      _notice = 'Saved on this device. It will sync when you are back online.';
    });
    await _flush();
  }

  Future<void> _flush() async {
    if (_busy) return;
    setState(() => _busy = true);
    final push = ref.read(pushAttendanceOpsProvider);
    final store = await ref.read(localStoreProvider.future);
    final summary = await flushAttendanceOutbox(store: store, push: push);
    final pending = await store.listPendingOps();
    final conflicts = await store.listConflicts();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _pending = pending;
      _conflicts = conflicts;
      if (summary.applied > 0) _draft.clear();
      if (summary.error != null) {
        _notice =
            'Saved on this device. It will sync when you are back online.';
      } else if (summary.conflicts > 0) {
        _notice = 'Some sheets need review before they can sync.';
      } else if (summary.applied > 0) {
        _notice = 'Synced ${summary.applied} sheet${summary.applied == 1 ? '' : 's'}.';
      } else if (pending.isEmpty) {
        _notice = null;
      }
    });
    if (summary.applied > 0) {
      ref.invalidate(
        attendanceProvider((sectionId: widget.sectionId, date: _isoDate)),
      );
    }
  }

  Future<void> _resolveConflict(AttendanceOutboxConflict conflict) async {
    final store = await ref.read(localStoreProvider.future);
    await store.removeConflict(conflict.op.clientOpId);
    if (!mounted) return;
    setState(() {
      _conflicts = [
        for (final entry in _conflicts)
          if (entry.op.clientOpId != conflict.op.clientOpId) entry,
      ];
      _draft.clear();
    });
    ref.invalidate(
      attendanceProvider((sectionId: widget.sectionId, date: conflict.op.date)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final key = (sectionId: widget.sectionId, date: _isoDate);
    final rosterAsync = ref.watch(rosterProvider(widget.sectionId));
    final recordsAsync = ref.watch(attendanceProvider(key));
    final pendingForDate = _pending
        .where((op) => op.matches(widget.sectionId, _isoDate))
        .toList();

    if (rosterAsync.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (rosterAsync.hasError) {
      return ErrorView(
        error: rosterAsync.error!,
        onRetry: () => ref.invalidate(rosterProvider(widget.sectionId)),
      );
    }
    final roster = rosterAsync.value ?? const <RosterStudent>[];
    final records = recordsAsync.value ?? const <AttendanceRecord>[];
    final recorded = {for (final record in records) record.studentId: record};
    final queuedForDate = pendingForDate.isNotEmpty;
    final canSave =
        roster.isNotEmpty &&
        !_busy &&
        !queuedForDate &&
        (_draft.isNotEmpty || records.length < roster.length);

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
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              TextButton.icon(
                onPressed: _busy || queuedForDate || roster.isEmpty
                    ? null
                    : () => setState(() {
                        for (final student in roster) {
                          _draft[student.id] = AttendanceStatus.present;
                        }
                      }),
                icon: const Icon(Icons.done_all),
                label: const Text('Mark all present'),
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: _busy ? null : _flush,
                icon: const Icon(Icons.sync),
                label: Text(
                  _busy
                      ? 'Syncing…'
                      : 'Sync now${_pending.isEmpty ? '' : ' (${_pending.length})'}',
                ),
              ),
            ],
          ),
        ),
        if (_notice != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                _notice!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.primary,
                ),
              ),
            ),
          ),
        if (pendingForDate.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Chip(
                avatar: const Icon(Icons.cloud_upload, size: 16),
                label: Text(
                  'Queued: ${pendingForDate.length} sheet'
                  '${pendingForDate.length == 1 ? '' : 's'} for this date',
                ),
                visualDensity: VisualDensity.compact,
              ),
            ),
          ),
        if (_conflicts.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Card(
              color: theme.colorScheme.errorContainer.withValues(alpha: 0.5),
              child: Column(
                children: [
                  ListTile(
                    dense: true,
                    leading: Icon(
                      Icons.report_problem,
                      color: theme.colorScheme.error,
                    ),
                    title: const Text('Attendance conflicts'),
                    subtitle: const Text(
                      'The server kept a newer version. Reload to keep it.',
                    ),
                  ),
                  for (final conflict in _conflicts)
                    ListTile(
                      dense: true,
                      title: Text(
                        '${conflict.op.date} · ${conflict.op.entries.length} students',
                      ),
                      subtitle: Text(
                        conflict.currentStatus == null
                            ? conflict.message
                            : '${conflict.message} Server now: '
                                '${AttendanceStatus.fromWire(conflict.currentStatus!).label}'
                                '${conflict.currentVersion == null ? '' : ' (v${conflict.currentVersion})'}',
                      ),
                      trailing: TextButton(
                        onPressed: () => _resolveConflict(conflict),
                        child: const Text('Reload'),
                      ),
                    ),
                ],
              ),
            ),
          ),
        if (recordsAsync.isLoading)
          const LinearProgressIndicator(minHeight: 2),
        Expanded(
          child: roster.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(height: 100),
                    Center(child: Text('No students enrolled in this section.')),
                  ],
                )
              : RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(rosterProvider(widget.sectionId));
                    ref.invalidate(attendanceProvider(key));
                    await ref.read(attendanceProvider(key).future);
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                    itemCount: roster.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final student = roster[index];
                      final record = recorded[student.id];
                      final status =
                          _draft[student.id] ??
                          record?.status ??
                          AttendanceStatus.present;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          '${student.firstName} ${student.lastName}'.trim(),
                        ),
                        subtitle: Text(
                          record == null
                              ? 'Not recorded'
                              : '${record.status.label} · v${record.version}',
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            for (final option in AttendanceStatus.values)
                              IconButton(
                                visualDensity: VisualDensity.compact,
                                tooltip: option.label,
                                isSelected: option == status,
                                onPressed: _busy || queuedForDate
                                    ? null
                                    : () => setState(
                                        () => _draft[student.id] = option,
                                      ),
                                icon: Icon(
                                  attendanceStatusIcon(option),
                                  color: option == status
                                      ? attendanceStatusColor(context, option)
                                      : null,
                                ),
                                style: IconButton.styleFrom(
                                  backgroundColor: option == status
                                      ? attendanceStatusColor(
                                          context,
                                          option,
                                        ).withValues(alpha: 0.14)
                                      : null,
                                ),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: FilledButton.icon(
              onPressed: canSave ? () => _save(roster, records) : null,
              icon: const Icon(Icons.save),
              label: const Text('Save attendance'),
            ),
          ),
        ),
      ],
    );
  }
}
