import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// 끝나지 않는 애니메이션이 있어도 멈추는 `pumpAndSettle`.
///
/// 🔴 파일제출 탭의 「읽는 중」 줄은 진행률을 **모르므로** indeterminate 막대다.
///    그건 영원히 도는 애니메이션이라 `pumpAndSettle`이 절대 끝나지 않는다 —
///    실제로 테스트 한 판이 10분 타임아웃으로 죽었다.
///    여기서는 잠깐 기다려 보고, 안 멎으면 몇 프레임만 밀고 넘어간다.
Future<void> settle(WidgetTester t, {Duration timeout = const Duration(seconds: 3)}) async {
  try {
    await t.pumpAndSettle(const Duration(milliseconds: 16), EnginePhase.sendSemanticsUpdate, timeout);
  } on FlutterError {
    await t.pump(const Duration(milliseconds: 300));
  }
}
