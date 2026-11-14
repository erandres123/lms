import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers.dart';
import '../widgets/error_view.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: me.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorView(
          error: error,
          onRetry: () => ref.invalidate(meProvider),
        ),
        data: (me) => ListView(
          children: [
            const SizedBox(height: 8),
            ListTile(
              leading: const CircleAvatar(child: Icon(Icons.person)),
              title: Text(me.email ?? 'Signed in'),
              subtitle: Text(_roleLabel(me.role)),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.badge_outlined),
              title: const Text('User ID'),
              subtitle: Text(me.userId),
            ),
            ListTile(
              leading: const Icon(Icons.apartment_outlined),
              title: const Text('School (tenant)'),
              subtitle: Text(me.tenantId),
            ),
            const Divider(),
            ListTile(
              leading: Icon(Icons.logout, color: Theme.of(context).colorScheme.error),
              title: const Text('Sign out'),
              onTap: () => _signOut(context),
            ),
          ],
        ),
      ),
    );
  }

  String _roleLabel(String role) => switch (role) {
    'school_admin' => 'School administrator',
    'teacher' => 'Teacher',
    'student' => 'Student',
    'parent' => 'Parent',
    _ => role,
  };

  Future<void> _signOut(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('Cached schedule data stays on this device.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed ?? false) {
      await Supabase.instance.client.auth.signOut();
    }
  }
}
