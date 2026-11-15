import 'dart:math';

import '../api/models.dart';

final _random = Random.secure();

String newClientOpId() {
  final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

class AttendanceOutboxEntry {
  const AttendanceOutboxEntry({
    required this.studentId,
    required this.status,
    this.baseVersion,
    this.note,
  });

  factory AttendanceOutboxEntry.fromJson(Map<String, dynamic> json) =>
      AttendanceOutboxEntry(
        studentId: json['studentId'] as String,
        status: AttendanceStatus.fromWire(json['status'] as String),
        baseVersion: (json['baseVersion'] as num?)?.toInt(),
        note: json['note'] as String?,
      );

  final String studentId;
  final AttendanceStatus status;
  final int? baseVersion;
  final String? note;

  Map<String, dynamic> toJson() => {
    'studentId': studentId,
    'status': status.wire,
    if (baseVersion != null && baseVersion! > 0) 'baseVersion': baseVersion,
    if (note != null && note!.isNotEmpty) 'note': note,
  };
}

class AttendanceOutboxOp {
  const AttendanceOutboxOp({
    required this.clientOpId,
    required this.sectionId,
    required this.date,
    required this.entries,
    required this.createdAt,
  });

  factory AttendanceOutboxOp.fromJson(Map<String, dynamic> json) =>
      AttendanceOutboxOp(
        clientOpId: json['clientOpId'] as String,
        sectionId: json['sectionId'] as String,
        date: json['date'] as String,
        entries: (json['entries'] as List<dynamic>)
            .map(
              (entry) =>
                  AttendanceOutboxEntry.fromJson(entry as Map<String, dynamic>),
            )
            .toList(),
        createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      );

  final String clientOpId;
  final String sectionId;
  final String date;
  final List<AttendanceOutboxEntry> entries;
  final DateTime createdAt;

  bool matches(String sectionId, String date) =>
      this.sectionId == sectionId && this.date == date;

  Map<String, dynamic> toJson() => {
    'clientOpId': clientOpId,
    'kind': 'attendance.save',
    'sectionId': sectionId,
    'date': date,
    'entries': entries.map((entry) => entry.toJson()).toList(),
    'createdAt': createdAt.toUtc().toIso8601String(),
  };
}

class AttendanceOutboxConflict {
  const AttendanceOutboxConflict({
    required this.op,
    required this.message,
    this.studentId,
    this.currentStatus,
    this.currentVersion,
    this.rejected = false,
  });

  factory AttendanceOutboxConflict.fromOutcome(
    AttendanceOutboxOp op,
    SyncPushOutcome outcome,
  ) => AttendanceOutboxConflict(
    op: op,
    message:
        outcome.conflict?.message ??
        outcome.message ??
        'The server kept a newer version of this sheet.',
    studentId: outcome.conflict?.studentId,
    currentStatus: outcome.conflict?.currentStatus,
    currentVersion: outcome.conflict?.currentVersion,
    rejected: outcome.status == 'rejected',
  );

  factory AttendanceOutboxConflict.fromJson(Map<String, dynamic> json) =>
      AttendanceOutboxConflict(
        op: AttendanceOutboxOp.fromJson(json['op'] as Map<String, dynamic>),
        message: json['message'] as String,
        studentId: json['studentId'] as String?,
        currentStatus: json['currentStatus'] as String?,
        currentVersion: (json['currentVersion'] as num?)?.toInt(),
        rejected: json['rejected'] as bool? ?? false,
      );

  final AttendanceOutboxOp op;
  final String message;
  final String? studentId;
  final String? currentStatus;
  final int? currentVersion;
  final bool rejected;

  Map<String, dynamic> toJson() => {
    'op': op.toJson(),
    'message': message,
    'studentId': studentId,
    'currentStatus': currentStatus,
    'currentVersion': currentVersion,
    'rejected': rejected,
  };
}

abstract class OutboxStore {
  Future<List<AttendanceOutboxOp>> listPendingOps();
  Future<void> enqueueOp(AttendanceOutboxOp op);
  Future<void> removeOp(String clientOpId);
  Future<List<AttendanceOutboxConflict>> listConflicts();
  Future<void> putConflict(AttendanceOutboxConflict conflict);
  Future<void> removeConflict(String clientOpId);
}

typedef PushAttendanceOps =
    Future<SyncPushResponse> Function(List<Map<String, dynamic>> operations);

class FlushSummary {
  const FlushSummary({
    this.applied = 0,
    this.conflicts = 0,
    this.remaining = 0,
    this.error,
  });

  final int applied;
  final int conflicts;
  final int remaining;
  final String? error;

  bool get ok => error == null;
}

Future<FlushSummary> flushAttendanceOutbox({
  required OutboxStore store,
  required PushAttendanceOps push,
  int batchSize = 20,
}) async {
  var applied = 0;
  var conflicts = 0;
  try {
    while (true) {
      final pending = await store.listPendingOps();
      if (pending.isEmpty) break;
      final batch = pending.take(batchSize).toList();
      final response = await push(
        batch.map((op) => op.toJson()).toList(),
      );
      final byId = {
        for (final outcome in response.results) outcome.clientOpId: outcome,
      };
      var settled = 0;
      for (final op in batch) {
        final outcome = byId[op.clientOpId];
        if (outcome == null) continue;
        await store.removeOp(op.clientOpId);
        settled++;
        if (outcome.settled) {
          applied++;
        } else {
          await store.putConflict(
            AttendanceOutboxConflict.fromOutcome(op, outcome),
          );
          conflicts++;
        }
      }
      if (settled == 0 || batch.length < batchSize) break;
    }
  } catch (error) {
    return FlushSummary(
      applied: applied,
      conflicts: conflicts,
      remaining: (await store.listPendingOps()).length,
      error: error.toString(),
    );
  }
  return FlushSummary(
    applied: applied,
    conflicts: conflicts,
    remaining: (await store.listPendingOps()).length,
  );
}
