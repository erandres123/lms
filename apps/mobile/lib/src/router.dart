import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'screens/join_screen.dart';
import 'screens/login_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/schedule_screen.dart';
import 'screens/section_detail_screen.dart';
import 'widgets/app_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<Session?>(Supabase.instance.client.auth.currentSession);
  final subscription = Supabase.instance.client.auth.onAuthStateChange.listen(
    (state) => refresh.value = state.session,
  );

  final router = GoRouter(
    refreshListenable: refresh,
    initialLocation: '/schedule',
    redirect: (context, state) {
      final signedIn = refresh.value != null;
      final onLogin = state.matchedLocation == '/login';
      if (!signedIn) return onLogin ? null : '/login';
      if (onLogin) return '/schedule';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/schedule', builder: (_, _) => const ScheduleScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/inbox', builder: (_, _) => const NotificationsScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen()),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/sections/:sectionId',
        builder: (context, state) =>
            SectionDetailScreen(sectionId: state.pathParameters['sectionId']!),
      ),
      GoRoute(
        path: '/join/:meetingId',
        builder: (context, state) =>
            JoinScreen(meetingId: state.pathParameters['meetingId']!),
      ),
    ],
  );

  ref.onDispose(() {
    subscription.cancel();
    router.dispose();
    refresh.dispose();
  });
  return router;
});
