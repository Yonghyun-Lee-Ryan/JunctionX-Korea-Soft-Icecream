@Tags(['live'])
library;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:solar_for_bid/api/docs_api.dart';
import 'package:solar_for_bid/api/http_docs_api.dart';
import 'package:solar_for_bid/api/models.dart';
import 'package:solar_for_bid/models/company_document.dart';
import 'package:solar_for_bid/state/company_registration_controller.dart';

/// 🔴 진짜 백엔드에 붙는다. `--dart-define=API_BASE_URL=...` 로 주소를 바꾼다.
///    백엔드가 꺼져 있으면 전부 skip — CI를 빨갛게 만들지 않는다.
///
///    실행: flutter test test/live_api_test.dart --dart-define=API_BASE_URL=http://localhost:3010
const _base = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3010');
const _demoDir = '../plan/Solar_for_Bid/06_데모입력';

Future<bool> _up() async {
  try {
    final r = await http.get(Uri.parse('$_base/health')).timeout(const Duration(seconds: 2));
    return r.statusCode == 200;
  } catch (_) {
    return false;
  }
}

void main() {
  late bool up;
  setUpAll(() async => up = await _up());

  test('GET /api/docs/types — 8갈래가 온다', () async {
    if (!up) return markTestSkipped('백엔드가 꺼져 있다: $_base');
    final types = await HttpDocsApi(baseUrl: _base).types();
    expect(types.length, 8);
    expect(types.map((t) => t.key), containsAll(<String>[
      'biz_reg', 'sme_cert', 'credit_rating', 'pia_designation',
      'sw_business', 'performance', 'financial', 'tech_staff',
    ]));
  });

  test('🔴 실제 PDF 업로드 → 분류 → 추출 → 카드가 채워진다', () async {
    if (!up) return markTestSkipped('백엔드가 꺼져 있다: $_base');
    final f = File('$_demoDir/사업자등록증_다온피엠씨_가상.pdf');
    if (!f.existsSync()) return markTestSkipped('견본 PDF 없음');

    final api = HttpDocsApi(baseUrl: _base);
    final c = CompanyRegistrationController(api);

    await c.uploadAll([PickedDoc(filename: f.uri.pathSegments.last, bytes: f.readAsBytesSync())]);

    expect(c.failures, isEmpty, reason: c.failures.map((e) => '${e.code}: ${e.message}').join(' / '));
    expect(c.results.containsKey('biz_reg'), isTrue);

    final r = c.results['biz_reg']!;
    expect(r.docType.confidence, 'high');
    expect(r.extraction.data['법인명_단체명'], '주식회사 다온피엠씨');
    // 🔴 필드별 근거 쪽이 실려 온다
    expect(r.extraction.fields['등록번호']?.page, greaterThan(0));

    final row = c.documents.firstWhere((d) => d.title == '사업자 등록증');
    expect(row.status, DocStatus.done);
    expect(row.typeKey, 'co_biz_reg');

    expect(c.cardFields.firstWhere((x) => x.label == '상호').value, '주식회사 다온피엠씨');
    expect(c.cardFields.firstWhere((x) => x.label == '소재지').value, contains('서울특별시'));
    api.close();
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('🔴 8종을 전부 올리고 회사 카드를 실제로 저장한다', () async {
    if (!up) return markTestSkipped('백엔드가 꺼져 있다: $_base');
    const names = <String, String>{
      'biz_reg': '사업자등록증', 'sme_cert': '중소기업확인서', 'credit_rating': '신용평가등급확인서',
      'pia_designation': '개인정보영향평가기관지정서', 'sw_business': '소프트웨어사업자신고확인서',
      'performance': '실적증명서', 'financial': '재무제표', 'tech_staff': '기술인력보유현황',
    };
    final docs = <PickedDoc>[];
    for (final base in names.values) {
      final f = File('$_demoDir/${base}_다온피엠씨_가상.pdf');
      if (!f.existsSync()) return markTestSkipped('견본 PDF 없음: $base');
      docs.add(PickedDoc(filename: f.uri.pathSegments.last, bytes: f.readAsBytesSync()));
    }

    final api = HttpDocsApi(baseUrl: _base);
    final c = CompanyRegistrationController(api);
    await c.uploadAll(docs);

    expect(c.failures.where((f) => f.code != 'E_REPLACED'), isEmpty,
        reason: c.failures.map((e) => '${e.code}: ${e.message}').join(' / '));
    expect(c.results.length, 8);

    // 🔴 카드 7줄이 전부 채워졌나
    for (final f in c.cardFields) {
      expect(f.status, isNot(FieldStatus.missing), reason: '${f.label}이 비었다');
    }
    expect(c.looksComplete, isTrue);

    // 🔴 실제로 저장된다
    expect(await c.createCard(), isTrue,
        reason: c.failures.map((e) => e.message).join(' / '));
    expect(c.saved!.companyId, isNotEmpty);
    expect(c.missing, isEmpty);

    // 🔴 저장된 것이 서버에서 다시 읽힌다
    final res = await http.get(Uri.parse('$_base/api/companies/${c.saved!.companyId}'));
    expect(res.statusCode, 200);
    final saved = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    expect((saved['documents'] as List).length, 8);
    expect(saved['bizNo'], '120-86-01230');
    api.close();
  }, timeout: const Timeout(Duration(minutes: 6)));

  test('🔴 서류가 부족하면 서버가 저장을 거부하고 빠진 항목을 준다', () async {
    if (!up) return markTestSkipped('백엔드가 꺼져 있다: $_base');
    final f = File('$_demoDir/사업자등록증_다온피엠씨_가상.pdf');
    if (!f.existsSync()) return markTestSkipped('견본 PDF 없음');

    final api = HttpDocsApi(baseUrl: _base);
    final c = CompanyRegistrationController(api);
    await c.uploadAll([PickedDoc(filename: f.uri.pathSegments.last, bytes: f.readAsBytesSync())]);

    expect(await c.createCard(), isFalse);
    expect(c.saved, isNull);
    expect(c.missing, containsAll(['기업 규모', '최근 실적', '재무', '인력']));
    api.close();
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('🔴 PDF가 아니면 서버 문장이 그대로 온다', () async {
    if (!up) return markTestSkipped('백엔드가 꺼져 있다: $_base');
    final api = HttpDocsApi(baseUrl: _base);
    try {
      await api.upload(PickedDoc(filename: 'x.pdf', bytes: Uint8List.fromList(utf8.encode('not a pdf'))));
      fail('예외가 나야 한다');
    } on ApiException catch (e) {
      expect(e.code, 'E_UNSUPPORTED_FILE');
      expect(e.status, 415);
      expect(e.message, isNotEmpty);
    }
    api.close();
  });
}
