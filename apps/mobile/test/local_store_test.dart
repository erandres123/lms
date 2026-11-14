import 'package:flutter_test/flutter_test.dart';
import 'package:lms_mobile/src/api/models.dart';
import 'package:lms_mobile/src/data/cache.dart';

SyncChange change({
  required String table,
  required String rowId,
  Map<String, dynamic>? data,
  String operation = 'insert',
  int seq = 1,
}) => SyncChange(
  seq: seq,
  table: table,
  operation: operation,
  rowId: rowId,
  data: data,
);

void main() {
  test('applies upserts and tombstones and moves the cursor', () async {
    final store = MemoryLocalStore();
    await store.prepareForUser('user-1');

    await store.applyPage(
      SyncPage(
        nextCursor: 2,
        hasMore: false,
        changes: [
          change(table: 'sections', rowId: 's1', data: {'id': 's1', 'name': 'Rizal'}),
          change(table: 'sections', rowId: 's2', data: {'id': 's2', 'name': 'Mabini'}),
        ],
      ),
    );

    expect(await store.readCursor(), 2);
    expect(await store.readTable('sections'), hasLength(2));

    await store.applyPage(
      SyncPage(
        nextCursor: 3,
        hasMore: false,
        changes: [change(table: 'sections', rowId: 's1', operation: 'delete', seq: 3)],
      ),
    );

    expect(await store.readCursor(), 3);
    expect(
      (await store.readTable('sections'))!.map((row) => row['id']),
      ['s2'],
    );
  });

  test('treats a null payload as a tombstone', () async {
    final store = MemoryLocalStore();
    await store.prepareForUser('user-1');
    await store.applyPage(
      SyncPage(
        nextCursor: 1,
        hasMore: false,
        changes: [change(table: 'attendance', rowId: 'a1', data: {'id': 'a1'})],
      ),
    );

    await store.applyPage(
      SyncPage(
        nextCursor: 2,
        hasMore: false,
        changes: [change(table: 'attendance', rowId: 'a1', operation: 'update', seq: 2)],
      ),
    );

    expect(await store.readTable('attendance'), isNull);
  });

  test('clears the mirror when another user signs in', () async {
    final store = MemoryLocalStore();
    await store.prepareForUser('user-1');
    await store.applyPage(
      SyncPage(
        nextCursor: 5,
        hasMore: false,
        changes: [change(table: 'sections', rowId: 's1', data: {'id': 's1'})],
      ),
    );

    await store.prepareForUser('user-2');

    expect(await store.readCursor(), 0);
    expect(await store.readTable('sections'), isNull);
  });

  test('parses a sync pull page', () {
    final page = SyncPage.fromJson({
      'changes': [
        {
          'seq': 7,
          'table': 'attendance',
          'operation': 'insert',
          'rowId': 'a1',
          'version': 1,
          'changedAt': '2026-11-14T01:00:00.000Z',
          'data': {'id': 'a1', 'status': 'present'},
        },
        {
          'seq': 8,
          'table': 'attendance',
          'operation': 'delete',
          'rowId': 'a2',
          'version': 2,
          'changedAt': '2026-11-14T01:01:00.000Z',
          'data': null,
        },
      ],
      'nextCursor': 8,
      'hasMore': true,
    });

    expect(page.nextCursor, 8);
    expect(page.hasMore, isTrue);
    expect(page.changes.first.data?['status'], 'present');
    expect(page.changes.last.isDelete, isTrue);
  });
}
