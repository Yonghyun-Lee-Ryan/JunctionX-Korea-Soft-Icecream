import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/api/card_view.dart';
import 'package:solar_for_bid/main.dart';
import 'package:solar_for_bid/services/document_picker.dart';
import 'package:solar_for_bid/state/company_registration_controller.dart';

import 'support/fake_api.dart';

Future<FakeApi> _pump(WidgetTester t, {double w = 1920, double h = 1080, bool live = false}) async {
  final api = FakeApi(company: const CurrentCompany(exists: true, companyId: 'co_x'))..liveScreening = live;
  t.view.physicalSize = Size(w, h);
  t.view.devicePixelRatio = 1.0;
  await t.pumpWidget(SolarForBidApp(
    api: api,
    controller: CompanyRegistrationController(api),
    pickDocuments: () async => const PickOutcome(docs: [], rejected: {}),
  ));
  await t.pumpAndSettle();
  // 회사 카드 → 「이 카드로 공고 추천」
  await t.tap(find.text('이 카드로 공고 추천'));
  await t.pumpAndSettle();
  return api;
}

void main() {
  testWidgets('🔴 분모가 헤드라인이다 — 127건 중 3건', (t) async {
    addTearDown(t.view.reset);
    await _pump(t);
    expect(find.textContaining('127건 중 ', findRichText: true), findsOneWidget);
    expect(find.text('나에게 맞는 공고'), findsOneWidget);
    expect(find.text('다시 추천'), findsOneWidget);
  });

  testWidgets('🔴 캐시 목록임을 먼저 말한다', (t) async {
    addTearDown(t.view.reset);
    await _pump(t);
    expect(find.text('캐시 목록 · 나라장터 미연결'), findsOneWidget);
    expect(find.text('나라장터 실시간'), findsNothing);
  });

  group('나라장터 실호출', () {
    testWidgets('🔴 실시간이라고 말하고, 첨부를 안 읽었음도 같이 말한다', (t) async {
      addTearDown(t.view.reset);
      await _pump(t, live: true);
      expect(find.text('나라장터 실시간'), findsOneWidget);
      expect(find.text('캐시 목록 · 나라장터 미연결'), findsNothing);
      // 🔴 자격 충족은 아직 모른다 — 그 사실을 두 군데서 말한다
      expect(find.text('자격 미확인 · 첨부 미분석'), findsOneWidget);
      expect(find.textContaining('첨부 문서는 아직 읽지 않아'), findsOneWidget);
    });

    testWidgets('🔴 충족을 «0건»이라 말하지 않고 「충족 미확인」이라 한다', (t) async {
      addTearDown(t.view.reset);
      await _pump(t, live: true);
      expect(find.text('충족 미확인'), findsNWidgets(2));
      expect(find.text('충족 0'), findsNothing);
    });

    testWidgets('실측 분모가 헤드라인에 들어간다', (t) async {
      addTearDown(t.view.reset);
      await _pump(t, live: true);
      expect(find.textContaining('300건 중 ', findRichText: true), findsOneWidget);
      expect(find.text('제외 232건'), findsOneWidget);
    });
  });

  testWidgets('추천 카드가 D-day·충족·근거 쪽을 보여 준다', (t) async {
    addTearDown(t.view.reset);
    await _pump(t);
    expect(find.text('영업일 D-8'), findsOneWidget);
    expect(find.text('충족 5'), findsOneWidget);
    expect(find.text('p.14'), findsOneWidget);
    // 🔴 근거 쪽을 모르면 「쪽 미상」 — 아는 척하지 않는다
    expect(find.text('쪽 미상'), findsWidgets);
    // 🔴 못 읽은 항목을 숨기지 않는다
    expect(find.text('미확인 1'), findsOneWidget);
  });

  testWidgets('🔴 보류된 카드는 지우지 않고 「보류 취소」를 준다', (t) async {
    addTearDown(t.view.reset);
    await _pump(t);
    expect(find.text('공공기관 정보화 PMO 용역'), findsOneWidget);
    expect(find.text('보류 취소'), findsOneWidget);
  });

  testWidgets('🚪 응찰 준비를 누르면 서버에 go를 남기고 응찰 목록으로 넘어간다', (t) async {
    addTearDown(t.view.reset);
    final api = await _pump(t);
    await t.tap(find.text('응찰 준비').first);
    await t.pumpAndSettle();

    expect(api.decisions['R25BK00645031-000'], 'go');
    // 🔴 go를 찍은 건만 저장된다
    expect(api.savedBids.single.caseId, 'R25BK00645031-000');
    expect(find.text('응찰 준비중인 공고'), findsOneWidget);
    // 🔴 첨부 수집은 아직 시작하지 않는다 — 수십 초가 걸리는 일을 사람 확인 없이 돌리지 않는다
    expect(api.createdCases, isEmpty);
  });

  testWidgets('🚪 보류는 화면을 넘기지 않고 목록에 남긴다', (t) async {
    addTearDown(t.view.reset);
    final api = await _pump(t);
    await t.tap(find.text('보류').first);
    await t.pumpAndSettle();

    expect(api.decisions['R25BK00645031-000'], 'skip');
    expect(api.createdCases, isEmpty, reason: '보류는 응찰 준비가 아니다');
    expect(find.textContaining('건 중 ', findRichText: true), findsOneWidget);
    expect(find.text('보류 취소'), findsNWidgets(2));
  });

  group('제외 드롭다운', () {
    testWidgets('🔴 접혀 있어도 분모는 늘 보인다', (t) async {
      addTearDown(t.view.reset);
      await _pump(t);
      expect(find.text('제외 124건'), findsOneWidget);
      expect(find.textContaining('금융권 차세대 PMO'), findsNothing);
    });

    testWidgets('펼치면 제외 사유와 근거 쪽이 나온다', (t) async {
      addTearDown(t.view.reset);
      await _pump(t);
      await t.tap(find.text('제외 124건'));
      await t.pumpAndSettle();

      expect(find.text('(데모) 금융권 차세대 PMO'), findsOneWidget);
      expect(find.text('최근 3년 금융권 PMO 실적 2건 이상 필요 — 회사 카드 0건'), findsOneWidget);
      expect(find.text('p12 참고'), findsOneWidget);
      // 🔴 표본만 보여 준다는 사실을 숨기지 않는다
      expect(find.textContaining('표본으로 보여 드립니다'), findsOneWidget);
    });

    testWidgets('다시 누르면 접힌다', (t) async {
      addTearDown(t.view.reset);
      await _pump(t);
      await t.tap(find.text('제외 124건'));
      await t.pumpAndSettle();
      await t.tap(find.text('제외 124건'));
      await t.pumpAndSettle();
      expect(find.text('(데모) 금융권 차세대 PMO'), findsNothing);
    });
  });

  testWidgets('🔴 폭을 훑어도 오버플로 0건 (펼침 포함)', (t) async {
    addTearDown(t.view.reset);
    var overflow = 0;
    final old = FlutterError.onError;
    FlutterError.onError = (d) {
      if (d.exceptionAsString().contains('overflowed')) overflow++;
    };
    for (final (w, h) in <(double, double)>[(1920, 1080), (1440, 900), (1100, 900), (820, 900), (600, 900), (375, 812)]) {
      await t.pumpWidget(const SizedBox.shrink());
      await _pump(t, w: w, h: h);
      await t.tap(find.text('제외 124건'));
      await t.pumpAndSettle();
    }
    FlutterError.onError = old;
    expect(overflow, 0);
  });
}
