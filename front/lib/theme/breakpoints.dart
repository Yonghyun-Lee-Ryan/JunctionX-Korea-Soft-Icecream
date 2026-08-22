import 'package:flutter/widgets.dart';

/// 🔴 브레이크포인트는 기기 일반론이 아니라 **이 화면의 내용 폭에서 역산**했다.
///
///   우측 컬럼폭 = (W − 526) × 622/1395
///     526 = 사이드바 400 + 구분선 1 + 좌우 패딩 110 + 컬럼 간격 15
///     1395 = 773 + 622  (Figma 두 컬럼 합)
///
/// 「조달업체 등록 - 확인됨」이 한 줄로 유지되려면 우측이 377px 필요 → W ≥ 1372 → 여유 두고 1400.
/// 1200·600은 Material 3의 Large·Compact 경계와 맞춰 교차검증했다.
enum LayoutMode { compact, rail, stacked, threePane }

abstract final class Breakpoints {
  static const threePane = 1400.0;
  static const stacked = 1200.0;
  static const rail = 600.0;

  /// 🔴 `.of()`가 아니라 `.sizeOf()` — 크기 변화에만 리빌드된다.
  ///    of()는 키보드 인셋·textScale 변화에도 전부 리빌드한다.
  static LayoutMode of(BuildContext context) => forWidth(MediaQuery.sizeOf(context).width);

  static LayoutMode forWidth(double w) {
    if (w >= threePane) return LayoutMode.threePane;
    if (w >= stacked) return LayoutMode.stacked;
    if (w >= rail) return LayoutMode.rail;
    return LayoutMode.compact;
  }
}

extension LayoutModeX on LayoutMode {
  /// 400px 상시 사이드바는 Large 이상에서만 존재한다
  bool get showSidebar => this == LayoutMode.threePane || this == LayoutMode.stacked;
  bool get showRail => this == LayoutMode.rail;

  /// 우측 컬럼을 옆에 두는가, 아래로 내리는가
  bool get twoColumn => this == LayoutMode.threePane;
  bool get isCompact => this == LayoutMode.compact;

  /// 🔴 threePane 값은 Figma 그대로 보존한다
  EdgeInsets get contentPadding => switch (this) {
        LayoutMode.threePane => const EdgeInsets.fromLTRB(50, 50, 60, 60),
        LayoutMode.stacked => const EdgeInsets.fromLTRB(40, 40, 40, 48),
        LayoutMode.rail => const EdgeInsets.fromLTRB(28, 32, 28, 40),
        LayoutMode.compact => const EdgeInsets.fromLTRB(20, 20, 20, 32),
      };
}
