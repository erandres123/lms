enum AttendanceStatus {
  present('present', 'Present'),
  absent('absent', 'Absent'),
  late('late', 'Late'),
  excused('excused', 'Excused');

  const AttendanceStatus(this.wire, this.label);

  final String wire;
  final String label;

  static AttendanceStatus fromWire(String value) => values.firstWhere(
    (status) => status.wire == value,
    orElse: () => AttendanceStatus.present,
  );
}

class Me {
  const Me({
    required this.userId,
    required this.tenantId,
    required this.role,
    this.email,
  });

  factory Me.fromJson(Map<String, dynamic> json) => Me(
    userId: json['userId'] as String,
    tenantId: json['tenantId'] as String,
    role: json['role'] as String,
    email: json['email'] as String?,
  );

  final String userId;
  final String tenantId;
  final String role;
  final String? email;

  bool get isStudent => role == 'student';
}

class Section {
  const Section({
    required this.id,
    required this.name,
    required this.gradeLevel,
    required this.schoolYear,
    this.teacherId,
  });

  factory Section.fromJson(Map<String, dynamic> json) => Section(
    id: json['id'] as String,
    name: json['name'] as String,
    gradeLevel: (json['gradeLevel'] as num).toInt(),
    schoolYear: json['schoolYear'] as String,
    teacherId: json['teacherId'] as String?,
  );

  final String id;
  final String name;
  final int gradeLevel;
  final String schoolYear;
  final String? teacherId;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'gradeLevel': gradeLevel,
    'schoolYear': schoolYear,
    'teacherId': teacherId,
  };
}

class Period {
  const Period({required this.id, required this.name, required this.sequence});

  factory Period.fromJson(Map<String, dynamic> json) => Period(
    id: json['id'] as String,
    name: json['name'] as String,
    sequence: (json['sequence'] as num).toInt(),
  );

  final String id;
  final String name;
  final int sequence;
}

class Meeting {
  const Meeting({
    required this.id,
    required this.sectionId,
    required this.title,
    required this.status,
    required this.scheduledFor,
    required this.durationMinutes,
    required this.joinable,
    required this.providerConfigured,
  });

  factory Meeting.fromJson(Map<String, dynamic> json) => Meeting(
    id: json['id'] as String,
    sectionId: json['sectionId'] as String,
    title: json['title'] as String,
    status: json['status'] as String,
    scheduledFor: DateTime.parse(json['scheduledFor'] as String).toLocal(),
    durationMinutes: (json['durationMinutes'] as num).toInt(),
    joinable: json['joinable'] as bool,
    providerConfigured: json['providerConfigured'] as bool? ?? true,
  );

  final String id;
  final String sectionId;
  final String title;
  final String status;
  final DateTime scheduledFor;
  final int durationMinutes;
  final bool joinable;
  final bool providerConfigured;

  bool get isLive => status == 'live';
  bool get canJoin => isLive && joinable;
}

class JoinResult {
  const JoinResult({
    required this.url,
    required this.token,
    required this.role,
    required this.meeting,
  });

  factory JoinResult.fromJson(Map<String, dynamic> json) => JoinResult(
    url: json['url'] as String,
    token: json['token'] as String,
    role: json['role'] as String,
    meeting: Meeting.fromJson(json['meeting'] as Map<String, dynamic>),
  );

  final String url;
  final String token;
  final String role;
  final Meeting meeting;
}

class GradeItem {
  const GradeItem({
    required this.id,
    required this.title,
    required this.maxScore,
    this.competencyCode,
  });

  factory GradeItem.fromJson(Map<String, dynamic> json) => GradeItem(
    id: json['id'] as String,
    title: json['title'] as String,
    maxScore: (json['maxScore'] as num).toDouble(),
    competencyCode: json['competencyCode'] as String?,
  );

  final String id;
  final String title;
  final double maxScore;
  final String? competencyCode;
}

class GradeCategory {
  const GradeCategory({
    required this.id,
    required this.name,
    required this.weight,
    required this.items,
  });

  factory GradeCategory.fromJson(Map<String, dynamic> json) => GradeCategory(
    id: json['id'] as String,
    name: json['name'] as String,
    weight: (json['weight'] as num).toDouble(),
    items: (json['items'] as List<dynamic>)
        .map((item) => GradeItem.fromJson(item as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String name;
  final double weight;
  final List<GradeItem> items;
}

class CategoryResult {
  const CategoryResult({
    required this.categoryId,
    required this.earned,
    required this.possible,
    this.percentage,
  });

  factory CategoryResult.fromJson(Map<String, dynamic> json) => CategoryResult(
    categoryId: json['categoryId'] as String,
    earned: (json['earned'] as num).toDouble(),
    possible: (json['possible'] as num).toDouble(),
    percentage: (json['percentage'] as num?)?.toDouble(),
  );

  final String categoryId;
  final double earned;
  final double possible;
  final double? percentage;
}

class ScoreEntry {
  const ScoreEntry({required this.score, required this.version});

  final double score;
  final int version;
}

class StudentRow {
  const StudentRow({
    required this.studentId,
    required this.firstName,
    required this.lastName,
    required this.categories,
    required this.scores,
    this.percentage,
    this.transmutedGrade,
    this.effectiveGrade,
  });

  factory StudentRow.fromJson(Map<String, dynamic> json) {
    final rawScores = json['scores'] as Map<String, dynamic>? ?? const {};
    return StudentRow(
      studentId: json['studentId'] as String,
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
      categories: (json['categories'] as List<dynamic>)
          .map((entry) => CategoryResult.fromJson(entry as Map<String, dynamic>))
          .toList(),
      scores: {
        for (final entry in rawScores.entries)
          entry.key: ScoreEntry(
            score: ((entry.value as Map<String, dynamic>)['score'] as num).toDouble(),
            version: ((entry.value as Map<String, dynamic>)['version'] as num).toInt(),
          ),
      },
      percentage: (json['percentage'] as num?)?.toDouble(),
      transmutedGrade: (json['transmutedGrade'] as num?)?.toDouble(),
      effectiveGrade: (json['effectiveGrade'] as num?)?.toDouble(),
    );
  }

  final String studentId;
  final String firstName;
  final String lastName;
  final List<CategoryResult> categories;
  final Map<String, ScoreEntry> scores;
  final double? percentage;
  final double? transmutedGrade;
  final double? effectiveGrade;

  String get fullName => '$firstName $lastName'.trim();
}

class Gradebook {
  const Gradebook({
    required this.section,
    required this.period,
    required this.categories,
    required this.students,
    required this.weightsTotal,
  });

  factory Gradebook.fromJson(Map<String, dynamic> json) => Gradebook(
    section: Section.fromJson(json['section'] as Map<String, dynamic>),
    period: Period.fromJson(json['period'] as Map<String, dynamic>),
    categories: (json['categories'] as List<dynamic>)
        .map((entry) => GradeCategory.fromJson(entry as Map<String, dynamic>))
        .toList(),
    students: (json['students'] as List<dynamic>)
        .map((entry) => StudentRow.fromJson(entry as Map<String, dynamic>))
        .toList(),
    weightsTotal: (json['weightsTotal'] as num).toDouble(),
  );

  final Section section;
  final Period period;
  final List<GradeCategory> categories;
  final List<StudentRow> students;
  final double weightsTotal;
}

class AttendanceRecord {
  const AttendanceRecord({
    required this.studentId,
    required this.date,
    required this.status,
    this.version = 1,
    this.note,
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) =>
      AttendanceRecord(
        studentId: json['studentId'] as String,
        date: json['date'] as String,
        status: AttendanceStatus.fromWire(json['status'] as String),
        version: (json['version'] as num?)?.toInt() ?? 1,
        note: json['note'] as String?,
      );

  final String studentId;
  final String date;
  final AttendanceStatus status;
  final int version;
  final String? note;
}

class RosterStudent {
  const RosterStudent({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.userId,
  });

  factory RosterStudent.fromJson(Map<String, dynamic> json) => RosterStudent(
    id: json['id'] as String,
    firstName: json['firstName'] as String,
    lastName: json['lastName'] as String,
    userId: json['userId'] as String?,
  );

  final String id;
  final String firstName;
  final String lastName;
  final String? userId;
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.data,
    required this.createdAt,
    this.readAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final rawData = json['data'] as Map<String, dynamic>? ?? const {};
    return AppNotification(
      id: json['id'] as String,
      kind: json['kind'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      data: {
        for (final entry in rawData.entries) entry.key: '${entry.value}',
      },
      readAt: json['readAt'] == null
          ? null
          : DateTime.parse(json['readAt'] as String).toLocal(),
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
    );
  }

  final String id;
  final String kind;
  final String title;
  final String body;
  final Map<String, String> data;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get unread => readAt == null;
}

class NotificationInbox {
  const NotificationInbox({required this.items, required this.unreadCount});

  factory NotificationInbox.fromJson(Map<String, dynamic> json) =>
      NotificationInbox(
        items: (json['items'] as List<dynamic>)
            .map((entry) => AppNotification.fromJson(entry as Map<String, dynamic>))
            .toList(),
        unreadCount: (json['unreadCount'] as num).toInt(),
      );

  final List<AppNotification> items;
  final int unreadCount;
}

class PushDevice {
  const PushDevice({required this.id, required this.platform});

  factory PushDevice.fromJson(Map<String, dynamic> json) => PushDevice(
    id: json['id'] as String,
    platform: json['platform'] as String,
  );

  final String id;
  final String platform;
}


class SyncChange {
  const SyncChange({
    required this.seq,
    required this.table,
    required this.operation,
    required this.rowId,
    this.version,
    this.data,
  });

  factory SyncChange.fromJson(Map<String, dynamic> json) => SyncChange(
    seq: (json['seq'] as num).toInt(),
    table: json['table'] as String,
    operation: json['operation'] as String,
    rowId: json['rowId'] as String,
    version: (json['version'] as num?)?.toInt(),
    data: json['data'] as Map<String, dynamic>?,
  );

  final int seq;
  final String table;
  final String operation;
  final String rowId;
  final int? version;
  final Map<String, dynamic>? data;

  bool get isDelete => operation == 'delete' || data == null;
}

class SyncPage {
  const SyncPage({
    required this.changes,
    required this.nextCursor,
    required this.hasMore,
  });

  factory SyncPage.fromJson(Map<String, dynamic> json) => SyncPage(
    changes: (json['changes'] as List<dynamic>)
        .map((entry) => SyncChange.fromJson(entry as Map<String, dynamic>))
        .toList(),
    nextCursor: (json['nextCursor'] as num).toInt(),
    hasMore: json['hasMore'] as bool,
  );

  final List<SyncChange> changes;
  final int nextCursor;
  final bool hasMore;
}

class SyncConflictDetail {
  const SyncConflictDetail({
    required this.message,
    this.studentId,
    this.currentStatus,
    this.currentVersion,
  });

  factory SyncConflictDetail.fromJson(Map<String, dynamic> json) {
    final current = json['current'] as Map<String, dynamic>?;
    return SyncConflictDetail(
      message: (json['message'] as String?) ?? 'the server kept a newer version',
      studentId: json['studentId'] as String?,
      currentStatus: current?['status'] as String?,
      currentVersion: (current?['version'] as num?)?.toInt(),
    );
  }

  final String message;
  final String? studentId;
  final String? currentStatus;
  final int? currentVersion;
}

class SyncPushOutcome {
  const SyncPushOutcome({
    required this.clientOpId,
    required this.status,
    this.storedStatus,
    this.conflict,
    this.message,
  });

  factory SyncPushOutcome.fromJson(Map<String, dynamic> json) {
    final rawConflict = json['conflict'] as Map<String, dynamic>?;
    return SyncPushOutcome(
      clientOpId: json['clientOpId'] as String,
      status: json['status'] as String,
      storedStatus: json['storedStatus'] as String?,
      conflict: rawConflict == null
          ? null
          : SyncConflictDetail.fromJson(rawConflict),
      message: json['message'] as String?,
    );
  }

  final String clientOpId;
  final String status;
  final String? storedStatus;
  final SyncConflictDetail? conflict;
  final String? message;

  bool get applied => status == 'applied';
  bool get duplicateApplied =>
      status == 'duplicate' && storedStatus == 'applied';
  bool get settled => applied || duplicateApplied;
}

class SyncPushResponse {
  const SyncPushResponse({required this.results});

  factory SyncPushResponse.fromJson(Map<String, dynamic> json) =>
      SyncPushResponse(
        results: (json['results'] as List<dynamic>)
            .map(
              (entry) => SyncPushOutcome.fromJson(entry as Map<String, dynamic>),
            )
            .toList(),
      );

  final List<SyncPushOutcome> results;
}
