import '../api/models.dart';
import 'outbox.dart';

/// Local mirror of the server tables, the sync cursor, and the outbox.
abstract class LocalStore implements OutboxStore {
  /// Clears mirrors and the outbox when a different user signs in.
  Future<void> prepareForUser(String userId);
  Future<int> readCursor();
  Future<void> applyPage(SyncPage page);
  Future<List<Map<String, dynamic>>?> readTable(String table);
}

class MemoryLocalStore implements LocalStore {
  final Map<String, Map<String, Map<String, dynamic>>> _rows = {};
  final Map<String, AttendanceOutboxOp> _pending = {};
  final Map<String, AttendanceOutboxConflict> _conflicts = {};
  String? _userId;
  int _cursor = 0;

  @override
  Future<void> prepareForUser(String userId) async {
    if (_userId == userId) return;
    _rows.clear();
    _pending.clear();
    _conflicts.clear();
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

  @override
  Future<List<AttendanceOutboxOp>> listPendingOps() async {
    final ops = _pending.values.toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return ops;
  }

  @override
  Future<void> enqueueOp(AttendanceOutboxOp op) async {
    _pending[op.clientOpId] = op;
  }

  @override
  Future<void> removeOp(String clientOpId) async {
    _pending.remove(clientOpId);
  }

  @override
  Future<List<AttendanceOutboxConflict>> listConflicts() async =>
      _conflicts.values.toList();

  @override
  Future<void> putConflict(AttendanceOutboxConflict conflict) async {
    _conflicts[conflict.op.clientOpId] = conflict;
  }

  @override
  Future<void> removeConflict(String clientOpId) async {
    _conflicts.remove(clientOpId);
  }
}
