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
    return withChecked(sampleFactsheet(id), checks);
  }

  @override
  Future<Factsheet> factsheet(String caseId) async => withChecked(sampleFactsheet(caseId), checks);

  /// 서버가 기억하는 체크 — 탭 id → 체크된 행 키
  final Map<String, List<String>> checks = {};
  final List<({String caseId, String tabId, String key, bool checked})> checkCalls = [];

  @override
  Future<List<String>> setCheck(String caseId, String tabId, String key, {required bool checked}) async {
    checkCalls.add((caseId: caseId, tabId: tabId, key: key, checked: checked));
    final list = checks.putIfAbsent(tabId, () => []);
    list.remove(key);
    if (checked) list.add(key);
    return List.of(list);
  }

  /// 케이스에 올린 제출 서류 (caseId, 파일명, 어느 서류용인지)
  final List<({String caseId, String filename, String? requirement})> caseUploads = [];

  /// 업로드가 실패하는 상황을 만들 때
  ApiException? caseUploadError;

  /// 올린 제안서 원고 (caseId, 파일명)
  final List<({String caseId, String filename})> proposalUploads = [];

  @override
  Future<Factsheet> uploadProposal(String caseId, PickedDoc doc) async {
    if (caseUploadError != null) throw caseUploadError!;
    proposalUploads.add((caseId: caseId, filename: doc.filename));
    return withProposalScanned(sampleFactsheet(caseId), filename: doc.filename);
  }

  @override
  Future<Factsheet> uploadCaseFile(String caseId, PickedDoc doc, {String? requirement}) async {
    if (caseUploadError != null) throw caseUploadError!;
    caseUploads.add((caseId: caseId, filename: doc.filename, requirement: requirement));
    return withUploaded(sampleFactsheet(caseId), requirement: requirement, filename: doc.filename);
  }

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

/// 백엔드 factsheet 봉투 표본.
///
/// 🔴 `backend/fixtures/factsheet.demo.json` + `src/config/kitPages.js`에서 **그대로 떠 온 것**이다.
///    가짜 API가 서버와 다른 계약을 흉내 내면 테스트는 통과하면서 아무것도 지키지 않는다.
/// 🔴 제출준비 탭들은 아직 다른 팀이 만드는 중이라 «있는 모양»만 표본으로 들어 있다.
Factsheet sampleFactsheet(String caseId) => Factsheet.fromJson({
        "caseId": caseId,
        "status": "done",
        "verdict": {
              "badge": "eligible",
              "unverified": 1,
              "decision": "pending",
              "headline": "참가자격 5개 확인 — 전부 충족. 1개는 문서에서 읽지 못했습니다.",
              "reasons": [
                    {
                          "text": "「개인정보 영향평가기관 지정」이 참가자격입니다 — 보유 (지정 2024-06, 유효)",
                          "page": 14,
                          "docId": "2",
                          "confidence": "high"
                    },
                    {
                          "text": "소프트웨어사업자 등록 — 충족",
                          "page": 14,
                          "docId": "2",
                          "confidence": "high"
                    },
                    {
                          "text": "중소기업 제한 — 충족 (확인서 2027-03-31)",
                          "page": 14,
                          "docId": "2",
                          "confidence": "high"
                    },
                    {
                          "text": "정규직 비율 30% 이상 권고 — 74%로 충족",
                          "page": 15,
                          "docId": "2",
                          "confidence": "high"
                    },
                    {
                          "text": "공동수급 허용 (대표사 포함 5인 이하, 최소지분 10%) — 단독 참여 가능, 정보로만 표시합니다",
                          "page": 14,
                          "docId": "2",
                          "confidence": "high"
                    },
                    {
                          "text": "🔴 설명회 참가 의무 여부를 공고문에서 읽지 못했습니다 — 미확인. 이것 때문에 빼지는 않습니다.",
                          "page": 0,
                          "docId": "1",
                          "confidence": "unknown"
                    }
              ]
        },
        "progress": [
              {
                    "step": "첨부 5건 수집",
                    "state": "done",
                    "detail": "fileSeq 1~5, 422에서 종료"
              },
              {
                    "step": "문서 9종 분류",
                    "state": "done",
                    "detail": "ntce_notice 1 · rfp_main 1 · contract_terms 2 · form_annex 1"
              },
              {
                    "step": "요구사항 추출",
                    "state": "done",
                    "detail": "151건"
              },
              {
                    "step": "자격 판정",
                    "state": "done"
              }
        ],
        "tabs": [
              {
                    "id": "submitfiles",
                    "title": "필요한 서류",
                    "kind": "docs",
                    "items": [
                          {
                                "title": "입찰참가신청서",
                                "filename": "사업자 등록증_다온피엠씨.pdf",
                                "state": "done",
                                "label": "co_biz_reg"
                          },
                          {
                                "title": "제안서・제안요약서",
                                "filename": "실적증명서_2024-2026.pdf",
                                "state": "reading",
                                "label": "읽는 중"
                          },
                          {
                                "title": "실적증명서",
                                "filename": "업로드 되지 않음",
                                "state": "missing",
                                "label": "업로드"
                          },
                          {
                                "title": "신용평가등급확인서",
                                "filename": "업로드 되지 않음",
                                "state": "missing",
                                "label": "업로드"
                          },
                          {
                                "title": "청렴계약이행서약서",
                                "filename": "중소기업 확인서_2027-03-31.pdf",
                                "state": "done",
                                "label": "co_sme_cert"
                          }
                    ],
                    "summary": "제출 서류 적격 판단은 아직 연결되지 않았습니다 — 지금 보이는 상태는 데모 표본입니다."
              },
              {
                    "id": "compliance",
                    "title": "요구사항 체크리스트",
                    "kind": "checklist",
                    "columns": [
                          "요구사항 ID",
                          "분류",
                          "명칭",
                          "단서",
                          "근거 페이지"
                    ],
                    "columnAlign": [
                          "left",
                          "left",
                          "left",
                          "left",
                          "right"
                    ],
                    "rows": [
                          [
                                "CSR-001",
                                "공통",
                                "PMO 사업의 수행전략 및 방안 제시",
                                "-",
                                "47p"
                          ],
                          [
                                "CSR-003",
                                "공통",
                                "현행 시스템 및 사업 현황 분석",
                                "-",
                                "12p"
                          ],
                          [
                                "CSR-007",
                                "공통",
                                "대상사업 일정관리",
                                {
                                      "text": "※중앙회 일정에 종속되는 구간은 제외",
                                      "tone": "proviso"
                                },
                                "54p"
                          ],
                          [
                                "PMR-002",
                                "사업관리",
                                "품질관리 방안 및 산출물 검토 체계",
                                {
                                      "text": "※발주기관 품질기준을 우선 적용",
                                      "tone": "proviso"
                                },
                                "123p"
                          ],
                          [
                                "PMR-005",
                                "사업관리",
                                "위험 식별・대응 및 보고 추가",
                                "-",
                                "324p"
                          ],
                          [
                                "ECR-004",
                                "장비",
                                "H/W 공통 요구사항",
                                {
                                      "text": "※신규 도입장비에 한함",
                                      "tone": "proviso"
                                },
                                "12p"
                          ],
                          [
                                "SER-001",
                                "보안",
                                "개인정보 처리위탁 보안 요구사항",
                                {
                                      "text": "※위탁 범위는 계약특수 조건 제4조에 따름",
                                      "tone": "proviso"
                                },
                                "57p"
                          ]
                    ],
                    "warnings": [
                          "총괄표 151건 · 여기 표시 7건 — 데모 축약"
                    ],
                    "summary": "151건 · 웹에서 한 행씩 체크합니다 — xlsx 없음"
              },
              {
                    "id": "wbs",
                    "title": "WBS",
                    "kind": "table",
                    "columns": [
                          "ID",
                          "작업 패키지",
                          "산출물",
                          "선행",
                          "기간",
                          "M/M",
                          "근거요구",
                          "P"
                    ],
                    "columnAlign": [
                          "left",
                          "left",
                          "left",
                          "left",
                          "left",
                          "left",
                          "left",
                          "right"
                    ],
                    "rows": [
                          [
                                "1.1",
                                "착수 및 사업수행 계획 수립",
                                "사업 수행 계획서",
                                "-",
                                "미 명시",
                                "특급 0.5・고급 0.5",
                                "CSR-001",
                                "47"
                          ],
                          [
                                "1.2",
                                "현행 분석",
                                "현황 분석서",
                                "1.1",
                                "미 명시",
                                "고급 0.1・중급 0.1",
                                "CSR-003",
                                "48"
                          ]
                    ],
                    "warnings": [
                          "기간 명시 0건 / 미 명시 2건"
                    ],
                    "summary": "기간은 문서를 참고해주세요. 없으면 「미 명시」로 표기합니다. - M/M은 추천값입니다."
              },
              {
                    "id": "criticalpath",
                    "title": "임계경로",
                    "kind": "table",
                    "columns": [
                          "작업",
                          "남은 일"
                    ],
                    "columnAlign": [
                          "left",
                          "right"
                    ],
                    "rows": [
                          [
                                "입찰참가자격 등록 확인",
                                {
                                      "text": "3일 전",
                                      "tone": "danger"
                                }
                          ],
                          [
                                "실적증명서 발급 (발주기관 3곳)",
                                {
                                      "text": "7일 전",
                                      "tone": "warn"
                                }
                          ],
                          [
                                "제안서 집필",
                                {
                                      "text": "10일 전",
                                      "tone": "muted"
                                }
                          ]
                    ],
                    "warnings": [
                          "공휴일 미반영 — 주말만 제외했습니다"
                    ]
              },
              {
                    "id": "cost",
                    "title": "M/M 예상 원가 (추천)",
                    "kind": "metric",
                    "metric": {
                          "value": "4.0",
                          "unit": "M/M",
                          "caption": "특급 1.0・고급 1.5・중급 1.5",
                          "note": "금액 환산 - 단가 미입력 · 회사 카드에 등급별 단가가 있을 때만",
                          "evidence": [
                                "추정가격・공고 p3",
                                "낙찰하한율・공고 p7"
                          ]
                    },
                    "summary": "투찰가 아님"
              },
              {
                    "id": "constraints",
                    "title": "제출 제약",
                    "kind": "banner",
                    "banner": {
                          "label": "제출 제약",
                          "text": "인편 제출・제안서 5부・분량 상한 100쪽・가격제안서는 별도 밀봉",
                          "evidence": "공고문 p21"
                    }
              },
              {
                    "id": "checklist",
                    "title": "제출 서류",
                    "kind": "table",
                    "columns": [
                          "서류",
                          "부수",
                          "유효기간",
                          "상태",
                          "보완요청・리드타임",
                          "P"
                    ],
                    "columnAlign": [
                          "left",
                          "left",
                          "left",
                          "left",
                          "left",
                          "right"
                    ],
                    "rows": [
                          [
                                "입찰참가신청서 (서식 제1호)",
                                "1",
                                "-",
                                {
                                      "text": "준비됨",
                                      "tone": "ok",
                                      "chip": true
                                },
                                "-",
                                "23"
                          ],
                          [
                                "제안서・제안요약서",
                                "5",
                                "-",
                                {
                                      "text": "준비됨",
                                      "tone": "ok",
                                      "chip": true
                                },
                                "인쇄 1일",
                                "36"
                          ],
                          [
                                "실적증명서",
                                "1",
                                "발급 30일 내",
                                {
                                      "text": "보완 필요",
                                      "tone": "warn",
                                      "chip": true
                                },
                                "발주기관 직인본이 필요합니다 - 사본 불가・3곳에 오늘 신청・「확인 필요」 발급 소요",
                                "36"
                          ],
                          [
                                "신용평가등급확인서",
                                "1",
                                "2026-11-30",
                                {
                                      "text": "준비됨",
                                      "tone": "ok",
                                      "chip": true
                                },
                                "-",
                                "87"
                          ],
                          [
                                "청렴계약이행서약서",
                                "5",
                                "-",
                                {
                                      "text": "미확인",
                                      "tone": "muted",
                                      "chip": true
                                },
                                "인쇄 1일",
                                "94"
                          ],
                          [
                                "가격제안서",
                                "5",
                                "-",
                                {
                                      "text": "보완 필요",
                                      "tone": "warn",
                                      "chip": true
                                },
                                "인쇄 1일",
                                "167"
                          ]
                    ]
              },
              {
                    "id": "rework",
                    "title": "보완요청 2건",
                    "kind": "tasks",
                    "items": [
                          {
                                "title": "실적증명서",
                                "chip": {
                                      "text": "보완 필요",
                                      "tone": "warn"
                                },
                                "detail": "발주기관 직인본 필요 - 사본 불가",
                                "action": {
                                      "label": "보완 자료 올리기",
                                      "kind": "upload"
                                }
                          },
                          {
                                "title": "가격제안서",
                                "chip": {
                                      "text": "보완 필요",
                                      "tone": "warn"
                                },
                                "detail": "별도 봉투 밀봉・겉면 기재",
                                "action": {
                                      "label": "다온피엠씨_가격제안서.pdf",
                                      "kind": "file"
                                }
                          }
                    ],
                    "summary": "사람이 검토한 뒤 보완 자료를 올리면 다시 검사합니다."
              },
              {
                    "id": "phrases",
                    "title": "금지 표현 검사",
                    "kind": "note",
                    "note": {
                          "body": "제안서 원고에서 「가능하다」・「고려할 수 있다」 류 3곳 - 평가에서 불가능한 것으로 간주되는 표현입니다.",
                          "emphasis": "3곳",
                          "evidence": "RFP p18",
                          "proposal_file": "제안서_다온피엠씨_가상.pdf",
                          "items": [
                                {"expression": "가능합니다", "sentence": "외부 LLM 서비스와의 연계도 가능합니다.", "page": 3},
                                {"expression": "고려할 수 있다", "sentence": "정기 점검은 추가로 고려할 수 있습니다.", "page": 4},
                                {"expression": "지원 가능", "sentence": "모바일 환경도 지원 가능하도록 설계합니다.", "page": 5}
                          ],
                          "action": {"label": "다른 원고로 다시 검사", "kind": "upload"}
                    }
              }
        ],
        "downloads": [
              {
                    "id": "wbs",
                    "label": "WBS.xlsx",
                    "url": "/api/cases/R25BK00645031-000/files/wbs.xlsx"
              },
              {
                    "id": "criticalpath",
                    "label": "임계경로.xlsx",
                    "url": "/api/cases/R25BK00645031-000/files/criticalpath.xlsx"
              }
        ],
        "meta": {
              "cached": false,
              "attachments": [
                    {
                          "fileSeq": 1,
                          "filename": "입찰공고문.hwp",
                          "docClass": "ntce_notice"
                    }
              ],
              "kitPages": [
                    {
                          "id": "files",
                          "label": "파일제출",
                          "kind": "upload",
                          "tabs": [
                                {
                                      "id": "submitfiles",
                                      "column": 0
                                }
                          ],
                          "columnFlex": [
                                1055,
                                714
                          ]
                    },
                    {
                          "id": "compliance",
                          "label": "요구사항 체크리스트",
                          "tabs": [
                                {
                                      "id": "compliance",
                                      "column": 0
                                }
                          ]
                    },
                    {
                          "id": "wbs",
                          "label": "WBS",
                          "tabs": [
                                {
                                      "id": "wbs",
                                      "column": 0
                                },
                                {
                                      "id": "criticalpath",
                                      "column": 1
                                },
                                {
                                      "id": "cost",
                                      "column": 1
                                }
                          ],
                          "columnFlex": [
                                1080,
                                710
                          ]
                    },
                    {
                          "id": "submit",
                          "label": "제출준비",
                          "tabs": [
                                {
                                      "id": "constraints",
                                      "column": 0,
                                      "span": "full"
                                },
                                {
                                      "id": "checklist",
                                      "column": 0,
                                      "span": "full"
                                },
                                {
                                      "id": "rework",
                                      "column": 0
                                },
                                {
                                      "id": "phrases",
                                      "column": 1
                                }
                          ],
                          "columnFlex": [
                                1020,
                                770
                          ]
                    }
              ],
              "kitPrimaryAction": {
                    "files": "다음으로",
                    "compliance": "WBS로",
                    "wbs": "제출준비",
                    "submit": "제출하기"
              },
              "kitSecondaryAction": {
                    "files": "나중에",
                    "compliance": "임시저장",
                    "wbs": "임시저장",
                    "submit": "임시저장"
              }
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

/// 서버가 제출 검사를 다시 돌린 뒤의 봉투 흉내 — 그 서류(없으면 첫 미제출 줄)가 파일과 연결돼 「준비됨」이 된다.
Factsheet withUploaded(Factsheet f, {String? requirement, required String filename}) {
  final tabs = [
    for (final t in f.tabs)
      if (t.id != 'submitfiles')
        t
      else
        KitTab(
          id: t.id, title: t.title, columns: t.columns, rows: t.rows, kind: t.kind, summary: t.summary,
          items: () {
            var done = false;
            return [
              for (final i in t.items)
                if (!done && (requirement == null ? i.state == 'missing' : i.title == requirement))
                  () { done = true; return KitItem(title: i.title, filename: filename, state: 'done', label: '준비됨'); }()
                else
                  i,
            ];
          }(),
        ),
  ];
  return Factsheet(
    caseId: f.caseId, status: f.status, verdict: f.verdict, tabs: tabs, downloads: f.downloads, progress: f.progress,
    pages: f.pages, primaryAction: f.primaryAction, secondaryAction: f.secondaryAction, cached: f.cached,
    attachments: f.attachments, title: f.title, org: f.org, deadline: f.deadline, daysLeft: f.daysLeft, errorMessage: f.errorMessage,
  );
}

/// 서버가 기억하는 체크를 봉투의 탭에 싣는다 — `checked[]`
Factsheet withChecked(Factsheet f, Map<String, List<String>> checks) {
  if (checks.isEmpty) return f;
  final tabs = [
    for (final t in f.tabs)
      if (!checks.containsKey(t.id))
        t
      else
        KitTab(
          id: t.id, title: t.title, columns: t.columns, rows: t.rows, kind: t.kind, columnAlign: t.columnAlign,
          warnings: t.warnings, summary: t.summary, metric: t.metric, banner: t.banner, note: t.note, items: t.items,
          checked: List.of(checks[t.id]!),
        ),
  ];
  return Factsheet(
    caseId: f.caseId, status: f.status, verdict: f.verdict, tabs: tabs, downloads: f.downloads, progress: f.progress,
    pages: f.pages, primaryAction: f.primaryAction, secondaryAction: f.secondaryAction, cached: f.cached,
    attachments: f.attachments, title: f.title, org: f.org, deadline: f.deadline, daysLeft: f.daysLeft, errorMessage: f.errorMessage,
  );
}

/// 원고를 올린 뒤 서버가 스캔을 다시 돌린 봉투 흉내 — 금지 표현 2곳.
Factsheet withProposalScanned(Factsheet f, {required String filename}) => _replaceNote(f, KitNoteData(
      body: '제안서 원고에서 「가능하다」・「고려할 수 있다」 류 2곳 - 평가에서 불가능한 것으로 간주되는 표현입니다.',
      emphasis: '2곳',
      evidence: 'RFP p18',
      proposalFile: filename,
      items: const [
        KitNoteItem(expression: '가능합니다', sentence: '외부 LLM 서비스와의 연계도 가능합니다.', page: 3),
        KitNoteItem(expression: '고려할 수 있다', sentence: '정기 점검은 추가로 고려할 수 있습니다.', page: 4),
      ],
      action: const KitAction(label: '다른 원고로 다시 검사', kind: 'upload'),
    ));

/// 원고가 아직 없는 서버 — 「미제출」과 올리기 버튼.
Factsheet withProposalAbsent(Factsheet f) => _replaceNote(f, const KitNoteData(
      body: '제안서 원고 미제출 — 금지 표현을 검사하지 못했습니다. 원고를 올리면 다시 검사합니다.',
      emphasis: '미제출',
      evidence: '',
      action: KitAction(label: '제안서 원고 올리기', kind: 'upload'),
    ));

Factsheet _replaceNote(Factsheet f, KitNoteData note) {
  final tabs = [
    for (final t in f.tabs)
      if (t.id != 'phrases') t else KitTab(id: t.id, title: t.title, columns: t.columns, rows: t.rows, kind: t.kind, note: note),
  ];
  return Factsheet(
    caseId: f.caseId, status: f.status, verdict: f.verdict, tabs: tabs, downloads: f.downloads, progress: f.progress,
    pages: f.pages, primaryAction: f.primaryAction, secondaryAction: f.secondaryAction, cached: f.cached,
    attachments: f.attachments, title: f.title, org: f.org, deadline: f.deadline, daysLeft: f.daysLeft, errorMessage: f.errorMessage,
  );
}

/// 서버가 마감을 읽어 붙인 봉투 흉내.
Factsheet withDeadline(Factsheet f, {required String deadline, required bool passed, required int daysLeft}) => Factsheet(
      caseId: f.caseId, status: f.status, verdict: f.verdict, tabs: f.tabs, downloads: f.downloads, progress: f.progress,
      pages: f.pages, primaryAction: f.primaryAction, secondaryAction: f.secondaryAction, cached: f.cached,
      attachments: f.attachments, title: f.title, org: f.org, deadline: deadline, daysLeft: daysLeft, deadlinePassed: passed,
      errorMessage: f.errorMessage,
    );
