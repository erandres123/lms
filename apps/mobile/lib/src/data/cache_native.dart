import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

import '../api/models.dart';
import 'cache.dart';
import 'database.dart';
import 'outbox.dart';

Future<LocalStore> openLocalStore() async {
  final directory = await getApplicationSupportDirectory();
  final key = await _databaseKey();
  final database = AppDatabase(
    NativeDatabase.createInBackground(
      File('${directory.path}/lms.sqlite'),
      setup: (raw) {
        raw.execute("PRAGMA cipher = 'sqlcipher'");
        raw.execute('PRAGMA legacy = 4');
        raw.execute("PRAGMA key = '$key'");
      },
    ),
  );
  return DriftLocalStore(database);
}

Future<String> _databaseKey() async {
  const storage = FlutterSecureStorage();
  final existing = await storage.read(key: 'lms_db_key');
  if (existing != null && existing.isNotEmpty) return existing;

  final random = Random.secure();
  final key = base64UrlEncode(List<int>.generate(32, (_) => random.nextInt(256)));
  await storage.write(key: 'lms_db_key', value: key);
  return key;
}

class DriftLocalStore implements LocalStore {
  DriftLocalStore(this._database);

  static const _cursorKey = 'sync.cursor';
  static const _userKey = 'sync.user';

  final AppDatabase _database;

  @override
  Future<void> prepareForUser(String userId) async {
    if (await _readMeta(_userKey) == userId) return;

    await _database.transaction(() async {
      await _database.delete(_database.syncRecords).go();
      await _database.delete(_database.outboxOps).go();
      await _database.delete(_database.outboxConflicts).go();
      await _writeMeta(_userKey, userId);
      await _writeMeta(_cursorKey, '0');
    });
  }

  @override
  Future<int> readCursor() async {
    final value = await _readMeta(_cursorKey);
    return int.tryParse(value ?? '') ?? 0;
  }

  @override
  Future<void> applyPage(SyncPage page) async {
    await _database.transaction(() async {
      for (final change in page.changes) {
        final key = _database.syncRecords;
        if (change.isDelete) {
          await (_database.delete(key)
                ..where(
                  (row) =>
                      row.sourceTable.equals(change.table) &
                      row.rowId.equals(change.rowId),
                ))
              .go();
          continue;
        }

        await _database.into(key).insertOnConflictUpdate(
          SyncRecordsCompanion.insert(
            sourceTable: change.table,
            rowId: change.rowId,
            payload: jsonEncode(change.data),
            seq: change.seq,
            version: Value(change.version),
            updatedAt: DateTime.now(),
          ),
        );
      }

      await _writeMeta(_cursorKey, '${page.nextCursor}');
    });
  }

  @override
  Future<List<Map<String, dynamic>>?> readTable(String table) async {
    final rows = await (_database.select(_database.syncRecords)
          ..where((row) => row.sourceTable.equals(table)))
        .get();
    if (rows.isEmpty) return null;
    return [
      for (final row in rows) jsonDecode(row.payload) as Map<String, dynamic>,
    ];
  }

  @override
  Future<List<AttendanceOutboxOp>> listPendingOps() async {
    final rows = await (_database.select(_database.outboxOps)
          ..orderBy([(row) => OrderingTerm.asc(row.createdAt)]))
        .get();
    return [
      for (final row in rows)
        AttendanceOutboxOp.fromJson(
          jsonDecode(row.payload) as Map<String, dynamic>,
        ),
    ];
  }

  @override
  Future<void> enqueueOp(AttendanceOutboxOp op) async {
    await _database.into(_database.outboxOps).insertOnConflictUpdate(
      OutboxOpsCompanion.insert(
        clientOpId: op.clientOpId,
        payload: jsonEncode(op.toJson()),
        createdAt: op.createdAt,
      ),
    );
  }

  @override
  Future<void> removeOp(String clientOpId) async {
    await (_database.delete(_database.outboxOps)
          ..where((row) => row.clientOpId.equals(clientOpId)))
        .go();
  }

  @override
  Future<List<AttendanceOutboxConflict>> listConflicts() async {
    final rows = await (_database.select(_database.outboxConflicts)
          ..orderBy([(row) => OrderingTerm.desc(row.createdAt)]))
        .get();
    return [
      for (final row in rows)
        AttendanceOutboxConflict.fromJson(
          jsonDecode(row.payload) as Map<String, dynamic>,
        ),
    ];
  }

  @override
  Future<void> putConflict(AttendanceOutboxConflict conflict) async {
    await _database.into(_database.outboxConflicts).insertOnConflictUpdate(
      OutboxConflictsCompanion.insert(
        clientOpId: conflict.op.clientOpId,
        payload: jsonEncode(conflict.toJson()),
        createdAt: DateTime.now(),
      ),
    );
  }

  @override
  Future<void> removeConflict(String clientOpId) async {
    await (_database.delete(_database.outboxConflicts)
          ..where((row) => row.clientOpId.equals(clientOpId)))
        .go();
  }

  Future<String?> _readMeta(String key) async {
    final row = await (_database.select(_database.appMeta)
          ..where((entry) => entry.key.equals(key)))
        .getSingleOrNull();
    return row?.value;
  }

  Future<void> _writeMeta(String key, String value) async {
    await _database.into(_database.appMeta).insertOnConflictUpdate(
      AppMetaCompanion.insert(key: key, value: value),
    );
  }
}
