import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../api/factsheet.dart';
import '../models/company_document.dart';
import '../theme/tokens.dart';
import 'app_chip.dart';
import 'document_row.dart';

/// 표가 아닌 탭들. 🔴 어떤 모양으로 그릴지는 서버가 준 `kind`가 정한다 —
///    화면이 탭 id를 보고 «이건 원가 카드»라고 판단하지 않는다.
///
/// Figma 77:8081(M/M 예상 원가) · 74:7362(제출 제약 · 보완요청 · 금지 표현) · 74:6470(필요한 서류)

// ── 제출 제약 배너 (Figma 74:7380) ──────────────────────────
class KitBanner extends StatelessWidget {
  const KitBanner({super.key, required this.data});
  final KitBannerData data;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
        decoration: const BoxDecoration(color: AppColors.noticeBg, borderRadius: AppRadius.card),
        child: Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 12,
          runSpacing: 6,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SvgPicture.asset(AppIcons.warnCircle, width: 24, height: 24),
                const SizedBox(width: 6),
                Text(data.label, style: AppText.bannerLabel),
              ],
            ),
            // 🔴 서버가 만든 문장 그대로
            Text(data.text, style: AppText.bannerText),
            // 🔴 근거 쪽이 없으면 아예 안 띄운다 — 근거 없는 제약은 이 제품이 하는 말이 아니다
            if (data.evidence != null && data.evidence!.isNotEmpty)
              Text(data.evidence!, style: AppText.bannerEvidence),
          ],
        ),
      );
}

// ── M/M 예상 원가 (Figma 77:8239) ───────────────────────────
class KitMetricCard extends StatelessWidget {
  const KitMetricCard({super.key, required this.tab});
  final KitTab tab;

  @override
  Widget build(BuildContext context) {
    final m = tab.metric!;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(30, 16, 30, 24),
      decoration: BoxDecoration(
        color: AppColors.metricBg,
        borderRadius: AppRadius.card,
        border: Border.all(color: AppColors.metricBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            children: [
              Text(tab.title, style: AppText.sectionTitle),
              // 🔴 「투찰가 아님」 — 이 숫자를 투찰가로 오해하면 회사가 돈을 잃는다
              if (tab.summary != null && tab.summary!.isNotEmpty)
                Text('- ${tab.summary!}', style: AppText.rowSub.copyWith(color: AppColors.fontGray2)),
            ],
          ),
          const SizedBox(height: 20),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            runSpacing: 4,
            children: [
              Text(m.value, style: AppText.metricValue),
              Text(
                [m.unit, m.caption].whereType<String>().where((e) => e.isNotEmpty).join('・'),
                style: AppText.metricCaption,
              ),
            ],
          ),
          if (m.note != null && m.note!.isNotEmpty) ...[
            const SizedBox(height: 11),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: const BoxDecoration(color: AppColors.primarySoft, borderRadius: AppRadius.card),
              // 🔴 «못 한 것»을 말하는 줄이다. 값을 지어내지 않았다는 표시라 지우면 안 된다
              child: Text(m.note!, style: AppText.metricNote),
            ),
          ],
          if (m.evidence.isNotEmpty) ...[
            const SizedBox(height: 16),
            Wrap(
              spacing: 17,
              runSpacing: 6,
              children: [for (final e in m.evidence) Text(e, style: AppText.metricEvidence)],
            ),
          ],
        ],
      ),
    );
  }
}

// ── 보완요청 (Figma 74:7530) ────────────────────────────────
class KitTasksCard extends StatelessWidget {
  const KitTasksCard({super.key, required this.tab, this.onAction});
  final KitTab tab;
  final void Function(KitItem item)? onAction;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 30),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(tab.title, style: AppText.sectionTitle),
            if (tab.summary != null && tab.summary!.isNotEmpty) ...[
              const SizedBox(height: 8),
              // 🔴 «사람이 검토한 뒤» — 자동으로 통과시키지 않는다는 약속이다
              Text(tab.summary!, style: AppText.rowSub.copyWith(color: AppColors.fontGray1)),
            ],
            const SizedBox(height: 12),
            for (final item in tab.items)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _item(item),
              ),
          ],
        ),
      );

  Widget _item(KitItem item) => Container(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: AppRadius.card,
          border: Border.all(color: AppColors.border),
        ),
        child: LayoutBuilder(
          builder: (context, c) {
            final head = Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 5,
                  runSpacing: 4,
                  children: [
                    Text(item.title, style: AppText.sectionTitle),
                    if (item.chip != null) AppChip.tone(item.chip!.text, item.chip!.tone),
                  ],
                ),
                if (item.detail != null && item.detail!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(item.detail!, style: AppText.rowSub.copyWith(color: AppColors.fontGray1)),
                ],
              ],
            );
            final action = item.action == null ? null : _action(item);
            if (action == null) return head;
            // 좁으면 버튼을 아래로 — 🔴 잘라 내지 않는다
            return c.maxWidth < 520
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [head, const SizedBox(height: 12), action],
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [Expanded(child: head), const SizedBox(width: 16), action],
                  );
          },
        ),
      );

  Widget _action(KitItem item) {
    final a = item.action!;
    // 🔴 kind가 file이면 이미 올라온 파일이다 — 누를 것이 없으니 버튼처럼 굴지 않는다
    final upload = a.kind == 'upload';
    final body = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppRadius.card,
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (upload) ...[
            SvgPicture.asset(AppIcons.download, width: 24, height: 24),
            const SizedBox(width: 4),
          ],
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 200),
            child: Text(a.label,
                style: AppText.chip
                    .copyWith(color: upload ? AppColors.black : AppColors.fontGray1),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
    if (!upload) return body;
    return InkWell(
      onTap: onAction == null ? null : () => onAction!(item),
      borderRadius: AppRadius.card,
      child: body,
    );
  }
}

// ── 금지 표현 검사 (Figma 74:7524) ──────────────────────────
class KitNoteCard extends StatelessWidget {
  const KitNoteCard({super.key, required this.tab, this.onAction});
  final KitTab tab;

  /// 서버가 붙인 행동(원고 올리기 등)을 눌렀을 때
  final void Function(KitAction action)? onAction;

  @override
  Widget build(BuildContext context) {
    final n = tab.note!;
    return AppCard(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 30),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(tab.title, style: AppText.sectionTitle),
          const SizedBox(height: 10),
          RichText(text: TextSpan(children: _spans(n))),
          if (n.proposalFile != null && n.proposalFile!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('검사한 원고: ${n.proposalFile}', style: AppText.rowSub),
          ],
          // 🔴 걸린 자리 — 표현·문장·쪽. 문장을 고쳐 주지 않는다
          for (final it in n.items) ...[
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppChip.danger(it.expression),
                const SizedBox(width: 8),
                Expanded(child: Text(it.sentence, style: AppText.rowSub)),
                if (it.page > 0) ...[
                  const SizedBox(width: 8),
                  Text('p.${it.page}', style: AppText.noteEvidence),
                ],
              ],
            ),
          ],
          if (n.evidence != null && n.evidence!.isNotEmpty) ...[
            const SizedBox(height: 16),
            // 🔴 배너는 「공고문 p21」로 그린다. 같은 뜻을 같은 모양으로 —
            //    Figma의 앞 마침표는 옮기지 않는다(같은 화면 안에서 표기가 갈린다)
            Text(n.evidence!, style: AppText.noteEvidence),
          ],
          if (n.action != null) ...[
            const SizedBox(height: 16),
            OutlineButtonSmall(label: n.action!.label, onTap: onAction == null ? null : () => onAction!(n.action!)),
          ],
        ],
      ),
    );
  }

  /// 🔴 강조할 조각을 본문에서 «찾는다». 서버가 조각 문자열을 주므로
  ///    화면이 «숫자면 빨강» 같은 규칙을 만들지 않는다.
  List<TextSpan> _spans(KitNoteData n) {
    final e = n.emphasis;
    if (e == null || e.isEmpty) return [TextSpan(text: n.body, style: AppText.noteBody)];
    final i = n.body.indexOf(e);
    if (i < 0) return [TextSpan(text: n.body, style: AppText.noteBody)];
    return [
      TextSpan(text: n.body.substring(0, i), style: AppText.noteBody),
      TextSpan(text: e, style: AppText.noteEmphasis),
      TextSpan(text: n.body.substring(i + e.length), style: AppText.noteBody),
    ];
  }
}

// ── 필요한 서류 (Figma 74:6516) ─────────────────────────────
class KitDocsList extends StatelessWidget {
  const KitDocsList({super.key, required this.tab, this.onUpload});
  final KitTab tab;
  final void Function(KitItem item)? onUpload;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(tab.title, style: AppText.sectionTitle),
          const SizedBox(height: 12),
          for (final item in tab.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              // 🔴 회사 등록 화면의 줄을 그대로 쓴다 — 같은 뜻이면 같은 모양이어야 한다
              //    파일이 붙은 줄도 「다시 올리기」로 바꿀 수 있다. 칩 색은 서버가 준 tone 이다
              child: DocumentRow(
                doc: _toDoc(item),
                tone: item.chip?.tone ?? 'success',
                onUpload: () => onUpload?.call(item),
                onReplace: onUpload == null || item.state != 'done' ? null : () => onUpload!(item),
              ),
            ),
          if (tab.summary != null && tab.summary!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SvgPicture.asset(AppIcons.infoCircle, width: 18, height: 18),
                const SizedBox(width: 8),
                // 🔴 서버가 만든 문장 그대로
                Expanded(child: Text(tab.summary!, style: AppText.rowSub)),
              ],
            ),
          ],
        ],
      );

  static CompanyDocument _toDoc(KitItem i) => CompanyDocument(
        title: i.title,
        subtitle: i.filename ?? '',
        status: switch (i.state) {
          'done' => DocStatus.done,
          'reading' => DocStatus.reading,
          _ => DocStatus.missing,
        },
        typeKey: i.chip?.text ?? i.label,
        progress: i.progress,
      );
}
