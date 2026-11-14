import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../api/api_client.dart';
import '../config.dart';

@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

/// Registers this device for FCM and mirrors foreground messages into the
/// existing in-app inbox. Push is best-effort: failures never break the app.
class PushService {
  PushService({
    required this.api,
    required this.onInboxChanged,
    required this.onOpenInbox,
  });

  final ApiClient api;
  final VoidCallback onInboxChanged;
  final VoidCallback onOpenInbox;

  final messengerKey = GlobalKey<ScaffoldMessengerState>();

  StreamSubscription<AuthState>? _authSubscription;
  StreamSubscription<String>? _tokenSubscription;
  StreamSubscription<RemoteMessage>? _openSubscription;
  StreamSubscription<RemoteMessage>? _messageSubscription;
  bool _started = false;

  Future<void> start() async {
    if (_started) return;
    _started = true;

    try {
      if (kIsWeb) {
        if (!AppConfig.firebaseWebConfigured) return;
        await Firebase.initializeApp(options: _webOptions);
      } else {
        await Firebase.initializeApp();
        FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
      }
    } catch (error) {
      debugPrint('Push disabled: $error');
      return;
    }

    final messaging = FirebaseMessaging.instance;
    // v17's register()/onRegistered only reports newly issued IDs; getToken is
    // still the reliable way to read the current token after an app restart.
    // ignore: deprecated_member_use
    _tokenSubscription = messaging.onTokenRefresh.listen(_register);
    _messageSubscription = FirebaseMessaging.onMessage.listen(_showForeground);

    if (!kIsWeb) {
      _openSubscription = FirebaseMessaging.onMessageOpenedApp.listen(
        (_) => onOpenInbox(),
      );
    }

    _authSubscription = Supabase.instance.client.auth.onAuthStateChange.listen(
      (state) {
        if (state.event == AuthChangeEvent.signedIn) _sync();
      },
    );

    if (Supabase.instance.client.auth.currentSession != null) {
      await _sync();
    }

    if (!kIsWeb) {
      final initial = await messaging.getInitialMessage();
      if (initial != null) onOpenInbox();
    }
  }

  Future<void> _sync() async {
    try {
      if (kIsWeb && AppConfig.firebaseVapidKey.isEmpty) return;

      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;

      if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
        await messaging.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
      }

      // ignore: deprecated_member_use
      final token = await messaging.getToken(
        vapidKey: kIsWeb ? AppConfig.firebaseVapidKey : null,
        serviceWorkerScriptPath: kIsWeb ? '/firebase-messaging-sw.js' : null,
      );
      if (token != null) await _register(token);
    } catch (error) {
      debugPrint('Push registration skipped: $error');
    }
  }

  Future<void> _register(String token) async {
    if (Supabase.instance.client.auth.currentSession == null) return;
    try {
      await api.registerPushDevice(platform: _platform, token: token);
    } catch (error) {
      debugPrint('Push token registration failed: $error');
    }
  }

  String get _platform {
    if (kIsWeb) return 'web';
    return defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
  }

  void _showForeground(RemoteMessage message) {
    onInboxChanged();
    // iOS shows its own foreground banner; Android and web need an in-app cue.
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) return;

    final title = message.notification?.title ?? message.data['title'];
    final body = message.notification?.body ?? message.data['body'];
    final text = [title, body]
        .whereType<String>()
        .where((value) => value.isNotEmpty)
        .join('\n');
    messengerKey.currentState?.showSnackBar(
      SnackBar(
        content: Text(text.isEmpty ? 'You have a new notification.' : text),
        action: SnackBarAction(label: 'View', onPressed: onOpenInbox),
      ),
    );
  }

  FirebaseOptions get _webOptions => FirebaseOptions(
    apiKey: AppConfig.firebaseApiKey,
    appId: AppConfig.firebaseAppId,
    messagingSenderId: AppConfig.firebaseSenderId,
    projectId: AppConfig.firebaseProjectId,
    authDomain:
        AppConfig.firebaseAuthDomain.isEmpty ? null : AppConfig.firebaseAuthDomain,
    storageBucket: AppConfig.firebaseStorageBucket.isEmpty
        ? null
        : AppConfig.firebaseStorageBucket,
  );

  void dispose() {
    _authSubscription?.cancel();
    _tokenSubscription?.cancel();
    _openSubscription?.cancel();
    _messageSubscription?.cancel();
  }
}
