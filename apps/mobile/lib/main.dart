import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'src/app.dart';
import 'src/config.dart';
import 'src/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!AppConfig.isConfigured) {
    runApp(const _ConfigMissingApp());
    return;
  }
  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    publishableKey: AppConfig.supabaseAnonKey,
  );
  runApp(const ProviderScope(child: LmsApp()));
}

class _ConfigMissingApp extends StatelessWidget {
  const _ConfigMissingApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: buildAppTheme(),
      home: Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Configuration missing'),
                  const SizedBox(height: 12),
                  const Text(
                    'Run the app with the Supabase URL and anon key, for example:',
                  ),
                  const SizedBox(height: 12),
                  const SelectableText(
                    'flutter run --dart-define-from-file=env.json\n'
                    'flutter build web --dart-define-from-file=env.json',
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'env.json must contain SUPABASE_URL, SUPABASE_ANON_KEY, '
                    'API_BASE_URL and WEB_BASE_URL.',
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
