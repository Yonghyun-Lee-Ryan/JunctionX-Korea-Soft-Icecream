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
    this.secondaryAction = const {},
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

  /// 🔴 보조 버튼 문구도 서버가 준다 — 파일제출은 「임시저장」이 아니라 「나중에」다
  final Map<String, String> secondaryAction;
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
      secondaryAction: ((meta['kitSecondaryAction'] as Map?) ?? const {})
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
  const KitPage({
    required this.id,
    required this.label,
    required this.tabs,
    this.kind = 'tabs',
    this.columnFlex = const [],
  });

  final String id;
  final String label;
  final List<KitPageTab> tabs;

  /// tabs | upload — 🔴 upload면 좌측 서류 목록 + 우측 드롭존 (Figma 74:6470)
  final String kind;

  /// 열 폭 비율 (Figma 값). 비어 있으면 균등
  final List<int> columnFlex;

  bool get isUpload => kind == 'upload';

  /// 🔴 전폭(span:'full') 탭은 열에 들어가지 않으므로 열 수를 세지 않는다 —
  ///    세면 배너 하나 때문에 1열짜리 페이지가 그대로 1열로 남거나, 반대로 잘못 늘어난다.
  int get columnCount {
    final cols = [for (final t in tabs) if (!t.isFull) t.column];
    return cols.isEmpty ? 1 : (cols.reduce((a, b) => a > b ? a : b) + 1);
  }

  factory KitPage.fromJson(Map<String, dynamic> j) => KitPage(
        id: j['id'] as String? ?? '',
        label: j['label'] as String? ?? '',
        kind: j['kind'] as String? ?? 'tabs',
        tabs: ((j['tabs'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(KitPageTab.fromJson)
            .toList(growable: false),
        columnFlex: ((j['columnFlex'] as List?) ?? const [])
            .whereType<num>()
            .map((e) => e.toInt())
            .toList(growable: false),
      );
}

class KitPageTab {
  const KitPageTab({required this.id, this.column = 0, this.span});
  final String id;
  final int column;

  /// 'full'이면 열 위에 전폭으로 얹는다
  final String? span;

  bool get isFull => span == 'full';

  factory KitPageTab.fromJson(Map<String, dynamic> j) => KitPageTab(
        id: j['id'] as String? ?? '',
        column: (j['column'] as num?)?.toInt() ?? 0,
        span: j['span'] as String?,
      );
}

/// 표의 셀 하나.
///
/// 🔴 색은 **서버가 정한다**. 화면이 「준비됨이면 초록」처럼 값을 보고 색을 고르면
///    문구가 바뀌는 순간 색이 죽는다. 여기서는 받은 tone을 그릴 뿐이다.
class KitCell {
  const KitCell(this.text, {this.tone = 'default', this.chip = false});

  final String text;

  /// default | proviso | ok | warn | danger | muted
  final String tone;

  /// 칩(둥근 배경)으로 그린다
  final bool chip;

  factory KitCell.parse(Object? raw) {
    if (raw is Map) {
      return KitCell(
        raw['text']?.toString() ?? '',
        tone: raw['tone']?.toString() ?? 'default',
        chip: raw['chip'] == true,
      );
    }
    final t = raw?.toString() ?? '';
    // 🔴 예전 봉투는 tone이 없다. ※로 시작하는 단서만은 예전처럼 주황으로 살려 둔다 —
    //    에이전트가 tone을 붙이기 시작하면 이 짐작은 더 이상 쓰이지 않는다.
    return KitCell(t, tone: t.trimLeft().startsWith('※') ? 'proviso' : 'default');
  }
}

class KitTab {
  const KitTab({
    required this.id,
    required this.title,
    required this.columns,
    required this.rows,
    this.kind = 'table',
    this.columnAlign = const [],
    this.warnings = const [],
    this.summary,
    this.metric,
    this.banner,
    this.note,
    this.items = const [],
  });

  final String id;
  final String title;

  /// table | checklist | docs | metric | tasks | note | banner
  /// 🔴 checklist면 행마다 체크박스를 붙인다
  final String kind;
  final List<String> columns;
  final List<List<KitCell>> rows;

  /// 열 정렬 (left | right). 🔴 「근거 페이지」를 오른쪽에 붙이는 건 서버가 정한다
  final List<String> columnAlign;

  /// 🔴 검산 실패·불일치. 표 위에 붉게 뜬다. Node가 다시 센 값이다
  final List<String> warnings;
  final String? summary;

  /// kind별 짐. 해당 kind가 아니면 비어 있다
  final KitMetric? metric;
  final KitBannerData? banner;
  final KitNoteData? note;
  final List<KitItem> items;

  bool get isChecklist => kind == 'checklist';
  bool get isTable => kind == 'table' || kind == 'checklist';

  /// 표는 행이, 나머지는 자기 짐이 있어야 그릴 게 있다
  bool get hasContent => switch (kind) {
        'metric' => metric != null,
        'banner' => banner != null,
        'note' => note != null,
        'tasks' || 'docs' => items.isNotEmpty,
        _ => rows.isNotEmpty,
      };

  bool alignRight(int col) => col < columnAlign.length && columnAlign[col] == 'right';

  factory KitTab.fromJson(Map<String, dynamic> j) => KitTab(
        id: j['id'] as String? ?? '',
        title: j['title'] as String? ?? '',
        kind: j['kind'] as String? ?? 'table',
        columns: ((j['columns'] as List?) ?? const []).map((e) => e.toString()).toList(growable: false),
        rows: ((j['rows'] as List?) ?? const [])
            .whereType<List>()
            .map((r) => r.map(KitCell.parse).toList(growable: false))
            .toList(growable: false),
        columnAlign:
            ((j['columnAlign'] as List?) ?? const []).map((e) => e.toString()).toList(growable: false),
        warnings: ((j['warnings'] as List?) ?? const []).map((e) => e.toString()).toList(growable: false),
        summary: j['summary'] as String?,
        metric: j['metric'] is Map
            ? KitMetric.fromJson((j['metric'] as Map).cast<String, dynamic>())
            : null,
        banner: j['banner'] is Map
            ? KitBannerData.fromJson((j['banner'] as Map).cast<String, dynamic>())
            : null,
        note: j['note'] is Map
            ? KitNoteData.fromJson((j['note'] as Map).cast<String, dynamic>())
            : null,
        items: ((j['items'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(KitItem.fromJson)
            .toList(growable: false),
      );
}

/// 🔴 서버가 언젠가 `{text, page}` 같은 객체를 보낼 수 있는 자리에 생캐스트(`as String?`)를 쓰면,
///    그 필드 하나가 아니라 **봉투 전체**가 `_TypeError`로 죽어 화면이 통째로 사라진다.
///    한 칸이 예상과 다르면 그 칸만 잃는 게 맞다.
String? _text(Object? raw) {
  if (raw == null) return null;
  if (raw is String) return raw;
  if (raw is Map) return raw['text']?.toString();
  return raw.toString();
}

/// 큰 숫자 하나로 말하는 카드 (Figma 77:8081 — M/M 예상 원가)
class KitMetric {
  const KitMetric({
    required this.value,
    this.unit,
    this.caption,
    this.note,
    this.evidence = const [],
  });

  final String value;
  final String? unit;
  final String? caption;

  /// 🔴 「금액 환산 - 단가 미입력」처럼 **못 한 것**을 말하는 줄
  final String? note;
  final List<String> evidence;

  factory KitMetric.fromJson(Map<String, dynamic> j) => KitMetric(
        value: _text(j['value']) ?? '',
        unit: _text(j['unit']),
        caption: _text(j['caption']),
        note: _text(j['note']),
        // 🔴 rows에서 고친 것과 같은 자리다 — 근거가 객체로 오면 Map.toString이 화면에 찍힌다
        evidence: ((j['evidence'] as List?) ?? const [])
            .map(_text)
            .whereType<String>()
            .where((e) => e.isNotEmpty)
            .toList(growable: false),
      );
}

/// 표 위에 얹는 띠 (Figma 74:7362 — 제출 제약)
class KitBannerData {
  const KitBannerData({required this.label, required this.text, this.evidence});
  final String label;
  final String text;

  /// 🔴 근거 쪽. 이 제품은 근거 없는 문장을 띄우지 않는다
  final String? evidence;

  factory KitBannerData.fromJson(Map<String, dynamic> j) => KitBannerData(
        label: _text(j['label']) ?? '',
        text: _text(j['text']) ?? '',
        evidence: _text(j['evidence']),
      );
}

/// 글로 말하는 카드 (Figma 74:7362 — 금지 표현 검사)
class KitNoteData {
  const KitNoteData({required this.body, this.emphasis, this.evidence});
  final String body;

  /// body 안에서 붉게 강조할 조각 (예: 「3곳」)
  final String? emphasis;
  final String? evidence;

  factory KitNoteData.fromJson(Map<String, dynamic> j) => KitNoteData(
        body: _text(j['body']) ?? '',
        emphasis: _text(j['emphasis']),
        evidence: _text(j['evidence']),
      );
}

/// 서류 한 줄(docs) 또는 보완요청 한 건(tasks)
class KitItem {
  const KitItem({
    required this.title,
    this.filename,
    this.detail,
    this.state,
    this.label,
    this.progress,
    this.chip,
    this.action,
  });

  final String title;

  /// docs — 올라온 파일 이름
  final String? filename;

  /// tasks — 왜 보완이 필요한지
  final String? detail;

  /// docs — done | reading | missing
  final String? state;
  final String? label;
  final double? progress;

  final KitCell? chip;
  final KitAction? action;

  factory KitItem.fromJson(Map<String, dynamic> j) => KitItem(
        title: _text(j['title']) ?? '',
        filename: _text(j['filename']),
        detail: _text(j['detail']),
        state: _text(j['state']),
        label: _text(j['label']),
        progress: (j['progress'] as num?)?.toDouble(),
        chip: j['chip'] is Map ? KitCell.parse(j['chip']) : null,
        action: j['action'] is Map
            ? KitAction.fromJson((j['action'] as Map).cast<String, dynamic>())
            : null,
      );
}

class KitAction {
  const KitAction({required this.label, this.kind = 'upload'});
  final String label;

  /// upload | file — 🔴 file이면 이미 올라온 파일이라 누를 것이 없다
  final String kind;

  factory KitAction.fromJson(Map<String, dynamic> j) => KitAction(
        label: _text(j['label']) ?? '',
        kind: _text(j['kind']) ?? 'upload',
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
