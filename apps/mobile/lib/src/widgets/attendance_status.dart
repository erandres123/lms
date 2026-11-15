import 'package:flutter/material.dart';

import '../api/models.dart';

Color attendanceStatusColor(BuildContext context, AttendanceStatus status) {
  final scheme = Theme.of(context).colorScheme;
  return switch (status) {
    AttendanceStatus.present => scheme.primary,
    AttendanceStatus.absent => scheme.error,
    AttendanceStatus.late => scheme.tertiary,
    AttendanceStatus.excused => scheme.secondary,
  };
}

IconData attendanceStatusIcon(AttendanceStatus status) => switch (status) {
  AttendanceStatus.present => Icons.check_circle,
  AttendanceStatus.absent => Icons.cancel,
  AttendanceStatus.late => Icons.schedule,
  AttendanceStatus.excused => Icons.verified_user,
};

class AttendanceStatusChip extends StatelessWidget {
  const AttendanceStatusChip({super.key, required this.status});

  final AttendanceStatus status;

  @override
  Widget build(BuildContext context) {
    final color = attendanceStatusColor(context, status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status.label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color),
      ),
    );
  }
}
