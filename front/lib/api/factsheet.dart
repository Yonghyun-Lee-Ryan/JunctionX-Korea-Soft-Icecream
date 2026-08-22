/// `GET /api/cases/{caseId}` — `04_계약/factsheet.envelope.json`.
///
/// 🔴 계약은 **바깥 구조**다. `tabs[].columns/rows`를 범용 표로 그릴 뿐,
///    프론트는 탭 id나 열 이름으로 분기하지 않는다 — 탭이 늘거나 열이 바뀌어도 화면이 안 바뀐다.
class Factsheet {
  const Factsheet({
    required this.caseId,
    required this.status,
    required this.verdict,
    required this.tabs,
    required this.downloads,
    this.progress = const [],
    this.pages = const [],
    this.primaryAction = const {},
    this.cached = false,
    this.attachments = const [],
    this.title,
    this.org,
    this.deadline,
    this.daysLeft,
  });

  final String caseId;
  final String status;
  final Verdict verdict;
  final List<KitTab> tabs;
  final List<KitDownload> downloads;
  final List<ProgressStep> progress;

  /// 🔴 탭 배치도 서버가 준다
  final List<KitPage> pages;
  final Map<String, String> primaryAction;
  final bool cached;
  final List<KitAttachment> attachments;

  // 헤더용 — 서버가 주면 쓰고 없으면 비운다
  final String? title;
  final String? org;
  final String? deadline;
  final int? daysLeft;

  KitTab? tab(String id) {
    for (final t in tabs) {
      if (t.id == id) return t;
    }
    return null;
  }

  factory Factsheet.fromJson(Map<String, dynamic> j) {
    final meta = (j['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
    return Factsheet(
      caseId: j['caseId'] as String? ?? '',
      status: j['status'] as String? ?? 'done',
      verdict: Verdict.fromJson((j['verdict'] as Map?)?.cast<String, dynamic>() ?? const {}),
      tabs: ((j['tabs'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(KitTab.fromJson)
          .toList(growable: false),
      downloads: ((j['downloads'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(KitDownload.fromJson)
          .toList(growable: false),
      progress: ((j['progress'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ProgressStep.fromJson)
          .toList(growable: false),
      pages: ((meta['kitPages'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(KitPage.fromJson)
          .toList(growable: false),
      primaryAction: ((meta['kitPrimaryAction'] as Map?) ?? const {})
          .map((k, v) => MapEntry(k.toString(), v.toString())),
      cached: meta['cached'] as bool? ?? false,
      attachments: ((meta['attachments'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(KitAttachment.fromJson)
          .toList(growable: false),
      title: j['title'] as String?,
      org: j['org'] as String?,
      deadline: j['deadline'] as String?,
      daysLeft: (j['daysLeft'] as num?)?.toInt(),
    );
  }
}

class KitPage {
  const KitPage({required this.id, required this.label, required this.tabs, this.columnFlex = const []});
  final String id;
  final String label;
  final List<KitPageTab> tabs;

  /// 열 폭 비율 (Figma 값). 비어 있으면 균등
  final List<int> columnFlex;

  int get columnCount => tabs.isEmpty ? 1 : (tabs.map((t) => t.column).reduce((a, b) => a > b ? a : b) + 1);

  factory KitPage.fromJson(Map<String, dynamic> j) => KitPage(
        id: j['id'] as String? ?? '',
        label: j['label'] as String? ?? '',
        tabs: ((j['tabs'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map((t) => KitPageTab(id: t['id'] as String? ?? '', column: (t['column'] as num?)?.toInt() ?? 0))
            .toList(growable: false),
        columnFlex: ((j['columnFlex'] as List?) ?? const []).map((e) => (e as num).toInt()).toList(growable: false),
      );
}

class KitPageTab {
  const KitPageTab({required this.id, this.column = 0});
  final String id;
  final int column;
}

class KitTab {
  const KitTab({
    required this.id,
    required this.title,
    required this.columns,
    required this.rows,
    this.kind = 'table',
    this.warnings = const [],
    this.summary,
  });

  final String id;
  final String title;

  /// table | checklist — 🔴 checklist면 행마다 체크박스를 붙인다
  final String kind;
  final List<String> columns;
  final List<List<String>> rows;

  /// 🔴 검산 실패·불일치. 표 위에 붉게 뜬다. Node가 다시 센 값이다
  final List<String> warnings;
  final String? summary;

  bool get isChecklist => kind == 'checklist';

  factory KitTab.fromJson(Map<String, dynamic> j) => KitTab(
        id: j['id'] as String? ?? '',
        title: j['title'] as String? ?? '',
        kind: j['kind'] as String? ?? 'table',
        columns: ((j['columns'] as List?) ?? const []).map((e) => e.toString()).toList(growable: false),
        rows: ((j['rows'] as List?) ?? const [])
            .whereType<List>()
            .map((r) => r.map((c) => c?.toString() ?? '').toList(growable: false))
            .toList(growable: false),
        warnings: ((j['warnings'] as List?) ?? const []).map((e) => e.toString()).toList(growable: false),
        summary: j['summary'] as String?,
      );
}

class KitDownload {
  const KitDownload({required this.id, required this.label, required this.url, this.bytes});
  final String id;
  final String label;
  final String url;
  final int? bytes;

  factory KitDownload.fromJson(Map<String, dynamic> j) => KitDownload(
        id: j['id'] as String? ?? '',
        label: j['label'] as String? ?? '',
        url: j['url'] as String? ?? '',
        bytes: (j['bytes'] as num?)?.toInt(),
      );
}

class Verdict {
  const Verdict({this.badge = 'eligible', this.unverified = 0, this.headline, this.reasons = const []});
  final String badge;
  final int unverified;
  final String? headline;
  final List<VerdictReason> reasons;

  factory Verdict.fromJson(Map<String, dynamic> j) => Verdict(
        badge: j['badge'] as String? ?? 'eligible',
        unverified: (j['unverified'] as num?)?.toInt() ?? 0,
        headline: j['headline'] as String?,
        reasons: ((j['reasons'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(VerdictReason.fromJson)
            .toList(growable: false),
      );
}

class VerdictReason {
  const VerdictReason({required this.text, this.page = 0, this.confidence = 'unknown'});
  final String text;
  final int page;
  final String confidence;

  factory VerdictReason.fromJson(Map<String, dynamic> j) => VerdictReason(
        text: j['text'] as String? ?? '',
        page: (j['page'] as num?)?.toInt() ?? 0,
        confidence: j['confidence'] as String? ?? 'unknown',
      );
}

class ProgressStep {
  const ProgressStep({required this.step, required this.state, this.detail});
  final String step;
  final String state;
  final String? detail;

  factory ProgressStep.fromJson(Map<String, dynamic> j) => ProgressStep(
        step: j['step'] as String? ?? '',
        state: j['state'] as String? ?? 'pending',
        detail: j['detail'] as String?,
      );
}

class KitAttachment {
  const KitAttachment({required this.fileSeq, required this.filename, this.docClass, this.bytes});
  final int fileSeq;
  final String filename;
  final String? docClass;
  final int? bytes;

  factory KitAttachment.fromJson(Map<String, dynamic> j) => KitAttachment(
        fileSeq: (j['fileSeq'] as num?)?.toInt() ?? 0,
        filename: j['filename'] as String? ?? '',
        docClass: j['docClass'] as String?,
        bytes: (j['bytes'] as num?)?.toInt(),
      );
}
