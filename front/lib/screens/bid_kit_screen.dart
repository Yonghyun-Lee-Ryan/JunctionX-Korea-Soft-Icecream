import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../api/docs_api.dart';
import '../api/factsheet.dart';
import '../api/http_docs_api.dart';
import '../api/models.dart';
import '../services/document_picker.dart' as picker;
import '../theme/tokens.dart';
import '../widgets/drop_region.dart';
import '../widgets/app_chip.dart';
import '../widgets/kit_panels.dart';
import '../widgets/kit_table.dart';
import '../widgets/dropzone_card.dart';

/// 화면④ 응찰 준비(Bid Kit) — Figma `정션2026`
///   74:6470 파일제출 · 74:7004 요구사항 체크리스트 · 77:8081 WBS · 74:7362 제출준비
///
/// 🔴 탭 구성·배치·버튼 문구는 **서버가 준다**(`meta.kitPages`). 프론트는 그대로 그린다.
///    한 탭을 어떤 «모양»으로 그릴지도 서버가 준 `kind`가 정한다 — 화면이 탭 id를 보고
///    «이건 원가 카드»라고 판단하지 않는다. 그래야 패널이 늘어도 이 파일이 안 바뀐다.
/// 🔴 아직 만들어지지 않은 탭은 「아직 없음」이라고 말한다 — 0건으로 그리지 않는다.
/// 🔴 봉투가 분석 중(collecting/parsing/judging)이면 `pollInterval` 마다 다시 묻는다 — 첨부 수집·공고 해부·판정은
///    수 분이 걸리고, 서버는 그동안 progress[] 로 어느 단계인지 말한다. done/failed 가 되면 멈춘다.
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
    this.pickDocuments,
  });

  /// 파일 선택 다이얼로그. 🔴 테스트가 가짜를 넣는다 — null 이면 실제 다이얼로그
  final Future<picker.PickOutcome> Function()? pickDocuments;

  /// 분석 중일 때 다시 묻는 간격
  static const pollInterval = Duration(seconds: 4);

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
  Factsheet? _data;
  Object? _error;
  Timer? _poll;
  int _page = 0;
  bool _uploading = false;
  bool _dragging = false;

  /// 올리는 동안 배너에 쓰는 문장 — 무엇을 올리고 서버가 무엇을 하는지. 🔴 40~80초 침묵이 「아무 반응 없음」으로 보였다(실측)
  String? _uploadingNote;

  /// 체크리스트의 체크 — 탭 id → 행 키. 🔴 서버 값으로 시작하고, 누르면 서버에 저장한다. 탭을 나가도 여기 남는다
  final _checks = <String, Set<String>>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  void _load() {
    _poll?.cancel();
    _poll = null;
    widget.api.factsheet(widget.caseId).then(_accept, onError: (Object e) {
      if (!mounted) return;
      // 🔴 폴링 중 한 번 실패한 건 다음 턴에 다시 묻는다 — 이미 보이는 화면을 오류로 바꾸지 않는다
      if (_data != null && _data!.isInProgress) {
        _schedule();
        return;
      }
      setState(() => _error = e);
    });
  }

  void _accept(Factsheet f) {
    if (!mounted) return;
    setState(() {
      _data = f;
      _error = null;
      // 서버가 기억하는 체크가 정본이다 — 봉투가 올 때마다 맞춘다
      for (final t in f.tabs) {
        if (t.isChecklist) _checks[t.id] = t.checked.toSet();
      }
    });
    if (f.isInProgress) _schedule();
  }

  void _schedule() {
    _poll?.cancel();
    _poll = Timer(BidKitScreen.pollInterval, _load);
  }

  void _reload() {
    setState(() => _error = null);
    _load();
  }

  /// 파일을 골라 이 케이스에 올린다. [requirement]는 어느 서류용인지(서류 줄·보완요청에서 누르면 그 이름, 드롭존이면 null).
  /// 🔴 서버가 제출 검사를 다시 돌려 돌려준 봉투가 그대로 화면이 된다 — 화면이 「올렸으니 준비됨」이라고 짐작하지 않는다.
  Future<void> _uploadFor(String? requirement) async {
    // 🔴 조용히 무시하지 않는다 — 올리는 중이면 그렇다고 말한다
    if (_uploading) {
      _toast('아직 올리는 중입니다 — 끝나면 다시 눌러 주세요.');
      return;
    }
    final outcome = await (widget.pickDocuments ?? picker.pickDocuments)();
    await _uploadOutcome(outcome, requirement);
  }

  /// 제안서 원고를 골라 올린다 — 서버가 스캔·검사를 다시 돌린다. 원고는 하나만 본다(여러 개면 첫 파일).
  Future<void> _uploadProposal() async {
    if (_uploading) {
      _toast('아직 올리는 중입니다 — 끝나면 다시 눌러 주세요.');
      return;
    }
    final outcome = await (widget.pickDocuments ?? picker.pickDocuments)();
    if (!mounted) return;
    if (outcome.rejected.isNotEmpty) {
      _toast(outcome.rejected.entries.map((e) => '${e.key}: ${e.value}').join('\n'));
    }
    if (outcome.docs.isEmpty) return;
    final doc = outcome.docs.first;
    setState(() {
      _uploading = true;
      _uploadingNote = '「${doc.filename}」 올리는 중 — 서버가 금지 표현을 검사하고 있습니다. 보통 1~2분 걸립니다. 화면을 새로고침하지 마세요.';
    });
    try {
      final f = await widget.api.uploadProposal(widget.caseId, doc);
      _accept(f);
      if (mounted) _toast(_proposalOutcome(f));
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    } catch (_) {
      if (mounted) _toast('원고를 올리지 못했습니다.');
    } finally {
      if (mounted) setState(() { _uploading = false; _uploadingNote = null; });
    }
  }

  Future<void> _uploadOutcome(picker.PickOutcome outcome, String? requirement) async {
    if (!mounted || _uploading) return;
    // 🔴 거른 파일은 이유와 함께 말한다 — 조용히 삼키지 않는다
    if (outcome.rejected.isNotEmpty) {
      _toast(outcome.rejected.entries.map((e) => '${e.key}: ${e.value}').join('\n'));
    }
    if (outcome.docs.isEmpty) return;
    setState(() => _uploading = true);
    try {
      Factsheet? last;
      for (final doc in outcome.docs) {
        setState(() => _uploadingNote = '「${doc.filename}」 올리는 중 — 서버가 제출 검사를 다시 돌리고 있습니다. 보통 1분 안팎 걸립니다. 화면을 새로고침하지 마세요.');
        last = await widget.api.uploadCaseFile(widget.caseId, doc, requirement: requirement);
        _accept(last);
      }
      // 🔴 끝났으면 결과를 말한다 — 서버가 돌려준 봉투에서 그 서류의 상태를 읽는다
      if (mounted && last != null) _toast(_fileOutcome(last, requirement, outcome.docs.length));
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    } catch (_) {
      if (mounted) _toast('파일을 올리지 못했습니다.');
    } finally {
      if (mounted) setState(() { _uploading = false; _uploadingNote = null; });
    }
  }

  /// 업로드 결과 한 문장 — 「X」 올렸습니다 — 검사 결과: 준비됨 (보완 필요면 서버의 이유까지)
  String _fileOutcome(Factsheet f, String? requirement, int count) {
    if (requirement == null) return '파일 $count건을 올렸습니다 — 제출 검사를 다시 했습니다.';
    final row = f.tabs.where((t) => t.kind == 'docs').expand((t) => t.items).where((i) => i.title == requirement).firstOrNull;
    final status = row?.chip?.text ?? row?.label;
    final rework = f.tabs.where((t) => t.kind == 'tasks').expand((t) => t.items).where((i) => i.title == requirement).firstOrNull;
    return [
      '「$requirement」 올렸습니다',
      if (status != null && status.isNotEmpty && status != '업로드') '검사 결과: $status',
      if (status == '보완 필요' && rework?.detail != null && rework!.detail!.isNotEmpty) rework.detail!,
    ].join(' — ');
  }

  String _proposalOutcome(Factsheet f) {
    final note = f.tabs.where((t) => t.kind == 'note').map((t) => t.note).whereType<KitNoteData>().firstOrNull;
    final n = note?.emphasis;
    return n == null || n.isEmpty ? '원고를 검사했습니다.' : '원고를 검사했습니다 — 금지 표현 $n';
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: AppColors.canvas,
        body: SafeArea(
          child: Builder(
            builder: (context) {
              final data = _data;
              if (data == null && _error == null) {
                return const Center(child: CircularProgressIndicator(color: AppColors.primary));
              }
              if (data == null) {
                final e = _error;
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
              return _body(data);
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
        // 🔴 올리는 동안 어느 탭에서든 보인다 — 무엇을 올리고 서버가 무엇을 하는지
        if (_uploading && _uploadingNote != null) _uploadBanner(_uploadingNote!),
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

  Widget _uploadBanner(String note) => Container(
        width: double.infinity,
        color: AppColors.primarySoft,
        padding: const EdgeInsets.fromLTRB(24, 10, 24, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(note, style: AppText.rowSub.copyWith(color: AppColors.primary)),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: AppRadius.bar,
              child: const LinearProgressIndicator(
                minHeight: 4,
                backgroundColor: Colors.white,
                valueColor: AlwaysStoppedAnimation(AppColors.primary),
              ),
            ),
          ],
        ),
      );

  Widget _header(Factsheet f, KitPage? page) {
    final title = f.title ?? widget.title ?? f.caseId;
    // 🔴 마감이 지났는지는 서버가 판단한다(deadlinePassed). 지났으면 D-값을 그리지 않는다 — 목록의 옛 값이 「D-0」으로 남던 실측
    final passed = f.deadlinePassed == true;
    final meta = [
      f.caseId,
      f.org ?? widget.org,
      if ((f.deadline ?? widget.deadline) != null) '마감 ${f.deadline ?? widget.deadline}',
      if (!passed && (f.daysLeft ?? widget.daysLeft) != null) '영업일 D-${f.daysLeft ?? widget.daysLeft}',
    ].whereType<String>().join('・');

    final actions = Wrap(
      spacing: 10,
      runSpacing: 10,
      alignment: WrapAlignment.end,
      children: [
        // 🔴 문구를 화면이 고르지 않는다 — 파일제출에서는 「나중에」다
        _ghost(
          (page == null ? null : f.secondaryAction[page.id]) ?? '임시저장',
          () => page != null && page.isUpload
              ? _advance(f)
              : _toast('임시저장은 아직 준비 중입니다.'),
        ),
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
              if (passed) ...[
                const SizedBox(height: 8),
                // 🔴 지난 공고는 응찰할 수 없다 — 준비 자료는 남기되 사실을 먼저 말한다
                const AppChip.danger('마감 지남'),
              ],
              // 🔴 분석 중이면 어느 단계인지 말한다 — 도는 원만 보여 주지 않는다
              if (f.isInProgress) ...[
                const SizedBox(height: 8),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text('분석 중 — ${f.runningStep ?? '잠시만 기다려 주세요'}',
                          style: AppText.kitMeta, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              ],
              // 🔴 실패는 서버가 준 문장 그대로. 다시 돌리는 길은 목록의 「응찰하러 가기」다
              if (f.isFailed) ...[
                const SizedBox(height: 8),
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    const AppChip.danger('분석 실패'),
                    Text(
                      '${f.errorMessage ?? '문서 분석이 끝나지 못했습니다.'} 다시 돌리려면 응찰 목록에서 「응찰하러 가기」를 다시 누르세요.',
                      style: AppText.kitMeta,
                    ),
                  ],
                ),
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
    // 🔴 탭이 «있다»가 아니라 «그릴 것이 있다»로 본다 — 열만 있고 행이 없는 빈 탭도 아직이다
    final ready = p.tabs.any((t) => f.tab(t.id)?.hasContent ?? false);
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
    // 🔴 «탭이 있다»가 아니라 «그릴 것이 있다»로 거른다. 탭 배지는 hasContent로 판정하는데
    //    본문만 존재 여부로 그리면, 배지는 「준비 중」인데 본문엔 빈 카드가 넉 장 깔린다.
    final present = [
      for (final pt in page.tabs)
        if (f.tab(pt.id)?.hasContent ?? false) (pt, f.tab(pt.id)!),
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

    // 🔴 전폭 탭(배너·큰 표)은 열 위에 얹는다
    final full = [for (final (pt, tab) in present) if (pt.isFull) tab];
    final columned = [for (final e in present) if (!e.$1.isFull) e];

    return LayoutBuilder(
      builder: (context, c) {
        const gap = 20.0;
        final children = <Widget>[
          for (final tab in full)
            Padding(padding: const EdgeInsets.only(bottom: gap), child: _panel(f, tab)),
        ];

        // 파일 제출은 좌 서류 목록 · 우 드롭존 (Figma 74:6470)
        if (page.isUpload) {
          children.add(_uploadBody(f, columned.map((e) => e.$2).toList(), c.maxWidth));
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
        }

        final wide = c.maxWidth >= 1240 && page.columnCount > 1;
        if (!wide) {
          children.addAll([
            for (final (_, tab) in columned)
              Padding(padding: const EdgeInsets.only(bottom: gap), child: _panel(f, tab)),
          ]);
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
        }

        final flex = page.columnFlex.isNotEmpty ? page.columnFlex : List.filled(page.columnCount, 1);
        children.add(Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var col = 0; col < page.columnCount; col++) ...[
              if (col > 0) const SizedBox(width: gap),
              Expanded(
                flex: col < flex.length ? flex[col] : 1,
                child: Column(
                  children: [
                    for (final (pt, tab) in columned)
                      if (pt.column == col)
                        Padding(padding: const EdgeInsets.only(bottom: gap), child: _panel(f, tab)),
                  ],
                ),
              ),
            ],
          ],
        ));
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
      },
    );
  }

  /// 파일제출 — 좌 「필요한 서류」 · 우 드롭존.
  ///
  /// 🔴 드롭존과 「업로드」는 **아직 아무것도 하지 않는다.** 제출 서류 적격 판단 에이전트가
  ///    붙기 전이라, 파일을 받아 놓고 검사한 척하면 그게 화면이 하는 거짓말이다.
  ///    누르면 무엇이 없어서 안 되는지 말한다.
  Widget _uploadBody(Factsheet f, List<KitTab> tabs, double maxWidth) {
    final docs = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final tab in tabs)
          Padding(
            padding: const EdgeInsets.only(bottom: 20),
            // 🔴 줄의 「업로드」는 그 서류용으로 올린다 — 서버가 어느 서류인지 알아야 연결한다
            child: KitDocsList(tab: tab, onUpload: (item) => _uploadFor(item.title)),
          ),
      ],
    );
    final zone = DropzoneCard(onPick: () => _uploadFor(null), isDragging: _dragging, busy: _uploading);

    final body = maxWidth < 1240
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [zone, const SizedBox(height: 20), docs],
          )
        : Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 1055, child: docs),
              const SizedBox(width: 20),
              Expanded(flex: 714, child: zone),
            ],
          );
    // 🔴 드롭은 카드가 아니라 페이지 전체에 건다 (DropRegion 주석 참조). 끌어다 놓은 파일은 서류를 지정하지 않고 올린다
    return DropRegion(
      enabled: !_uploading,
      onDragChanged: (v) => setState(() => _dragging = v),
      onFiles: (outcome) => _uploadOutcome(outcome, null),
      child: body,
    );
  }

  /// 🔴 탭 하나를 어떤 모양으로 그릴지는 `kind`가 정한다. 모르는 kind면 표로 떨어진다 —
  ///    에이전트가 새 kind를 보내도 화면이 죽지 않는다.
  Widget _panel(Factsheet f, KitTab tab) => switch (tab.kind) {
        'banner' when tab.banner != null => KitBanner(data: tab.banner!),
        'metric' when tab.metric != null => KitMetricCard(tab: tab),
        // 🔴 카드의 행동은 원고 업로드다 — 문구(올리기 / 다른 원고로 다시 검사)는 서버가 준다
        'note' when tab.note != null => KitNoteCard(tab: tab, busy: _uploading, onAction: (_) => _uploadProposal()),
        // 🔴 보완요청의 「보완 자료 올리기」도 그 서류용 업로드다
        'tasks' => KitTasksCard(tab: tab, busy: _uploading, onAction: (item) => _uploadFor(item.title)),
        'docs' => AppCard(child: KitDocsList(tab: tab, onUpload: (item) => _uploadFor(item.title))),
        _ => _card(f, tab),
      };

  /// 체크 하나를 서버에 저장한다 — 화면은 먼저 바꾸고, 실패하면 되돌리며 이유를 말한다
  Future<void> _setCheck(KitTab tab, String key, bool value) async {
    final set = _checks.putIfAbsent(tab.id, () => tab.checked.toSet());
    setState(() => value ? set.add(key) : set.remove(key));
    try {
      final saved = await widget.api.setCheck(widget.caseId, tab.id, key, checked: value);
      if (mounted) setState(() => _checks[tab.id] = saved.toSet());
    } catch (e) {
      if (!mounted) return;
      setState(() => value ? set.remove(key) : set.add(key));
      _toast(e is ApiException ? e.message : '체크를 저장하지 못했습니다. 다시 눌러 주세요.');
    }
  }

  Widget _card(Factsheet f, KitTab tab) {
    // 🔴 다운로드는 서버가 downloads[]에 실은 탭에만 붙는다 — 조견표는 웹 체크리스트라 파일이 없다
    final d = f.downloads.where((x) => x.id == tab.id).firstOrNull;
    return KitTableCard(
      tab: tab,
      checked: tab.isChecklist ? (_checks[tab.id] ?? tab.checked.toSet()) : null,
      onCheck: tab.isChecklist ? (k, v) => _setCheck(tab, k, v) : null,
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
