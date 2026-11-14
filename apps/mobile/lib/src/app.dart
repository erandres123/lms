import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'join_link.dart';
import 'providers.dart';
import 'push/push_service.dart';
import 'router.dart';
import 'theme.dart';

class LmsApp extends ConsumerStatefulWidget {
  const LmsApp({super.key});

  @override
  ConsumerState<LmsApp> createState() => _LmsAppState();
}

class _LmsAppState extends ConsumerState<LmsApp> {
  StreamSubscription<Uri>? _subscription;
  PushService? _push;

  @override
  void initState() {
    super.initState();
    _push = PushService(
      api: ref.read(apiClientProvider),
      onInboxChanged: () => ref.invalidate(notificationsProvider),
      onOpenInbox: () => ref.read(routerProvider).go('/inbox'),
    );
    unawaited(_push!.start());
    if (kIsWeb) return;
    final links = AppLinks();
    links.getInitialLink().then(_handleLink);
    _subscription = links.uriLinkStream.listen(_handleLink);
  }

  void _handleLink(Uri? uri) {
    if (uri == null || !mounted) return;
    final meetingId = meetingIdFromDeepLink(uri);
    if (meetingId != null) {
      ref.read(routerProvider).go('/join/$meetingId');
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _push?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'LMS',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: _push?.messengerKey,
      theme: buildAppTheme(),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
