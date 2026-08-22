import 'package:flutter/material.dart';
import '../services/document_picker.dart';
import '../models/company_document.dart';
import '../state/company_registration_controller.dart';
import '../theme/breakpoints.dart';
import '../theme/tokens.dart';
import '../widgets/app_chip.dart';
import '../widgets/company_card_preview.dart';
import '../widgets/document_row.dart';
import '../widgets/drop_region.dart';
import '../widgets/dropzone_card.dart';
import '../widgets/sidebar.dart';
import '../widgets/sidebar_rail.dart';
import '../widgets/upload_failure_banner.dart';

/// 화면① 회사 등록 — Figma `정션2026` node 47:896
///
/// 🔴 반응형 규칙은 `theme/breakpoints.dart`에 있다. 브레이크포인트 숫자는
///    기기 일반론이 아니라 이 화면의 내용 폭에서 역산한 값이다.
class CompanyRegistrationScreen extends StatefulWidget {
  const CompanyRegistrationScreen({
    super.key,
    required this.controller,
    required this.pickDocuments,
    this.onLater,
    this.onCreateCard,
  });

  final CompanyRegistrationController controller;

  /// 파일 선택 다이얼로그. 🔴 플랫폼 의존을 화면 밖으로 밀어낸다 — 테스트가 가짜를 넣는다
  final Future<PickOutcome> Function() pickDocuments;

  /// 헤더 버튼. 🔴 지금은 화면 ②가 없어 비어 있다 — 없는 걸 있는 척하지 않는다
  final VoidCallback? onLater;
  final VoidCallback? onCreateCard;

  @override
  State<CompanyRegistrationScreen> createState() => _CompanyRegistrationScreenState();
}

class _CompanyRegistrationScreenState extends State<CompanyRegistrationScreen> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  bool _dragging = false;
  bool _drawerOpen = false;

  /// 🔴 아직 조달청 OpenAPI에 붙지 않았다. 결과를 사실처럼 보여 주면
  ///    「출처 없는 값을 만들지 않는다」 규율을 화면이 어기는 것이 된다.
  ///    붙기 전까지는 배지를 「미연동」으로 두고 값을 비운다.
  static const _crossChecks = <CrossCheckItem>[
    CrossCheckItem(label: '조달업체 등록', badge: '미연동'),
    CrossCheckItem(label: '부정당제재 조회', badge: '미연동'),
  ];

  Future<void> _createCard() async {
    final ok = await widget.controller.createCard();
    if (!mounted) return;
    final c = widget.controller;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        backgroundColor: AppColors.primary,
        content: Text('회사 카드를 저장했습니다. (${c.saved?.companyId ?? ''})',
            style: AppText.rowSub.copyWith(color: Colors.white)),
      ));
      widget.onCreateCard?.call();
    }
    // 🔴 실패는 배너가 이미 서버 문장을 들고 있다 — 여기서 문장을 짓지 않는다
  }

  Future<void> _pick() async {
    await _accept(await widget.pickDocuments());
  }

  /// 🔴 거른 파일을 조용히 버리지 않는다 — 왜 안 올라갔는지 배너로 알린다
  Future<void> _accept(PickOutcome outcome) async {
    for (final e in outcome.rejected.entries) {
      widget.controller.reportRejected(e.key, e.value);
    }
    if (outcome.docs.isEmpty) return;
    await widget.controller.uploadAll(outcome.docs);
  }

  @override
  Widget build(BuildContext context) {
    final mode = Breakpoints.of(context);

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.canvas,
      // 🔴 Sidebar는 400px에 못 박혀 있다. 줄이지 않고 Drawer에 그대로 넣는다
      // 🔴 화면이 400px보다 좁으면 Drawer(400)가 «조용히» 찌그러진다 — 화면 폭에 맞춘다
      // 🔴 Sidebar는 400px 고정이라 Drawer를 그냥 좁히면 «조용히» 찌그러진다.
      //    Drawer는 화면에 맞추고, 안의 400px는 가로 스크롤로 흘린다 — 넘치지도 눌리지도 않는다.
      drawer: mode.isCompact
          ? Drawer(
              width: (MediaQuery.sizeOf(context).width - 40).clamp(240.0, 400.0),
              child: const SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SizedBox(width: 400, child: Sidebar()),
              ),
            )
          : null,
      onDrawerChanged: (open) => setState(() => _drawerOpen = open),
      body: SafeArea(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (mode.showSidebar) ...[
              const Sidebar(),
              // 🔴 RotatedBox 기반이라 높이가 확정된 곳에서만 그린다 (접히는 모드에서는 렌더 안 함)
              const SizedBox(width: 1, child: FigmaDivider.vertical()),
            ] else if (mode.showRail) ...[
              const SidebarRail(),
              const SizedBox(width: 1, child: FigmaDivider.vertical()),
            ],
            Expanded(
              // 🔴 드롭 영역은 카드가 아니라 본문 전체다 — 카드 밖에 놓아도 «먹통»이 아니게
              child: DropRegion(
                // 🔴 DropTarget은 가려져도 드롭을 계속 받는다. Drawer가 열리면 내린다.
                enabled: !_drawerOpen,
                onFiles: _accept,
                onDragChanged: (v) => setState(() => _dragging = v),
                child: _content(mode),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _content(LayoutMode mode) => ListenableBuilder(
        listenable: widget.controller,
        builder: (context, _) {
          final c = widget.controller;
          return SingleChildScrollView(
            padding: mode.contentPadding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _header(mode, c),
                const SizedBox(height: 20),
                if (c.failures.isNotEmpty) ...[
                  UploadFailureBanner(failures: c.failures, onDismiss: c.dismissFailure),
                  const SizedBox(height: 20),
                ],
                if (mode.twoColumn)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 🔴 Flexible이 아니라 Expanded — Figma의 773:622는 「정확히 이 비율로 채운다」는 뜻이다
                      Expanded(flex: 773, child: _leftColumn(c)),
                      const SizedBox(width: 15),
                      Expanded(flex: 622, child: _rightColumn(c)),
                    ],
                  )
                else ...[
                  _leftColumn(c),
                  const SizedBox(height: 24),
                  _rightColumn(c),
                ],
              ],
            ),
          );
        },
      );

  Widget _header(LayoutMode mode, CompanyRegistrationController c) {
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
            Flexible(child: Text('회사 등록', style: AppText.pageTitle, overflow: TextOverflow.ellipsis)),
          ],
        ),
        const SizedBox(height: 14),
        Text('한 번만 올립니다. 회사 카드는 캐시되고, 공고가 바뀌어도 다시 올리지 않습니다.',
            style: AppText.pageSubtitle),
        if (c.saved != null) ...[
          const SizedBox(height: 8),
          Row(mainAxisSize: MainAxisSize.min, children: [
            const AppChip.success('저장됨'),
            const SizedBox(width: 8),
            Flexible(child: Text(c.saved!.companyId,
                style: AppText.rowSub, overflow: TextOverflow.ellipsis)),
          ]),
        ] else if (c.locallyMissing.isNotEmpty) ...[
          const SizedBox(height: 8),
          // 🔴 무엇이 남았는지 미리 보여 준다. 단 버튼을 막지는 않는다 — 판정은 서버가 한다
          Text('남은 항목: ${c.locallyMissing.join(" · ")}',
              style: AppText.rowSub.copyWith(color: AppColors.warnFg)),
        ],
      ],
    );

    // 🔴 Row로 두면 폭 ≤360px과 textScaler 1.3 이상에서 넘친다.
    //    Wrap은 주축 unbounded 문제가 없다 — 자식이 둘 다 고정 크기 버튼이라서다.
    final actions = Wrap(
      spacing: 10,
      runSpacing: 10,
      alignment: WrapAlignment.end,
      children: [
        _ghostButton('나중에', onTap: widget.onLater),
        _primaryButton(
          widget.controller.isSaving ? '저장 중 ...' : '회사 카드 만들기',
          // 🔴 업로드 중이거나 저장 중이면 막는다. 그러나 «부족해서» 막지는 않는다 —
          //    무엇이 부족한지는 눌러서 서버 문장으로 알려 주는 편이 낫다.
          onTap: (widget.controller.isBusy || widget.controller.isSaving) ? null : _createCard,
        ),
      ],
    );

    // 🔴 헤더의 실제 폭은 창 폭이 아니라 「창 − 사이드바 − 패딩」이다.
    //    여기가 MediaQuery가 아니라 LayoutBuilder를 써야 하는 유일한 자리다.
    return LayoutBuilder(
      builder: (context, constraints) {
        // Wrap을 쓰면 부제가 unbounded 제약을 받아 줄바꿈이 아예 안 된다 → Row/Column 분기
        if (constraints.maxWidth < 720) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [title, const SizedBox(height: 16), actions],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: title),
            const SizedBox(width: 20),
            actions,
          ],
        );
      },
    );
  }

  Widget _leftColumn(CompanyRegistrationController c) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DropzoneCard(onPick: _pick, isDragging: _dragging, busy: c.isBusy),
          const SizedBox(height: 30),
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Text('필요한 서류', style: AppText.sectionTitle),
          ),
          for (final d in c.documents) ...[
            DocumentRow(doc: d, onUpload: _pick),
            const SizedBox(height: 12),
          ],
        ],
      );

  Widget _rightColumn(CompanyRegistrationController c) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CompanyCardPreview(fields: c.cardFields),
          const SizedBox(height: 20),
          const CrossCheckCard(items: _crossChecks),
        ],
      );

  // 🔴 예전엔 Container라 «눌리지 않는 버튼»이었다. 테스트는 글자만 찾아서 통과했다.
  Widget _primaryButton(String label, {VoidCallback? onTap}) => InkWell(
        onTap: onTap,
        borderRadius: AppRadius.card,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: const BoxDecoration(color: AppColors.primary, borderRadius: AppRadius.card),
          child: Text(label, style: AppText.button, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      );

  Widget _ghostButton(String label, {VoidCallback? onTap}) => InkWell(
        onTap: onTap,
        borderRadius: AppRadius.card,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: const BoxDecoration(color: AppColors.canvas, borderRadius: AppRadius.card),
          child: Text(label, style: AppText.buttonGhost, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      );
}
