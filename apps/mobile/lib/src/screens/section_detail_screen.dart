import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../widgets/error_view.dart';
import 'attendance_panel.dart';
import 'grades_panel.dart';
import 'meetings_panel.dart';

class SectionDetailScreen extends ConsumerWidget {
  const SectionDetailScreen({super.key, required this.sectionId});

  final String sectionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sections = ref.watch(sectionsProvider);
    return sections.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, _) => Scaffold(
        appBar: AppBar(),
        body: ErrorView(error: error, onRetry: () => ref.invalidate(sectionsProvider)),
      ),
      data: (sections) {
        final section = sections.where((s) => s.id == sectionId).firstOrNull;
        if (section == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: Text('Section not found.')),
          );
        }
        return DefaultTabController(
          length: 3,
          child: Scaffold(
            appBar: AppBar(
              title: Text(section.name),
              bottom: const TabBar(
                tabs: [
                  Tab(text: 'Meetings'),
                  Tab(text: 'Grades'),
                  Tab(text: 'Attendance'),
                ],
              ),
            ),
            body: TabBarView(
              children: [
                MeetingsPanel(sectionId: sectionId),
                GradesPanel(sectionId: sectionId),
                AttendancePanel(sectionId: sectionId),
              ],
            ),
          ),
        );
      },
    );
  }
}
