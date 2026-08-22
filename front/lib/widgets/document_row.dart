import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../models/company_document.dart';
import '../theme/tokens.dart';
import 'app_chip.dart';

/// 「필요한 서류」의 한 줄. 상태 셋을 한 위젯이 그린다 (Figma 49:1037 / 49:1051 / 49:1082)
///
/// 🔴 [onReplace]가 있으면 파일이 붙은 줄(done)에도 「다시 올리기」가 붙는다 — 준비됨·보완 필요 줄에서 파일을 바꿀 길이
///    없던 실측. [tone]은 done 칩의 색 — 서버가 준 tone 을 옮길 뿐, 화면이 「준비됨이면 초록」이라고 판단하지 않는다.
class DocumentRow extends StatelessWidget {
  const DocumentRow({super.key, required this.doc, this.onUpload, this.onReplace, this.tone = 'success'});
  final CompanyDocument doc;
  final VoidCallback? onUpload;
  final VoidCallback? onReplace;
  final String tone;

  @override
  Widget build(BuildContext context) => AppCard(
        minHeight: 111,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
        child: LayoutBuilder(
          builder: (context, c) {
            final text = Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(doc.title, style: AppText.rowTitle, maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 6),
                Text(doc.subtitle, style: AppText.rowSub, maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            );
            // 🔴 좁으면 상태 칩·버튼을 글 아래로 내린다 — 잘라 내지 않는다
            final narrow = c.maxWidth < 520;
            return Row(
              children: [
                // 🔴 50.5 × 55.5 — 정사각형이 아니다
                SvgPicture.asset(AppIcons.docFile, width: 50.5, height: 55.5),
                const SizedBox(width: 12),
                Expanded(
                  child: narrow
                      ? Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [text, const SizedBox(height: 10), _trailing()],
                        )
                      : text,
                ),
                if (!narrow) _trailing(),
              ],
            );
          },
        ),
      );

  Widget _trailing() => switch (doc.status) {
        // 🔴 Wrap — 좁은 폭에서 칩과 버튼이 두 줄로 내려간다. Row 면 375px 에서 넘쳤다(실측)
        DocStatus.done => Wrap(
            spacing: 10,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              AppChip.tone(doc.typeKey ?? '', tone),
              if (onReplace != null) OutlineButtonSmall(label: '다시 올리기', onTap: onReplace),
            ],
          ),
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
