import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../models/company_document.dart';
import '../theme/tokens.dart';
import 'app_chip.dart';

/// 「필요한 서류」의 한 줄. 상태 셋을 한 위젯이 그린다 (Figma 49:1037 / 49:1051 / 49:1082)
class DocumentRow extends StatelessWidget {
  const DocumentRow({super.key, required this.doc, this.onUpload});
  final CompanyDocument doc;
  final VoidCallback? onUpload;

  @override
  Widget build(BuildContext context) => AppCard(
        minHeight: 111,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
        child: Row(
          children: [
            // 🔴 50.5 × 55.5 — 정사각형이 아니다
            SvgPicture.asset(AppIcons.docFile, width: 50.5, height: 55.5),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(doc.title, style: AppText.rowTitle, maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  Text(doc.subtitle, style: AppText.rowSub, maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            _trailing(),
          ],
        ),
      );

  Widget _trailing() => switch (doc.status) {
        DocStatus.done => AppChip.success(doc.typeKey ?? ''),
        DocStatus.missing => OutlineButtonSmall(label: '업로드', onTap: onUpload),
        DocStatus.reading => Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppChip.primary('읽는 중'),
              const SizedBox(width: 12),
              Flexible(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 140),
                  child: ClipRRect(
                  borderRadius: AppRadius.bar,
                  child: LinearProgressIndicator(
                    value: doc.progress,
                    minHeight: 5,
                    backgroundColor: AppColors.line1,
                    valueColor: const AlwaysStoppedAnimation(AppColors.primary),
                  ),
                  ),
                ),
              ),
            ],
          ),
      };
}
