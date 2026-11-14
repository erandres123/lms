import 'api/models.dart';
import 'config.dart';

final _uuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

String? meetingIdFromDeepLink(Uri uri) {
  final candidates = <String>[
    if (uri.host == 'join' && uri.pathSegments.isNotEmpty) uri.pathSegments.first,
    for (var i = 0; i < uri.pathSegments.length - 1; i++)
      if (uri.pathSegments[i] == 'join') uri.pathSegments[i + 1],
  ];
  for (final candidate in candidates) {
    if (_uuid.hasMatch(candidate)) return candidate;
  }
  return null;
}

Uri buildJoinLink(JoinResult result, {String? webBaseUrl}) {
  final base = (webBaseUrl ?? AppConfig.webBaseUrl).replaceAll(RegExp(r'/+$'), '');
  final fragment = Uri(
    queryParameters: {
      'url': result.url,
      'token': result.token,
      'title': result.meeting.title,
      'role': result.role,
    },
  ).query;
  return Uri.parse('$base/live-join#$fragment');
}
