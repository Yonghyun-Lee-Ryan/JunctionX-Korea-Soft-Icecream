import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../models/company_document.dart';
import '../theme/tokens.dart';
import 'app_chip.dart';

/// 「회사 카드 미리보기」 (Figma 52:1859)
class CompanyCardPreview extends StatelessWidget {
  const CompanyCardPreview({super.key, required this.fields, this.onManualEntry});
  final List<CompanyCardField> fields;
  final VoidCallback? onManualEntry;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.fromLTRB(20, 20, 30, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(child: Text('회사 카드 미리보기', style: AppText.sectionTitle, overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 12),
                OutlineButtonSmall(label: '직접 등록하기', onTap: onManualEntry),
              ],
            ),
            const SizedBox(height: 20),
            for (var i = 0; i < fields.length; i++) ...[
              _row(fields[i]),
              if (i != fields.length - 1)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: FigmaDivider.horizontal(),
                ),
            ],
          ],
        ),
      );

  Widget _row(CompanyCardField f) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SizedBox(width: 96, child: Text(f.label, style: AppText.fieldLabel, maxLines: 2, overflow: TextOverflow.ellipsis)),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    f.value,
                    style: switch (f.status) {
                      // 🔴 「읽는 중」은 보라, 「서류 없음」은 회색 — 값이 없다는 걸 숨기지 않는다
                      FieldStatus.reading => AppText.fieldValue.copyWith(color: AppColors.primary),
                      FieldStatus.missing => AppText.fieldValue.copyWith(color: AppColors.fontGray2),
                      FieldStatus.unverified || FieldStatus.confirmed => AppText.fieldValue,
                    },
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Flexible(child: Text(f.source, style: AppText.rowSub, overflow: TextOverflow.ellipsis)),
                      // 🔴 근거 쪽. 0이면 「쪽 미상」 — 모른다는 걸 숨기지 않는다
                      if (f.status != FieldStatus.missing && f.status != FieldStatus.reading) ...[
                        const SizedBox(width: 6),
                        Text(f.page > 0 ? 'p.${f.page}' : '쪽 미상',
                            style: AppText.rowSub.copyWith(color: AppColors.fontMuted)),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            _statusMark(f.status),
          ],
        ),
      );

  Widget _statusMark(FieldStatus s) => switch (s) {
        // 🔴 36 × 31 과 38 × 38 — 두 아이콘의 박스가 다르다
        FieldStatus.confirmed => SvgPicture.asset(AppIcons.check, width: 36, height: 31),
        FieldStatus.reading => SvgPicture.asset(AppIcons.clock, width: 38, height: 38),
        // 🔴 값은 있지만 추출 신뢰도가 high가 아니다 — 초록 체크로 그리면 거짓이 된다.
        //    라이브 8건 중 6건이 여기 해당한다(배열 필드엔 confidence가 안 실려 온다).
        FieldStatus.unverified => const Tooltip(
            message: '추출 신뢰도가 확인되지 않았습니다. 원문을 확인해 주세요.',
            child: AppChip.warn('확인 필요'),
          ),
        FieldStatus.missing => const AppChip.neutral('미확인'),
      };
}

/// 「조달청 교차 확인」 (Figma 52:1864)
class CrossCheckCard extends StatelessWidget {
  const CrossCheckCard({super.key, required this.items});
  final List<CrossCheckItem> items;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.fromLTRB(21, 20, 21, 13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('조달청 교차 확인', style: AppText.sectionTitle),
            const SizedBox(height: 10),
            for (final it in items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    // 🔴 확인된 것만 체크를 준다. 미연동에 체크를 그리면 거짓이다
                    if (it.badge == '미연동')
                      const SizedBox(
                        width: 36, height: 31,
                        child: Icon(Icons.remove, size: 18, color: AppColors.fontMuted),
                      )
                    else
                      SvgPicture.asset(AppIcons.check, width: 36, height: 31),
                    const SizedBox(width: 3),
                    // 🔴 Expanded가 없으면 이 카드의 최소폭이 479px로 굳는다 (실측)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Text(it.label, style: AppText.fieldLabel, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(child: AppChip.info(it.badge)),
                  ],
                ),
              ),
          ],
        ),
      );
}
