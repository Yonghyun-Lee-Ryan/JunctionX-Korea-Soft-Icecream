import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../theme/tokens.dart';

/// px 10 / py 6 · radius 8 — Figma 전 화면 공통 칩
class AppChip extends StatelessWidget {
  const AppChip({super.key, required this.label, required this.background, required this.foreground});

  const AppChip.info(String label, {Key? key})
      : this(key: key, label: label, background: AppColors.chipBg1, foreground: AppColors.chipTypo1);

  const AppChip.success(String label, {Key? key})
      : this(key: key, label: label, background: AppColors.successBg, foreground: AppColors.successFg);

  const AppChip.primary(String label, {Key? key})
      : this(key: key, label: label, background: AppColors.primarySoft, foreground: AppColors.primary);

  const AppChip.neutral(String label, {Key? key})
      : this(key: key, label: label, background: AppColors.neutralBg, foreground: AppColors.neutralFg);

  /// 🔴 값은 있으나 확인되지 않았다 — 「없음」과도 「확정」과도 다르다
  const AppChip.warn(String label, {Key? key})
      : this(key: key, label: label, background: AppColors.warnBg, foreground: AppColors.warnFg);

  const AppChip.danger(String label, {Key? key})
      : this(key: key, label: label, background: AppColors.dangerBg, foreground: AppColors.dangerFg);

  /// 마감 임박
  const AppChip.urgent(String label, {Key? key})
      : this(key: key, label: label, background: AppColors.urgentBg, foreground: AppColors.urgentFg);

  /// 서버가 준 tone 문자열 그대로 — 🔴 프론트가 색을 판단하지 않는다.
  ///    두 벌의 이름을 다 받는다: 스크리닝 봉투의 success/urgent/…와
  ///    Bid Kit 봉투의 ok/warn/muted/…. 매핑을 여기 한 곳에만 둔다.
  factory AppChip.tone(String label, String tone) => switch (tone) {
        'success' || 'ok' => AppChip.success(label),
        'danger' => AppChip.danger(label),
        'neutral' => AppChip.neutral(label),
        'urgent' || 'warn' || 'proviso' => AppChip.urgent(label),
        'primary' => AppChip.primary(label),
        // 🔴 muted를 «모르는 tone»과 같은 자리에 두면 서버 오타와 구분이 안 된다
        'muted' || 'info' => AppChip.info(label),
        _ => AppChip.info(label),
      };

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: background, borderRadius: AppRadius.chip),
        child: Text(label,
            style: AppText.chip.copyWith(color: foreground),
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
      );
}

/// 흰 배경 + #DADADA 테두리의 작은 버튼 (「업로드」·「직접 등록하기」)
class OutlineButtonSmall extends StatelessWidget {
  const OutlineButtonSmall({super.key, required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: AppRadius.chip,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: AppRadius.chip,
            border: Border.all(color: AppColors.border),
          ),
          child: Text(label, style: AppText.smallButton),
        ),
      );
}

/// 카드 껍데기 — 흰 배경 · --line1 테두리 · radius 8
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.width,
    this.minHeight,
  });
  final Widget child;
  final EdgeInsets padding;
  final double? width;

  /// 🔴 height가 아니라 minHeight다. 폭이 좁아지면 글자가 줄바꿈되는데
  ///    height가 고정이면 «아래로» 넘친다 — 원인은 가로인데 세로 오버플로로 보인다.
  final double? minHeight;

  @override
  Widget build(BuildContext context) => Container(
        width: width,
        constraints: minHeight == null ? null : BoxConstraints(minHeight: minHeight!),
        padding: padding,
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: AppRadius.card,
          border: Border.all(color: AppColors.line1),
        ),
        child: child,
      );
}


/// Figma가 내보낸 1px 선 자산을 그대로 쓴다.
/// 🔴 원본 SVG가 `preserveAspectRatio="none"`이라 늘려 쓰는 것이 디자인 의도다.
class FigmaDivider extends StatelessWidget {
  const FigmaDivider.horizontal({super.key}) : _vertical = false;
  const FigmaDivider.vertical({super.key}) : _vertical = true;

  final bool _vertical;

  @override
  Widget build(BuildContext context) {
    if (_vertical) {
      // 원본은 가로 1080×1 선을 90도 돌려 세운 것이다
      return RotatedBox(
        quarterTurns: 1,
        child: SvgPicture.asset(AppIcons.dividerV, fit: BoxFit.fill, height: 1),
      );
    }
    return SizedBox(
      height: 1,
      width: double.infinity,
      child: SvgPicture.asset(AppIcons.dividerH, fit: BoxFit.fill, height: 1),
    );
  }
}
