import 'package:flutter/material.dart';

abstract final class AppColors {
  static const seed = Color(0xFF0B4EA2);
  static const live = Color(0xFFB3261E);
  static const present = Color(0xFF1B7F3B);
  static const late = Color(0xFF9A6700);
  static const absent = Color(0xFFB3261E);
  static const excused = Color(0xFF4A5568);
}

abstract final class Insets {
  static const screen = 16.0;
  static const gap = 12.0;
  static const section = 24.0;
}

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: AppColors.seed);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: scheme.surfaceContainerLowest,
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      elevation: 0,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    ),
    listTileTheme: const ListTileThemeData(
      contentPadding: EdgeInsets.symmetric(horizontal: Insets.screen),
    ),
  );
}
