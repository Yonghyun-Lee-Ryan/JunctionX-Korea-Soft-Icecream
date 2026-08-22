/// `POST /api/docs/upload` 응답을 그대로 옮긴 것.
/// 🔴 봉투의 **바깥 구조**만 계약이다. `extraction.data`는 갈래마다 필드가 다르므로
///    파싱하지 않고 Map 그대로 들고 있는다 — 에이전트 출력이 바뀌어도 이 클래스는 안 바뀐다.
class DocUploadResult {
  const DocUploadResult({
    required this.uploadId,
    required this.filename,
    required this.bytes,
    required this.docType,
    required this.extraction,
    required this.meta,
  });

  final String uploadId;
  final String filename;
  final int bytes;
  final DocTypeVerdict docType;
  final Extraction extraction;
  final UploadMeta meta;

  factory DocUploadResult.fromJson(Map<String, dynamic> j) => DocUploadResult(
        uploadId: j['uploadId'] as String? ?? '',
        filename: j['filename'] as String? ?? '',
        bytes: (j['bytes'] as num?)?.toInt() ?? 0,
        docType: DocTypeVerdict.fromJson(j['docType'] as Map<String, dynamic>? ?? const {}),
        extraction: Extraction.fromJson(j['extraction'] as Map<String, dynamic>? ?? const {}),
        meta: UploadMeta.fromJson(j['meta'] as Map<String, dynamic>? ?? const {}),
      );
}

class DocTypeVerdict {
  const DocTypeVerdict({
    required this.key,
    required this.label,
    required this.confidence,
    required this.score,
    required this.margin,
    required this.candidates,
  });

  /// 🔴 판정이 서지 않으면 null이다 — 서버가 억지로 고르지 않는다
  final String? key;
  final String? label;
  final String confidence; // high | low | unknown
  final int score;
  final int margin;
  final List<DocTypeCandidate> candidates;

  factory DocTypeVerdict.fromJson(Map<String, dynamic> j) => DocTypeVerdict(
        key: j['key'] as String?,
        label: j['label'] as String?,
        confidence: j['confidence'] as String? ?? 'unknown',
        score: (j['score'] as num?)?.toInt() ?? 0,
        margin: (j['margin'] as num?)?.toInt() ?? 0,
        candidates: ((j['candidates'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(DocTypeCandidate.fromJson)
            .toList(growable: false),
      );
}

class DocTypeCandidate {
  const DocTypeCandidate({required this.key, required this.label, required this.score});
  final String key;
  final String label;
  final int score;

  factory DocTypeCandidate.fromJson(Map<String, dynamic> j) => DocTypeCandidate(
        key: j['key'] as String? ?? '',
        label: j['label'] as String? ?? '',
        score: (j['score'] as num?)?.toInt() ?? 0,
      );
}

class Extraction {
  const Extraction({
    required this.data,
    required this.fields,
    required this.confidence,
    required this.counts,
    required this.lowFields,
    this.raw,
  });

  /// 갈래별로 필드가 다르다. 🔴 파싱하지 않는다
  final Map<String, dynamic> data;
  final Map<String, FieldMeta> fields;
  final String confidence; // high | low | unknown
  final ConfidenceCounts counts;

  /// 🔴 화면이 ⚠를 다는 자리
  final List<String> lowFields;

  /// JSON 파싱이 실패했을 때만 온다
  final String? raw;

  factory Extraction.fromJson(Map<String, dynamic> j) => Extraction(
        data: Map<String, dynamic>.from(j['data'] as Map? ?? const {}),
        fields: ((j['fields'] as Map?) ?? const {}).map(
          (k, v) => MapEntry(k as String, FieldMeta.fromJson(Map<String, dynamic>.from(v as Map? ?? const {}))),
        ),
        confidence: j['confidence'] as String? ?? 'unknown',
        counts: ConfidenceCounts.fromJson(j['confidenceCounts'] as Map<String, dynamic>? ?? const {}),
        lowFields: ((j['lowFields'] as List?) ?? const []).map((e) => e.toString()).toList(growable: false),
        raw: j['raw'] as String?,
      );

  /// data에서 첫 번째로 값이 있는 키를 고른다.
  /// 🔴 갈래마다 키 이름이 달라서(한글/영문) 화면이 후보를 나열하고 서버 값을 그대로 쓴다.
  String? pick(List<String> keys) {
    for (final k in keys) {
      final v = data[k];
      if (v == null) continue;
      final s = v is String ? v : v.toString();
      if (s.trim().isNotEmpty) return s.trim();
    }
    return null;
  }
}

class FieldMeta {
  const FieldMeta({required this.confidence, required this.page});
  final String confidence;

  /// 근거 쪽. 🔴 0이면 「쪽 미상」
  final int page;

  factory FieldMeta.fromJson(Map<String, dynamic> j) => FieldMeta(
        confidence: j['confidence'] as String? ?? 'unknown',
        page: (j['page'] as num?)?.toInt() ?? 0,
      );
}

class ConfidenceCounts {
  const ConfidenceCounts({this.high = 0, this.low = 0, this.unknown = 0});
  final int high;
  final int low;
  final int unknown;

  int get total => high + low + unknown;

  factory ConfidenceCounts.fromJson(Map<String, dynamic> j) => ConfidenceCounts(
        high: (j['high'] as num?)?.toInt() ?? 0,
        low: (j['low'] as num?)?.toInt() ?? 0,
        unknown: (j['unknown'] as num?)?.toInt() ?? 0,
      );
}

class UploadMeta {
  const UploadMeta({
    required this.source,
    required this.cached,
    this.agentId,
    this.configId,
    this.jobId,
    this.pages = 0,
    this.textChars = 0,
    this.elapsedMs = 0,
  });

  final String source; // agent | fixture
  final bool cached;
  final String? agentId;
  final String? configId;
  final String? jobId;
  final int pages;
  final int textChars;
  final int elapsedMs;

  factory UploadMeta.fromJson(Map<String, dynamic> j) => UploadMeta(
        source: j['source'] as String? ?? 'agent',
        cached: j['cached'] as bool? ?? false,
        agentId: j['agentId'] as String?,
        configId: j['configId']?.toString(),
        jobId: j['jobId'] as String?,
        pages: (j['pages'] as num?)?.toInt() ?? 0,
        textChars: (j['textChars'] as num?)?.toInt() ?? 0,
        elapsedMs: (j['elapsedMs'] as num?)?.toInt() ?? 0,
      );
}

/// 🔴 프론트는 문장을 짓지 않는다. 서버가 준 message를 그대로 쓴다 (WBS 규율).
class ApiException implements Exception {
  const ApiException({required this.code, required this.message, this.status, this.missing = const []});
  final String code;
  final String message;
  final int? status;

  /// 🔴 `E_CARD_INCOMPLETE`일 때 무엇이 빠졌는지. 서버가 준 목록을 그대로 쓴다
  final List<String> missing;

  /// 🔴 봉투 모양이 아닌 오류 바디(프록시·게이트웨이·문자열 error)에서도 터지지 않는다
  factory ApiException.fromJson(Map<String, dynamic> j, {int? status}) {
    final raw = j['error'];
    if (raw is Map) {
      final code = raw['code'];
      final message = raw['message'];
      final missing = raw['missing'];
      return ApiException(
        code: code is String && code.isNotEmpty ? code : 'E_INTERNAL',
        message: message is String && message.isNotEmpty ? message : _fallback(status),
        status: status,
        missing: missing is List
            ? missing
                .map((m) => m is Map ? (m['field']?.toString() ?? '') : m.toString())
                .where((s) => s.isNotEmpty)
                .toList(growable: false)
            : const [],
      );
    }
    if (raw is String && raw.isNotEmpty) {
      return ApiException(code: 'E_INTERNAL', message: raw, status: status);
    }
    final message = j['message'];
    return ApiException(
      code: 'E_INTERNAL',
      message: message is String && message.isNotEmpty ? message : _fallback(status),
      status: status,
    );
  }

  static String _fallback(int? status) =>
      status == null ? '처리 중 오류가 발생했습니다.' : '처리 중 오류가 발생했습니다. (HTTP $status)';

  @override
  String toString() => message;
}
