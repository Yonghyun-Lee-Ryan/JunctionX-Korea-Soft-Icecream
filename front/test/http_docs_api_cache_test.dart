import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:solar_for_bid/api/http_docs_api.dart';

/// 🔴 Upstage 크레딧 — 끝난 봉투(status=done)는 프론트가 10분 동안 다시 묻지 않는다.
///    분석 중인 봉투(collecting/parsing/judging)는 폴링해야 하므로 캐시하지 않는다.
Map<String, dynamic> _envelope(String caseId, String status) => {
      'caseId': caseId,
      'status': status,
      'verdict': {'badge': 'eligible'},
      'tabs': const [],
      'downloads': const [],
      'progress': [
        {'step': '첨부 수집', 'state': 'done'},
        {'step': '문서 읽기', 'state': status == 'done' ? 'done' : 'running'},
      ],
      'meta': {'cached': false, 'kitPages': const []},
    };

class _Server {
  _Server(this.statusFor);
  final String Function(String caseId) statusFor;
  final List<String> requests = [];

  http.Client get client => MockClient((req) async {
        requests.add('${req.method} ${req.url.path}');
        final caseId = req.url.pathSegments.last;
        final status = req.method == 'POST' ? statusFor('R25X-000') : statusFor(caseId);
        final id = req.method == 'POST' ? 'R25X-000' : caseId;
        return http.Response(
          jsonEncode(_envelope(id, status)),
          req.method == 'POST' && status != 'done' ? 202 : 200,
          headers: const {'content-type': 'application/json; charset=utf-8'},
        );
      });
}

void main() {
  test('끝난 봉투는 10분 동안 한 번만 가져온다', () async {
    final server = _Server((_) => 'done');
    var now = DateTime(2026, 8, 23, 10);
    final api = HttpDocsApi(baseUrl: 'http://x', client: server.client, clock: () => now);

    await api.factsheet('R25X-000');
    await api.factsheet('R25X-000');
    expect(server.requests, ['GET /api/cases/R25X-000']);

    now = now.add(const Duration(minutes: 11));
    await api.factsheet('R25X-000');
    expect(server.requests.length, 2, reason: '10분이 지나면 다시 묻는다');
  });

  test('분석 중인 봉투는 캐시하지 않는다 — 폴링이 새 상태를 본다', () async {
    final server = _Server((_) => 'judging');
    final api = HttpDocsApi(baseUrl: 'http://x', client: server.client);

    await api.factsheet('R25X-000');
    await api.factsheet('R25X-000');
    expect(server.requests.length, 2);
  });

  test('createCase 가 끝난 봉투(200)를 주면 그대로 캐시가 된다 — 바로 열어도 GET 이 없다', () async {
    final server = _Server((_) => 'done');
    final api = HttpDocsApi(baseUrl: 'http://x', client: server.client);

    final f = await api.createCase(bidPbancNo: 'R25X');
    expect(f.status, 'done');
    await api.factsheet('R25X-000');
    expect(server.requests, ['POST /api/cases']);
  });

  test('forgetFactsheet 로 비우면 다시 가져온다', () async {
    final server = _Server((_) => 'done');
    final api = HttpDocsApi(baseUrl: 'http://x', client: server.client);

    await api.factsheet('R25X-000');
    api.forgetFactsheet('R25X-000');
    await api.factsheet('R25X-000');
    expect(server.requests.length, 2);
  });
}
