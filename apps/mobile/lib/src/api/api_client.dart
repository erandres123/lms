import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import 'models.dart';

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  bool get unauthorized => statusCode == 401;
  bool get notFound => statusCode == 404;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this._auth, {http.Client? httpClient})
    : _http = httpClient ?? http.Client();

  final SupabaseClient _auth;
  final http.Client _http;

  String? get userId => _auth.auth.currentUser?.id;

  Future<Me> me() async =>
      Me.fromJson(await _get('/v1/me') as Map<String, dynamic>);

  Future<SyncPage> pull({required int cursor, int limit = 200}) async {
    final payload = await _get(
      '/v1/sync/pull',
      query: {'cursor': '$cursor', 'limit': '$limit'},
    );
    return SyncPage.fromJson(payload as Map<String, dynamic>);
  }

  Future<List<Section>> sections() async {
    final data = await _get('/v1/sections') as List<dynamic>;
    return data
        .map((entry) => Section.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<List<Period>> periods() async {
    final data = await _get('/v1/grading-periods') as List<dynamic>;
    return data
        .map((entry) => Period.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<List<Meeting>> meetings(String sectionId) async {
    final payload = await _get('/v1/sections/$sectionId/meetings') as Map<String, dynamic>;
    final meetings = payload['meetings'] as List<dynamic>? ?? const [];
    return meetings
        .map((entry) => Meeting.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<Gradebook> gradebook(String sectionId, String periodId) async {
    final payload = await _get(
      '/v1/sections/$sectionId/gradebook',
      query: {'periodId': periodId},
    );
    return Gradebook.fromJson(payload as Map<String, dynamic>);
  }

  Future<List<AttendanceRecord>> attendance(String sectionId, String date) async {
    final payload = await _get(
      '/v1/sections/$sectionId/attendance',
      query: {'date': date},
    ) as Map<String, dynamic>;
    final records = payload['records'] as List<dynamic>? ?? const [];
    return records
        .map((entry) => AttendanceRecord.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<List<RosterStudent>> roster(String sectionId) async {
    final payload = await _get('/v1/sections/$sectionId/roster') as Map<String, dynamic>;
    final students = payload['students'] as List<dynamic>? ?? const [];
    return students
        .map((entry) => RosterStudent.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<SyncPushResponse> push(
    List<Map<String, dynamic>> operations,
  ) async {
    final payload = await _post(
      '/v1/sync/push',
      body: {'operations': operations},
    );
    return SyncPushResponse.fromJson(payload as Map<String, dynamic>);
  }

  Future<PrivacyNoticeSettings> privacyNotice() async {
    final payload = await _get('/v1/privacy/notice');
    return PrivacyNoticeSettings.fromJson(payload as Map<String, dynamic>);
  }

  Future<GuardianOverview> guardianOverview() async {
    final payload = await _get('/v1/guardian/overview');
    return GuardianOverview.fromJson(payload as Map<String, dynamic>);
  }

  Future<void> captureGuardianConsent(
    String studentId, {
    required String status,
    String? note,
  }) async {
    await _post(
      '/v1/guardian/students/$studentId/consents',
      body: {'status': status, 'note': ?note},
    );
  }

  Future<JoinResult> join(String meetingId) async {
    final payload = await _post('/v1/meetings/$meetingId/join');
    return JoinResult.fromJson(payload as Map<String, dynamic>);
  }

  Future<NotificationInbox> notifications({int limit = 50}) async {
    final payload = await _get(
      '/v1/notifications',
      query: {'limit': '$limit'},
    );
    return NotificationInbox.fromJson(payload as Map<String, dynamic>);
  }

  Future<AppNotification> markNotificationRead(String notificationId) async {
    final payload = await _post('/v1/notifications/$notificationId/read');
    return AppNotification.fromJson(payload as Map<String, dynamic>);
  }

  Future<PushDevice> registerPushDevice({
    required String platform,
    required String token,
  }) async {
    final payload = await _post(
      '/v1/notifications/devices',
      body: {'platform': platform, 'token': token},
    );
    return PushDevice.fromJson(payload as Map<String, dynamic>);
  }

  Future<dynamic> _get(String path, {Map<String, String>? query}) =>
      _send('GET', path, query: query);

  Future<dynamic> _post(String path, {Object? body}) =>
      _send('POST', path, body: body);

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
  }) async {
    final headers = await _headers();
    if (body != null) headers['Content-Type'] = 'application/json';
    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path').replace(
      queryParameters: query?.isEmpty ?? true ? null : query,
    );
    final encodedBody = body == null ? null : jsonEncode(body);

    final response = method == 'POST'
        ? await _http.post(uri, headers: headers, body: encodedBody)
        : await _http.get(uri, headers: headers);

    final decoded = _decode(response.body);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(response.statusCode, _errorMessage(decoded));
    }
    return decoded;
  }

  Future<Map<String, String>> _headers() async {
    final session = _auth.auth.currentSession;
    if (session == null) {
      throw const ApiException(401, 'Your session expired. Sign in again.');
    }
    return {
      'Authorization': 'Bearer ${session.accessToken}',
      'Accept': 'application/json',
    };
  }

  dynamic _decode(String body) {
    if (body.isEmpty) return null;
    try {
      return jsonDecode(body);
    } on FormatException {
      return null;
    }
  }

  String _errorMessage(dynamic decoded) {
    if (decoded is Map<String, dynamic>) {
      final message = decoded['message'];
      if (message is String) return message;
      if (message is List) return message.join(', ');
    }
    return 'The request failed. Try again.';
  }
}
