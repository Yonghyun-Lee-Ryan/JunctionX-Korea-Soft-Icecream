import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../theme/tokens.dart';
import 'sidebar.dart';

/// 🔴 Sidebar의 폭을 줄이는 방식은 쓸 수 없다.
///    sidebar.dart 안에 400px에 못 박힌 곳이 둘 있다 —
///    선택 알약(44+312+44) 과 하단 회사 카드(50+300+50). 눌러도 **예외 없이 조용히 어긋난다.**
///    그래서 좁은 창에서는 아예 다른 위젯을 그린다.
class SidebarRail extends StatelessWidget {
  const SidebarRail({super.key, this.selectedIndex = 0, this.onSelect, this.onExpand});

  final int selectedIndex;
  final ValueChanged<int>? onSelect;
  final VoidCallback? onExpand;

  static const width = 88.0;

  @override
  Widget build(BuildContext context) => Container(
        width: width,
        color: AppColors.surface,
        // 🔴 높이 365px 이하에서 세로로 넘쳤다
        child: LayoutBuilder(
          builder: (context, c) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: c.maxHeight),
              child: IntrinsicHeight(child: _body(context)),
            ),
          ),
        ),
      );

  Widget _body(BuildContext context) => Column(
          children: [
            const SizedBox(height: 28),
            SvgPicture.asset(AppIcons.logo, width: 34, height: 34),
            const SizedBox(height: 32),
            for (var i = 0; i < kNavItems.length; i++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 12),
                child: Tooltip(
                  message: kNavItems[i].label,
                  child: InkWell(
                    onTap: () => onSelect?.call(i),
                    borderRadius: AppRadius.card,
                    child: Container(
                      width: 64,
                      height: 56,
                      alignment: Alignment.center,
                      decoration: i == selectedIndex
                          ? const BoxDecoration(color: AppColors.primarySoft, borderRadius: AppRadius.card)
                          : null,
                      child: SvgPicture.asset(
                        kNavItems[i].icon,
                        width: kNavItems[i].size.width,
                        height: kNavItems[i].size.height,
                      ),
                    ),
                  ),
                ),
              ),
            const Spacer(),
            // 🔴 rail에서 하단 회사 카드가 «도달 불가능하게» 사라지던 것을 되살린다.
            //    특히 「캐시 데모」 표시는 기획 규율상 숨기면 안 되는 정보다.
            IconButton(
              onPressed: () => showDialog<void>(
                context: context,
                builder: (_) => const Dialog(
                  child: SizedBox(width: 340, child: CompanyBadgeCard(padded: true)),
                ),
              ),
              icon: const Icon(Icons.business_outlined, color: AppColors.fontGray2),
              tooltip: '(주) 다온피엠씨 · 가상 회사・데모',
            ),
            if (onExpand != null)
              IconButton(
                onPressed: onExpand,
                icon: const Icon(Icons.chevron_right, color: AppColors.fontGray2),
                tooltip: '메뉴 펼치기',
              ),
            const SizedBox(height: 16),
          ],
        );
}
