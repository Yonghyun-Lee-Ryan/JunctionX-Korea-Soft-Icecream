import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'card_view.dart';
import 'factsheet.dart';
import 'screening.dart';
import 'docs_api.dart';
import 'models.dart';

/// `backend`의 `POST /api/docs/upload`에 붙는다.
class HttpDocsApi implements DocsApi {
  HttpDocsApi({String? baseUrl, http.Client? client, Duration? timeout, DateTime Function()? clock})
      : baseUrl = (baseUrl ?? defaultBaseUrl).replaceAll(RegExp(r'/+$'), ''),
        timeout = timeout ?? defaultTimeout,
        _client = client ?? http.Client(),
        _clock = clock ?? DateTime.now;

  /// `--dart-define=API_BASE_URL=https://...` 로 덮어쓴다
  static const defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// 🔴 백엔드의 Studio 폴링 예산이 300초(`STUDIO_POLL_TIMEOUT_MS`)다.
  ///    프론트가 그보다 먼저 끊으면 서버가 보내는 `E_STUDIO_TIMEOUT`(504)을
  ///    **영원히 못 보고** 매번 「연결 실패」로 오인한다.
  static const defaultTimeout = Duration(seconds: 330);

  /// 백엔드 multer 제한과 같은 값. 넘으면 요청조차 보내지 않는다
  static const maxUploadBytes = 30 * 1024 * 1024;

  /// 🔴 Upstage 크레딧 — 끝난 봉투(status=done)는 10분 동안 다시 묻지 않는다.
  ///    서버도 같은 케이스를 7일 동안 다시 돌리지 않지만, 탭을 오가며 생기는 왕복 자체를 줄인다.
  ///    분석 중인 봉투(collecting/parsing/judging)는 폴링이 새 상태를 봐야 하므로 캐시하지 않는다.
  static const factsheetCacheTtl = Duration(minutes: 10);

  final String baseUrl;
  final Duration timeout;
  final http.Client _client;
  final DateTime Function() _clock;
  final Map<String, (Factsheet, DateTime)> _factsheetCache = {};

  @override
  Future<DocUploadResult> upload(PickedDoc doc) async {
    if (doc.bytes.lengthInBytes > maxUploadBytes) {
      throw ApiException(
        code: 'E_TOO_LARGE',
        message: '파일이 너무 큽니다. 30MB 이하만 올릴 수 있습니다. (${_mb(doc.bytes.lengthInBytes)}MB)',
      );
    }

    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/api/docs/upload'))
      // 🔴 필드명은 반드시 `file` — 서버가 upload.single('file')로 받는다.
      // 🔴 파일명은 그대로 보낸다. 백엔드가 multer의 latin1을 되돌리므로 여기서 또 손대면 깨진다.
      ..files.add(http.MultipartFile.fromBytes('file', doc.bytes, filename: doc.filename));

    // 🔴 타임아웃이 **본문 읽기까지** 덮어야 한다.
    //    send()에만 걸면 서버가 헤더만 주고 멈출 때 영구 대기한다.
    return _guard(() async {
      final streamed = await _client.send(req);
      final res = await http.Response.fromStream(streamed);
      return _decode(res, DocUploadResult.fromJson);
    });
  }

  @override
  Future<List<DocTypeInfo>> types() => _guard(
        () async {
          final res = await _client.get(Uri.parse('$baseUrl/api/docs/types'));
          return _decode(res, (j) => ((j['docTypes'] as List?) ?? const [])
              .whereType<Map<String, dynamic>>()
              .map(DocTypeInfo.fromJson)
              .toList(growable: false));
        },
        timeout: const Duration(seconds: 15),
      );

  @override
  Future<SavedCard> saveCard(SaveCardRequest req) => _guard(
        () async {
          final res = await _client.post(
            Uri.parse('$baseUrl/api/companies/card'),
            headers: const {'Content-Type': 'application/json; charset=utf-8'},
            body: utf8.encode(jsonEncode(req.toJson())),
          );
          return _decode(res, SavedCard.fromJson);
        },
        timeout: const Duration(seconds: 30),
      );

  @override
  Future<CurrentCompany> currentCompany() => _guard(
        () async {
          final res = await _client.get(Uri.parse('$baseUrl/api/companies/current'));
          return _decode(res, CurrentCompany.fromJson);
        },
        timeout: const Duration(seconds: 15),
      );

  @override
  Future<CompanyCardView> cardView(String companyId) => _guard(
        () async {
          final res = await _client.get(Uri.parse('$baseUrl/api/companies/$companyId/card'));
          return _decode(res, CompanyCardView.fromJson);
        },
        timeout: const Duration(seconds: 20),
      );

  @override
  Future<ScreeningResult> screening(String companyId, {bool live = false}) => _guard(
        () async {
          final uri = Uri.parse('$baseUrl/api/companies/$companyId/screening')
              .replace(queryParameters: live ? {'live': '1'} : null);
          final res = await _client.get(uri);
          return _decode(res, ScreeningResult.fromJson);
        },
        timeout: const Duration(seconds: 60),
      );

  @override
  Future<void> setDecision(String companyId, String caseId, String decision) => _guard(
        () async {
          final res = await _client.put(
            Uri.parse('$baseUrl/api/companies/$companyId/screening/$caseId/decision'),
            headers: const {'Content-Type': 'application/json; charset=utf-8'},
            body: utf8.encode(jsonEncode({'decision': decision})),
          );
          _decode(res, (j) => j);
        },
        timeout: const Duration(seconds: 20),
      );

  @override
  Future<Factsheet> createCase({required String bidPbancNo, String bidPbancOrd = '000', String? companyId}) => _guard(
        () async {
          final res = await _client.post(
            Uri.parse('$baseUrl/api/cases'),
            headers: const {'Content-Type': 'application/json; charset=utf-8'},
            body: utf8.encode(jsonEncode({
              'bidPbancNo': bidPbancNo,
              'bidPbancOrd': bidPbancOrd,
              'companyId': ?companyId,
            })),
          );
          // 🔴 7일 안에 끝난 케이스는 서버가 200 으로 봉투를 그대로 준다 — 그게 바로 캐시가 된다
          return _remember(_decode(res, Factsheet.fromJson));
        },
        timeout: const Duration(seconds: 60),
      );

  @override
  Future<Factsheet> factsheet(String caseId) async {
    final hit = _factsheetCache[caseId];
    if (hit != null && _clock().difference(hit.$2) < factsheetCacheTtl) return hit.$1;
    return _guard(
      () async {
        final res = await _client.get(Uri.parse('$baseUrl/api/cases/$caseId'));
        return _remember(_decode(res, Factsheet.fromJson));
      },
      timeout: const Duration(seconds: 30),
    );
  }

  @override
  Future<Factsheet> uploadCaseFile(String caseId, PickedDoc doc, {String? requirement}) {
    if (doc.bytes.lengthInBytes > maxUploadBytes) {
      throw ApiException(
        code: 'E_TOO_LARGE',
        message: '파일이 너무 큽니다. 30MB 이하만 올릴 수 있습니다. (${_mb(doc.bytes.lengthInBytes)}MB)',
      );
    }
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/api/cases/$caseId/files'))
      // 🔴 필드명은 `file` — 서버가 upload.single('file')로 받는다. 파일명은 그대로(서버가 latin1을 되돌린다)
      ..files.add(http.MultipartFile.fromBytes('file', doc.bytes, filename: doc.filename));
    if (requirement != null && requirement.isNotEmpty) req.fields['requirement'] = requirement;
    // 🔴 서버가 제출 검사(Solar)를 다시 돌리고 돌려준다 — 업로드 타임아웃이 그걸 덮어야 한다
    return _guard(() async {
      final streamed = await _client.send(req);
      final res = await http.Response.fromStream(streamed);
      return _remember(_decode(res, Factsheet.fromJson));
    });
  }

  @override
  Future<Factsheet> uploadProposal(String caseId, PickedDoc doc) {
    if (doc.bytes.lengthInBytes > maxUploadBytes) {
      throw ApiException(
        code: 'E_TOO_LARGE',
        message: '파일이 너무 큽니다. 30MB 이하만 올릴 수 있습니다. (${_mb(doc.bytes.lengthInBytes)}MB)',
      );
    }
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/api/cases/$caseId/proposal'))
      ..files.add(http.MultipartFile.fromBytes('file', doc.bytes, filename: doc.filename));
    return _guard(() async {
      final streamed = await _client.send(req);
      final res = await http.Response.fromStream(streamed);
      return _remember(_decode(res, Factsheet.fromJson));
    });
  }

  Factsheet _remember(Factsheet f) {
    if (f.status == 'done') {
      _factsheetCache[f.caseId] = (f, _clock());
    } else {
      _factsheetCache.remove(f.caseId);
    }
    return f;
  }

  /// 캐시를 비운다 — 다시 돌린 케이스를 바로 보고 싶을 때
  void forgetFactsheet(String caseId) => _factsheetCache.remove(caseId);

  @override
  Future<void> saveBid(String companyId, ShortlistItem item) => _guard(
        () async {
          final res = await _client.post(
            Uri.parse('$baseUrl/api/companies/$companyId/bids'),
            headers: const {'Content-Type': 'application/json; charset=utf-8'},
            body: utf8.encode(jsonEncode({
              'caseId': item.caseId,
              'title': item.title,
              'org': item.org,
              'deadline': item.deadline,
              'daysLeft': item.daysLeft,
              'matched': item.matched,
              'unverified': item.unverified,
              'reasons': [
                for (final r in item.reasons)
                  {'text': r.text, 'page': r.page, 'docId': r.docId, 'confidence': r.confidence},
              ],
            })),
          );
          _decode(res, (j) => j);
        },
        timeout: const Duration(seconds: 20),
      );

  @override
  Future<List<ShortlistItem>> bids(String companyId) => _guard(
        () async {
          final res = await _client.get(Uri.parse('$baseUrl/api/companies/$companyId/bids'));
          return _decode(res, (j) => ((j['bids'] as List?) ?? const [])
              .whereType<Map<String, dynamic>>()
              .map(ShortlistItem.fromJson)
              .toList(growable: false));
        },
        timeout: const Duration(seconds: 20),
      );

  @override
  Future<void> dropBid(String companyId, String caseId) => _guard(
        () async {
          final res = await _client.delete(Uri.parse('$baseUrl/api/companies/$companyId/bids/$caseId'));
          _decode(res, (j) => j);
        },
        timeout: const Duration(seconds: 20),
      );

  /// 탭 xlsx 주소 — 다운로드는 브라우저/OS에 맡긴다
  String downloadUrl(String caseId, String tabId) => '$baseUrl/api/cases/$caseId/files/$tabId.xlsx';

  Future<T> _guard<T>(Future<T> Function() body, {Duration? timeout}) async {
    try {
      return await body().timeout(timeout ?? this.timeout);
    } on TimeoutException {
      throw ApiException(
        code: 'E_CLIENT_TIMEOUT',
        message: '서버가 제 시간에 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.',
      );
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException(
        code: 'E_NETWORK',
        message: '$baseUrl 에 연결하지 못했습니다. 백엔드가 그 주소에서 실행 중인지 확인해 주세요.',
      );
    }
  }

  T _decode<T>(http.Response res, T Function(Map<String, dynamic>) parse) {
    final text = utf8.decode(res.bodyBytes, allowMalformed: true);

    Object? decoded;
    try {
      decoded = jsonDecode(text);
    } catch (_) {
      // 🔴 이 주소에 우리 백엔드가 아닌 다른 서버가 떠 있을 때 여기로 온다.
      //    「연결 실패」로 뭉뚱그리지 않고 그렇게 말한다.
      throw ApiException(
        code: 'E_NOT_OUR_BACKEND',
        message: '$baseUrl 이(가) 예상과 다른 응답을 보냈습니다. '
            '그 주소에 Solar for Bid 백엔드가 맞는지 확인해 주세요. (HTTP ${res.statusCode})',
        status: res.statusCode,
      );
    }

    if (decoded is! Map<String, dynamic>) {
      throw ApiException(
        code: 'E_BAD_RESPONSE',
        message: '서버 응답 형식이 예상과 다릅니다. (HTTP ${res.statusCode})',
        status: res.statusCode,
      );
    }

    if (res.statusCode >= 400) {
      // 🔴 서버가 준 message를 그대로 올린다. 프론트가 문장을 짓지 않는다.
      //    다만 봉투 모양이 아닌 오류 바디(프록시·게이트웨이)에서도 터지지 않아야 한다.
      throw ApiException.fromJson(decoded, status: res.statusCode);
    }

    try {
      return parse(decoded);
    } catch (e) {
      // 🔴 파싱 실패를 「연결 실패」로 둔갑시키지 않는다
      throw ApiException(
        code: 'E_BAD_RESPONSE',
        message: '서버 응답을 해석하지 못했습니다. 백엔드 버전을 확인해 주세요.',
        status: res.statusCode,
      );
    }
  }

  static String _mb(int bytes) => (bytes / 1024 / 1024).toStringAsFixed(1);

  void close() => _client.close();
}
