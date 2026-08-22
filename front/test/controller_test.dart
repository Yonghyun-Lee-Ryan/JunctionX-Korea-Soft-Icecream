import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/api/docs_api.dart';
import 'package:solar_for_bid/api/models.dart';
import 'package:solar_for_bid/models/company_document.dart';
import 'package:solar_for_bid/state/company_registration_controller.dart';

import 'support/fake_api.dart';



PickedDoc _doc(String name) => PickedDoc(filename: name, bytes: Uint8List(4));

void main() {
  test('처음에는 5칸이 전부 미업로드다', () {
    final c = CompanyRegistrationController(FakeApi());
    expect(c.documents.length, 5);
    expect(c.documents.every((d) => d.status == DocStatus.missing), isTrue);
    expect(c.cardFields.every((f) => f.status == FieldStatus.missing), isTrue);
  });

  test('사업자등록증을 올리면 그 칸이 채워지고 상호·소재지가 붙는다', () async {
    final r = fixture('biz_reg');
    final c = CompanyRegistrationController(FakeApi(byFilename: {r.filename: r}));
    await c.uploadAll([_doc(r.filename)]);

    final row = c.documents.firstWhere((d) => d.title == '사업자 등록증');
    expect(row.status, DocStatus.done);
    expect(row.typeKey, 'co_biz_reg');
    expect(row.subtitle, r.filename);

    final name = c.cardFields.firstWhere((f) => f.label == '상호');
    expect(name.value, '주식회사 다온피엠씨');
    // 🔴 값은 있지만 확정은 아니다 — 이 문서의 extraction.confidence가 unknown이다
    //    (배열 필드에는 confidence가 안 실려 온다). 초록 체크로 그리면 거짓이 된다.
    expect(name.status, isNot(FieldStatus.missing));
    expect(name.status, r.extraction.confidence == 'high' ? FieldStatus.confirmed : FieldStatus.unverified);
    expect(c.cardFields.firstWhere((f) => f.label == '소재지').value, contains('서울특별시'));
  });

  test('🔴 중소기업확인서와 지정서가 같은 칸을 공유한다', () async {
    final sme = fixture('sme_cert');
    final pia = fixture('pia_designation');
    final c = CompanyRegistrationController(FakeApi(byFilename: {sme.filename: sme, pia.filename: pia}));

    // 하나만 올리면 칸 이름 그대로 한 줄
    await c.uploadAll([_doc(pia.filename)]);
    expect(c.documents.firstWhere((d) => d.title == '중소기업 확인서・지정서').typeKey, 'co_pia_designation');

    // 🔴 둘 다 올리면 «둘 다» 보인다 — 첫 매치만 그리면 나중 것이 사라진 것처럼 보인다
    await c.uploadAll([_doc(sme.filename)]);
    final keys = c.documents.map((d) => d.typeKey).whereType<String>();
    expect(keys, containsAll(['co_sme_cert', 'co_pia_designation']));
    expect(c.cardFields.firstWhere((f) => f.label == '기업 규모').value, '중소기업 (중기업)');
  });

  test('🔴 칸에 없는 갈래도 버리지 않고 목록 끝에 붙는다', () async {
    final cr = fixture('credit_rating');
    final sw = fixture('sw_business');
    final c = CompanyRegistrationController(FakeApi(byFilename: {cr.filename: cr, sw.filename: sw}));
    await c.uploadAll([_doc(cr.filename), _doc(sw.filename)]);

    expect(c.documents.length, 7); // 정의된 5칸(미업로드) + 칸 밖 2건
    expect(c.documents.map((d) => d.title), containsAll(['신용평가등급확인서', '소프트웨어사업자 신고확인서']));
  });

  test('8종을 다 올리면 카드 7줄이 전부 채워진다', () async {
    final all = {
      for (final k in ['biz_reg', 'sme_cert', 'credit_rating', 'pia_designation', 'sw_business', 'performance', 'financial', 'tech_staff'])
        fixture(k).filename: fixture(k),
    };
    final c = CompanyRegistrationController(FakeApi(byFilename: all));
    await c.uploadAll(all.keys.map(_doc).toList());

    expect(c.results.length, 8);
    for (final f in c.cardFields) {
      expect(f.status, isNot(FieldStatus.missing), reason: '${f.label}이 비었다');
      expect(f.value, isNot('서류 없음'), reason: '${f.label}이 비었다');
    }
    expect(c.cardFields.firstWhere((f) => f.label == '최근 실적').value, contains('15건'));
    expect(c.cardFields.firstWhere((f) => f.label == '인력').value, contains('68명'));
    expect(c.cardFields.firstWhere((f) => f.label == '재무').value, contains('8,420,000,000'));
  });

  test('🔴 unknown 신뢰도를 «확정»으로 표시하지 않는다', () async {
    final r = fixture('biz_reg');
    final c = CompanyRegistrationController(FakeApi(byFilename: {r.filename: r}));
    await c.uploadAll([_doc(r.filename)]);

    final name = c.cardFields.firstWhere((f) => f.label == '상호');
    // 픽스처의 extraction.confidence가 high가 아니면 confirmed면 안 된다
    if (r.extraction.confidence != 'high') {
      expect(name.status, FieldStatus.unverified,
          reason: 'unknown을 초록 체크로 그리면 확인 안 된 값을 확인됐다고 말하는 것이다');
    }
  });

  test('🔴 「등록・지정」은 여러 문서에서 합성된다', () async {
    final sw = fixture('sw_business');
    final pia = fixture('pia_designation');
    final c = CompanyRegistrationController(FakeApi(byFilename: {sw.filename: sw, pia.filename: pia}));
    await c.uploadAll([_doc(sw.filename), _doc(pia.filename)]);

    final v = c.cardFields.firstWhere((f) => f.label == '등록・지정').value;
    expect(v, contains('소프트웨어사업'));
    expect(v, contains('개인정보 영향평가'), reason: '먼저 잡힌 하나만 쓰면 영영 합쳐지지 않는다');
  });

  test('🔴 지정서와 중소기업확인서가 둘 다 올라오면 둘 다 보인다', () async {
    final sme = fixture('sme_cert');
    final pia = fixture('pia_designation');
    final c = CompanyRegistrationController(FakeApi(byFilename: {sme.filename: sme, pia.filename: pia}));
    await c.uploadAll([_doc(sme.filename), _doc(pia.filename)]);

    final keys = c.documents.map((d) => d.typeKey).whereType<String>();
    expect(keys, containsAll(['co_sme_cert', 'co_pia_designation']),
        reason: '한 칸이 둘을 받으면 첫 매치만 그려서 나중 것이 «사라진» 것처럼 보였다');
  });

  test('🔴 재무는 매출을 못 뽑으면 기간 라벨을 대신 보여 주지 않는다', () async {
    final fin = fixture('financial');
    final stripped = DocUploadResult.fromJson({
      ...jsonDecode(File('test/fixtures/upload_financial.json').readAsStringSync()) as Map<String, dynamic>,
      'extraction': {
        ...(jsonDecode(File('test/fixtures/upload_financial.json').readAsStringSync())
            as Map<String, dynamic>)['extraction'] as Map<String, dynamic>,
        'data': {'balance_sheet_current_period_label': '제17(당)기'},
      },
    });
    final c = CompanyRegistrationController(FakeApi(byFilename: {fin.filename: stripped}));
    await c.uploadAll([_doc(fin.filename)]);
    expect(c.cardFields.firstWhere((f) => f.label == '재무').value, '서류 없음');
  });

  test('🔴 같은 갈래를 덮어쓰면 조용히 지우지 않고 알린다', () async {
    final a = fixture('biz_reg');
    final b = DocUploadResult.fromJson({
      ...jsonDecode(File('test/fixtures/upload_biz_reg.json').readAsStringSync()) as Map<String, dynamic>,
      'filename': '다른_사업자등록증.pdf',
    });
    final c = CompanyRegistrationController(FakeApi(byFilename: {a.filename: a, b.filename: b}));
    await c.uploadAll([_doc(a.filename)]);
    await c.uploadAll([_doc(b.filename)]);

    expect(c.results['biz_reg']!.filename, '다른_사업자등록증.pdf');
    expect(c.failures.any((f) => f.code == 'E_REPLACED'), isTrue);
  });

  test('🔴 실패하면 서버 문장을 그대로 들고 있고, 칸은 그대로 비어 있다', () async {
    const err = ApiException(code: 'E_DOC_TYPE_UNKNOWN', message: '문서 종류를 판정하지 못했습니다.', status: 422);
    final c = CompanyRegistrationController(FakeApi(byFilename: {'수상한.pdf': err}));
    await c.uploadAll([_doc('수상한.pdf')]);

    expect(c.failures.single.code, 'E_DOC_TYPE_UNKNOWN');
    expect(c.failures.single.message, '문서 종류를 판정하지 못했습니다.');
    expect(c.documents.every((d) => d.status == DocStatus.missing), isTrue);
  });

  test('🔴 서류가 부족하면 저장되지 않고, 서버가 준 문장·목록이 그대로 남는다', () async {
    final r = fixture('biz_reg');
    final api = FakeApi(byFilename: {r.filename: r});
    final c = CompanyRegistrationController(api);
    await c.uploadAll([_doc(r.filename)]);

    expect(await c.createCard(), isFalse);
    expect(c.saved, isNull);
    expect(c.missing, containsAll(['기업 규모', '최근 실적', '재무', '인력']));
    expect(c.failures.single.code, 'E_CARD_INCOMPLETE');
    expect(c.failures.single.message, contains('아직 채워지지 않은 항목'));
  });

  test('🔴 8종을 다 올리면 저장되고, 보낸 내용이 카드와 같다', () async {
    final all = {
      for (final k in ['biz_reg', 'sme_cert', 'credit_rating', 'pia_designation', 'sw_business', 'performance', 'financial', 'tech_staff'])
        fixture(k).filename: fixture(k),
    };
    final api = FakeApi(byFilename: all);
    final c = CompanyRegistrationController(api);
    await c.uploadAll(all.keys.map(_doc).toList());

    expect(c.looksComplete, isTrue);
    expect(await c.createCard(), isTrue);
    expect(c.saved!.companyId, 'co_test');
    expect(c.missing, isEmpty);

    final sent = api.lastSave!;
    expect(sent.documents.length, 8);
    expect(sent.name, '주식회사 다온피엠씨');
    expect(sent.bizNo, '120-86-01230');
    expect(sent.fields['인력'], contains('68명'));
    // 🔴 추출 원문을 같이 보낸다 — 서버가 근거를 잃지 않게
    expect(sent.documents.firstWhere((d) => d.docTypeKey == 'biz_reg').data, isNotEmpty);
  });

  test('업로드 중에는 저장을 시작하지 않는다', () async {
    final r = fixture('financial');
    final c = CompanyRegistrationController(FakeApi(byFilename: {r.filename: r}));
    final f = c.uploadAll([_doc(r.filename)]);
    expect(await c.createCard(), isFalse, reason: '업로드가 끝나기 전에 저장하면 빠진 채로 저장된다');
    await f;
  });

  test('업로드 중에는 종류를 아는 척하지 않는다', () async {
    final r = fixture('financial');
    final api = FakeApi(byFilename: {r.filename: r});
    final c = CompanyRegistrationController(api);
    final future = c.uploadAll([_doc(r.filename)]);

    // 응답 전: 파일명만 있는 reading 줄이 하나 늘어난다
    expect(c.isBusy, isTrue);
    expect(c.documents.first.status, DocStatus.reading);
    expect(c.documents.first.title, isNot('재무제표'));
    // 🔴 진행률을 «아는 척»하지 않는다 — null이어야 막대가 indeterminate로 돈다.
    //    0이면 0%에서 굳어 멈춘 것처럼 보인다.
    expect(c.documents.first.progress, isNull);

    await future;
    expect(c.isBusy, isFalse);
    expect(c.documents.firstWhere((d) => d.title == '재무제표').status, DocStatus.done);
  });
}



void mainCard() {}
