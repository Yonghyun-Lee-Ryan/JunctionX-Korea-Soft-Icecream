/// `GET /api/companies/{id}/card` 응답.
/// 🔴 계약은 **바깥 구조**다 — stats[] · sections[].rows[].
///    프론트는 label로 분기하지 않고 그대로 그린다. 문장도 서버가 만든다.
class CompanyCardView {
  const CompanyCardView({
    required this.companyId,
    required this.name,
    required this.stats,
    required this.sections,
    this.bizNo,
    this.savedAt,
  });

  final String companyId;
  final String name;
  final String? bizNo;
  final String? savedAt;
  final List<CardStat> stats;
  final List<CardSection> sections;

  factory CompanyCardView.fromJson(Map<String, dynamic> j) => CompanyCardView(
        companyId: j['companyId'] as String? ?? '',
        name: j['name'] as String? ?? '',
        bizNo: j['bizNo'] as String?,
        savedAt: j['savedAt'] as String?,
        stats: ((j['stats'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(CardStat.fromJson)
            .toList(growable: false),
        sections: ((j['sections'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(CardSection.fromJson)
            .toList(growable: false),
      );
}

class CardStat {
  const CardStat({required this.id, required this.label, this.value, this.sub, this.status = 'missing'});
  final String id;
  final String label;
  final String? value;
  final String? sub;
  final String status;

  factory CardStat.fromJson(Map<String, dynamic> j) => CardStat(
        id: j['id'] as String? ?? '',
        label: j['label'] as String? ?? '',
        value: j['value']?.toString(),
        sub: j['sub']?.toString(),
        status: j['status'] as String? ?? 'missing',
      );
}

class CardSection {
  const CardSection({
    required this.id,
    required this.title,
    required this.rows,
    this.column = 0,
    this.note,
    this.chips = const [],
  });

  final String id;
  final String title;

  /// 🔴 서버가 정한 «희망 열». 좁은 화면에서는 프론트가 접는다
  final int column;

  /// 🔴 서버가 만든 문장. 프론트가 짓지 않는다
  final String? note;
  final List<CardChip> chips;
  final List<CardRow> rows;

  factory CardSection.fromJson(Map<String, dynamic> j) => CardSection(
        id: j['id'] as String? ?? '',
        title: j['title'] as String? ?? '',
        column: (j['column'] as num?)?.toInt() ?? 0,
        note: j['note'] as String?,
        chips: ((j['chips'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(CardChip.fromJson)
            .toList(growable: false),
        rows: ((j['rows'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(CardRow.fromJson)
            .toList(growable: false),
      );
}

class CardChip {
  const CardChip({required this.label, required this.tone});
  final String label;

  /// success | danger | info | neutral
  final String tone;

  factory CardChip.fromJson(Map<String, dynamic> j) => CardChip(
        label: j['label'] as String? ?? '',
        tone: j['tone'] as String? ?? 'info',
      );
}

class CardRow {
  const CardRow({required this.label, this.value, this.source, this.status = 'missing', this.action});
  final String label;
  final String? value;

  /// 근거 파일명. 🔴 값이 어디서 나왔는지를 잃지 않는다
  final String? source;

  /// confirmed | unverified | missing
  final String status;

  /// 'manual'이면 「직접입력」 버튼을 붙인다
  final String? action;

  bool get isManual => action == 'manual';

  factory CardRow.fromJson(Map<String, dynamic> j) => CardRow(
        label: j['label'] as String? ?? '',
        value: j['value']?.toString(),
        source: j['source']?.toString(),
        status: j['status'] as String? ?? 'missing',
        action: j['action'] as String?,
      );
}

class CurrentCompany {
  const CurrentCompany({required this.exists, this.companyId, this.name});
  final bool exists;
  final String? companyId;
  final String? name;

  factory CurrentCompany.fromJson(Map<String, dynamic> j) => CurrentCompany(
        exists: j['exists'] as bool? ?? false,
        companyId: j['companyId'] as String?,
        name: j['name'] as String?,
      );
}
