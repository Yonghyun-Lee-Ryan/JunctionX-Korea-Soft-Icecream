import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../api/screening.dart';
import '../theme/tokens.dart';
import 'app_chip.dart';

/// 추천 공고 한 장 (Figma 56:2933).
///
/// 🔴 보류(skip)된 카드는 흐려지고 버튼이 「보류 취소」 하나로 바뀐다 —
///    목록에서 지우지 않는다. 사람이 되돌릴 수 있어야 한다.
class NoticeCard extends StatelessWidget {
  const NoticeCard({super.key, required this.item, this.onDecide, this.onOpen})
      : onGo = null,
        onDrop = null,
        saved = false;

  /// 이미 「응찰 준비」를 찍어 **저장된** 공고 (Figma 74:6893).
  /// 🔴 판정 버튼이 사라지고 「응찰하러 가기」 하나만 남는다 — 여기서 다시 고를 일이 없다.
  const NoticeCard.saved({
    super.key,
    required this.item,
    required this.onGo,
    this.onDrop,
    this.onOpen,
  })  : onDecide = null,
        saved = true;

  final ShortlistItem item;
  final void Function(BidDecision)? onDecide;
  final VoidCallback? onOpen;

  /// 저장된 공고 → Bid Kit
  final VoidCallback? onGo;

  /// 🔴 응찰 대상에서 뺀다. 지우는 게 아니라 dropped로 남는다
  final VoidCallback? onDrop;
  final bool saved;

  bool get _held => !saved && item.decision == BidDecision.skip;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppRadius.card,
        border: Border.all(color: _held ? AppColors.border : AppColors.primary),
      ),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // 🔴 칩 줄에는 숫자만 남긴다. 칩이 늘어나면 줄바꿈되게 Wrap이다 —
          //    Row였다면 좁은 카드에서 「전체보기」가 구석으로 밀려 붙었다.
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              // 🔴 D-day는 «영업일»이다. 달력 일수가 아니라는 게 이 제품의 요점 중 하나다
              item.daysLeft <= 10
                  ? AppChip.urgent('영업일 D-${item.daysLeft}')
                  : AppChip.info('영업일 D-${item.daysLeft}'),
              // 🔴 첨부를 안 읽었으면 충족을 «0건»이라 말하지 않는다 — 모른다고 말한다
              if (item.matched > 0)
                AppChip.success('충족 ${item.matched}')
              else
                const AppChip.neutral('충족 미확인'),
              // 🔴 못 읽은 항목을 숨기지 않는다. 제외 사유는 아니다
              if (item.unverified > 0) AppChip.warn('미확인 ${item.unverified}'),
            ],
          ),
          const SizedBox(height: 12),
          Text(item.title, style: AppText.cardHeadline, maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 6),
          // 🔴 「전체보기」를 제목 바로 아래 기관·마감 줄 끝에 둔다 —
          //    「이 공고를 더 보기」라는 뜻이 제목 가까이에서 분명해진다.
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text('${item.org}・마감 ${item.deadline}',
                    style: AppText.rowSub, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: onOpen,
                borderRadius: AppRadius.chip,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  child: Text('전체보기', style: AppText.chip),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          for (final r in item.reasons.take(3)) _reason(r),
          const SizedBox(height: 16),
          _actions(),
        ],
      ),
    );

    // 보류 상태는 흐리게 — 🔴 지우지 않는다
    return _held ? Opacity(opacity: 0.55, child: card) : card;
  }

  Widget _reason(MatchReason r) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SvgPicture.asset(AppIcons.checkOk, width: 36, height: 31),
            const SizedBox(width: 4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(r.text, style: AppText.reqTitle, maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Flexible(
                        child: Text(r.docId == null ? '제안요청서' : '첨부 ${r.docId}',
                            style: AppText.rowSub, maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      const SizedBox(width: 6),
                      // 🔴 근거 쪽. 모르면 「쪽 미상」 — 아는 척하지 않는다
                      Text(r.page > 0 ? 'p.${r.page}' : '쪽 미상',
                          style: AppText.rowSub.copyWith(color: AppColors.fontMuted)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _actions() {
    if (saved) {
      // 🔴 Figma 74:6893 — 카드 폭을 꽉 채우는 버튼 하나.
      //    「빼기」는 옆에 작게 둔다. 눌러서 사라지는 게 아니라 목록에서 빠질 뿐이다.
      return Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: onGo,
              borderRadius: AppRadius.card,
              child: Container(
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: const BoxDecoration(color: AppColors.primary, borderRadius: AppRadius.card),
                child: Text('응찰하러 가기',
                    style: AppText.actionButton.copyWith(color: Colors.white),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ),
            ),
          ),
          if (onDrop != null) ...[
            const SizedBox(width: 8),
            _outline('빼기', onDrop!),
          ],
        ],
      );
    }
    if (_held) {
      return Align(
        alignment: Alignment.centerRight,
        child: _outline('보류 취소', () => onDecide?.call(BidDecision.pending)),
      );
    }
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        _outline('보류', () => onDecide?.call(BidDecision.skip)),
        const SizedBox(width: 8),
        _filled(item.decision == BidDecision.go ? '응찰 준비 ✓' : '응찰 준비',
            () => onDecide?.call(BidDecision.go)),
      ],
    );
  }

  Widget _outline(String label, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: AppRadius.card,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(borderRadius: AppRadius.card, border: Border.all(color: AppColors.border)),
          child: Text(label, style: AppText.actionButton),
        ),
      );

  Widget _filled(String label, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: AppRadius.card,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: const BoxDecoration(color: AppColors.primary, borderRadius: AppRadius.card),
          child: Text(label, style: AppText.actionButton.copyWith(color: Colors.white)),
        ),
      );
}

/// 하단 「제외 N건」 — 접었다 펼친다 (Figma 56:3285 닫힘 / 56:3004 열림)
class ExcludedPanel extends StatelessWidget {
  const ExcludedPanel({
    super.key,
    required this.total,
    required this.samples,
    required this.expanded,
    required this.onToggle,
  });

  final int total;
  final List<ExcludedItem> samples;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            InkWell(
              onTap: onToggle,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    SvgPicture.asset(
                      expanded ? AppIcons.chevronUp : AppIcons.chevronDown,
                      width: expanded ? 30 : 10,
                      height: expanded ? 25 : 5,
                    ),
                    const SizedBox(width: 10),
                    // 🔴 「제외 124건」이 이 화면의 분모다. 접혀 있어도 숫자는 늘 보인다
                    Text('제외 $total건', style: AppText.sectionTitle),
                  ],
                ),
              ),
            ),
            if (expanded) ...[
              const SizedBox(height: 10),
              for (var i = 0; i < samples.length; i++) ...[
                _row(samples[i]),
                if (i != samples.length - 1)
                  const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: FigmaDivider.horizontal()),
              ],
              if (samples.length < total) ...[
                const SizedBox(height: 12),
                // 🔴 표본만 보여 준다는 사실을 숨기지 않는다
                Text('전체 $total건 중 ${samples.length}건을 표본으로 보여 드립니다.',
                    style: AppText.rowSub),
              ],
            ],
          ],
        ),
      );

  Widget _row(ExcludedItem e) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: LayoutBuilder(
          builder: (context, c) {
            final title = Text(e.title, style: AppText.excludedTitle, maxLines: 2, overflow: TextOverflow.ellipsis);
            final reason = Text(e.reason, style: AppText.excludedBody, maxLines: 2, overflow: TextOverflow.ellipsis);
            // 🔴 근거 쪽. 모르면 「쪽 미상」
            final page = Text(e.page > 0 ? 'p${e.page} 참고' : '쪽 미상', style: AppText.excludedBody);
            if (c.maxWidth < 720) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [title, const SizedBox(height: 4), reason, const SizedBox(height: 4), page],
              );
            }
            return Row(
              children: [
                SizedBox(width: 260, child: title),
                const SizedBox(width: 24),
                Expanded(child: reason),
                const SizedBox(width: 24),
                page,
              ],
            );
          },
        ),
      );
}
