import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lms_mobile/src/session.dart';

String token(Map<String, dynamic> claims) {
  String segment(Object value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${segment({'alg': 'ES256'})}.${segment(claims)}.signature';
}

void main() {
  test('reads the platform role from the access token', () {
    expect(roleFromToken(token({'app_role': 'teacher', 'tenant_id': 't-1'})), 'teacher');
    expect(roleFromToken(token({'app_role': 'student'})), 'student');
  });

  test('ignores missing or malformed tokens', () {
    expect(roleFromToken(null), isNull);
    expect(roleFromToken('not-a-jwt'), isNull);
    expect(roleFromToken(token({'tenant_id': 't-1'})), isNull);
    expect(roleFromToken(token({'app_role': ''})), isNull);
  });
}
