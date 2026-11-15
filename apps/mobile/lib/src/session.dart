import 'dart:convert';

/// Reads the platform role from the Supabase access token, so the app can
/// decide what to show even when the API is unreachable.
String? roleFromToken(String? token) {
  if (token == null) return null;
  final parts = token.split('.');
  if (parts.length != 3) return null;
  try {
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    final decoded = jsonDecode(payload);
    if (decoded is! Map<String, dynamic>) return null;
    final role = decoded['app_role'];
    return role is String && role.isNotEmpty ? role : null;
  } on FormatException {
    return null;
  }
}
