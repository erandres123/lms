import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:lms_mobile/src/api/models.dart';
import 'package:lms_mobile/src/data/cache.dart';
import 'package:lms_mobile/src/providers.dart';
import 'package:lms_mobile/src/screens/teacher_attendance_panel.dart';

Widget harness(List<Object> overrides) => ProviderScope(
  overrides: overrides.cast(),
  child: const MaterialApp(
    home: Scaffold(body: TeacherAttendancePanel(sectionId: 'section-1')),
  ),
);

void main() {
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final key = (sectionId: 'section-1', date: today);

  testWidgets('marks students offline and queues the sheet', (tester) async {
    final store = MemoryLocalStore();
    await store.prepareForUser('teacher-1');

    await tester.pumpWidget(
      harness([
        localStoreProvider.overrideWith((ref) async => store),
        pushAttendanceOpsProvider.overrideWithValue(
          (operations) async => throw Exception('offline'),
        ),
        rosterProvider('section-1').overrideWith(
          (ref) async => const [
            RosterStudent(id: 'student-1', firstName: 'Ana', lastName: 'Cruz'),
            RosterStudent(id: 'student-2', firstName: 'Jose', lastName: 'Diaz'),
          ],
        ),
        attendanceProvider(key).overrideWith((ref) async => []),
      ]),
    );
    await tester.pumpAndSettle();

    expect(find.text('Ana Cruz'), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.widgetWithText(ListTile, 'Ana Cruz'),
        matching: find.byTooltip('Absent'),
      ),
    );
    await tester.pump();
    await tester.tap(
      find.descendant(
        of: find.widgetWithText(ListTile, 'Jose Diaz'),
        matching: find.byTooltip('Late'),
      ),
    );
    await tester.pump();

    await tester.tap(find.text('Save attendance'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Saved on this device'), findsOneWidget);
    expect(find.textContaining('Queued: 1 sheet'), findsOneWidget);

    final pending = await store.listPendingOps();
    expect(pending, hasLength(1));
    expect(pending.single.date, today);
    expect(
      pending.single.entries.map((entry) => entry.status),
      [AttendanceStatus.absent, AttendanceStatus.late],
    );
  });

  testWidgets('syncs the queue and pins the base version', (tester) async {
    final store = MemoryLocalStore();
    await store.prepareForUser('teacher-1');
    late List<Map<String, dynamic>> pushed;

    await tester.pumpWidget(
      harness([
        localStoreProvider.overrideWith((ref) async => store),
        pushAttendanceOpsProvider.overrideWithValue((operations) async {
          pushed = operations;
          return SyncPushResponse(
            results: [
              for (final op in operations)
                SyncPushOutcome(
                  clientOpId: op['clientOpId'] as String,
                  status: 'applied',
                ),
            ],
          );
        }),
        rosterProvider('section-1').overrideWith(
          (ref) async => const [
            RosterStudent(id: 'student-1', firstName: 'Ana', lastName: 'Cruz'),
          ],
        ),
        attendanceProvider(key).overrideWith(
          (ref) async => [
            AttendanceRecord(
              studentId: 'student-1',
              date: today,
              status: AttendanceStatus.present,
              version: 4,
            ),
          ],
        ),
      ]),
    );
    await tester.pumpAndSettle();

    expect(find.text('Present · v4'), findsOneWidget);

    await tester.tap(find.byTooltip('Excused'));
    await tester.pump();
    await tester.tap(find.text('Save attendance'));
    await tester.pumpAndSettle();

    expect(find.text('Synced 1 sheet.'), findsOneWidget);
    expect(await store.listPendingOps(), isEmpty);
    final entry =
        (pushed.single['entries'] as List<dynamic>).single as Map<String, dynamic>;
    expect(entry['status'], 'excused');
    expect(entry['baseVersion'], 4);
  });
}
