import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../api/factsheet.dart';
import '../theme/tokens.dart';
import 'app_chip.dart';

/// 🔴 탭 하나를 그리는 **범용 표**. 탭이 늘거나 열이 바뀌어도 이 위젯은 안 바뀐다.
///    checklist면 행 앞에 체크박스가 붙는다 (Figma 57:4571).
class KitTableCard extends StatefulWidget {
  const KitTableCard({super.key, required this.tab, this.downloadUrl, this.onDownload});

  final KitTab tab;
  final String? downloadUrl;
  final ValueChanged<String>? onDownload;

  @override
  State<KitTableCard> createState() => _KitTableCardState();
}

class _KitTableCardState extends State<KitTableCard> {
  /// 🔴 체크 상태는 화면 로컬이다 — 계약이 「데모에서는 프론트 상태로 둬도 된다」고 못 박았다
  final _checked = <int>{};

  @override
  Widget build(BuildContext context) {
    final t = widget.tab;
    return AppCard(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(child: Text(t.title, style: AppText.sectionTitle, overflow: TextOverflow.ellipsis)),
              if (widget.downloadUrl != null) ...[
                const SizedBox(width: 12),
                _downloadButton(),
              ],
            ],
          ),
          // 🔴 검산 경고는 표 «위»에 붉게. Node가 다시 센 값이라 신뢰할 수 있다
          if (t.warnings.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (final w in t.warnings)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SvgPicture.asset(AppIcons.warnCircle, width: 20, height: 20),
                    const SizedBox(width: 8),
                    Expanded(child: Text(w, style: AppText.rowSub.copyWith(color: AppColors.urgentFg))),
                  ],
                ),
              ),
          ],
          const SizedBox(height: 14),
          if (t.rows.isEmpty)
            _empty()
          else
            // 🔴 열이 많은 표는 가로로 흐른다 — 좁은 창에서 셀을 뭉개지 않는다
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: ConstrainedBox(
                constraints: BoxConstraints(minWidth: MediaQuery.sizeOf(context).width * 0.3),
                child: _table(t),
              ),
            ),
          if (t.summary != null && t.summary!.isNotEmpty) ...[
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SvgPicture.asset(AppIcons.infoCircle, width: 18, height: 18),
                const SizedBox(width: 8),
                // 🔴 서버가 만든 문장 그대로
                Expanded(child: Text(t.summary!, style: AppText.rowSub)),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _empty() => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 40),
        alignment: Alignment.center,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppChip.neutral('아직 없음'),
            const SizedBox(height: 10),
            // 🔴 «없다»를 «0건»으로 그리지 않는다
            Text('아직 만들어지지 않았습니다.', style: AppText.rowSub, textAlign: TextAlign.center),
          ],
        ),
      );

  Widget _table(KitTab t) {
    final widths = <int, TableColumnWidth>{};
    if (t.isChecklist) widths[0] = const FixedColumnWidth(56);

    return Table(
      defaultColumnWidth: const IntrinsicColumnWidth(),
      columnWidths: widths,
      defaultVerticalAlignment: TableCellVerticalAlignment.middle,
      border: TableBorder(horizontalInside: BorderSide(color: AppColors.line1)),
      children: [
        TableRow(
          children: [
            if (t.isChecklist) const SizedBox(height: 44),
            for (final c in t.columns)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 24, 12),
                child: Text(c, style: AppText.cellHead, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
          ],
        ),
        for (var r = 0; r < t.rows.length; r++)
          TableRow(
            children: [
              if (t.isChecklist)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: _checkbox(r),
                ),
              for (var c = 0; c < t.columns.length; c++)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 14, 24, 14),
                  child: Text(
                    c < t.rows[r].length ? t.rows[r][c] : '',
                    // 🔴 ※로 시작하는 단서는 주황으로. 요구의 뜻을 뒤집는 문장이라 눈에 띄어야 한다
                    style: (c < t.rows[r].length && t.rows[r][c].trimLeft().startsWith('※'))
                        ? AppText.cellProviso
                        : AppText.cell,
                  ),
                ),
            ],
          ),
      ],
    );
  }

  Widget _checkbox(int row) {
    final on = _checked.contains(row);
    return InkWell(
      onTap: () => setState(() => on ? _checked.remove(row) : _checked.add(row)),
      borderRadius: AppRadius.card,
      child: on
          ? SvgPicture.asset(AppIcons.checkboxOn, width: 24, height: 24)
          : Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                borderRadius: AppRadius.card,
                border: Border.all(color: AppColors.border),
              ),
            ),
    );
  }

  Widget _downloadButton() => InkWell(
        onTap: widget.onDownload == null ? null : () => widget.onDownload!(widget.downloadUrl!),
        borderRadius: AppRadius.card,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: AppRadius.card,
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SvgPicture.asset(AppIcons.download, width: 24, height: 24),
              const SizedBox(width: 4),
              Text('${widget.tab.title}.xlsx', style: AppText.chip.copyWith(color: AppColors.black)),
            ],
          ),
        ),
      );
}
