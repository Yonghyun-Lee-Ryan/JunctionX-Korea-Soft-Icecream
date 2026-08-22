import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/api/card_view.dart';
import 'package:solar_for_bid/main.dart';
import 'package:solar_for_bid/services/document_picker.dart';
import 'package:solar_for_bid/state/company_registration_controller.dart';

import 'support/fake_api.dart';

/// 회사 카드 → 공고 탐색 → 「응찰 준비」(저장) → 응찰 목록 → 「응찰하러 가기」 → Bid Kit
///
/// 🔴 「응찰 준비」는 이제 **저장까지만** 한다. 첨부 수집(케이스 생성)은 목록에서 한 번 더 눌러야 시작된다.
Future<FakeApi> _toKit(WidgetTester t, {double w = 1920, double h = 1080}) async {
  final api = FakeApi(company: const CurrentCompany(exists: true, companyId: 'co_x'));
  t.view.physicalSize = Size(w, h);
  t.view.devicePixelRatio = 1.0;
  await t.pumpWidget(SolarForBidApp(
    api: api,
    controller: CompanyRegistrationController(api),
    pickDocuments: () async => const PickOutcome(docs: [], rejected: {}),
  ));
  await t.pumpAndSettle();
  await t.tap(find.text('이 카드로 공고 추천'));
  await t.pumpAndSettle();
  await t.tap(find.text('응찰 준비').first);
  await t.pumpAndSettle();
  await t.tap(find.text('응찰하러 가기').first);
  await t.pumpAndSettle();
  return api;
}

void main() {
  testWidgets('🔴 「응찰 준비」가 케이스를 만들고 Bid Kit으로 간다', (t) async {
    addTearDown(t.view.reset);
    final api = await _toKit(t);

    // go를 찍었고, 그 공고번호로 케이스가 만들어졌다
    expect(api.decisions['R25BK00645031-000'], 'go');
    expect(api.createdCases.single, 'R25BK00645031-000');

    // 🔴 탭은 서버가 준 3개다 — 임계경로는 별도 탭이 아니라 WBS 탭 안 패널이다
    expect(find.text('요구사항 체크리스트'), findsOneWidget);
    expect(find.text('WBS'), findsWidgets);
    expect(find.text('제출준비'), findsWidgets);
  });

  testWidgets('요구사항 체크리스트가 체크박스 표로 그려진다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    expect(find.text('요구사항 조견표'), findsOneWidget);
    expect(find.text('CSR-001'), findsOneWidget);
    // 🔴 ※ 단서가 살아 있다 — 요구의 뜻을 뒤집는 문장이다
    expect(find.text('※발주기관 품질기준을 우선 적용'), findsOneWidget);
    // 🔴 Node가 다시 센 검산 경고
    expect(find.textContaining('총괄표 151건'), findsOneWidget);
  });

  testWidgets('🔴 임계경로는 별도 탭이 아니라 WBS 탭 안에 있다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    // 탭 바에 「임계경로」라는 탭이 없다
    expect(find.text('임계경로'), findsNothing);

    await t.tap(find.text('WBS').first);
    await t.pumpAndSettle();

    // 그러나 패널로는 보인다
    expect(find.text('임계경로'), findsOneWidget);
    expect(find.text('입찰참가자격 등록 확인'), findsOneWidget);
    expect(find.text('M/M 예상 원가 (추천)'), findsOneWidget);
    expect(find.text('4.0'), findsOneWidget);
    // 🔴 공휴일 미반영을 숨기지 않는다
    expect(find.textContaining('공휴일 미반영'), findsOneWidget);
  });

  testWidgets('🔴 아직 안 만들어진 탭은 「준비 중」이라 말한다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    // 탭 바에 준비 중 배지
    expect(find.text('준비 중'), findsWidgets);

    await t.tap(find.text('제출준비').first);
    await t.pumpAndSettle();
    expect(find.textContaining('아직 만들어지지 않았습니다'), findsOneWidget);
    expect(find.textContaining('문서 분석이 끝나면'), findsOneWidget);
  });

  testWidgets('🔴 다운로드는 downloads[]에 있는 탭에만 붙는다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    // 조견표는 웹 체크리스트라 xlsx가 없다
    expect(find.text('요구사항 조견표.xlsx'), findsNothing);

    await t.tap(find.text('WBS').first);
    await t.pumpAndSettle();
    expect(find.text('WBS.xlsx'), findsOneWidget);
    expect(find.text('임계경로.xlsx'), findsOneWidget);
    // 원가는 downloads에 없다
    expect(find.text('M/M 예상 원가 (추천).xlsx'), findsNothing);
  });

  // 🔴 왔던 길로 되돌린다 — 추천 목록이 아니라 「응찰 준비중인 공고」다
  testWidgets('뒤로 가면 응찰 목록으로 돌아간다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    await t.tap(find.bySemanticsLabel('응찰 목록으로').first);
    await t.pumpAndSettle();
    expect(find.text('응찰 준비중인 공고'), findsOneWidget);
    expect(find.text('응찰하러 가기'), findsOneWidget);
  });

  testWidgets('🔴 폭을 훑어도 오버플로 0건', (t) async {
    addTearDown(t.view.reset);
    var overflow = 0;
    final old = FlutterError.onError;
    FlutterError.onError = (d) {
      if (d.exceptionAsString().contains('overflowed')) overflow++;
    };
    for (final (w, h) in <(double, double)>[(1920, 1080), (1440, 900), (1100, 900), (820, 900), (600, 900), (375, 812)]) {
      await t.pumpWidget(const SizedBox.shrink());
      await _toKit(t, w: w, h: h);
      for (final label in ['WBS', '제출준비']) {
        await t.tap(find.text(label).first);
        await t.pumpAndSettle();
      }
    }
    FlutterError.onError = old;
    expect(overflow, 0);
  });
}
