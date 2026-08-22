import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../theme/tokens.dart';
import 'app_chip.dart';

class NavItem {
  const NavItem(this.icon, this.label, this.size);
  final String icon;
  final String label;

  /// 🔴 Figma의 아이콘 박스 크기를 그대로 옮긴다 — 하나로 통일하지 않는다
  final Size size;
}

/// 🔴 아이콘 크기가 항목마다 다르다 — Figma 값을 그대로 옮긴 것이니 통일하지 않는다
const kNavItems = <NavItem>[
  NavItem(AppIcons.navCompany, '회사 카드', Size(40, 40)),
  NavItem(AppIcons.navSearch, '공고 탐색', Size(40.001, 40.001)),
  NavItem(AppIcons.navBids, '응찰 건', Size(40, 44.5)),
  NavItem(AppIcons.navSettings, '설정・API 키', Size(42, 42)),
];

class Sidebar extends StatelessWidget {
  const Sidebar({super.key, this.selectedIndex = 0, this.onSelect});
  final int selectedIndex;
  final ValueChanged<int>? onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 400,
      color: AppColors.surface,
      // 🔴 짧은 창(높이 ≤ 559px)에서 Column이 세로로 넘쳐 하단 회사 카드가 화면 밖으로 나갔다.
      //    LayoutBuilder + IntrinsicHeight로 «남으면 Spacer, 모자라면 스크롤»을 만든다.
      child: LayoutBuilder(
        builder: (context, c) => SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: c.maxHeight),
            child: IntrinsicHeight(child: _body()),
          ),
        ),
      ),
    );
  }

  Widget _body() {
    return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── 로고 ────────────────────────────────────
          Padding(
            padding: const EdgeInsets.only(left: 60, top: 60),
            child: Row(
              children: [
                SvgPicture.asset(AppIcons.logo, width: 34, height: 34),
                const SizedBox(width: 10),
                // 🔴 textScaler 1.3 이상에서 브랜드 글자가 400px를 넘긴다
                Flexible(child: Text('Solar for Bid', style: AppText.brand, overflow: TextOverflow.ellipsis)),
              ],
            ),
          ),
          const SizedBox(height: 60),
          Padding(
            padding: const EdgeInsets.only(left: 60),
            child: Text('조달 파이프라인', style: AppText.sidebarLabel),
          ),
          const SizedBox(height: 15),

          // ── 내비게이션 ──────────────────────────────
          for (var i = 0; i < kNavItems.length; i++) _navRow(i, kNavItems[i]),

          const Spacer(),

          // ── 회사 카드 ───────────────────────────────
          const Padding(
            padding: EdgeInsets.only(left: 50, right: 50, bottom: 50),
            child: CompanyBadgeCard(),
          ),
        ],
      );
  }

  Widget _navRow(int index, NavItem item) {
    final selected = index == selectedIndex;
    // 선택 항목만 배경 칩이 붙는다 (Figma 47:969)
    return Padding(
      padding: EdgeInsets.only(left: selected ? 44 : 50, right: 44, bottom: 8),
      child: InkWell(
        onTap: () => onSelect?.call(index),
        borderRadius: AppRadius.card,
        child: Container(
          width: selected ? 312 : null,
          padding: EdgeInsets.only(left: selected ? 6 : 0),
          decoration: selected
              ? const BoxDecoration(color: AppColors.primarySoft, borderRadius: AppRadius.card)
              : null,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SvgPicture.asset(item.icon, width: item.size.width, height: item.size.height),
              const SizedBox(width: 10),
              Flexible(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Text(item.label,
                      style: selected ? AppText.navActive : AppText.navIdle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}


/// 사이드바 하단의 회사 배지. 🔴 rail·compact에서도 도달할 수 있어야 해서 따로 뺐다 —
///    특히 「캐시 데모」는 기획 규율상 숨기면 안 되는 정보다.
class CompanyBadgeCard extends StatelessWidget {
  const CompanyBadgeCard({super.key, this.padded = false});

  final bool padded;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.all(padded ? 20 : 0),
        child: AppCard(
          width: padded ? null : 300,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('(주) 다온피엠씨', style: AppText.sidebarCardTitle,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 6),
              Text('가상 회사・데모', style: AppText.sidebarCardSub,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 12),
              // 🔴 Wrap이다 — 폰트가 바뀌거나 글자 배율이 커지면 Row는 넘친다
              const Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  AppChip.info('캐시 데모'),
                  AppChip.info('Config #12'),
                ],
              ),
            ],
          ),
        ),
      );
}
