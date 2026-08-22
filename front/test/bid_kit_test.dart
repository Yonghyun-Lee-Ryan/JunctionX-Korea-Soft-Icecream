import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/api/card_view.dart';
import 'package:solar_for_bid/api/docs_api.dart';
import 'package:solar_for_bid/api/factsheet.dart';
import 'package:solar_for_bid/api/models.dart';
import 'package:solar_for_bid/main.dart';
import 'package:solar_for_bid/screens/bid_kit_screen.dart';
import 'package:solar_for_bid/services/document_picker.dart';
import 'package:solar_for_bid/state/company_registration_controller.dart';

import 'support/fake_api.dart';
import 'support/settle.dart';

/// 회사 카드 → 공고 탐색 → 「응찰 준비」(저장) → 응찰 목록 → 「응찰하러 가기」 → Bid Kit
///
/// 🔴 「응찰 준비」는 이제 **저장까지만** 한다. 첨부 수집(케이스 생성)은 목록에서 한 번 더 눌러야 시작된다.
Future<FakeApi> _toKit(WidgetTester t, {double w = 1920, double h = 1080, FakeApi? api, Future<PickOutcome> Function()? pick}) async {
  api ??= FakeApi(company: const CurrentCompany(exists: true, companyId: 'co_x'));
  t.view.physicalSize = Size(w, h);
  t.view.devicePixelRatio = 1.0;
  await t.pumpWidget(SolarForBidApp(
    api: api,
    controller: CompanyRegistrationController(api),
    pickDocuments: pick ?? () async => const PickOutcome(docs: [], rejected: {}),
  ));
  await settle(t);
  await t.tap(find.text('이 카드로 공고 추천'));
  await settle(t);
  await t.tap(find.text('응찰 준비').first);
  await settle(t);
  await t.tap(find.text('응찰하러 가기').first);
  await settle(t);
  return api;
}

void main() {
  testWidgets('🔴 「응찰 준비」가 케이스를 만들고 Bid Kit으로 간다', (t) async {
    addTearDown(t.view.reset);
    final api = await _toKit(t);

    // go를 찍었고, 그 공고번호로 케이스가 만들어졌다
    expect(api.decisions['R25BK00645031-000'], 'go');
    expect(api.createdCases.single, 'R25BK00645031-000');

    // 🔴 탭은 서버가 준 4개다 — 임계경로는 별도 탭이 아니라 WBS 탭 안 패널이다
    expect(find.text('파일제출'), findsWidgets);
    expect(find.text('요구사항 체크리스트'), findsWidgets);
    expect(find.text('WBS'), findsWidgets);
    expect(find.text('제출준비'), findsWidgets);
  });

  // ── 파일제출 (Figma 74:6470) ────────────────────────────
  testWidgets('🔴 첫 장은 파일제출 — 필요한 서류와 드롭존이 같이 보인다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);

    expect(find.text('필요한 서류'), findsOneWidget);
    expect(find.text('입찰참가신청서'), findsOneWidget);
    expect(find.text('사업자 등록증_다온피엠씨.pdf'), findsOneWidget);
    // 세 가지 상태가 다 보인다
    expect(find.text('co_biz_reg'), findsOneWidget);
    expect(find.text('읽는 중'), findsOneWidget);
    expect(find.text('업로드'), findsNWidgets(2));
    // 드롭존
    expect(find.text('서류를 끌어다 놓거나 선택하세요'), findsOneWidget);
    // 🔴 보조 버튼 문구를 서버가 준다 — 여기서는 「임시저장」이 아니다
    expect(find.text('나중에'), findsOneWidget);
    expect(find.text('다음으로'), findsOneWidget);
    expect(find.text('임시저장'), findsNothing);
  });

  // ── 파일제출 — 업로드가 실제로 간다 (1-1) ────────────────
  Future<PickOutcome> pickOne() async => PickOutcome(
        docs: [PickedDoc(filename: '실적증명서_2026.pdf', bytes: Uint8List.fromList([0x25, 0x50, 0x44, 0x46]))],
        rejected: const {},
      );

  testWidgets('🔴 서류 줄의 「업로드」는 파일을 골라 그 서류용으로 올리고, 돌아온 봉투로 줄이 「준비됨」이 된다', (t) async {
    addTearDown(t.view.reset);
    final api = await _toKit(t, pick: pickOne);
    // 표본에서 「업로드」가 붙은 첫 줄은 실적증명서다
    await t.tap(find.text('업로드').first);
    await settle(t);

    expect(api.caseUploads.length, 1);
    final up = api.caseUploads.single;
    expect(up.caseId, 'R25BK00645031-000');
    expect(up.filename, '실적증명서_2026.pdf');
    expect(up.requirement, '실적증명서');
    // 서버가 돌려준 봉투가 그대로 화면이 된다 — 줄이 파일명 + 준비됨
    expect(find.text('실적증명서_2026.pdf'), findsOneWidget);
    expect(find.text('준비됨'), findsWidgets);
    expect(find.text('업로드'), findsOneWidget, reason: '남은 미제출 줄 하나만 「업로드」');
  });

  testWidgets('드롭존의 「파일 선택」은 서류를 지정하지 않고 올린다', (t) async {
    addTearDown(t.view.reset);
    final api = await _toKit(t, pick: pickOne);
    await t.tap(find.text('파일 선택'));
    await settle(t);
    expect(api.caseUploads.single.requirement, isNull);
    expect(api.caseUploads.single.filename, '실적증명서_2026.pdf');
  });

  testWidgets('🔴 올릴 파일이 없거나 거른 파일은 그 이유를 말한다 — 조용히 삼키지 않는다', (t) async {
    addTearDown(t.view.reset);
    final api = await _toKit(t, pick: () async => const PickOutcome(docs: [], rejected: {'사진.jpg': '지금은 PDF만 분석할 수 있습니다.'}));
    await t.tap(find.text('파일 선택'));
    await settle(t);
    expect(api.caseUploads, isEmpty);
    expect(find.textContaining('사진.jpg'), findsOneWidget);
  });

  testWidgets('제출준비의 「보완 자료 올리기」는 그 서류용으로 올린다', (t) async {
    addTearDown(t.view.reset);
    final api = await _toKit(t, pick: pickOne);
    await t.tap(find.text('제출준비').first);
    await settle(t);
    await t.tap(find.text('보완 자료 올리기').first);
    await settle(t);
    expect(api.caseUploads.length, 1);
    expect(api.caseUploads.single.requirement, isNotNull);
    expect(api.caseUploads.single.requirement, isNotEmpty);
  });

  // ── 금지 표현 검사 — 제안서 원고 (1-2) ──────────────────
  Future<PickOutcome> pickProposal() async => PickOutcome(
        docs: [PickedDoc(filename: '제안서_v2.pdf', bytes: Uint8List.fromList([0x25, 0x50, 0x44, 0x46]))],
        rejected: const {},
      );

  testWidgets('🔴 금지 표현 카드는 걸린 문장과 쪽을 보여 준다 — 문장을 고쳐 주지 않고 자리만 짚는다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    await t.tap(find.text('제출준비').first);
    await settle(t);
    expect(find.textContaining('외부 LLM 서비스와의 연계도 가능합니다.'), findsOneWidget);
    expect(find.textContaining('모바일 환경도 지원 가능하도록'), findsOneWidget);
    expect(find.text('p.3'), findsOneWidget);
    expect(find.textContaining('제안서_다온피엠씨_가상.pdf'), findsOneWidget);
    expect(find.text('다른 원고로 다시 검사'), findsOneWidget);
  });

  testWidgets('🔴 「제안서 원고 올리기」를 누르면 원고를 올리고, 서버가 돌려준 스캔 결과로 카드가 바뀐다', (t) async {
    addTearDown(t.view.reset);
    final api = _AbsentProposalApi();
    await _toKit(t, api: api, pick: pickProposal);
    await t.tap(find.text('제출준비').first);
    await settle(t);
    expect(find.textContaining('미제출', findRichText: true), findsOneWidget);
    await t.tap(find.text('제안서 원고 올리기'));
    await settle(t);
    expect(api.proposalUploads.single.caseId, 'R25BK00645031-000');
    expect(api.proposalUploads.single.filename, '제안서_v2.pdf');
    expect(find.textContaining('미제출', findRichText: true), findsNothing);
    expect(find.textContaining('2곳', findRichText: true), findsOneWidget);
    expect(find.textContaining('정기 점검은 추가로 고려할 수 있습니다.'), findsOneWidget);
    expect(find.textContaining('제안서_v2.pdf'), findsOneWidget);
  });

  testWidgets('「다른 원고로 다시 검사」도 원고 업로드다', (t) async {
    addTearDown(t.view.reset);
    final api = await _toKit(t, pick: pickProposal);
    await t.tap(find.text('제출준비').first);
    await settle(t);
    await t.tap(find.text('다른 원고로 다시 검사'));
    await settle(t);
    expect(api.proposalUploads.length, 1);
    expect(api.caseUploads, isEmpty, reason: '제출 서류 업로드가 아니다');
  });

  testWidgets('업로드가 실패하면 서버 문장을 보여 주고 화면은 그대로다', (t) async {
    addTearDown(t.view.reset);
    final api = FakeApi(company: const CurrentCompany(exists: true, companyId: 'co_x'))
      ..caseUploadError = const ApiException(code: 'E_UNSUPPORTED_FILE', message: 'PDF를 읽지 못했습니다.');
    await _toKit(t, api: api, pick: pickOne);
    await t.tap(find.text('업로드').first);
    await settle(t);
    expect(find.text('PDF를 읽지 못했습니다.'), findsOneWidget);
    expect(find.text('업로드'), findsNWidgets(2), reason: '봉투가 바뀌지 않았다');
  });

  // ── 요구사항 체크리스트 (Figma 74:7004) ─────────────────
  testWidgets('요구사항 체크리스트가 체크박스 표로 그려진다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    await t.tap(find.text('요구사항 체크리스트').first);
    await settle(t);

    expect(find.text('CSR-001'), findsOneWidget);
    expect(find.text('요구사항 ID'), findsOneWidget);
    expect(find.text('근거 페이지'), findsOneWidget);
    // 🔴 ※ 단서가 살아 있다 — 요구의 뜻을 뒤집는 문장이다
    expect(find.text('※발주기관 품질기준을 우선 적용'), findsOneWidget);
    // 🔴 Node가 다시 센 검산 경고
    expect(find.textContaining('총괄표 151건'), findsOneWidget);
  });

  testWidgets('🔴 임계경로는 별도 탭이 아니라 WBS 탭 안에 있다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    // 탭 바에 「임계경로」라는 탭이 없다
    expect(find.text('임계경로'), findsNothing);

    await t.tap(find.text('WBS').first);
    await settle(t);

    // 그러나 패널로는 보인다
    expect(find.text('임계경로'), findsOneWidget);
    expect(find.text('입찰참가자격 등록 확인'), findsOneWidget);
    expect(find.text('M/M 예상 원가 (추천)'), findsOneWidget);
    expect(find.text('4.0'), findsOneWidget);
    // 🔴 이 숫자를 투찰가로 오해하면 회사가 돈을 잃는다
    expect(find.textContaining('투찰가 아님'), findsOneWidget);
    // 🔴 «못 한 것»을 말하는 줄
    expect(find.textContaining('단가 미입력'), findsOneWidget);
    expect(find.text('추정가격・공고 p3'), findsOneWidget);
    // 🔴 공휴일 미반영을 숨기지 않는다
    expect(find.textContaining('공휴일 미반영'), findsOneWidget);
    // 🔴 남은 일은 서버가 준 tone으로 물든다 — 값을 보고 색을 고르지 않는다
    expect(find.text('3일 전'), findsOneWidget);
  });

  // ── 제출준비 (Figma 74:7362) ────────────────────────────
  testWidgets('🔴 제출준비는 제약 배너 · 상태 칩 · 보완요청 · 금지 표현을 함께 그린다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    await t.tap(find.text('제출준비').first);
    await settle(t);

    // 전폭 배너 — 근거 쪽까지
    expect(find.text('제출 제약'), findsOneWidget);
    expect(find.textContaining('가격제안서는 별도 밀봉'), findsOneWidget);
    expect(find.text('공고문 p21'), findsOneWidget);

    // 상태 칩 세 가지
    expect(find.text('준비됨'), findsNWidgets(3));
    expect(find.text('보완 필요'), findsNWidgets(4)); // 표 2 + 보완요청 카드 2
    expect(find.text('미확인'), findsOneWidget);

    // 보완요청 · 금지 표현
    expect(find.text('보완요청 2건'), findsOneWidget);
    expect(find.text('보완 자료 올리기'), findsOneWidget);
    expect(find.text('금지 표현 검사'), findsOneWidget);
    expect(find.textContaining('평가에서 불가능한 것으로', findRichText: true), findsOneWidget);
  });

  /// 🔴 픽스처에 탭이 «없어서» 통과하는 테스트는 픽스처가 차는 날 조용히 죽는다.
  ///    탭을 실제로 비워서 확인한다.
  testWidgets('🔴 그릴 것이 없는 탭은 「준비 중」이라 말한다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t, api: _EmptySubmitApi());

    await t.tap(find.text('제출준비').first);
    await settle(t);
    expect(find.text('준비 중'), findsWidgets);
    expect(find.textContaining('아직 만들어지지 않았습니다'), findsOneWidget);
    expect(find.textContaining('문서 분석이 끝나면'), findsOneWidget);
  });

  testWidgets('🔴 다운로드는 downloads[]에 있는 탭에만 붙는다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    // 요구사항 체크리스트는 웹에서 체크하는 표라 xlsx가 없다
    expect(find.text('요구사항 체크리스트.xlsx'), findsNothing);

    await t.tap(find.text('WBS').first);
    await settle(t);
    expect(find.text('WBS.xlsx'), findsOneWidget);
    expect(find.text('임계경로.xlsx'), findsOneWidget);
    // 원가는 downloads에 없다
    expect(find.text('M/M 예상 원가 (추천).xlsx'), findsNothing);
  });

  // 🔴 왔던 길로 되돌린다 — 추천 목록이 아니라 「응찰 준비중인 공고」다
  testWidgets('뒤로 가면 응찰 목록으로 돌아간다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t);
    await t.tap(find.bySemanticsLabel('응찰 목록으로').first);
    await settle(t);
    expect(find.text('응찰 준비중인 공고'), findsOneWidget);
    expect(find.text('응찰하러 가기'), findsOneWidget);
  });

  // ── 분석 중 폴링 ───────────────────────────────────────
  testWidgets('🔴 분석 중이면 진행 단계를 말하며 폴링하고, 끝나면 탭이 채워진다', (t) async {
    addTearDown(t.view.reset);
    final api = _PollingApi();
    await _toKit(t, api: api);

    // 첫 봉투는 judging — 탭은 「준비 중」, 어느 단계인지 말한다
    expect(find.textContaining('문서 종류 분류'), findsOneWidget);
    expect(find.text('입찰참가신청서'), findsNothing);
    expect(api.factsheetCalls, 1);

    // 🔴 4초마다 다시 묻는다. (settle 은 가짜 시계를 3초 더 미니 여기서는 pump 로만 센다)
    await t.pump(BidKitScreen.pollInterval);
    expect(api.factsheetCalls, 2);

    await t.pump(BidKitScreen.pollInterval);
    await t.pump();
    expect(api.factsheetCalls, 3);
    // 끝났다 — 폴링이 멎고 파일제출 탭이 채워진다
    expect(find.textContaining('문서 종류 분류'), findsNothing);
    expect(find.text('입찰참가신청서'), findsOneWidget);

    await t.pump(BidKitScreen.pollInterval * 2);
    expect(api.factsheetCalls, 3, reason: 'done 이면 더 묻지 않는다');
  });

  testWidgets('🔴 실패한 케이스는 서버가 준 이유를 보여 주고 다시 돌리는 길을 말한다', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t, api: _FailedApi());
    expect(find.textContaining('제안요청서를 찾지 못했습니다'), findsOneWidget);
    expect(find.textContaining('응찰하러 가기'), findsOneWidget);
  });

  // ── 마감이 지난 공고 (2-5) ───────────────────────────────
  testWidgets('🔴 마감이 지난 공고는 D-값 대신 「마감 지남」을 말한다 — 서버가 판단한 값으로', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t, api: _PassedDeadlineApi());
    expect(find.text('마감 지남'), findsOneWidget);
    expect(find.textContaining('영업일 D-'), findsNothing);
    expect(find.textContaining('2025년 3월 14일'), findsOneWidget, reason: '마감 문구는 그대로 보인다');
  });

  testWidgets('마감이 남았으면 서버가 센 영업일을 쓴다 (목록 값이 아니라)', (t) async {
    addTearDown(t.view.reset);
    await _toKit(t, api: _FutureDeadlineApi());
    expect(find.textContaining('영업일 D-8'), findsOneWidget);
    expect(find.text('마감 지남'), findsNothing);
  });

  group('봉투 견고성', _envelopeRobustness);
  group('다시 올리기', _reuploadTests);

  testWidgets('🔴 폭을 훑어도 오버플로 0건', (t) async {
    addTearDown(t.view.reset);
    var overflow = 0;
    final old = FlutterError.onError;
    FlutterError.onError = (d) {
      if (!d.exceptionAsString().contains('overflowed')) return;
      overflow++;
      // 어디서 넘쳤는지 말한다 — 개수만으로는 고칠 수 없다
      debugPrint('overflow @${t.view.physicalSize}: ${d.exceptionAsString().split('\n').first}');
    };
    for (final (w, h) in <(double, double)>[(1920, 1080), (1440, 900), (1100, 900), (820, 900), (600, 900), (375, 812)]) {
      await t.pumpWidget(const SizedBox.shrink());
      await _toKit(t, w: w, h: h);
      for (final label in ['WBS', '제출준비']) {
        await t.tap(find.text(label).first);
        await settle(t);
      }
    }
    FlutterError.onError = old;
    expect(overflow, 0);
  });
}

/// 제출준비 탭들이 **아직 만들어지지 않은** 서버.
/// 🔴 열만 있고 행이 없는 탭도 «아직»이다 — 0건으로 그리면 다 훑고 아무것도 없다는 뜻이 된다.
class _EmptySubmitApi extends FakeApi {
  _EmptySubmitApi() : super(company: const CurrentCompany(exists: true, companyId: 'co_x'));

  @override
  Future<Factsheet> createCase({
    required String bidPbancNo,
    String bidPbancOrd = '000',
    String? companyId,
  }) async {
    createdCases.add('$bidPbancNo-$bidPbancOrd');
    return _stripSubmit(sampleFactsheet('$bidPbancNo-$bidPbancOrd'));
  }

  @override
  Future<Factsheet> factsheet(String caseId) async => _stripSubmit(sampleFactsheet(caseId));

  static const _submit = {'constraints', 'checklist', 'rework', 'phrases'};

  static Factsheet _stripSubmit(Factsheet f) => Factsheet(
        caseId: f.caseId,
        status: f.status,
        verdict: f.verdict,
        tabs: [
          for (final t in f.tabs)
            if (!_submit.contains(t.id))
              t
            else
              // 남기되 «비운다» — 있지도 않은 탭을 지우는 것과 다르다
              KitTab(id: t.id, title: t.title, kind: t.kind, columns: t.columns, rows: const []),
        ],
        downloads: f.downloads,
        progress: f.progress,
        pages: f.pages,
        primaryAction: f.primaryAction,
        secondaryAction: f.secondaryAction,
        cached: f.cached,
        attachments: f.attachments,
      );
}

/// 🔴 봉투 한 칸이 예상과 다르면 그 칸만 잃어야 한다 — 화면 전체가 죽으면 안 된다.
///    실제로 `as String?` 생캐스트가 곳곳에 있어서, 근거가 객체로 오는 순간
///    `Factsheet.fromJson`이 통째로 `_TypeError`를 던졌다.
void _parsesWithout(String label, Map<String, dynamic> Function(Map<String, dynamic>) mutate) {
  test('🔴 봉투가 조금 달라도 화면이 통째로 죽지 않는다 — $label', () {
    // 🔴 <String, Object>로 못 박는다 — 안 그러면 Dart가 Map<String,String>으로 좁혀
    //    테스트가 «객체를 넣어 본다»는 일 자체를 못 한다
    final base = <String, dynamic>{
      'caseId': 'X-000',
      'tabs': <Map<String, Object>>[
        {'id': 'phrases', 'kind': 'note', 'title': '금지 표현 검사',
         'note': <String, Object>{'body': '본문', 'emphasis': '3곳', 'evidence': 'RFP p18'}},
        {'id': 'constraints', 'kind': 'banner', 'title': '제출 제약',
         'banner': <String, Object>{'label': '제출 제약', 'text': '인편 제출', 'evidence': '공고문 p21'}},
        {'id': 'cost', 'kind': 'metric', 'title': '원가',
         'metric': <String, Object>{'value': '4.0', 'evidence': <Object>['추정가격・공고 p3']}},
      ],
      'downloads': <Object>[],
    };
    final f = Factsheet.fromJson(mutate(base));
    expect(f.tabs.length, 3);
  });
}

void _envelopeRobustness() {
  _parsesWithout('note.evidence가 객체', (j) {
    (((j['tabs'] as List)[0] as Map)['note'] as Map)['evidence'] = {'text': 'RFP', 'page': 18};
    return j;
  });
  _parsesWithout('banner.evidence가 객체', (j) {
    (((j['tabs'] as List)[1] as Map)['banner'] as Map)['evidence'] = {'text': '공고문', 'page': 21};
    return j;
  });
  _parsesWithout('metric.evidence 원소가 객체', (j) {
    (((j['tabs'] as List)[2] as Map)['metric'] as Map)['evidence'] = [
      {'text': '추정가격', 'page': 3}
    ];
    return j;
  });
  _parsesWithout('metric.value가 숫자', (j) {
    (((j['tabs'] as List)[2] as Map)['metric'] as Map)['value'] = 4.0;
    return j;
  });

  test('🔴 근거가 객체로 와도 글자는 살아남는다 — 그 칸만 잃지 않는다', () {
    final f = Factsheet.fromJson({
      'caseId': 'X-000',
      'tabs': [
        {'id': 'cost', 'kind': 'metric', 'title': '원가',
         'metric': {'value': '4.0', 'evidence': [{'text': '추정가격・공고 p3'}]}},
      ],
      'downloads': <Object>[],
    });
    expect(f.tabs.single.metric!.evidence, ['추정가격・공고 p3']);
  });

  test('🔴 모르는 kind는 표로 떨어진다 — 에이전트가 새 모양을 보내도 화면이 죽지 않는다', () {
    final f = Factsheet.fromJson({
      'caseId': 'X-000',
      'tabs': [
        {'id': 'zz', 'kind': '아직-없는-모양', 'title': 'Z',
         'columns': ['a'], 'rows': [['1']]},
      ],
      'downloads': <Object>[],
    });
    expect(f.tabs.single.hasContent, isTrue);
    expect(f.tabs.single.rows.single.single.text, '1');
  });

  test('🔴 서버가 tone을 주면 그대로 쓰고, 없으면 ※만 짐작한다', () {
    final f = Factsheet.fromJson({
      'caseId': 'X-000',
      'tabs': [
        {'id': 't', 'columns': ['a', 'b', 'c'],
         'columnAlign': ['left', 'left', 'right'],
         'rows': [['평문', '※ 단서', {'text': '준비됨', 'tone': 'ok', 'chip': true}]]},
      ],
      'downloads': <Object>[],
    });
    final t = f.tabs.single;
    expect(t.rows.single[0].tone, 'default');
    expect(t.rows.single[1].tone, 'proviso'); // 옛 봉투 호환
    expect(t.rows.single[2].tone, 'ok');
    expect(t.rows.single[2].chip, isTrue);
    expect(t.alignRight(2), isTrue);
    expect(t.alignRight(0), isFalse);
  });
}

/// 분석 중인 서버 — 두 번은 judging, 세 번째에 done.
class _PollingApi extends FakeApi {
  _PollingApi() : super(company: const CurrentCompany(exists: true, companyId: 'co_x'));
  int factsheetCalls = 0;

  Factsheet _judging(String caseId) => Factsheet.fromJson({
        'caseId': caseId,
        'status': 'judging',
        'verdict': {'badge': 'eligible'},
        'tabs': const [],
        'downloads': const [],
        'progress': [
          {'step': '첨부 수집', 'state': 'done', 'detail': '첨부 5건'},
          {'step': '문서 읽기', 'state': 'done'},
          {'step': '문서 종류 분류', 'state': 'running'},
          {'step': '요구사항 추출·판정', 'state': 'pending'},
        ],
        'meta': {'cached': false, 'kitPages': sampleFactsheet(caseId).pages.map((p) => {'id': p.id, 'label': p.label, 'kind': p.kind, 'tabs': [for (final x in p.tabs) {'id': x.id, 'column': x.column}]}).toList()},
      });

  @override
  Future<Factsheet> createCase({required String bidPbancNo, String bidPbancOrd = '000', String? companyId}) async {
    createdCases.add('$bidPbancNo-$bidPbancOrd');
    return _judging('$bidPbancNo-$bidPbancOrd');
  }

  @override
  Future<Factsheet> factsheet(String caseId) async {
    factsheetCalls++;
    return factsheetCalls < 3 ? _judging(caseId) : sampleFactsheet(caseId);
  }
}

/// 파이프라인이 죽은 서버.
class _FailedApi extends FakeApi {
  _FailedApi() : super(company: const CurrentCompany(exists: true, companyId: 'co_x'));

  Factsheet _failed(String caseId) => Factsheet.fromJson({
        'caseId': caseId,
        'status': 'failed',
        'verdict': {'badge': 'eligible'},
        'tabs': const [],
        'downloads': const [],
        'progress': [
          {'step': '첨부 수집', 'state': 'done'},
          {'step': '문서 읽기', 'state': 'failed'},
        ],
        'error': {'code': 'E_RFP_NOT_FOUND', 'message': '공고 첨부에서 제안요청서를 찾지 못했습니다.'},
        'meta': {'cached': false, 'kitPages': const []},
      });

  @override
  Future<Factsheet> createCase({required String bidPbancNo, String bidPbancOrd = '000', String? companyId}) async {
    createdCases.add('$bidPbancNo-$bidPbancOrd');
    return _failed('$bidPbancNo-$bidPbancOrd');
  }

  @override
  Future<Factsheet> factsheet(String caseId) async => _failed(caseId);
}

/// 원고를 아직 안 올린 서버.
class _AbsentProposalApi extends FakeApi {
  _AbsentProposalApi() : super(company: const CurrentCompany(exists: true, companyId: 'co_x'));

  @override
  Future<Factsheet> createCase({required String bidPbancNo, String bidPbancOrd = '000', String? companyId}) async {
    createdCases.add('$bidPbancNo-$bidPbancOrd');
    return withProposalAbsent(sampleFactsheet('$bidPbancNo-$bidPbancOrd'));
  }

  @override
  Future<Factsheet> factsheet(String caseId) async => withProposalAbsent(sampleFactsheet(caseId));
}

/// 마감이 지난 공고 — 서버가 deadlinePassed 를 붙여 준다.
class _PassedDeadlineApi extends FakeApi {
  _PassedDeadlineApi() : super(company: const CurrentCompany(exists: true, companyId: 'co_x'));
  Factsheet _f(String caseId) => withDeadline(sampleFactsheet(caseId), deadline: '2025년 3월 14일(금) 11:00까지', passed: true, daysLeft: 0);
  @override
  Future<Factsheet> createCase({required String bidPbancNo, String bidPbancOrd = '000', String? companyId}) async {
    createdCases.add('$bidPbancNo-$bidPbancOrd');
    return _f('$bidPbancNo-$bidPbancOrd');
  }
  @override
  Future<Factsheet> factsheet(String caseId) async => _f(caseId);
}

class _FutureDeadlineApi extends FakeApi {
  _FutureDeadlineApi() : super(company: const CurrentCompany(exists: true, companyId: 'co_x'));
  Factsheet _f(String caseId) => withDeadline(sampleFactsheet(caseId), deadline: '2026-09-02 18:00', passed: false, daysLeft: 8);
  @override
  Future<Factsheet> createCase({required String bidPbancNo, String bidPbancOrd = '000', String? companyId}) async {
    createdCases.add('$bidPbancNo-$bidPbancOrd');
    return _f('$bidPbancNo-$bidPbancOrd');
  }
  @override
  Future<Factsheet> factsheet(String caseId) async => _f(caseId);
}

// ── 파일제출 — 준비됨 줄도 다시 올릴 수 있다 ────────────────────
void _reuploadTests() {
  Future<PickOutcome> pickOne() async => PickOutcome(
        docs: [PickedDoc(filename: '신청서_v2.pdf', bytes: Uint8List.fromList([0x25, 0x50, 0x44, 0x46]))],
        rejected: const {},
      );
  testWidgets('🔴 이미 파일이 붙은 줄의 「다시 올리기」는 그 서류용으로 다시 올린다', (t) async {
    addTearDown(t.view.reset);
    final api = await _toKit(t, pick: pickOne);
    // 표본의 첫 done 줄은 입찰참가신청서다
    expect(find.text('다시 올리기'), findsWidgets);
    await t.tap(find.text('다시 올리기').first);
    await settle(t);
    expect(api.caseUploads.single.requirement, '입찰참가신청서');
    expect(api.caseUploads.single.filename, '신청서_v2.pdf');
  });
}
