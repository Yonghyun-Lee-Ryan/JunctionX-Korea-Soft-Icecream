/// `GET /api/companies/{id}/screening` 응답 — `04_계약/screening.envelope.json`.
///
/// 🔴 분모(summary)를 반드시 담는다. 「127건을 훑어 3건」이 이 제품의 문장이고,
///    그 분모가 없으면 화면에서 우리가 한 일이 안 보인다.
class ScreeningResult {
  const ScreeningResult({
    required this.companyId,
    required this.status,
    required this.summary,
    required this.shortlist,
    this.excludedSamples = const [],
    this.cached = false,
    this.listSource = 'cached',
    this.note,
  });

  final String companyId;
  final String status;
  final ScreeningSummary summary;
  final List<ShortlistItem> shortlist;
  final List<ExcludedItem> excludedSamples;

  /// 🔴 사전 실행 결과면 true. 화면 구석에 표시한다 — 들키는 것보다 먼저 말하는 쪽이 싸다
  final bool cached;

  /// openapi | cached
  final String listSource;

  /// 🔴 서버가 「무엇을 하지 않았는지」 적어 보낸 문장. 프론트가 짓지 않는다
  final String? note;

  bool get isLive => listSource == 'openapi';

  factory ScreeningResult.fromJson(Map<String, dynamic> j) => ScreeningResult(
        companyId: j['companyId'] as String? ?? '',
        status: j['status'] as String? ?? 'done',
        summary: ScreeningSummary.fromJson(j['summary'] as Map<String, dynamic>? ?? const {}),
        shortlist: ((j['shortlist'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ShortlistItem.fromJson)
            .toList(growable: false),
        excludedSamples: ((j['excludedSamples'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ExcludedItem.fromJson)
            .toList(growable: false),
        cached: (j['meta'] as Map?)?['cached'] as bool? ?? false,
        listSource: (j['meta'] as Map?)?['listSource'] as String? ?? 'cached',
        note: (j['meta'] as Map?)?['note'] as String?,
      );
}

class ScreeningSummary {
  const ScreeningSummary({
    this.scanned = 0,
    this.excluded = 0,
    this.shortlisted = 0,
    this.parsed = 0,
    this.window,
  });
  final int scanned;
  final int excluded;
  final int shortlisted;

  /// 🔴 첨부를 실제로 읽은 건 수. 0이면 자격 충족은 아직 «미확인»이다
  final int parsed;
  final String? window;

  factory ScreeningSummary.fromJson(Map<String, dynamic> j) => ScreeningSummary(
        scanned: (j['scanned'] as num?)?.toInt() ?? 0,
        excluded: (j['excluded'] as num?)?.toInt() ?? 0,
        shortlisted: (j['shortlisted'] as num?)?.toInt() ?? 0,
        parsed: (j['parsed'] as num?)?.toInt() ?? 0,
        window: j['window'] as String?,
      );
}

/// 🚪 사람 게이트 — go를 찍은 건만 다음 단계가 돈다
enum BidDecision { pending, go, skip }

BidDecision _decision(String? s) => switch (s) {
      'go' => BidDecision.go,
      'skip' => BidDecision.skip,
      _ => BidDecision.pending,
    };

class ShortlistItem {
  const ShortlistItem({
    required this.caseId,
    required this.title,
    required this.org,
    required this.deadline,
    this.daysLeft = 0,
    this.matched = 0,
    this.unverified = 0,
    this.reasons = const [],
    this.decision = BidDecision.pending,
  });

  final String caseId;
  final String title;
  final String org;
  final String deadline;

  /// 🔴 남은 «영업일». 제안 준비가 물리적으로 가능한지가 여기서 갈린다
  final int daysLeft;
  final int matched;

  /// 🔴 못 읽어서 판정 못 한 항목 수. 제외 사유가 아니다
  final int unverified;
  final List<MatchReason> reasons;
  final BidDecision decision;

  ShortlistItem copyWith({BidDecision? decision}) => ShortlistItem(
        caseId: caseId,
        title: title,
        org: org,
        deadline: deadline,
        daysLeft: daysLeft,
        matched: matched,
        unverified: unverified,
        reasons: reasons,
        decision: decision ?? this.decision,
      );

  factory ShortlistItem.fromJson(Map<String, dynamic> j) => ShortlistItem(
        caseId: j['caseId'] as String? ?? '',
        title: j['title'] as String? ?? '',
        org: j['org'] as String? ?? '',
        deadline: j['deadline'] as String? ?? '',
        daysLeft: (j['daysLeft'] as num?)?.toInt() ?? 0,
        matched: (j['matched'] as num?)?.toInt() ?? 0,
        unverified: (j['unverified'] as num?)?.toInt() ?? 0,
        reasons: ((j['reasons'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(MatchReason.fromJson)
            .toList(growable: false),
        decision: _decision(j['decision'] as String?),
      );
}

class MatchReason {
  const MatchReason({required this.text, this.page = 0, this.docId, this.confidence = 'unknown'});
  final String text;

  /// 근거 쪽. 🔴 0이면 「쪽 미상」
  final int page;
  final String? docId;
  final String confidence;

  factory MatchReason.fromJson(Map<String, dynamic> j) => MatchReason(
        text: j['text'] as String? ?? '',
        page: (j['page'] as num?)?.toInt() ?? 0,
        docId: j['docId']?.toString(),
        confidence: j['confidence'] as String? ?? 'unknown',
      );
}

class ExcludedItem {
  const ExcludedItem({required this.caseId, required this.title, required this.reason, this.page = 0, this.stage});
  final String caseId;
  final String title;

  /// 🔴 근거 있는 미충족 한 줄
  final String reason;
  final int page;
  final String? stage;

  factory ExcludedItem.fromJson(Map<String, dynamic> j) => ExcludedItem(
        caseId: j['caseId'] as String? ?? '',
        title: j['title'] as String? ?? '',
        reason: j['reason'] as String? ?? '',
        page: (j['page'] as num?)?.toInt() ?? 0,
        stage: j['stage'] as String?,
      );
}
