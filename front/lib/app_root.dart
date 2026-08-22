import 'package:flutter/material.dart';

import 'api/card_view.dart';
import 'api/docs_api.dart';
import 'api/models.dart';
import 'api/screening.dart';
import 'screens/company_card_screen.dart';
import 'screens/bid_kit_screen.dart';
import 'screens/bid_list_screen.dart';
import 'screens/notice_discovery_screen.dart';
import 'screens/company_registration_screen.dart';
import 'services/document_picker.dart';
import 'state/company_registration_controller.dart';
import 'theme/tokens.dart';
import 'widgets/app_chip.dart';
import 'widgets/sidebar.dart';

/// 첫 진입 분기.
///
/// 🔴 «회사가 있나»를 프론트가 판단하지 않는다 — `GET /api/companies/current`가 알려 준다.
///    있으면 회사 카드, 없으면 회사 등록.
class AppRoot extends StatefulWidget {
  const AppRoot({
    super.key,
    required this.api,
    required this.controller,
    this.pickDocuments,
    this.startCompanyId,
  });

  final DocsApi api;
  final CompanyRegistrationController controller;
  final Future<PickOutcome> Function()? pickDocuments;

  /// 테스트가 분기를 건너뛸 때만 쓴다
  final String? startCompanyId;

  @override
  State<AppRoot> createState() => _AppRootState();
}

enum _View { loading, register, card, discovery, bids, bidKit, failed }

class _AppRootState extends State<AppRoot> {
  _View _view = _View.loading;
  String? _companyId;
  String _error = '';
  ShortlistItem? _bidItem;
  String? _bidCaseId;
  bool _preparing = false;
  final _bidListKey = GlobalKey<BidListScreenState>();

  @override
  void initState() {
    super.initState();
    if (widget.startCompanyId != null) {
      _companyId = widget.startCompanyId;
      _view = _View.card;
    } else {
      _resolve();
    }
  }

  Future<void> _resolve() async {
    setState(() => _view = _View.loading);
    try {
      final cur = await widget.api.currentCompany();
      if (!mounted) return;
      setState(() {
        _companyId = cur.companyId;
        _view = cur.exists ? _View.card : _View.register;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      // 🔴 서버가 준 문장 그대로
      setState(() { _error = e.message; _view = _View.failed; });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = '서버에 연결하지 못했습니다. 백엔드 주소와 실행 여부를 확인해 주세요.';
        _view = _View.failed;
      });
    }
  }

  @override
  Widget build(BuildContext context) => switch (_view) {
        _View.loading => const Scaffold(
            backgroundColor: AppColors.canvas,
            body: Center(child: CircularProgressIndicator(color: AppColors.primary)),
          ),
        _View.failed => Scaffold(
            backgroundColor: AppColors.canvas,
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error, style: AppText.pageSubtitle, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    OutlineButtonSmall(label: '다시 시도', onTap: _resolve),
                    const SizedBox(height: 10),
                    // 🔴 서버가 없어도 서류를 올리는 화면까지는 갈 수 있게 둔다
                    OutlineButtonSmall(
                      label: '회사 등록으로',
                      onTap: () => setState(() => _view = _View.register),
                    ),
                  ],
                ),
              ),
            ),
          ),
        _View.register => CompanyRegistrationScreen(
            controller: widget.controller,
            pickDocuments: widget.pickDocuments ?? pickDocuments,
            // 🔴 저장에 성공하면 카드 화면으로 넘어간다
            onCreateCard: () {
              final id = widget.controller.saved?.companyId;
              if (id == null) return;
              setState(() { _companyId = id; _view = _View.card; });
            },
          ),
        _View.card => CompanyCardScreen(
            api: widget.api,
            companyId: _companyId!,
            // 「카드 수정하기」 → 등록 화면으로 되돌아간다
            onEdit: () => setState(() => _view = _View.register),
            // 🔴 「이 카드로 공고 추천」 → 공고 탐색
            onRecommend: () => setState(() => _view = _View.discovery),
            onNavigate: _navigate,
          ),
        _View.discovery => Stack(
            children: [
              NoticeDiscoveryScreen(
                api: widget.api,
                companyId: _companyId!,
                onNavigate: _navigate,
                onPrepareBid: _prepareBid,
              ),
              // 🔴 저장하는 동안 화면을 막고 무엇을 하는지 말한다
              if (_preparing) _busy('응찰 대상으로 저장하는 중입니다'),
            ],
          ),
        _View.bids => Stack(
            children: [
              BidListScreen(
                key: _bidListKey,
                api: widget.api,
                companyId: _companyId!,
                onNavigate: _navigate,
                onOpenBid: _openBid,
              ),
              if (_preparing) _busy('나라장터에서 첨부를 받는 중입니다'),
            ],
          ),
        _View.bidKit => BidKitScreen(
            api: widget.api,
            caseId: _bidCaseId!,
            title: _bidItem?.title,
            org: _bidItem?.org,
            deadline: _bidItem?.deadline,
            daysLeft: _bidItem?.daysLeft,
            onBack: () => setState(() => _view = _View.bids),
          ),
      };

  /// 🔴 무엇을 기다리는지 말한다 — 도는 원만 보여 주지 않는다
  Widget _busy(String label) => ColoredBox(
        color: Colors.black.withValues(alpha: 0.25),
        child: Center(
          child: AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const CircularProgressIndicator(color: AppColors.primary),
                const SizedBox(height: 16),
                Text(label, style: AppText.sectionTitle),
              ],
            ),
          ),
        ),
      );

  /// 🔴 「응찰 준비」 — **먼저 저장하고** 응찰 목록으로 간다.
  ///    첨부 수집(케이스 생성)은 여기서 하지 않는다. 목록에서 「응찰하러 가기」를 누를 때 한다 —
  ///    나라장터 첨부는 수십 초가 걸리고, 그동안 사람을 붙잡아 둘 이유가 없다.
  Future<void> _prepareBid(ShortlistItem item) async {
    setState(() => _preparing = true);
    try {
      await widget.api.saveBid(_companyId!, item);
      if (!mounted) return;
      setState(() {
        _bidItem = item;
        _view = _View.bids;
      });
      // 이미 그 화면에 있었다면 다시 읽게 한다
      _bidListKey.currentState?.reload();
    } on ApiException catch (e) {
      if (!mounted) return;
      // 🔴 서버가 준 문장 그대로
      _toast(e.message);
    } catch (_) {
      if (!mounted) return;
      _toast('응찰 대상으로 저장하지 못했습니다.');
    } finally {
      if (mounted) setState(() => _preparing = false);
    }
  }

  /// 🚪 「응찰하러 가기」 — 여기서 케이스를 만든다(=나라장터 첨부 수집) → Bid Kit
  Future<void> _openBid(ShortlistItem item) async {
    final parts = item.caseId.split('-');
    final no = parts.first;
    final ord = parts.length > 1 ? parts.last : '000';

    setState(() => _preparing = true);
    try {
      final f = await widget.api.createCase(bidPbancNo: no, bidPbancOrd: ord, companyId: _companyId);
      if (!mounted) return;
      setState(() {
        _bidItem = item;
        _bidCaseId = f.caseId;
        _view = _View.bidKit;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      _toast(e.message);
    } catch (_) {
      if (!mounted) return;
      _toast('응찰 준비를 시작하지 못했습니다.');
    } finally {
      if (mounted) setState(() => _preparing = false);
    }
  }

  void _toast(String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg, style: AppText.rowSub.copyWith(color: Colors.white)),
      ));

  /// 사이드바 내비. 0 회사 카드 · 1 공고 탐색 · 2 응찰 · 3 설정
  void _navigate(int index) {
    if (_companyId == null) return;
    switch (index) {
      case 0:
        setState(() => _view = _View.card);
      case 1:
        setState(() => _view = _View.discovery);
      case 2:
        setState(() => _view = _View.bids);
      default:
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${kNavItems[index].label} 화면은 아직 준비 중입니다.',
              style: AppText.rowSub.copyWith(color: Colors.white)),
        ));
    }
  }
}

/// CompanyCardView를 화면 밖에서도 쓸 수 있게 재노출
typedef CardView = CompanyCardView;
