import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/main.dart';
import 'package:solar_for_bid/services/document_picker.dart';
import 'package:solar_for_bid/state/company_registration_controller.dart';

import 'support/fake_api.dart';
import 'support/scaled.dart';


Widget _app({double textScale = 1.0}) => Scaled(
      textScale: textScale,
      child: SolarForBidApp(
        api: FakeApi(),
        controller: CompanyRegistrationController(FakeApi()),
        pickDocuments: () async => const PickOutcome(docs: [], rejected: {}),
      ),
    );

/// 폭·높이·글자배율을 바꿔 가며 오버플로를 센다.
///
/// 🔴 예전 판은 `FlutterError.onError`를 통째로 가로채 **오버플로가 아닌 예외까지 삼켰다.**
///    화면이 통째로 죽어도 초록이었다. 이제 오버플로만 세고 나머지는 그대로 터뜨린다.
///
/// 🔴 `SizedBox.shrink()`로 트리를 한 번 파기하고 `UniqueKey`로 새로 만들지 않으면
///    Flutter가 같은 RenderFlex의 오버플로를 한 번만 보고해 결과가 비단조로 나온다.
Future<int> _overflowAt(WidgetTester t, double w, double h, {double textScale = 1.0}) async {
  var overflow = 0;
  final others = <FlutterErrorDetails>[];
  final old = FlutterError.onError;
  FlutterError.onError = (d) {
    if (d.exceptionAsString().contains('overflowed')) {
      overflow++;
    } else {
      others.add(d);
    }
  };
  t.view.physicalSize = Size(w, h);
  t.view.devicePixelRatio = 1.0;
  await t.pumpWidget(const SizedBox.shrink());
  await t.pumpWidget(KeyedSubtree(key: UniqueKey(), child: _app(textScale: textScale)));
  await t.pump(const Duration(milliseconds: 400));
  FlutterError.onError = old;

  // 🔴 오버플로가 아닌 예외는 절대 삼키지 않는다
  if (others.isNotEmpty) {
    fail('W=$w H=$h scale=$textScale 에서 오버플로 아닌 예외 ${others.length}건:\n'
        '${others.first.exceptionAsString()}');
  }
  return overflow;
}

const _sizes = <(double, double)>[
  (1920, 1080), (1728, 1080), (1512, 982), (1440, 900), (1400, 900),
  (1399, 900), (1366, 768), (1280, 800), (1201, 800), (1200, 800),
  (1199, 800), (1100, 800), (1024, 768), (900, 800), (834, 1112),
  (768, 1024), (700, 900), (601, 900), (600, 900), (599, 900),
  (430, 932), (393, 852), (375, 812), (360, 780), (320, 720),
];

void main() {
  testWidgets('🔴 모든 폭에서 오버플로 0건', (t) async {
    addTearDown(t.view.reset);
    final bad = <String>[];
    for (final (w, h) in _sizes) {
      final n = await _overflowAt(t, w, h);
      if (n != 0) bad.add('${w.toInt()}x${h.toInt()} → $n건');
    }
    expect(bad, isEmpty, reason: '오버플로: ${bad.join(", ")}');
  });

  testWidgets('🔴 짧은 창에서도 오버플로 0건 (사이드바 세로)', (t) async {
    addTearDown(t.view.reset);
    final bad = <String>[];
    // 사이드바 Column이 세로로 넘치던 구간
    for (final (w, h) in <(double, double)>[
      (1920, 560), (1920, 480), (1440, 420), (1280, 400), (900, 360), (900, 320), (420, 520),
    ]) {
      final n = await _overflowAt(t, w, h);
      if (n != 0) bad.add('${w.toInt()}x${h.toInt()} → $n건');
    }
    expect(bad, isEmpty, reason: '오버플로: ${bad.join(", ")}');
  });

  testWidgets('🔴 글자 배율을 키워도 오버플로 0건 (접근성)', (t) async {
    addTearDown(t.view.reset);
    final bad = <String>[];
    for (final scale in <double>[1.3, 1.6, 2.0]) {
      for (final (w, h) in <(double, double)>[
        (1920, 1080), (1440, 900), (1280, 900), (900, 900), (600, 900), (375, 812),
      ]) {
        final n = await _overflowAt(t, w, h, textScale: scale);
        if (n != 0) bad.add('${w.toInt()}x${h.toInt()} @${scale}x → $n건');
      }
    }
    expect(bad, isEmpty, reason: '오버플로: ${bad.join(", ")}');
  });

  testWidgets('🔴 좁은 창에서도 본문이 사라지지 않는다', (t) async {
    addTearDown(t.view.reset);
    for (final w in [320.0, 360.0, 375.0, 393.0, 430.0]) {
      t.view.physicalSize = Size(w, 812);
      t.view.devicePixelRatio = 1.0;
      await t.pumpWidget(const SizedBox.shrink());
      await t.pumpWidget(KeyedSubtree(key: UniqueKey(), child: _app()));
      await t.pump(const Duration(milliseconds: 400));
      expect(find.text('회사 등록'), findsOneWidget, reason: 'W=$w에서 본문이 사라졌다');
      expect(find.text('필요한 서류'), findsOneWidget, reason: 'W=$w에서 본문이 사라졌다');
    }
  });
}
