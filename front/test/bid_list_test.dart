import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/api/card_view.dart';
import 'package:solar_for_bid/api/models.dart';
import 'package:solar_for_bid/main.dart';
import 'package:solar_for_bid/services/document_picker.dart';
import 'package:solar_for_bid/state/company_registration_controller.dart';

import 'support/fake_api.dart';
import 'support/scaled.dart';

Future<void> _pump(WidgetTester t, FakeApi api,
    {double w = 1920, double h = 1080, double textScale = 1.0}) async {
  t.view.physicalSize = Size(w, h);
  t.view.devicePixelRatio = 1.0;
  await t.pumpWidget(Scaled(
    textScale: textScale,
    child: SolarForBidApp(
      api: api,
      controller: CompanyRegistrationController(api),
      pickDocuments: () async => const PickOutcome(docs: [], rejected: {}),
    ),
  ));
  await t.pumpAndSettle();
}

/// 회사 카드 → 「이 카드로 공고 추천」 → 공고 탐색
Future<void> _toDiscovery(WidgetTester t) async {
  await t.tap(find.text('이 카드로 공고 추천'));
  await t.pumpAndSettle();
}

FakeApi _api() => FakeApi(company: const CurrentCompany(exists: true, companyId: 'co_x'));

void main() {
  testWidgets('🔴 「응찰 준비」를 누르면 저장하고 응찰 목록으로 간다', (t) async {
    addTearDown(t.view.reset);
    final api = _api();
    await _pump(t, api);
    await _toDiscovery(t);

    await t.tap(find.text('응찰 준비').first);
    await t.pumpAndSettle();

    // 서버에 판정과 저장이 둘 다 갔다
    expect(api.decisions['R25BK00645031-000'], 'go');
    expect(api.savedBids.map((b) => b.caseId), ['R25BK00645031-000']);

    // 응찰 준비중인 공고 화면
    expect(find.text('응찰 준비중인 공고'), findsOneWidget);
    expect(find.textContaining('1건', findRichText: true), findsWidgets);
    expect(find.text('체육진흥투표권사업 온라인발매 결제서비스(PG) 대행 용역'), findsOneWidget);
    expect(find.text('응찰하러 가기'), findsOneWidget);

    // 🔴 저장 단계에서 첨부를 받지 않는다 — 케이스는 아직 만들어지지 않았다
    expect(api.createdCases, isEmpty);
  });

  testWidgets('🔴 「응찰하러 가기」에서 비로소 케이스를 만들고 Bid Kit으로 간다', (t) async {
    addTearDown(t.view.reset);
    final api = _api();
    await _pump(t, api);
    await _toDiscovery(t);
    await t.tap(find.text('응찰 준비').first);
    await t.pumpAndSettle();

    await t.tap(find.text('응찰하러 가기'));
    await t.pumpAndSettle();

    expect(api.createdCases, ['R25BK00645031-000']);
    expect(find.text('요구사항 체크리스트'), findsWidgets);
  });

  testWidgets('🔴 Bid Kit에서 되돌아오면 응찰 목록이다 — 공고 탐색이 아니다', (t) async {
    addTearDown(t.view.reset);
    final api = _api();
    await _pump(t, api);
    await _toDiscovery(t);
    await t.tap(find.text('응찰 준비').first);
    await t.pumpAndSettle();
    await t.tap(find.text('응찰하러 가기'));
    await t.pumpAndSettle();

    await t.tap(find.bySemanticsLabel('응찰 목록으로').first);
    await t.pumpAndSettle();
    expect(find.text('응찰 준비중인 공고'), findsOneWidget);
  });

  testWidgets('🔴 저장이 실패하면 서버 문장을 그대로 띄우고 화면을 옮기지 않는다', (t) async {
    addTearDown(t.view.reset);
    final api = _api()
      ..saveBidError = const ApiException(
          code: 'E_COMPANY_NOT_FOUND', message: '저장된 회사가 없습니다.', status: 404);
    await _pump(t, api);
    await _toDiscovery(t);

    await t.tap(find.text('응찰 준비').first);
    await t.pumpAndSettle();

    expect(find.text('저장된 회사가 없습니다.'), findsOneWidget);
    expect(find.text('나에게 맞는 공고'), findsOneWidget);
    expect(find.text('응찰 준비중인 공고'), findsNothing);
  });

  testWidgets('🔴 「빼기」는 목록에서만 뺀다', (t) async {
    addTearDown(t.view.reset);
    final api = _api();
    await _pump(t, api);
    await _toDiscovery(t);
    await t.tap(find.text('응찰 준비').first);
    await t.pumpAndSettle();

    await t.tap(find.text('빼기'));
    await t.pumpAndSettle();

    expect(api.savedBids, isEmpty);
    expect(find.text('아직 응찰하겠다고 정한 공고가 없습니다.'), findsOneWidget);
    expect(find.text('공고 보러 가기'), findsOneWidget);
  });

  testWidgets('🔴 사이드바 「응찰 건」으로 바로 들어와도 목록이 보인다', (t) async {
    addTearDown(t.view.reset);
    final api = _api();
    await _pump(t, api);

    await t.tap(find.text('응찰 건'));
    await t.pumpAndSettle();
    expect(find.text('응찰 준비중인 공고'), findsOneWidget);
    expect(find.text('아직 응찰하겠다고 정한 공고가 없습니다.'), findsOneWidget);
  });

  testWidgets('🔴 좁은 폭·큰 글자에서도 넘치지 않는다', (t) async {
    addTearDown(t.view.reset);
    var overflow = 0;
    final old = FlutterError.onError;
    FlutterError.onError = (d) {
      if (d.exceptionAsString().contains('overflowed')) {
        overflow++;
      } else {
        old?.call(d);
      }
    };
    const cases = <(double, double, double)>[
      (1920, 1080, 1.0), (1400, 900, 1.0), (1100, 800, 1.0),
      (820, 700, 1.0), (600, 600, 1.0), (375, 812, 1.0),
      // 🔴 접근성 글자 배율. 「응찰하러 가기」가 카드 폭을 꽉 채우는 버튼이라 여기서 먼저 터진다
      (1920, 1080, 1.6), (1100, 800, 1.6), (600, 600, 1.3), (375, 812, 1.3),
    ];
    for (final (w, h, ts) in cases) {
      await t.pumpWidget(const SizedBox.shrink());
      final api = _api();
      await _pump(t, api, w: w, h: h, textScale: ts);
      await t.tap(find.text('이 카드로 공고 추천').first, warnIfMissed: false);
      await t.pumpAndSettle();
      await t.tap(find.text('응찰 준비').first, warnIfMissed: false);
      await t.pumpAndSettle();
    }
    FlutterError.onError = old;
    expect(overflow, 0);
  });
}
