import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lms_mobile/src/api/models.dart';
import 'package:lms_mobile/src/providers.dart';
import 'package:lms_mobile/src/screens/privacy_screen.dart';

Widget harness(PrivacyNoticeSettings settings) => ProviderScope(
  overrides: [
    privacyNoticeProvider.overrideWith((ref) async => settings),
  ],
  child: const MaterialApp(home: PrivacyScreen()),
);

void main() {
  test('parses a published notice and an empty tenant', () {
    final published = PrivacyNoticeSettings.fromJson({
      'notice': {'title': 'Student privacy notice', 'body': 'We keep records.'},
      'version': 3,
      'updatedAt': '2026-11-15T02:00:00.000Z',
    });
    expect(published.notice?.title, 'Student privacy notice');
    expect(published.version, 3);
    expect(published.updatedAt, isNotNull);

    final empty = PrivacyNoticeSettings.fromJson({
      'notice': null,
      'version': 0,
      'updatedAt': null,
    });
    expect(empty.notice, isNull);
    expect(empty.version, 0);
    expect(empty.updatedAt, isNull);
  });

  testWidgets('shows the published notice', (tester) async {
    await tester.pumpWidget(
      harness(
        PrivacyNoticeSettings(
          notice: const PrivacyNotice(
            title: 'Student privacy notice',
            body: 'We keep attendance records for the school year.',
          ),
          version: 2,
          updatedAt: DateTime(2026, 11, 15),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Student privacy notice'), findsOneWidget);
    expect(find.text('Version 2'), findsOneWidget);
    expect(
      find.text('We keep attendance records for the school year.'),
      findsOneWidget,
    );
  });

  testWidgets('explains when nothing is published', (tester) async {
    await tester.pumpWidget(
      harness(
        const PrivacyNoticeSettings(notice: null, version: 0),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('The school has not published a privacy notice yet.'),
      findsOneWidget,
    );
  });
}
