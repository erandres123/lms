import 'package:flutter_test/flutter_test.dart';
import 'package:lms_mobile/src/api/models.dart';
import 'package:lms_mobile/src/join_link.dart';

JoinResult _result() => JoinResult(
  url: 'wss://live.example.com',
  token: 'token-123',
  role: 'viewer',
  meeting: Meeting(
    id: 'meeting-1',
    sectionId: 'section-1',
    title: 'Math 7 — Fractions',
    status: 'live',
    scheduledFor: DateTime.utc(2026, 11, 14, 1, 0),
    durationMinutes: 60,
    joinable: true,
    providerConfigured: true,
  ),
);

void main() {
  group('meetingIdFromDeepLink', () {
    const id = '8f14e45f-ceea-4f1a-9b2c-3f4d5e6a7b8c';

    test('parses the custom scheme host form', () {
      expect(meetingIdFromDeepLink(Uri.parse('lms://join/$id')), id);
    });

    test('parses the custom scheme path form', () {
      expect(meetingIdFromDeepLink(Uri.parse('lms:///join/$id')), id);
    });

    test('parses an https link', () {
      expect(meetingIdFromDeepLink(Uri.parse('https://lms.example.com/join/$id')), id);
    });

    test('rejects links without a meeting uuid', () {
      expect(meetingIdFromDeepLink(Uri.parse('lms://join/not-a-uuid')), isNull);
      expect(meetingIdFromDeepLink(Uri.parse('https://lms.example.com/other')), isNull);
    });
  });

  test('buildJoinLink puts the token in the fragment only', () {
    final link = buildJoinLink(_result(), webBaseUrl: 'https://app.example.com/');
    expect(link.hasFragment, isTrue);
    expect(link.query, isEmpty);
    expect(link.path, '/live-join');
    final params = Uri.splitQueryString(link.fragment);
    expect(params['url'], 'wss://live.example.com');
    expect(params['token'], 'token-123');
    expect(params['role'], 'viewer');
    expect(params['title'], 'Math 7 — Fractions');
  });
}
