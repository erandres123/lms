import 'package:drift/drift.dart';

part 'database.g.dart';

class SyncRecords extends Table {
  TextColumn get sourceTable => text()();
  TextColumn get rowId => text()();
  TextColumn get payload => text()();
  IntColumn get seq => integer()();
  IntColumn get version => integer().nullable()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {sourceTable, rowId};
}

class AppMeta extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

@DriftDatabase(tables: [SyncRecords, AppMeta])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.e);

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async {
      await m.createAll();
    },
    onUpgrade: (m, from, to) async {
      if (from < 2) {
        await m.createTable(syncRecords);
        await m.deleteTable('cached_sections');
      }
    },
  );
}
