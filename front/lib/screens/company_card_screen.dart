import 'package:flutter/material.dart';

import '../api/card_view.dart';
import '../api/docs_api.dart';
import '../api/models.dart';
import '../theme/breakpoints.dart';
import '../theme/tokens.dart';
import '../widgets/app_chip.dart';
import '../widgets/card_stat_tile.dart';
import '../widgets/sidebar.dart';
import '../widgets/sidebar_rail.dart';

/// 화면② 회사 카드 — Figma `정션2026` node 52:1205
///
/// 🔴 이 화면은 **서버가 조립한 모양을 그대로 그린다.** stats[]와 sections[]를 순서대로
///    렌더할 뿐, 라벨로 분기하거나 문장을 짓지 않는다 (WBS 규율).
class CompanyCardScreen extends StatefulWidget {
  const CompanyCardScreen({
    super.key,
    required this.api,
    required this.companyId,
    this.onEdit,
    this.onRecommend,
    this.onNavigate,
  });

  final DocsApi api;
  final String companyId;

  /// 「카드 수정하기」 → 회사 등록 화면으로
  final VoidCallback? onEdit;

  /// 「이 카드로 공고 추천」 → 공고 탐색
  final VoidCallback? onRecommend;

  /// 사이드바 이동
  final ValueChanged<int>? onNavigate;

  @override
  State<CompanyCardScreen> createState() => _CompanyCardScreenState();
}

class _CompanyCardScreenState extends State<CompanyCardScreen> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  late Future<CompanyCardView> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.cardView(widget.companyId);
  }

  void _reload() => setState(() => _future = widget.api.cardView(widget.companyId));

  @override
  Widget build(BuildContext context) {
    final mode = Breakpoints.of(context);
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.canvas,
      drawer: mode.isCompact
          ? Drawer(
              width: (MediaQuery.sizeOf(context).width - 40).clamp(240.0, 400.0),
              child: const SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SizedBox(width: 400, child: Sidebar()),
              ),
            )
          : null,
      body: SafeArea(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (mode.showSidebar) ...[
              Sidebar(onSelect: widget.onNavigate),
              const SizedBox(width: 1, child: FigmaDivider.vertical()),
            ] else if (mode.showRail) ...[
              SidebarRail(onSelect: widget.onNavigate),
              const SizedBox(width: 1, child: FigmaDivider.vertical()),
            ],
            Expanded(child: _body(mode)),
          ],
        ),
      ),
    );
  }

  Widget _body(LayoutMode mode) => FutureBuilder<CompanyCardView>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator(color: AppColors.primary));
          }
          if (snap.hasError) {
            final e = snap.error;
            return _error(e is ApiException ? e.message : '회사 카드를 불러오지 못했습니다.');
          }
          final card = snap.data!;
          return SingleChildScrollView(
            padding: mode.contentPadding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _header(mode, card),
                const SizedBox(height: 30),
                _stats(mode, card),
                const SizedBox(height: 24),
                _sections(mode, card),
              ],
            ),
          );
        },
      );

  Widget _error(String message) => Center(
        child: Padding(
          padding: const EdgeInsets.all(40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 🔴 서버가 준 문장을 그대로 띄운다
              Text(message, style: AppText.pageSubtitle, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              OutlineButtonSmall(label: '다시 시도', onTap: _reload),
            ],
          ),
        ),
      );

  Widget _header(LayoutMode mode, CompanyCardView card) {
    final title = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (mode.isCompact)
          IconButton(
            onPressed: () => _scaffoldKey.currentState?.openDrawer(),
            icon: const Icon(Icons.menu, color: AppColors.fontGray1),
            tooltip: '메뉴',
          ),
        Flexible(
          child: RichText(
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            text: TextSpan(children: [
              TextSpan(text: '회사 카드 - ', style: AppText.pageTitle),
              // 회사 이름만 보라 (Figma 52:1247)
              TextSpan(text: card.name, style: AppText.pageTitle.copyWith(color: AppColors.primary)),
            ]),
          ),
        ),
      ],
    );

    final actions = Wrap(
      spacing: 10,
      runSpacing: 10,
      alignment: WrapAlignment.end,
      children: [
        _ghost('카드 수정하기', widget.onEdit),
        _primary('이 카드로 공고 추천', widget.onRecommend),
      ],
    );

    return LayoutBuilder(
      builder: (context, c) => c.maxWidth < 780
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [title, const SizedBox(height: 16), actions])
          : Row(children: [Expanded(child: title), const SizedBox(width: 20), actions]),
    );
  }

  /// 🔴 타일 수를 코드에 박지 않는다 — 서버가 준 만큼 그린다
  Widget _stats(LayoutMode mode, CompanyCardView card) => LayoutBuilder(
        builder: (context, c) {
          const gap = 20.0;
          final perRow = c.maxWidth >= 1240 ? 4 : (c.maxWidth >= 700 ? 2 : 1);
          final w = (c.maxWidth - gap * (perRow - 1)) / perRow;
          return Wrap(
            spacing: gap,
            runSpacing: gap,
            children: [
              for (final s in card.stats) SizedBox(width: w, child: CardStatTile(stat: s)),
            ],
          );
        },
      );

  Widget _sections(LayoutMode mode, CompanyCardView card) {
    return LayoutBuilder(
      builder: (context, c) {
        const gap = 20.0;
        final cols = c.maxWidth >= 1240 ? 3 : (c.maxWidth >= 820 ? 2 : 1);
        if (cols == 1) {
          return Column(
            children: [
              for (final s in card.sections)
                Padding(
                  padding: const EdgeInsets.only(bottom: gap),
                  child: CardSectionCard(section: s, onManual: _manual),
                ),
            ],
          );
        }
        // 🔴 열은 서버가 정한 section.column을 따른다. 열 수가 줄면 나머지를 접는다.
        final buckets = List.generate(cols, (_) => <Widget>[]);
        for (final s in card.sections) {
          buckets[s.column.clamp(0, cols - 1)].add(CardSectionCard(section: s, onManual: _manual));
        }
        final w = (c.maxWidth - gap * (cols - 1)) / cols;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < cols; i++) ...[
              if (i > 0) const SizedBox(width: gap),
              SizedBox(
                width: w,
                child: Column(
                  children: [
                    for (final card in buckets[i])
                      Padding(padding: const EdgeInsets.only(bottom: gap), child: card),
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }

  void _manual(CardRow row) {
    // 🔴 아직 저장 경로가 없다. 없는 기능을 있는 척하지 않는다
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text('「${row.label}」 직접 입력은 아직 준비 중입니다.',
          style: AppText.rowSub.copyWith(color: Colors.white)),
    ));
  }

  Widget _primary(String label, VoidCallback? onTap) => InkWell(
        onTap: onTap,
        borderRadius: AppRadius.card,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: const BoxDecoration(color: AppColors.primary, borderRadius: AppRadius.card),
          child: Text(label, style: AppText.button, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      );

  Widget _ghost(String label, VoidCallback? onTap) => InkWell(
        onTap: onTap,
        borderRadius: AppRadius.card,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: const BoxDecoration(color: AppColors.canvas, borderRadius: AppRadius.card),
          child: Text(label, style: AppText.buttonGhost, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      );
}
