import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../services/document_picker.dart';
import '../theme/tokens.dart';
import 'app_chip.dart';

/// 「서류를 끌어다 놓거나 선택하세요」 (Figma 49:1013)
///
/// 🔴 이 위젯은 드롭 이벤트를 받지 않는다 — 하이라이트만 그린다.
///    DropTarget은 화면(좌측 컬럼) 전체에 걸려 있다. 이유는 `DropRegion` 주석 참조.
class DropzoneCard extends StatelessWidget {
  const DropzoneCard({super.key, this.onPick, this.isDragging = false, this.busy = false});

  final Future<void> Function()? onPick;
  final bool isDragging;
  final bool busy;

  @override
  Widget build(BuildContext context) => Container(
        // 🔴 테두리를 두껍게 하면 자식이 밀린다 → foregroundDecoration으로 레이아웃 영향 0
        foregroundDecoration: isDragging
            ? BoxDecoration(
                borderRadius: AppRadius.card,
                border: Border.all(color: AppColors.primary, width: 2),
                color: AppColors.primary.withValues(alpha: 0.04),
              )
            : null,
        child: AppCard(
          minHeight: 279,
          padding: const EdgeInsets.symmetric(vertical: 33, horizontal: 20),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                // 🔴 72.964 × 72.965 — Figma 값을 반올림하지 않는다
                SvgPicture.asset(AppIcons.uploadCloud, width: 72.964, height: 72.965),
                const SizedBox(height: 14),
                Text(
                  isDragging ? '여기에 놓으세요' : '서류를 끌어다 놓거나 선택하세요',
                  style: AppText.cardTitle,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                // 🔴 문구를 손으로 쓰지 않는다 — 실제로 받는 형식에서 만든다.
                //    Figma는 HWP·JPG·PNG까지 약속하지만 지금 백엔드는 PDF만 읽는다.
                //    광고와 동작이 다르면 그게 화면이 하는 거짓말이다.
                Text(acceptedLabel, style: AppText.rowSub, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                if (busy)
                  const SizedBox(
                    width: 130,
                    child: LinearProgressIndicator(
                      minHeight: 5,
                      backgroundColor: AppColors.line1,
                      valueColor: AlwaysStoppedAnimation(AppColors.primary),
                    ),
                  )
                else
                  InkWell(
                    onTap: onPick == null ? null : () => onPick!(),
                    borderRadius: AppRadius.card,
                    child: Container(
                      width: 130,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: AppRadius.card,
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Text('파일 선택', style: AppText.chooseFile, textAlign: TextAlign.center),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
}
