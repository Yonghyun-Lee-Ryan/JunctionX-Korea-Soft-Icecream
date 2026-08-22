import 'dart:convert';
import 'dart:io';

import 'package:solar_for_bid/api/card_view.dart';
import 'package:solar_for_bid/api/docs_api.dart';
import 'package:solar_for_bid/api/models.dart';
import 'package:solar_for_bid/api/factsheet.dart';
import 'package:solar_for_bid/api/screening.dart';

/// 테스트용 가짜 백엔드. 🔴 실제 응답 픽스처를 그대로 쓴다.
class FakeApi implements DocsApi {
  FakeApi({Map<String, Object>? byFilename, this.company})
      : _byFilename = byFilename ?? const {};

  final Map<String, Object> _byFilename; // DocUploadResult | ApiException

  /// null이면 「저장된 회사 없음」 → 등록 화면으로 간다
  final CurrentCompany? company;

  final List<String> calls = [];
  SaveCardRequest? lastSave;

  @override
  Future<DocUploadResult> upload(PickedDoc doc) async {
    calls.add(doc.filename);
    final r = _byFilename[doc.filename];
    if (r is ApiException) throw r;
    if (r is DocUploadResult) return r;
    throw UnimplementedError('픽스처 없음: ${doc.filename}');
  }

  @override
  Future<List<DocTypeInfo>> types() async => const [];

  @override
  Future<SavedCard> saveCard(SaveCardRequest req) async {
    lastSave = req;
    const need = {
      '상호': ['biz_reg'], '소재지': ['biz_reg'], '기업 규모': ['sme_cert'],
      '등록・지정': ['sw_business', 'pia_designation'], '최근 실적': ['performance'],
      '재무': ['financial'], '인력': ['tech_staff'],
    };
    final have = req.documents.map((d) => d.docTypeKey).toSet();
    final missing = [for (final e in need.entries) if (!e.value.any(have.contains)) e.key];
    if (missing.isNotEmpty) {
      throw ApiException(
        code: 'E_CARD_INCOMPLETE',
        message: '아직 채워지지 않은 항목이 있습니다 — ${missing.join(" · ")}',
        status: 422,
        missing: missing,
      );
    }
    return const SavedCard(companyId: 'co_test', savedAt: '2026-08-22T00:00:00Z');
  }

  @override
  Future<CurrentCompany> currentCompany() async =>
      company ?? const CurrentCompany(exists: false);

  @override
  Future<CompanyCardView> cardView(String companyId) async => sampleCardView(companyId);

  final Map<String, String> decisions = {};

  /// 실호출 흉내를 낼지 (충족 미확인 · 나라장터 실시간)
  bool liveScreening = false;

  @override
  Future<ScreeningResult> screening(String companyId, {bool live = false}) async =>
      liveScreening ? sampleLiveScreening() : sampleScreening();

  @override
  Future<void> setDecision(String companyId, String caseId, String decision) async {
    decisions[caseId] = decision;
  }

  final List<String> createdCases = [];

  @override
  Future<Factsheet> createCase({required String bidPbancNo, String bidPbancOrd = '000', String? companyId}) async {
    final id = '$bidPbancNo-$bidPbancOrd';
    createdCases.add(id);
    return sampleFactsheet(id);
  }

  @override
  Future<Factsheet> factsheet(String caseId) async => sampleFactsheet(caseId);

  /// 🔴 저장된 응찰 대상. 서버처럼 caseId로 덮어쓴다
  final List<ShortlistItem> savedBids = [];

  /// 저장이 실패하는 상황을 만들 때
  ApiException? saveBidError;

  @override
  Future<void> saveBid(String companyId, ShortlistItem item) async {
    if (saveBidError != null) throw saveBidError!;
    savedBids.removeWhere((b) => b.caseId == item.caseId);
    savedBids.add(item.copyWith(decision: BidDecision.go));
  }

  @override
  Future<List<ShortlistItem>> bids(String companyId) async => List.of(savedBids);

  @override
  Future<void> dropBid(String companyId, String caseId) async {
    savedBids.removeWhere((b) => b.caseId == caseId);
  }
}

/// 백엔드 factsheet 봉투 표본. 🔴 제출준비 탭은 «아직 없다» — 다른 팀이 만드는 중이다
Factsheet sampleFactsheet(String caseId) => Factsheet.fromJson({
      'caseId': caseId,
      'status': 'done',
      'verdict': {'badge': 'eligible', 'unverified': 1, 'headline': '참가자격 5개 확인 — 전부 충족'},
      'progress': [
        {'step': '첨부 5건 수집', 'state': 'done'},
        {'step': '문서 분류', 'state': 'done'},
      ],
      'tabs': [
        {
          'id': 'compliance',
          'kind': 'checklist',
          'title': '요구사항 조견표',
          'columns': ['요구사항ID', '분류', '명칭', '※ 단서', '근거 p'],
          'rows': [
            ['CSR-001', '공통', 'PMO 사업의 수행전략 및 방안 제시', '-', '47p'],
            ['CSR-002', '공통', '품질관리 방안', '※발주기관 품질기준을 우선 적용', '47p'],
          ],
          'warnings': ['총괄표 151건 · 추출 2건 — 데모 축약'],
          'summary': '151건 · 웹에서 한 행씩 체크합니다',
        },
        {
          'id': 'wbs',
          'title': 'WBS',
          'columns': ['WBS ID', '작업 패키지', '산출물', '선행', '기간', 'M/M'],
          'rows': [
            ['1.1', '착수 및 사업수행 계획 수립', '사업 수행 계획서', '-', '미 명시', '특급 0.5'],
          ],
          'warnings': ['기간 명시 0건 / 미명시 1건'],
        },
        {
          'id': 'criticalpath',
          'title': '임계경로',
          'columns': ['작업', '남은 일'],
          'rows': [['입찰참가자격 등록 확인', '3일 전']],
          'warnings': ['공휴일 미반영 — 주말만 제외했습니다'],
        },
        {
          'id': 'cost',
          'title': 'M/M 예상 원가 (추천)',
          'columns': ['항목', '값', '근거'],
          'rows': [['합계 M/M', '4.0', '추정가격・공고 p3']],
          'summary': '투찰가가 아닙니다',
        },
      ],
      'downloads': [
        {'id': 'wbs', 'label': 'WBS.xlsx', 'url': '/api/cases/x/files/wbs.xlsx'},
        {'id': 'criticalpath', 'label': '임계경로.xlsx', 'url': '/api/cases/x/files/criticalpath.xlsx'},
      ],
      'meta': {
        'cached': false,
        'attachments': [
          {'fileSeq': 1, 'filename': '공고문.hwp', 'docClass': 'ntce_notice'},
        ],
        'kitPages': [
          {'id': 'compliance', 'label': '요구사항 체크리스트', 'tabs': [{'id': 'compliance', 'column': 0}]},
          {'id': 'wbs', 'label': 'WBS', 'columnFlex': [1080, 710], 'tabs': [
            {'id': 'wbs', 'column': 0}, {'id': 'criticalpath', 'column': 1}, {'id': 'cost', 'column': 1},
          ]},
          {'id': 'submit', 'label': '제출준비', 'tabs': [
            {'id': 'checklist', 'column': 0}, {'id': 'rework', 'column': 0},
          ]},
        ],
        'kitPrimaryAction': {'compliance': 'WBS로', 'wbs': '제출준비', 'submit': '제출하기'},
      },
    });

/// 백엔드 `screening.demo.json` 모양의 표본
ScreeningResult sampleScreening() => ScreeningResult.fromJson({
      'companyId': 'co_daon_demo',
      'status': 'done',
      'summary': {'scanned': 127, 'excluded': 124, 'shortlisted': 3, 'window': '2026-08-01 ~ 08-22 공고분'},
      'shortlist': [
        {
          'caseId': 'R25BK00645031-000',
          'title': '체육진흥투표권사업 온라인발매 결제서비스(PG) 대행 용역',
          'org': '공공기관B',
          'deadline': '09-02 18:00',
          'daysLeft': 8,
          'matched': 5,
          'unverified': 1,
          'decision': 'pending',
          'reasons': [
            {'text': '개인정보 영향평가기관 지정', 'page': 14, 'docId': '2', 'confidence': 'high'},
            {'text': '중소기업', 'page': 3, 'docId': '2', 'confidence': 'high'},
            {'text': '소프트웨어사업자 등록', 'page': 0, 'docId': '2', 'confidence': 'low'},
          ],
        },
        {
          'caseId': 'DEMO-SHORT-02',
          'title': '공공기관 정보화 PMO 용역',
          'org': '공공기관A',
          'deadline': '09-08 18:00',
          'daysLeft': 14,
          'matched': 4,
          'unverified': 0,
          'decision': 'skip',
          'reasons': [
            {'text': '공공 정보화 PMO 실적 3년 내 8건', 'page': 7, 'confidence': 'high'},
          ],
        },
        {
          'caseId': 'DEMO-SHORT-03',
          'title': '정보화 ISP 수립 용역',
          'org': '지자체',
          'deadline': '09-05 18:00',
          'daysLeft': 11,
          'matched': 3,
          'unverified': 0,
          'decision': 'pending',
          'reasons': [
            {'text': '소프트웨어사업자 등록', 'page': 5, 'confidence': 'high'},
          ],
        },
      ],
      'excludedSamples': [
        {'caseId': 'E1', 'title': '(데모) 금융권 차세대 PMO', 'stage': 'parsed',
         'reason': '최근 3년 금융권 PMO 실적 2건 이상 필요 — 회사 카드 0건', 'page': 12},
        {'caseId': 'E2', 'title': '(데모) 대형 통합 SI 감리', 'stage': 'parsed',
         'reason': '단일계약 10억 이상 실적 필요 — 회사 최대 6.12억', 'page': 10},
        {'caseId': 'E3', 'title': '(데모) 지역 정보화 용역', 'stage': 'cheap',
         'reason': '지역제한 — 본점 소재지 경북 한정. 회사 소재 서울', 'page': 0},
      ],
      'meta': {'cached': true, 'listSource': 'cached'},
    });

/// 백엔드 `GET /companies/{id}/card` 모양의 표본
CompanyCardView sampleCardView(String companyId) => CompanyCardView.fromJson({
      'companyId': companyId,
      'name': '주식회사 다온피엠씨',
      'bizNo': '120-86-01230',
      'savedAt': '2026-08-22 03:45:44',
      'stats': [
        {'id': 'pmo', 'label': '공공 정보화 PMO 실적', 'value': '8건', 'sub': '최근 3년', 'status': 'confirmed'},
        {'id': 'max_contract', 'label': '최대 단일 계약', 'value': '6.12억', 'sub': '원', 'status': 'confirmed'},
        {'id': 'staff', 'label': '기술인력', 'value': '68명', 'sub': '기술사 6명・특급 24명', 'status': 'confirmed'},
        {'id': 'credit', 'label': '신용 평가 등급', 'value': null, 'sub': null, 'status': 'missing'},
      ],
      'sections': [
        {
          'id': 'basic',
          'title': '기본・등록',
          'rows': [
            {'label': '사업자등록번호', 'value': '120-86-01230', 'source': '사업자등록증.pdf', 'status': 'confirmed'},
            {'label': '설립', 'value': '2009년', 'source': '사업자등록증.pdf', 'status': 'confirmed'},
          ],
        },
        {
          'id': 'performance',
          'title': '실적 (최근 3년)',
          'chips': [
            {'label': '공공 PMO 8', 'tone': 'success'},
            {'label': '금융 PMO 0', 'tone': 'danger'},
            {'label': '감리 3', 'tone': 'info'},
          ],
          'rows': [
            {'label': '최대 단일 계약', 'value': '6억 1,200만원', 'source': '실적증명서.pdf', 'status': 'confirmed'},
            {'label': '공동수급', 'value': null, 'source': '직접 입력', 'status': 'missing', 'action': 'manual'},
          ],
        },
        {
          'id': 'unverified',
          'title': '미확인 2건',
          'note': '서류에서 읽지 못하였습니다. 직접 입력하실 수 있습니다.',
          'rows': [
            {'label': '자본금', 'value': null, 'status': 'missing', 'action': 'manual'},
            {'label': '부채비율', 'value': null, 'status': 'missing', 'action': 'manual'},
          ],
        },
      ],
    });

DocUploadResult fixture(String key) => DocUploadResult.fromJson(
      jsonDecode(File('test/fixtures/upload_$key.json').readAsStringSync()) as Map<String, dynamic>,
    );


/// 🔴 나라장터 실호출 결과 표본 — 첨부를 안 읽었으므로 충족이 «미확인»이다
ScreeningResult sampleLiveScreening() => ScreeningResult.fromJson({
      'companyId': 'co_x',
      'status': 'done',
      'summary': {
        'scanned': 300, 'excludedCheap': 232, 'parsed': 0, 'excluded': 232, 'shortlisted': 2,
        'window': '최근 2026-08-22 기준 · 용역 · 전체 5598건 중 300건 조회',
      },
      'shortlist': [
        {
          'caseId': 'R26BK01681540-001',
          'title': '제5회 대구콘텐츠페어 공동관 구축 및 운영 용역',
          'org': '재단법인 대구디지털혁신진흥원',
          'deadline': '2026-09-04 10:00:00',
          'daysLeft': 9,
          'matched': 0,
          'unverified': 1,
          'decision': 'pending',
          'reasons': [
            {'text': '일반경쟁 · 협상에의한계약', 'page': 0, 'confidence': 'unknown'},
          ],
        },
        {
          'caseId': 'R26BK01690000-000',
          'title': '우즈베키스탄 디지털제조기술센터 초청연수',
          'org': '한국기계산업진흥회',
          'deadline': '2026-09-22 14:00:00',
          'daysLeft': 22,
          'matched': 0,
          'unverified': 1,
          'decision': 'pending',
          'reasons': [],
        },
      ],
      'excludedSamples': [
        {'caseId': 'X1', 'title': '(실측) 마감 지난 공고', 'stage': 'cheap',
         'reason': '마감이 지났습니다. (마감 2026-08-20 15:00:00)', 'page': 0},
      ],
      'meta': {
        'cached': false,
        'listSource': 'openapi',
        'elapsedMs': 7521,
        'note': '목록 메타데이터만으로 걸렀습니다. 첨부 문서는 아직 읽지 않아 자격 충족은 미확인입니다.',
      },
    });
