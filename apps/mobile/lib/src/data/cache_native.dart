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
