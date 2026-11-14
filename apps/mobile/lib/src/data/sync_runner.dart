import 'dart:async';

import '../api/api_client.dart';
import 'cache.dart';

/// Pulls change_log pages into the local mirror until the cursor catches up.
class SyncRunner {
  SyncRunner(this._api, this._store);

  static const _pageLimit = 200;
  static const _maxPages = 200;

  final ApiClient _api;
  final LocalStore _store;
  Future<void>? _inFlight;

  Future<void> pullAll() {
    return _inFlight ??= _pullAll().whenComplete(() => _inFlight = null);
  }

  Future<void> _pullAll() async {
    final userId = _api.userId;
    if (userId == null) return;

    await _store.prepareForUser(userId);
    var cursor = await _store.readCursor();

    for (var page = 0; page < _maxPages; page++) {
      final changes = await _api.pull(cursor: cursor, limit: _pageLimit);
      await _store.applyPage(changes);
      if (!changes.hasMore) return;
      cursor = changes.nextCursor;
    }

    throw StateError('sync pull did not converge after $_maxPages pages');
  }
}
