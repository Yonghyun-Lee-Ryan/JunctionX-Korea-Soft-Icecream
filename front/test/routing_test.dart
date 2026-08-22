import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/api/card_view.dart';
import 'package:solar_for_bid/main.dart';
import 'package:solar_for_bid/services/document_picker.dart';
import 'package:solar_for_bid/state/company_registration_controller.dart';

import 'support/fake_api.dart';
import 'support/settle.dart';

Future<void> _pump(WidgetTester t, FakeApi api, {double w = 1920, double h = 1080}) async {
  t.view.physicalSize = Size(w, h);
  t.view.devicePixelRatio = 1.0;
  await t.pumpWidget(SolarForBidApp(
    api: api,
    controller: CompanyRegistrationController(api),
    pickDocuments: () async => const PickOutcome(docs: [], rejected: {}),
  ));
  await settle(t);
}

void main() {
  testWidgets('🔴 저장된 회사가 없으면 회사 등록 화면으로 간다', (t) async {
    addTearDown(t.view.reset);
    await _pump(t, FakeApi());
    expect(find.text('회사 등록'), findsOneWidget);
    expect(find.text('서류를 끌어다 놓거나 선택하세요'), findsOneWidget);
  });

  testWidgets('🔴 저장된 회사가 있으면 회사 카드 화면으로 간다', (t) async {
    addTearDown(t.view.reset);
    await _pump(t, FakeApi(company: const CurrentCompany(exists: true, companyId: 'co_x', name: '주식회사 다온피엠씨')));

    expect(find.text('회사 등록'), findsNothing);
    // 제목은 RichText다 — 회사명만 보라색이라 TextSpan으로 나뉜다
    expect(find.textContaining('회사 카드 - ', findRichText: true), findsOneWidget);
    expect(find.textContaining('주식회사 다온피엠씨', findRichText: true), findsWidgets);
    expect(find.text('이 카드로 공고 추천'), findsOneWidget);
  });

  testWidgets('🔴 「카드 수정하기」를 누르면 등록 화면으로 되돌아간다', (t) async {
    addTearDown(t.view.reset);
    await _pump(t, FakeApi(company: const CurrentCompany(exists: true, companyId: 'co_x')));
    await t.tap(find.text('카드 수정하기'));
    await settle(t);
    expect(find.text('회사 등록'), findsOneWidget);
  });

  testWidgets('🔴 서버에 못 붙으면 서버 문장을 띄우고 등록으로 갈 길을 준다', (t) async {
    addTearDown(t.view.reset);
    await _pump(t, _DeadApi());
    expect(find.textContaining('연결하지 못했습니다'), findsOneWidget);
    await t.tap(find.text('회사 등록으로'));
    await settle(t);
    expect(find.text('회사 등록'), findsOneWidget);
  });

  group('회사 카드 화면', () {
    testWidgets('지표 타일과 섹션을 서버가 준 대로 그린다', (t) async {
      addTearDown(t.view.reset);
      await _pump(t, FakeApi(company: const CurrentCompany(exists: true, companyId: 'co_x')));

      expect(find.text('공공 정보화 PMO 실적'), findsOneWidget);
      expect(find.text('8건'), findsOneWidget);
      expect(find.text('6.12억'), findsOneWidget);
      // 🔴 값이 없는 지표는 0이 아니라 「미확인」이다
      expect(find.text('미확인'), findsWidgets);

      expect(find.text('기본・등록'), findsOneWidget);
      expect(find.text('실적 (최근 3년)'), findsOneWidget);
      expect(find.text('공공 PMO 8'), findsOneWidget);
      expect(find.text('금융 PMO 0'), findsOneWidget);
      // 🔴 서버가 만든 문장을 그대로
      expect(find.text('서류에서 읽지 못하였습니다. 직접 입력하실 수 있습니다.'), findsOneWidget);
      expect(find.text('직접입력'), findsNWidgets(3));
    });

    testWidgets('좁은 폭에서도 오버플로 없이 1열로 접힌다', (t) async {
      addTearDown(t.view.reset);
      var overflow = 0;
      final old = FlutterError.onError;
      FlutterError.onError = (d) {
        if (d.exceptionAsString().contains('overflowed')) overflow++;
      };
      for (final (w, h) in <(double, double)>[(1920, 1080), (1280, 900), (900, 900), (600, 900), (375, 812)]) {
        await t.pumpWidget(const SizedBox.shrink());
        await _pump(t, FakeApi(company: const CurrentCompany(exists: true, companyId: 'co_x')), w: w, h: h);
      }
      FlutterError.onError = old;
      expect(overflow, 0);
    });
  });
}

class _DeadApi extends FakeApi {
  @override
  Future<CurrentCompany> currentCompany() async => throw Exception('down');
}
