import 'package:flutter_test/flutter_test.dart';
import 'package:lms_mobile/src/api/models.dart';

void main() {
  test('parses a meeting and exposes live state', () {
    final meeting = Meeting.fromJson({
      'id': 'm1',
      'sectionId': 's1',
      'title': 'Math',
      'status': 'live',
      'scheduledFor': '2026-11-14T01:00:00.000Z',
      'durationMinutes': 60,
      'joinable': true,
      'providerConfigured': true,
    });
    expect(meeting.isLive, isTrue);
    expect(meeting.canJoin, isTrue);
    expect(meeting.scheduledFor.isUtc, isFalse);
  });

  test('parses a gradebook row with scores and categories', () {
    final row = StudentRow.fromJson({
      'studentId': 'stu1',
      'firstName': 'Ana',
      'lastName': 'Cruz',
      'categories': [
        {
          'categoryId': 'cat1',
          'percentage': 88.5,
          'earned': 17.7,
          'possible': 20,
        },
      ],
      'scores': {
        'item1': {'score': 9, 'version': 2},
      },
      'percentage': 88.5,
      'transmutedGrade': 92,
      'effectiveGrade': 92,
    });
    expect(row.fullName, 'Ana Cruz');
    expect(row.scores['item1']?.score, 9);
    expect(row.scores['item1']?.version, 2);
    expect(row.categories.single.percentage, 88.5);
    expect(row.effectiveGrade, 92);
  });

  test('parses an inbox and keeps unread state', () {
    final inbox = NotificationInbox.fromJson({
      'unreadCount': 1,
      'items': [
        {
          'id': 'n1',
          'kind': 'class_starting',
          'title': 'Class starting soon',
          'body': 'Angles check-in starts at 9:00 AM.',
          'data': <String, String>{'meetingId': 'm1', 'sectionId': 's1'},
          'readAt': null,
          'createdAt': '2026-11-14T01:30:00.000Z',
        },
        {
          'id': 'n2',
          'kind': 'absence_marked',
          'title': 'Marked absent',
          'body': 'You were marked absent.',
          'data': <String, String>{},
          'readAt': '2026-11-14T02:00:00.000Z',
          'createdAt': '2026-11-14T01:00:00.000Z',
        },
      ],
    });

    expect(inbox.unreadCount, 1);
    expect(inbox.items.first.unread, isTrue);
    expect(inbox.items.first.data['meetingId'], 'm1');
    expect(inbox.items.last.unread, isFalse);
    expect(inbox.items.first.createdAt.isUtc, isFalse);
  });
}
