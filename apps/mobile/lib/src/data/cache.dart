import '../api/models.dart';

/// Local mirror of the server tables plus the sync cursor.
abstract class LocalStore {
  /// Clears mirrors when a different user signs in.
  Future<void> prepareForUser(String userId);
  Future<int> readCursor();
  Future<void> applyPage(SyncPage page);
  Future<List<Map<String, dynamic>>?> readTable(String table);
}

class MemoryLocalStore implements LocalStore {
  final Map<String, Map<String, Map<String, dynamic>>> _rows = {};
  String? _userId;
  int _cursor = 0;

  @override
  Future<void> prepareForUser(String userId) async {
    if (_userId == userId) return;
    _rows.clear();
    _cursor = 0;
    _userId = userId;
  }

  @override
  Future<int> readCursor() async => _cursor;

  @override
  Future<void> applyPage(SyncPage page) async {
    for (final change in page.changes) {
      final table = _rows.putIfAbsent(change.table, () => {});
      if (change.isDelete) {
        table.remove(change.rowId);
      } else {
        table[change.rowId] = change.data!;
      }
    }
    _cursor = page.nextCursor;
  }

  @override
  Future<List<Map<String, dynamic>>?> readTable(String table) async {
    final rows = _rows[table];
    if (rows == null || rows.isEmpty) return null;
    return rows.values.toList();
  }
}
