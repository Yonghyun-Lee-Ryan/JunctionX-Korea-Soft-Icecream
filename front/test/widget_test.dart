import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/services/document_picker.dart';
import 'package:solar_for_bid/main.dart';
import 'package:solar_for_bid/state/company_registration_controller.dart';

import 'support/fake_api.dart';
import 'package:solar_for_bid/theme/breakpoints.dart';
import 'package:solar_for_bid/theme/tokens.dart';


Widget _app() => SolarForBidApp(
      api: FakeApi(),
      controller: CompanyRegistrationController(FakeApi()),
      pickDocuments: () async => const PickOutcome(docs: [], rejected: {}),
    );

Future<void> _pumpAt(WidgetTester t, double w, [double h = 1080]) async {
  t.view.physicalSize = Size(w, h);
  t.view.devicePixelRatio = 1.0;
  await t.pumpWidget(_app());
  await t.pumpAndSettle();
}

void main() {
  testWidgets('회사 등록 화면이 뜨고 3단 구성이 보인다', (t) async {
    addTearDown(t.view.reset);
    await _pumpAt(t, 1920);

    expect(find.text('Solar for Bid'), findsOneWidget);
    expect(find.text('조달 파이프라인'), findsOneWidget);
    expect(find.text('회사 등록'), findsOneWidget);
    expect(find.text('회사 카드 만들기'), findsOneWidget);
    expect(find.text('서류를 끌어다 놓거나 선택하세요'), findsOneWidget);
    expect(find.text('필요한 서류'), findsOneWidget);
    expect(find.text('회사 카드 미리보기'), findsOneWidget);
    expect(find.text('조달청 교차 확인'), findsOneWidget);
  });

  testWidgets('처음에는 5칸이 전부 「업로드」 상태다', (t) async {
    addTearDown(t.view.reset);
    await _pumpAt(t, 1920);
    expect(find.text('업로드'), findsNWidgets(5));
    expect(find.text('미확인'), findsNWidgets(7));
  });

  group('반응형', () {
    testWidgets('threePane(1920) — 사이드바 + 2단', (t) async {
      addTearDown(t.view.reset);
      await _pumpAt(t, 1920);
      expect(find.text('조달 파이프라인'), findsOneWidget); // 전체 사이드바
      expect(find.byTooltip('메뉴'), findsNothing);
    });

    testWidgets('stacked(1300) — 사이드바는 남고 우측이 아래로', (t) async {
      addTearDown(t.view.reset);
      await _pumpAt(t, 1300);
      expect(Breakpoints.forWidth(1300), LayoutMode.stacked);
      expect(find.text('조달 파이프라인'), findsOneWidget);
    });

    testWidgets('rail(900) — 사이드바가 레일로 접힌다', (t) async {
      addTearDown(t.view.reset);
      await _pumpAt(t, 900);
      expect(find.text('조달 파이프라인'), findsNothing); // 라벨 없음
      expect(find.byTooltip('회사 카드'), findsOneWidget); // 레일 툴팁
    });

    testWidgets('compact(420) — 햄버거 + Drawer', (t) async {
      addTearDown(t.view.reset);
      await _pumpAt(t, 420, 900);
      expect(find.byTooltip('메뉴'), findsOneWidget);
      expect(find.text('조달 파이프라인'), findsNothing);

      await t.tap(find.byTooltip('메뉴'));
      await t.pumpAndSettle();
      expect(find.text('조달 파이프라인'), findsOneWidget); // Drawer 안의 Sidebar
    });
  });

  test('브레이크포인트 경계', () {
    expect(Breakpoints.forWidth(1400), LayoutMode.threePane);
    expect(Breakpoints.forWidth(1399), LayoutMode.stacked);
    expect(Breakpoints.forWidth(1200), LayoutMode.stacked);
    expect(Breakpoints.forWidth(1199), LayoutMode.rail);
    expect(Breakpoints.forWidth(600), LayoutMode.rail);
    expect(Breakpoints.forWidth(599), LayoutMode.compact);
  });

  testWidgets('🔴 걸러진 파일은 조용히 버려지지 않고 이유가 뜬다', (t) async {
    addTearDown(t.view.reset);
    final controller = CompanyRegistrationController(FakeApi());
    t.view.physicalSize = const Size(1920, 1080);
    t.view.devicePixelRatio = 1.0;
    await t.pumpWidget(SolarForBidApp(
      api: FakeApi(),
      controller: controller,
      pickDocuments: () async => const PickOutcome(
        docs: [],
        rejected: {'설계도.dwg': '지금은 PDF만 분석할 수 있습니다.'},
      ),
    ));
    await t.pumpAndSettle();

    await t.tap(find.text('파일 선택'));
    await t.pumpAndSettle();

    expect(find.text('설계도.dwg'), findsOneWidget);
    expect(find.text('지금은 PDF만 분석할 수 있습니다.'), findsOneWidget);
  });

  test('디자인 토큰이 Figma 값과 같다', () {
    expect(AppColors.primary, const Color(0xFF5D53FF));
    expect(AppColors.line1, const Color(0xFFF3F3F3));
    expect(AppColors.chipTypo1, const Color(0xFF7C97B6));
    expect(AppColors.successFg, const Color(0xFF00A54C));
  });
}
