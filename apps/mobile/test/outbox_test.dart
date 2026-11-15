import 'package:flutter_test/flutter_test.dart';
import 'package:lms_mobile/src/api/models.dart';
import 'package:lms_mobile/src/data/cache.dart';
import 'package:lms_mobile/src/data/outbox.dart';

AttendanceOutboxOp op({
  String clientOpId = 'op-1',
  String date = '2026-11-15',
  int? baseVersion,
}) => AttendanceOutboxOp(
  clientOpId: clientOpId,
  sectionId: 'section-1',
  date: date,
  entries: [
    AttendanceOutboxEntry(
      studentId: 'student-1',
      status: AttendanceStatus.present,
      baseVersion: baseVersion,
    ),
  ],
  createdAt: DateTime.utc(2026, 11, 15, 1),
);

SyncPushOutcome outcome(
  String clientOpId,
  String status, {
  String? storedStatus,
  String? message,
  Map<String, dynamic>? conflict,
}) => SyncPushOutcome.fromJson({
  'clientOpId': clientOpId,
  'status': status,
  'storedStatus': ?storedStatus,
  'message': ?message,
  'conflict': ?conflict,
});

void main() {
  test('applies a queued sheet and clears the outbox', () async {
    final store = MemoryLocalStore();
    await store.prepareForUser('user-1');
    await store.enqueueOp(op());

    final summary = await flushAttendanceOutbox(
      store: store,
      push: (operations) async {
        expect(operations.single['kind'], 'attendance.save');
        expect(operations.single['clientOpId'], 'op-1');
        return SyncPushResponse(results: [outcome('op-1', 'applied')]);
      },
    );

    expect(summary.ok, isTrue);
    expect(summary.applied, 1);
    expect(summary.remaining, 0);
    expect(await store.listPendingOps(), isEmpty);
    expect(await store.listConflicts(), isEmpty);
  });

  test('keeps the sheet when the push fails offline', () async {
    final store = MemoryLocalStore();
    await store.prepareForUser('user-1');
    await store.enqueueOp(op());

    final summary = await flushAttendanceOutbox(
      store: store,
      push: (operations) async => throw Exception('offline'),
    );

    expect(summary.ok, isFalse);
    expect(summary.remaining, 1);
    expect(await store.listPendingOps(), hasLength(1));
  });

  test('treats a duplicate receipt as applied', () async {
    final store = MemoryLocalStore();
    await store.prepareForUser('user-1');
    await store.enqueueOp(op());

    final summary = await flushAttendanceOutbox(
      store: store,
      push: (operations) async => SyncPushResponse(
        results: [outcome('op-1', 'duplicate', storedStatus: 'applied')],
      ),
    );

    expect(summary.applied, 1);
    expect(summary.conflicts, 0);
    expect(await store.listPendingOps(), isEmpty);
  });

  test('moves a conflicting sheet out of the queue', () async {
    final store = MemoryLocalStore();
    await store.prepareForUser('user-1');
    await store.enqueueOp(op(baseVersion: 2));

    final summary = await flushAttendanceOutbox(
      store: store,
      push: (operations) async => SyncPushResponse(
        results: [
          outcome(
            'op-1',
            'conflict',
            conflict: {
              'message': 'attendance changed on the server',
              'studentId': 'student-1',
              'current': {'status': 'excused', 'version': 3},
            },
          ),
        ],
      ),
    );

    expect(summary.conflicts, 1);
    expect(summary.remaining, 0);
    final conflicts = await store.listConflicts();
    expect(conflicts, hasLength(1));
    expect(conflicts.single.currentStatus, 'excused');
    expect(conflicts.single.currentVersion, 3);

    await store.removeConflict('op-1');
    expect(await store.listConflicts(), isEmpty);
  });

  test('treats a duplicate conflict receipt as a conflict', () async {
    final store = MemoryLocalStore();
    await store.prepareForUser('user-1');
    await store.enqueueOp(op());

    await flushAttendanceOutbox(
      store: store,
      push: (operations) async => SyncPushResponse(
        results: [outcome('op-1', 'duplicate', storedStatus: 'conflict')],
      ),
    );

    expect(await store.listPendingOps(), isEmpty);
    expect(await store.listConflicts(), hasLength(1));
  });

  test('records rejected sheets with the server message', () async {
    final store = MemoryLocalStore();
    await store.prepareForUser('user-1');
    await store.enqueueOp(op());

    await flushAttendanceOutbox(
      store: store,
      push: (operations) async => SyncPushResponse(
        results: [outcome('op-1', 'rejected', message: 'section not yours')],
      ),
    );

    final conflicts = await store.listConflicts();
    expect(conflicts.single.rejected, isTrue);
    expect(conflicts.single.message, 'section not yours');
  });

  test('signing in a different user clears queued sheets', () async {
    final store = MemoryLocalStore();
    await store.prepareForUser('user-1');
    await store.enqueueOp(op());

    await store.prepareForUser('user-2');

    expect(await store.listPendingOps(), isEmpty);
  });

  test('serializes and restores an operation', () {
    final original = op(baseVersion: 4);
    final restored = AttendanceOutboxOp.fromJson(original.toJson());

    expect(restored.clientOpId, original.clientOpId);
    expect(restored.sectionId, original.sectionId);
    expect(restored.date, original.date);
    expect(restored.entries.single.status, AttendanceStatus.present);
    expect(restored.entries.single.baseVersion, 4);
  });

  test('client op ids are unique uuids', () {
    final ids = {for (var i = 0; i < 100; i++) newClientOpId()};
    expect(ids, hasLength(100));
    expect(
      ids.every(
        (id) => RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(id),
      ),
      isTrue,
    );
  });
}
