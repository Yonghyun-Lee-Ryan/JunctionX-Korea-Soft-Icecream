import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../api/docs_api.dart';
import '../api/factsheet.dart';
import '../api/http_docs_api.dart';
import '../api/models.dart';
import '../theme/tokens.dart';
import '../widgets/app_chip.dart';
import '../widgets/kit_table.dart';

/// 화면④ 응찰 준비(Bid Kit) — Figma `정션2026`
///   57:4571 요구사항 체크리스트 · 58:4886 WBS · 60:5059 제출준비
///
/// 🔴 탭 구성·배치·버튼 문구는 **서버가 준다**(`meta.kitPages`). 프론트는 그대로 그린다.
/// 🔴 아직 만들어지지 않은 탭은 「아직 없음」이라고 말한다 — 0건으로 그리지 않는다.
class BidKitScreen extends StatefulWidget {
  const BidKitScreen({
    super.key,
    required this.api,
    required this.caseId,
    this.title,
    this.org,
    this.deadline,
    this.daysLeft,
    this.onBack,
  });

  final DocsApi api;
  final String caseId;

  /// 목록에서 넘어올 때 이미 아는 값 — 서버가 안 주면 이걸 쓴다
  final String? title;
  final String? org;
  final String? deadline;
  final int? daysLeft;
  final VoidCallback? onBack;

  @override
  State<BidKitScreen> createState() => _BidKitScreenState();
}

class _BidKitScreenState extends State<BidKitScreen> {
  late Future<Factsheet> _future;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _future = widget.api.factsheet(widget.caseId);
  }

  void _reload() => setState(() => _future = widget.api.factsheet(widget.caseId));

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: AppColors.canvas,
        body: SafeArea(
          child: FutureBuilder<Factsheet>(
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
                        // 🔴 서버가 준 문장을 그대로
                        Text(e is ApiException ? e.message : '응찰 준비 자료를 불러오지 못했습니다.',
                            style: AppText.pageSubtitle, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            OutlineButtonSmall(label: '다시 시도', onTap: _reload),
                            const SizedBox(width: 8),
                            OutlineButtonSmall(label: '뒤로', onTap: widget.onBack),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              }
              return _body(snap.data!);
            },
          ),
        ),
      );

  Widget _body(Factsheet f) {
    final pages = f.pages;
    final page = pages.isEmpty ? null : pages[_page.clamp(0, pages.length - 1)];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 0),
          child: _header(f, page),
        ),
        const SizedBox(height: 20),
        if (pages.isNotEmpty) _tabBar(f, pages),
        const SizedBox(width: double.infinity, child: FigmaDivider.horizontal()),
        Expanded(
          child: page == null
              ? const SizedBox.shrink()
              : SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
                  child: _pageBody(f, page),
                ),
        ),
      ],
    );
  }

  Widget _header(Factsheet f, KitPage? page) {
    final title = f.title ?? widget.title ?? f.caseId;
    final meta = [
      f.caseId,
      f.org ?? widget.org,
      if ((f.deadline ?? widget.deadline) != null) '마감 ${f.deadline ?? widget.deadline}',
      if ((f.daysLeft ?? widget.daysLeft) != null) '영업일 D-${f.daysLeft ?? widget.daysLeft}',
    ].whereType<String>().join('・');

    final actions = Wrap(
      spacing: 10,
      runSpacing: 10,
      alignment: WrapAlignment.end,
      children: [
        _ghost('임시저장', () => _toast('임시저장은 아직 준비 중입니다.')),
        if (page != null && f.primaryAction[page.id] != null)
          _primary(f.primaryAction[page.id]!, () => _advance(f)),
      ],
    );

    final left = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // 🔴 화살표 하나뿐이라 읽어 주는 이름이 없었다 — 어디로 가는지 말해 준다
        Tooltip(
          message: '응찰 목록으로',
          child: Semantics(
            button: true,
            label: '응찰 목록으로',
            child: InkWell(
              onTap: widget.onBack,
              borderRadius: AppRadius.card,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: SvgPicture.asset(AppIcons.back, width: 14.5, height: 29),
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(title, style: AppText.kitTitle, maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 6),
              Text(meta, style: AppText.kitMeta, maxLines: 2, overflow: TextOverflow.ellipsis),
              if (f.cached) ...[
                const SizedBox(height: 8),
                // 🔴 캐시라는 사실을 먼저 말한다
                const AppChip.warn('캐시 결과'),
              ],
            ],
          ),
        ),
      ],
    );

    return LayoutBuilder(
      builder: (context, c) => c.maxWidth < 820
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [left, const SizedBox(height: 16), actions])
          : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: left),
              const SizedBox(width: 20),
              actions,
            ]),
    );
  }

  Widget _tabBar(Factsheet f, List<KitPage> pages) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Row(
          children: [
            for (var i = 0; i < pages.length; i++) _tab(f, pages[i], i),
          ],
        ),
      );

  Widget _tab(Factsheet f, KitPage p, int index) {
    final active = index == _page;
    // 🔴 이 페이지가 그릴 탭이 하나도 없으면 «아직» 표시를 단다
    final ready = p.tabs.any((t) => f.tab(t.id) != null);
    return InkWell(
      onTap: () => setState(() => _page = index),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(p.label, style: active ? AppText.tabLabelActive : AppText.tabLabel),
                  if (!ready) ...[
                    const SizedBox(width: 6),
                    const AppChip.neutral('준비 중'),
                  ],
                ],
              ),
            ),
            Container(
              height: 3,
              width: 60,
              color: active ? AppColors.primary : Colors.transparent,
            ),
          ],
        ),
      ),
    );
  }

  Widget _pageBody(Factsheet f, KitPage page) {
    final present = [
      for (final pt in page.tabs)
        if (f.tab(pt.id) != null) (pt, f.tab(pt.id)!),
    ];

    if (present.isEmpty) {
      // 🔴 아직 다른 팀이 만들고 있는 자리 — 있는 척하지 않는다
      return AppCard(
        padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppChip.neutral('준비 중'),
              const SizedBox(height: 12),
              Text('「${page.label}」는 아직 만들어지지 않았습니다.',
                  style: AppText.sectionTitle, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text('문서 분석이 끝나면 이 자리에 채워집니다.',
                  style: AppText.rowSub, textAlign: TextAlign.center),
            ],
          ),
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, c) {
        const gap = 20.0;
        final wide = c.maxWidth >= 1240 && page.columnCount > 1;
        if (!wide) {
          return Column(
            children: [
              for (final (_, tab) in present)
                Padding(padding: const EdgeInsets.only(bottom: gap), child: _card(f, tab)),
            ],
          );
        }
        final flex = page.columnFlex.isNotEmpty
            ? page.columnFlex
            : List.filled(page.columnCount, 1);
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var col = 0; col < page.columnCount; col++) ...[
              if (col > 0) const SizedBox(width: gap),
              Expanded(
                flex: col < flex.length ? flex[col] : 1,
                child: Column(
                  children: [
                    for (final (pt, tab) in present)
                      if (pt.column == col)
                        Padding(padding: const EdgeInsets.only(bottom: gap), child: _card(f, tab)),
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _card(Factsheet f, KitTab tab) {
    // 🔴 다운로드는 서버가 downloads[]에 실은 탭에만 붙는다 — 조견표는 웹 체크리스트라 파일이 없다
    final d = f.downloads.where((x) => x.id == tab.id).firstOrNull;
    return KitTableCard(
      tab: tab,
      downloadUrl: d == null
          ? null
          : (widget.api is HttpDocsApi
              ? (widget.api as HttpDocsApi).downloadUrl(f.caseId, tab.id)
              : d.url),
      onDownload: (url) => _toast('내려받기 주소: $url'),
    );
  }

  void _advance(Factsheet f) {
    if (_page + 1 < f.pages.length) {
      setState(() => _page += 1);
    } else {
      // 🔴 S8 투찰은 자동화하지 않는다 — 공동인증서·보안토큰의 영역이다
      _toast('전자입찰 투찰은 공동인증서와 보안토큰이 필요해 사람이 직접 해야 합니다.');
    }
  }

  void _toast(String message) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message, style: AppText.rowSub.copyWith(color: Colors.white))),
      );

  Widget _primary(String label, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: AppRadius.card,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: const BoxDecoration(color: AppColors.primary, borderRadius: AppRadius.card),
          child: Text(label, style: AppText.button, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      );

  Widget _ghost(String label, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: AppRadius.card,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: const BoxDecoration(color: AppColors.canvas, borderRadius: AppRadius.card),
          child: Text(label, style: AppText.buttonGhost, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      );
}
