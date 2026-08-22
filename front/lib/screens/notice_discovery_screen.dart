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

/// 화면③ 공고 탐색 — Figma `정션2026` node 56:3012(접힘) · 52:1935(펼침)
///
/// 🔴 나라장터 OpenAPI 키가 아직 없다. 백엔드가 캐시 목록(`screening.demo.json`)을
///    주고 `meta.cached`로 그 사실을 알린다 — 화면은 그것을 **숨기지 않고** 배지로 띄운다.
class NoticeDiscoveryScreen extends StatefulWidget {
  const NoticeDiscoveryScreen({
    super.key,
    required this.api,
    required this.companyId,
    this.onNavigate,
    this.onPrepareBid,
  });

  final DocsApi api;
  final String companyId;

  /// 사이드바 이동
  final ValueChanged<int>? onNavigate;

  /// 🚪 「응찰 준비」 → Bid Kit. 케이스는 이 화면이 만들고 caseId를 넘긴다
  final void Function(ShortlistItem item)? onPrepareBid;

  @override
  State<NoticeDiscoveryScreen> createState() => _NoticeDiscoveryScreenState();
}

class _NoticeDiscoveryScreenState extends State<NoticeDiscoveryScreen> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  late Future<ScreeningResult> _future;
  ScreeningResult? _data;
  bool _excludedOpen = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    // 🔴 실호출을 시도한다. 키가 없거나 실패하면 서버가 캐시로 떨어뜨리고 meta로 알려 준다
    _future = widget.api.screening(widget.companyId, live: true).then((r) {
      _data = r;
      return r;
    });
  }

  void _reload() => setState(_load);

  /// 🚪 사람 게이트. 🔴 화면에서 먼저 반영하고 서버에 보낸다 — 실패하면 되돌린다
  Future<void> _decide(ShortlistItem item, BidDecision d) async {
    final data = _data;
    if (data == null) return;
    final before = item.decision;

    setState(() {
      _data = ScreeningResult(
        companyId: data.companyId,
        status: data.status,
        summary: data.summary,
        shortlist: [
          for (final s in data.shortlist) s.caseId == item.caseId ? s.copyWith(decision: d) : s,
        ],
        excludedSamples: data.excludedSamples,
        cached: data.cached,
        listSource: data.listSource,
      );
    });

    try {
      await widget.api.setDecision(widget.companyId, item.caseId, d.name);
      // 🔴 go를 찍은 건만 다음 단계가 돈다 (기획안의 사람 게이트)
      if (d == BidDecision.go && mounted) widget.onPrepareBid?.call(item);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        final cur = _data!;
        _data = ScreeningResult(
          companyId: cur.companyId,
          status: cur.status,
          summary: cur.summary,
          shortlist: [
            for (final s in cur.shortlist) s.caseId == item.caseId ? s.copyWith(decision: before) : s,
          ],
          excludedSamples: cur.excludedSamples,
          cached: cur.cached,
          listSource: cur.listSource,
        );
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        // 🔴 서버가 준 문장을 그대로
        content: Text(e is ApiException ? e.message : '저장하지 못했습니다.',
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
                child: SizedBox(width: 400, child: Sidebar(selectedIndex: 1, onSelect: widget.onNavigate)),
              ),
            )
          : null,
      body: SafeArea(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (mode.showSidebar) ...[
              Sidebar(selectedIndex: 1, onSelect: widget.onNavigate),
              const SizedBox(width: 1, child: FigmaDivider.vertical()),
            ] else if (mode.showRail) ...[
              SidebarRail(selectedIndex: 1, onSelect: widget.onNavigate),
              const SizedBox(width: 1, child: FigmaDivider.vertical()),
            ],
            Expanded(child: _content(mode)),
          ],
        ),
      ),
    );
  }

  Widget _content(LayoutMode mode) => FutureBuilder<ScreeningResult>(
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
                    Text(e is ApiException ? e.message : '공고 목록을 불러오지 못했습니다.',
                        style: AppText.pageSubtitle, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    OutlineButtonSmall(label: '다시 시도', onTap: _reload),
                  ],
                ),
              ),
            );
          }
          final r = _data ?? snap.data!;
          return SingleChildScrollView(
            padding: mode.contentPadding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _header(mode, r),
                const SizedBox(height: 30),
                _cards(r),
                const SizedBox(height: 24),
                ExcludedPanel(
                  total: r.summary.excluded,
                  samples: r.excludedSamples,
                  expanded: _excludedOpen,
                  onToggle: () => setState(() => _excludedOpen = !_excludedOpen),
                ),
              ],
            ),
          );
        },
      );

  Widget _header(LayoutMode mode, ScreeningResult r) {
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
            Flexible(child: Text('나에게 맞는 공고', style: AppText.pageSubtitle, overflow: TextOverflow.ellipsis)),
          ],
        ),
        const SizedBox(height: 4),
        // 🔴 분모를 크게 보여 준다 — 「127건을 훑어 3건」이 이 제품의 문장이다
        RichText(
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          text: TextSpan(children: [
            TextSpan(text: '${r.summary.scanned}건 중 ', style: AppText.pageTitle),
            TextSpan(text: '${r.summary.shortlisted}건',
                style: AppText.pageTitle.copyWith(fontWeight: FontWeight.w800)),
          ]),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            const AppChip.info('필터'),
            if (r.summary.window != null) AppChip.info(r.summary.window!),
            // 🔴 실호출인지 캐시인지 먼저 말한다 — 들키는 것보다 싸다
            if (r.isLive)
              const AppChip.success('나라장터 실시간')
            else
              const AppChip.warn('캐시 목록 · 나라장터 미연결'),
            // 🔴 첨부를 아직 안 읽었으면 「충족」이 미확인이라는 뜻이다. 숨기지 않는다
            if (r.summary.parsed == 0 && r.isLive) const AppChip.warn('자격 미확인 · 첨부 미분석'),
          ],
        ),
        if (r.note != null) ...[
          const SizedBox(height: 8),
          // 🔴 서버가 만든 문장을 그대로
          Text(r.note!, style: AppText.rowSub),
        ],
      ],
    );

    final refresh = InkWell(
      onTap: _reload,
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
            Text('다시 추천', style: AppText.buttonGhost, maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );

    return LayoutBuilder(
      builder: (context, c) => c.maxWidth < 620
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [title, const SizedBox(height: 16), refresh])
          : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: title),
              const SizedBox(width: 20),
              refresh,
            ]),
    );
  }

  Widget _cards(ScreeningResult r) => LayoutBuilder(
        builder: (context, c) {
          const gap = 20.0;
          final cols = c.maxWidth >= 1240 ? 3 : (c.maxWidth >= 820 ? 2 : 1);
          final w = (c.maxWidth - gap * (cols - 1)) / cols;
          return Wrap(
            spacing: gap,
            runSpacing: gap,
            children: [
              for (final item in r.shortlist)
                SizedBox(
                  width: w,
                  child: NoticeCard(
                    item: item,
                    onDecide: (d) => _decide(item, d),
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
