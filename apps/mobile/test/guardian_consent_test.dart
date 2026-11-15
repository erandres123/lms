import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lms_mobile/src/api/models.dart';
import 'package:lms_mobile/src/providers.dart';
import 'package:lms_mobile/src/screens/guardian_consent_screen.dart';

Widget harness(GuardianOverview overview) => ProviderScope(
  overrides: [guardianOverviewProvider.overrideWith((ref) async => overview)],
  child: const MaterialApp(home: GuardianConsentScreen()),
);

final published = PrivacyNoticeSettings(
  notice: const PrivacyNotice(title: 'Student privacy notice', body: 'Body'),
  version: 2,
  updatedAt: DateTime(2026, 11, 15),
);

void main() {
  test('parses linked students and their consent state', () {
    final overview = GuardianOverview.fromJson({
      'notice': {
        'notice': {'title': 'Student privacy notice', 'body': 'Body'},
        'version': 2,
        'updatedAt': null,
      },
      'students': [
        {
          'studentId': 's1',
          'firstName': 'Ana',
          'lastName': 'Cruz',
          'relationship': 'Mother',
          'consentStatus': 'withdrawn',
          'consentNoticeVersion': 1,
          'consentAt': '2026-11-15T02:00:00.000Z',
        },
      ],
    });

    expect(overview.notice.version, 2);
    expect(overview.students.single.displayName, 'Cruz, Ana');
    expect(overview.students.single.consentStatus, 'withdrawn');
    expect(overview.students.single.consentNoticeVersion, 1);
    expect(overview.students.single.consentAt, isNotNull);
  });

  testWidgets('offers grant or withdraw per linked student', (tester) async {
    await tester.pumpWidget(
      harness(
        GuardianOverview(
          notice: published,
          students: const [
            GuardianStudent(
              studentId: 's1',
              firstName: 'Ana',
              lastName: 'Cruz',
              relationship: 'Mother',
              consentStatus: 'granted',
              consentNoticeVersion: 2,
              consentAt: null,
            ),
            GuardianStudent(
              studentId: 's2',
              firstName: 'Ben',
              lastName: 'Cruz',
              relationship: 'Father',
              consentStatus: 'withdrawn',
            ),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Cruz, Ana'), findsOneWidget);
    expect(find.text('Cruz, Ben'), findsOneWidget);
    expect(find.text('Consent granted'), findsOneWidget);
    expect(find.text('Consent withdrawn'), findsOneWidget);
    // Ana already granted notice v2, so her grant button is disabled.
    final grantAna = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Grant consent'),
    );
    expect(grantAna.onPressed, isNull);
    expect(find.text('Withdraw'), findsOneWidget);
    expect(find.text('Grant consent again'), findsOneWidget);
  });

  testWidgets('explains when no student is linked', (tester) async {
    await tester.pumpWidget(
      harness(GuardianOverview(notice: published, students: const [])),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        'No student is linked to your account yet. Ask the school office to link your child.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('waits for a published notice before consent', (tester) async {
    await tester.pumpWidget(
      harness(
        const GuardianOverview(
          notice: PrivacyNoticeSettings(notice: null, version: 0),
          students: [],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('The school has not published a privacy notice yet.'),
      findsOneWidget,
    );
  });
}
