import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'api/api_client.dart';
import 'api/models.dart';
import 'data/cache.dart';
import 'data/cache_factory.dart';
import 'data/outbox.dart';
import 'data/sync_runner.dart';
import 'session.dart';

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(Supabase.instance.client),
);

final pushAttendanceOpsProvider = Provider<PushAttendanceOps>(
  (ref) => ref.watch(apiClientProvider).push,
);

final localStoreProvider = FutureProvider<LocalStore>(
  (ref) => openLocalStore(),
);

final syncRunnerProvider = FutureProvider<SyncRunner>((ref) async {
  final api = ref.watch(apiClientProvider);
  final store = await ref.watch(localStoreProvider.future);
  return SyncRunner(api, store);
});

final meProvider = FutureProvider.autoDispose<Me>(
  (ref) => ref.watch(apiClientProvider).me(),
);

/// The signed-in role, read from the token so it survives offline.
final sessionRoleProvider = Provider<String?>(
  (ref) => roleFromToken(
    Supabase.instance.client.auth.currentSession?.accessToken,
  ),
);

final sectionsProvider = FutureProvider<List<Section>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final store = await ref.watch(localStoreProvider.future);
  final runner = await ref.watch(syncRunnerProvider.future);

  // Keep the mirror warm in the background; failures surface through the
  // online call or are retried on the next refresh.
  final mirror = runner.pullAll();
  unawaited(mirror.then((_) {}, onError: (Object _) {}));

  try {
    return await api.sections();
  } on Exception {
    await mirror.then((_) {}, onError: (Object _) {});
    final cached = await store.readTable('sections');
    if (cached != null && cached.isNotEmpty) {
      return [for (final row in cached) Section.fromJson(row)];
    }
    rethrow;
  }
});

final periodsProvider = FutureProvider.autoDispose<List<Period>>((ref) async {
  final api = ref.watch(apiClientProvider);
  try {
    return await api.periods();
  } on Exception {
    final store = await ref.watch(localStoreProvider.future);
    final cached = await store.readTable('grading_periods');
    if (cached != null && cached.isNotEmpty) {
      return [for (final row in cached) Period.fromJson(row)];
    }
    rethrow;
  }
});

final meetingsProvider = FutureProvider.autoDispose
    .family<List<Meeting>, String>(
      (ref, sectionId) => ref.watch(apiClientProvider).meetings(sectionId),
    );

final rosterProvider = FutureProvider.autoDispose
    .family<List<RosterStudent>, String>((ref, sectionId) async {
      final api = ref.watch(apiClientProvider);
      try {
        return await api.roster(sectionId);
      } on Exception {
        final store = await ref.watch(localStoreProvider.future);
        final enrollments = await store.readTable('enrollments');
        final students = await store.readTable('students');
        final byId = {
          for (final row in students ?? const <Map<String, dynamic>>[])
            row['id'] as String: row,
        };
        final roster = <RosterStudent>[
          for (final row in enrollments ?? const <Map<String, dynamic>>[])
            if (row['sectionId'] == sectionId &&
                row['status'] == 'active' &&
                byId[row['studentId']] != null)
              RosterStudent(
                id: byId[row['studentId']]!['id'] as String,
                firstName: byId[row['studentId']]!['firstName'] as String,
                lastName: byId[row['studentId']]!['lastName'] as String,
                userId: byId[row['studentId']]!['userId'] as String?,
              ),
        ]..sort((a, b) => a.lastName.toLowerCase().compareTo(b.lastName.toLowerCase()));
        if (roster.isNotEmpty) return roster;
        rethrow;
      }
    });

typedef GradebookKey = ({String sectionId, String periodId});

final gradebookProvider = FutureProvider.autoDispose
    .family<Gradebook, GradebookKey>(
      (ref, key) => ref
          .watch(apiClientProvider)
          .gradebook(key.sectionId, key.periodId),
    );

typedef AttendanceKey = ({String sectionId, String date});

final attendanceProvider = FutureProvider.autoDispose
    .family<List<AttendanceRecord>, AttendanceKey>((ref, key) async {
      final api = ref.watch(apiClientProvider);
      try {
        return await api.attendance(key.sectionId, key.date);
      } on Exception {
        final store = await ref.watch(localStoreProvider.future);
        final cached = await store.readTable('attendance');
        final records = [
          for (final row in cached ?? const <Map<String, dynamic>>[])
            if (row['sectionId'] == key.sectionId && row['date'] == key.date)
              AttendanceRecord.fromJson(row),
        ];
        if (records.isNotEmpty) return records;
        rethrow;
      }
    });

final notificationsProvider = FutureProvider.autoDispose<NotificationInbox>(
  (ref) => ref.watch(apiClientProvider).notifications(),
);

final privacyNoticeProvider =
    FutureProvider.autoDispose<PrivacyNoticeSettings>(
      (ref) => ref.watch(apiClientProvider).privacyNotice(),
    );

// A 403 means the teacher has not started the class; retrying would loop.
final joinProvider = FutureProvider.autoDispose.family<JoinResult, String>(
  (ref, meetingId) => ref.watch(apiClientProvider).join(meetingId),
  retry: (retryCount, error) => null,
);
