import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../api/docs_api.dart';
import '../api/models.dart';
import '../api/screening.dart';
import '../theme/breakpoints.dart';
import '../theme/tokens.dart';
import '../widgets/app_chip.dart';
import '../widgets/notice_card.dart';
import '../widgets/sidebar.dart';
import '../widgets/sidebar_rail.dart';

/// 화면④ 응찰 준비중인 공고 — Figma `정션2026` node 74:6893
///
/// 🔴 이 목록은 스크리닝 결과가 **아니다**. 사람이 「응찰 준비」를 찍은 순간
///    서버가 따로 저장한 것이다. 실호출 스크리닝은 조회 창(최근 14일·300건)이 좁아
///    다음 실행에서 그 공고가 목록에서 빠질 수 있는데, 하겠다고 정한 건은 남아야 한다.
class BidListScreen extends StatefulWidget {
  const BidListScreen({
    super.key,
    required this.api,
    required this.companyId,
    this.onNavigate,
    this.onOpenBid,
  });

  final DocsApi api;
  final String companyId;
  final ValueChanged<int>? onNavigate;

  /// 🚪 「응찰하러 가기」 → 케이스를 만들고 Bid Kit으로
  final void Function(ShortlistItem item)? onOpenBid;

  @override
  State<BidListScreen> createState() => BidListScreenState();
}

class BidListScreenState extends State<BidListScreen> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  late Future<List<ShortlistItem>> _future;
  List<ShortlistItem>? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = widget.api.bids(widget.companyId).then((r) {
      _data = r;
      return r;
    });
  }

  /// 저장 직후 바깥에서 다시 읽게 한다
  void reload() => setState(_load);

  /// 🔴 목록에서 뺀다. 화면에서 먼저 지우고 실패하면 되돌린다
  Future<void> _drop(ShortlistItem item) async {
    final before = _data;
    if (before == null) return;
    setState(() => _data = [for (final b in before) if (b.caseId != item.caseId) b]);
    try {
      await widget.api.dropBid(widget.companyId, item.caseId);
    } catch (e) {
      if (!mounted) return;
      setState(() => _data = before);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        // 🔴 서버가 준 문장 그대로
        content: Text(e is ApiException ? e.message : '목록에서 빼지 못했습니다.',
            style: AppText.rowSub.copyWith(color: Colors.white)),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final mode = Breakpoints.of(context);
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.canvas,
      drawer: mode.isCompact
          ? Drawer(
              width: (MediaQuery.sizeOf(context).width - 40).clamp(240.0, 400.0),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SizedBox(width: 400, child: Sidebar(selectedIndex: 2, onSelect: widget.onNavigate)),
              ),
            )
          : null,
      body: SafeArea(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (mode.showSidebar) ...[
              Sidebar(selectedIndex: 2, onSelect: widget.onNavigate),
              const SizedBox(width: 1, child: FigmaDivider.vertical()),
            ] else if (mode.showRail) ...[
              SidebarRail(selectedIndex: 2, onSelect: widget.onNavigate),
              const SizedBox(width: 1, child: FigmaDivider.vertical()),
            ],
            Expanded(child: _content(mode)),
          ],
        ),
      ),
    );
  }

  Widget _content(LayoutMode mode) => FutureBuilder<List<ShortlistItem>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator(color: AppColors.primary));
          }
          if (snap.hasError) {
            final e = snap.error;
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(e is ApiException ? e.message : '응찰 목록을 불러오지 못했습니다.',
                        style: AppText.pageSubtitle, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    OutlineButtonSmall(label: '다시 시도', onTap: reload),
                  ],
                ),
              ),
            );
          }
          final bids = _data ?? snap.data!;
          return SingleChildScrollView(
            padding: mode.contentPadding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _header(mode, bids),
                const SizedBox(height: 30),
                if (bids.isEmpty) _empty() else _cards(bids),
              ],
            ),
          );
        },
      );

  Widget _header(LayoutMode mode, List<ShortlistItem> bids) {
    // 🔴 마감이 가장 급한 건을 헤더에서 먼저 말한다 — 이 화면은 「무엇을 먼저 하나」다
    final soonest = bids.isEmpty
        ? null
        : bids.map((b) => b.daysLeft).reduce((a, b) => a < b ? a : b);

    final title = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (mode.isCompact)
              IconButton(
                onPressed: () => _scaffoldKey.currentState?.openDrawer(),
                icon: const Icon(Icons.menu, color: AppColors.fontGray1),
                tooltip: '메뉴',
              ),
            Flexible(
              child: Text('응찰 준비중인 공고',
                  style: AppText.pageSubtitle, overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
        const SizedBox(height: 4),
        RichText(
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          text: TextSpan(children: [
            TextSpan(text: '${bids.length}건',
                style: AppText.pageTitle.copyWith(fontWeight: FontWeight.w800)),
            TextSpan(text: ' 준비 중', style: AppText.pageTitle),
          ]),
        ),
        if (soonest != null) ...[
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              // 🔴 영업일이다. 달력 일수가 아니라는 게 이 제품의 요점이다
              soonest <= 10
                  ? AppChip.urgent('가장 급한 건 영업일 D-$soonest')
                  : AppChip.info('가장 급한 건 영업일 D-$soonest'),
            ],
          ),
        ],
      ],
    );

    final back = InkWell(
      onTap: () => widget.onNavigate?.call(1),
      borderRadius: AppRadius.card,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: AppRadius.card,
          border: Border.all(color: AppColors.line1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SvgPicture.asset(AppIcons.refresh, width: 20.001, height: 20.001),
            const SizedBox(width: 10),
            Text('공고 더 보기', style: AppText.buttonGhost, maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );

    return LayoutBuilder(
      builder: (context, c) => c.maxWidth < 620
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [title, const SizedBox(height: 16), back])
          : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: title),
              const SizedBox(width: 20),
              back,
            ]),
    );
  }

  Widget _empty() => AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('아직 응찰하겠다고 정한 공고가 없습니다.', style: AppText.sectionTitle),
            const SizedBox(height: 8),
            Text('「나에게 맞는 공고」에서 「응찰 준비」를 누르면 여기에 남습니다.',
                style: AppText.rowSub),
            const SizedBox(height: 20),
            OutlineButtonSmall(label: '공고 보러 가기', onTap: () => widget.onNavigate?.call(1)),
          ],
        ),
      );

  Widget _cards(List<ShortlistItem> bids) => LayoutBuilder(
        builder: (context, c) {
          const gap = 20.0;
          final cols = c.maxWidth >= 1240 ? 3 : (c.maxWidth >= 820 ? 2 : 1);
          final w = (c.maxWidth - gap * (cols - 1)) / cols;
          return Wrap(
            spacing: gap,
            runSpacing: gap,
            children: [
              for (final item in bids)
                SizedBox(
                  width: w,
                  child: NoticeCard.saved(
                    item: item,
                    onGo: () => widget.onOpenBid?.call(item),
                    onDrop: () => _drop(item),
                    onOpen: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text('공고 상세는 아직 준비 중입니다.',
                          style: AppText.rowSub.copyWith(color: Colors.white)),
                    )),
                  ),
                ),
            ],
          );
        },
      );
}
