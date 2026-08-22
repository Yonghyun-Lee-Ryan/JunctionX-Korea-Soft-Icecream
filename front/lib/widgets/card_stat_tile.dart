import 'package:flutter/material.dart';

import '../api/card_view.dart';
import '../theme/tokens.dart';
import 'app_chip.dart';

/// 상단 지표 타일 (Figma 52:1804 등). 폭 335 · 높이 158
class CardStatTile extends StatelessWidget {
  const CardStatTile({super.key, required this.stat});
  final CardStat stat;

  @override
  Widget build(BuildContext context) => AppCard(
        minHeight: 158,
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(stat.label, style: AppText.statLabel, maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 8),
            // 🔴 값이 없으면 0을 그리지 않는다 — 「미확인」이라고 말한다
            stat.value == null
                ? const AppChip.neutral('미확인')
                : Text(stat.value!, style: AppText.statValue, maxLines: 1, overflow: TextOverflow.ellipsis),
            if (stat.sub != null) ...[
              const SizedBox(height: 8),
              Text(stat.sub!, style: AppText.statSub, maxLines: 2, overflow: TextOverflow.ellipsis),
            ],
          ],
        ),
      );
}

/// 섹션 카드 — 제목 + (칩) + 행들 (Figma 52:1866 / 52:1892 / 52:1915)
class CardSectionCard extends StatelessWidget {
  const CardSectionCard({super.key, required this.section, this.onManual});

  final CardSection section;
  final void Function(CardRow row)? onManual;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(section.title, style: AppText.sectionTitle, maxLines: 1, overflow: TextOverflow.ellipsis),
            if (section.note != null) ...[
              const SizedBox(height: 6),
              // 🔴 서버가 만든 문장을 그대로 렌더한다
              Text(section.note!, style: AppText.pageSubtitle.copyWith(fontSize: 16)),
            ],
            if (section.chips.isNotEmpty) ...[
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [for (final c in section.chips) AppChip.tone(c.label, c.tone)],
              ),
            ],
            const SizedBox(height: 14),
            for (var i = 0; i < section.rows.length; i++) ...[
              _row(section.rows[i]),
              if (i != section.rows.length - 1)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: FigmaDivider.horizontal(),
                ),
            ],
          ],
        ),
      );

  Widget _row(CardRow r) {
    // 「직접 입력」 자리 — 값이 없고 사람이 채워야 하는 행
    if (r.isManual && r.value == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(child: Text(r.label, style: AppText.fieldValue, maxLines: 1, overflow: TextOverflow.ellipsis)),
            const SizedBox(width: 12),
            OutlineButtonSmall(label: '직접입력', onTap: onManual == null ? null : () => onManual!(r)),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 108,
            child: Text(r.label, style: AppText.fieldLabel.copyWith(fontSize: 18),
                maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 🔴 값이 없으면 회색으로 「미확인」 — 빈칸으로 두지 않는다
                Text(r.value ?? '미확인',
                    style: r.value == null
                        ? AppText.fieldValue.copyWith(color: AppColors.fontGray2)
                        : AppText.fieldValue,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
                if (r.source != null) ...[
                  const SizedBox(height: 4),
                  Text(r.source!, style: AppText.rowSub, maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
