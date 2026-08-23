# Solar for Bid — front

나라장터 공고를 제안 착수 패키지로 바꾸는 파이프라인의 화면입니다. Flutter 로 만들었고 웹이 기본 타깃입니다.

## 실행

```bash
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000
```

`API_BASE_URL` 은 `String.fromEnvironment` 로 읽는 컴파일 타임 상수입니다. 넘기지 않으면 `http://localhost:3000` 이 기본값이고, 한 번 빌드한 뒤에는 주소를 바꿀 수 없습니다.

정적 산출물로 띄우려면 이렇게 합니다.

```bash
flutter build web --release --no-web-resources-cdn \
  --dart-define=API_BASE_URL=http://localhost:3000
python3 -m http.server 8123 --directory build/web
```

`--no-web-resources-cdn` 을 빼면 CanvasKit 을 gstatic 에서 받아오므로, 네트워크가 없는 자리에서는 흰 화면이 됩니다. `build/` 는 커밋하지 않으니 클론 직후에는 없습니다.

macOS 타깃은 스캐폴드만 있고 이 개발 환경에서는 빌드를 확인하지 못했습니다. Xcode 가 CommandLineTools 뿐이고 CocoaPods 도 없습니다. iOS 타깃은 아직 만들지 않았습니다.

## 화면 다섯 장

첫 진입은 화면이 판단하지 않습니다. `GET /api/companies/current` 에 물어 저장된 회사가 있으면 회사 카드로, 없으면 회사 등록으로 갑니다. 서버에 못 붙으면 서버가 준 문장을 그대로 띄우고 다시 시도와 회사 등록 두 길을 남깁니다.

| 화면 | 파일 | 보여 주는 것 |
|---|---|---|
| 회사 등록 | `company_registration_screen.dart` | 서류를 끌어다 놓거나 골라 올립니다. 필요한 서류 다섯 칸과 오른쪽 회사 카드 미리보기가 응답으로 채워집니다 |
| 회사 카드 | `company_card_screen.dart` | 서버가 조립한 `stats[]` 와 `sections[]` 를 순서대로 그립니다. 타일 수도 열 배치도 서버가 정합니다 |
| 공고 탐색 | `notice_discovery_screen.dart` | 「N건 중 M건」 분모가 헤드라인입니다. 실시간 조회인지 캐시 목록인지 배지로 먼저 밝힙니다 |
| 응찰 준비중인 공고 | `bid_list_screen.dart` | 사람이 응찰 준비를 찍은 건만 남습니다. 가장 급한 마감을 영업일로 셉니다 |
| Bid Kit | `bid_kit_screen.dart` | 파일 제출, 요구사항 체크리스트, WBS, 제출 준비. 탭 구성과 버튼 문구를 서버(`meta.kitPages`)가 줍니다 |

이동은 회사 등록 → 회사 카드 → 공고 탐색 → 응찰 목록 → Bid Kit 순입니다. 나라장터 첨부 수집은 응찰 준비를 찍을 때가 아니라 응찰 목록의 「응찰하러 가기」에서 시작합니다. 수 분이 걸리는 일이라 결정하는 자리에서 사람을 붙잡아 두지 않았습니다.

Bid Kit 은 봉투가 `collecting`·`parsing`·`judging` 인 동안 4초마다 다시 물으며 지금 어느 단계인지 말합니다.

사이드바 항목은 넷입니다. 회사 카드, 공고 탐색, 응찰 건, 설정・API 키. 앞의 셋만 화면이 있고 설정은 준비 중 안내가 뜹니다.

## 구조

```
lib/
├── main.dart          진입점. HttpDocsApi 와 컨트롤러를 만들어 MaterialApp 에 겁니다
├── app_root.dart      첫 진입 분기, 사이드바 내비, 화면 전환
├── api/               docs_api(인터페이스) · http_docs_api(구현) · models · card_view · screening · factsheet
├── state/             company_registration_controller · doc_slots(갈래와 칸 매핑, 카드 필드 추출기)
├── services/          document_picker(드롭과 선택을 PickOutcome 하나로)
├── models/            company_document(DocStatus · FieldStatus)
├── widgets/           AppChip/AppCard · Sidebar/SidebarRail · DropRegion/DropzoneCard · DocumentRow ·
│                      CompanyCardPreview · CardStatTile · NoticeCard · KitTableCard · kit_panels 5종
├── theme/             tokens(Figma 토큰 정본) · breakpoints
└── screens/           화면 다섯 장
```

## 백엔드와 잇는 자리

`api/docs_api.dart` 가 인터페이스이고 `api/http_docs_api.dart` 가 구현입니다. 테스트는 같은 인터페이스에 `test/support/fake_api.dart` 를 끼워 http 없이 돕니다. 메서드는 열다섯 개입니다.

| 메서드 | 엔드포인트 |
|---|---|
| `upload` · `types` | `POST /api/docs/upload` · `GET /api/docs/types` |
| `currentCompany` · `saveCard` · `cardView` | `GET /api/companies/current` · `POST /api/companies/card` · `GET /api/companies/{id}/card` |
| `screening` · `setDecision` | `GET /api/companies/{id}/screening` · `PUT …/screening/{caseId}/decision` |
| `saveBid` · `bids` · `dropBid` | `POST·GET·DELETE /api/companies/{id}/bids` |
| `createCase` · `factsheet` | `POST /api/cases` · `GET /api/cases/{caseId}` |
| `uploadCaseFile` · `uploadProposal` | `POST /api/cases/{caseId}/files` · `/proposal` |
| `setCheck` | `PUT /api/cases/{caseId}/checks/{tabId}` |

멀티파트 업로드 셋의 타임아웃은 330초입니다. 백엔드의 Studio 폴링 예산이 300초라, 프론트가 먼저 끊으면 서버가 주는 504 를 영영 못 봅니다. 나머지는 15초에서 60초 사이입니다. 30MB 를 넘는 파일은 요청을 보내지 않고 바로 걸러 냅니다.

끝난 봉투(`status == 'done'`)는 10분 동안 캐시합니다. 분석 중인 봉투는 폴링이 새 상태를 봐야 하므로 캐시하지 않고, 체크를 저장하면 그 케이스의 캐시를 비웁니다.

화면이 한국어 문장을 짓지 않습니다. 오류는 서버가 준 `error.message` 를 그대로 렌더합니다. 연결 자체가 안 될 때만 프론트가 문장을 만듭니다.

### 갈래와 칸

디자인의 「필요한 서류」는 다섯 칸인데 백엔드 갈래는 아홉입니다. `state/doc_slots.dart` 의 `kDocSlots` 가 그 차이를 흡수합니다.

| 칸 | 받는 갈래 |
|---|---|
| 사업자 등록증 | `biz_reg` |
| 실적증명서 | `performance` |
| 재무제표 | `financial` |
| 기술인력 보유현황 | `tech_staff` |
| 중소기업 확인서・지정서 | `sme_cert` · `pia_designation` |

칸에 없는 갈래도 버리지 않습니다. 올라오면 서버가 준 label 로 목록 끝에 붙습니다. 업로드 중에는 종류를 아는 척하지 않고 파일명만 보여 주다가, 응답이 오면 제 칸으로 들어갑니다.

## 상태 셋

서류 한 줄과 미리보기 한 줄이 각각 세 상태를 갖습니다. 값이 없다는 사실을 숨기지 않는 것이 이 제품의 규율이라 화면에서도 그대로 드러냅니다.

| 서류 | 미리보기 | 표시 |
|---|---|---|
| `done` | `confirmed` | 초록 칩 또는 체크 아이콘 |
| `reading` | `reading` | 보라 칩과 진행 막대, 시계 아이콘 |
| `missing` | `missing` | 업로드 버튼, 회색 미확인 칩 |

## 반응형

브레이크포인트는 기기 일반론이 아니라 이 화면의 내용 폭에서 역산했습니다.

```
우측 컬럼폭 = (W − 526) × 622/1395
  526 = 사이드바 400 + 구분선 1 + 좌우 패딩 110 + 컬럼 간격 15
```

| 모드 | 폭 | 사이드바 | 본문 |
|---|---|---|---|
| `threePane` | 1400 이상 | 400px 전체 | 2단 |
| `stacked` | 1200~1399 | 400px 전체 | 1단 |
| `rail` | 600~1199 | 88px 레일 | 1단 |
| `compact` | 600 미만 | Drawer | 1단 |

이 화면은 반응형을 넣기 전에 이미 1600px 미만에서 깨져 있었습니다. 실측으로 1512에서 39px, 1440에서 71px, 1366에서 104px 넘쳤습니다. 원인은 브레이크포인트가 없어서가 아니라 `Flexible` 이 빠지고 `height` 가 고정돼 있어서였습니다. 그래서 구조부터 고쳤습니다. `AppCard` 가 `height` 대신 `minHeight` 를 받고, 라벨에 `Expanded` 와 ellipsis 가 붙었습니다.

사이드바는 폭을 줄이는 방식으로 접을 수 없습니다. 안에 400px 에 못 박힌 자리가 둘 있어서(선택 알약, 하단 회사 카드) 눌러도 조용히 어긋납니다. 그래서 좁을 때는 `SidebarRail` 이라는 다른 위젯을 그리고, `compact` 에서는 Drawer 에 원본을 그대로 넣습니다.

반응형 패키지는 쓰지 않았습니다. `flutter_adaptive_scaffold` 는 아이콘 크기가 항목마다 다른 이 내비를 담지 못하고, `responsive_framework` 는 재배치가 아니라 스케일이며, `flutter_screenutil` 은 반올림하지 않기로 한 Figma 값까지 같이 늘립니다.

## 파일 업로드

드래그앤드롭(`desktop_drop`)과 파일 선택(`file_selector`)이 `XFile` 한 타입으로 모입니다. `DropItem` 이 `XFile` 을 상속하므로 변환 경로가 `toPickedDocs()` 하나입니다.

여기서 실제로 물린 것들입니다.

| 함정 | 대응 |
|---|---|
| 웹에서 파일이 아닌 것을 드롭하면 플러그인 예외가 삼켜져 `onDragDone` 이 오지 않고 테두리가 켜진 채 굳습니다 | `DropRegion` 의 워치독. `dragUpdated` 가 900ms 끊기면 스스로 끕니다 |
| 웹에서 폴더를 드롭하면 터지지 않고 0바이트를 조용히 돌려줍니다 | `bytes.isEmpty` 를 거르고 이유를 배너에 적습니다 |
| 드롭 영역이 사실상 브라우저 탭 전체라, 카드 밖에 놓으면 먹통처럼 보입니다 | `DropTarget` 을 카드가 아니라 본문 전체에 걸고 하이라이트만 카드에 줍니다 |
| macOS Finder 다중 선택에 `.DS_Store` 가 섞입니다 | 이름이 `.` 으로 시작하면 제외합니다 |
| macOS 샌드박스에 `network.client` 가 없어 드롭은 되는데 업로드가 죽었습니다 | entitlements 두 파일에 추가했습니다. `network.server` 는 아웃바운드와 무관합니다 |
| 한글 파일명이 multer 에서 latin1 로 깨집니다 | 백엔드가 되돌리므로 프론트는 `name` 을 그대로 보냅니다 |

거른 파일을 조용히 버리지 않습니다. PDF 가 아니거나 빈 파일이면 배너에 이유가 뜹니다.

## 디자인 토큰

`theme/tokens.dart` 하나가 정본입니다. 화면 코드에 hex 를 직접 쓰지 않습니다.

| Figma | Dart | 값 |
|---|---|---|
| `--black` | `AppColors.black` | `#090909` |
| `--line1` | `AppColors.line1` | `#F3F3F3` |
| `--font-gray1` | `AppColors.fontGray1` | `#707070` |
| `--font-gray2` | `AppColors.fontGray2` | `#9D9D9D` |
| (raw) | `AppColors.primary` | `#5D53FF` |

자간은 Figma 의 tracking px 값을 그대로 옮겼습니다. `assets/icons/` 의 SVG 23개도 Figma 원본이고 다시 그리지 않았습니다. 크기를 하나로 통일하지 않았습니다. `doc_file` 은 50.5×55.5, `check` 는 36×31 로 정사각형이 아닙니다. `AppIcons` 상수로만 참조합니다.

디자인은 Pretendard 를 쓰는데 폰트 파일은 넣지 않았습니다. 없으면 시스템 한글 폰트로 떨어지고, 크기와 자간은 토큰이 잡고 있어 레이아웃은 어긋나지 않습니다. 사이드바 칩 줄이 `Row` 가 아니라 `Wrap` 인 이유가 이것입니다. 대체 폰트가 더 넓게 잡혀 실제로 14px 넘쳤습니다.

## 테스트

```bash
flutter test      # 104건 통과, 5건 skip
flutter analyze
```

skip 되는 5건은 실제 백엔드에 붙는 테스트입니다. 기본 주소가 3010 이라 그냥 돌리면 건너뛰므로, 주소를 맞춰 줘야 붙습니다.

```bash
flutter test test/live_api_test.dart --dart-define=API_BASE_URL=http://localhost:3000
```

`test/overflow_test.dart` 가 화면 폭 스물다섯 개를 훑으며 오버플로 0건을 강제합니다. 골든 이미지는 `test/golden_capture.dart` 로 따로 뜹니다. 파일 이름이 `_test.dart` 가 아니라 `flutter test` 묶음에는 들어가지 않습니다.

테스트는 `front/` 를 작업 디렉터리로 두고 돌려야 합니다. `test/support/fake_api.dart` 가 픽스처를 상대경로로 읽습니다.

## 다음에 붙일 자리

화면 다섯 장으로 v1 범위를 채웠습니다. 다음 버전이 들어올 자리는 이미 열어 두었습니다.

사이드바의 설정・API 키는 회사가 여러 곳이 되는 v2 에서 회사 전환과 키 관리가 들어갈 자리입니다. 공고 상세 열기와 회사 카드 행의 직접 입력은 사람이 서버 판정을 덮어쓰는 통로가 됩니다. 덮어쓴 값이 다음 판정의 입력이 되면, 쓸수록 회사 카드가 정확해집니다. 조달청 교차 확인 두 줄은 지금 미연동인데 붙고 나면 서류를 올리기 전에도 자격 일부를 확인할 수 있습니다.

지금은 이 자리들이 준비 중이라고 화면이 직접 말합니다. 있는 척하지 않는 편이 데모에서도 더 설득력이 있었습니다.

탭이나 화면이 늘어날 때 이 코드가 얼마나 바뀌는지도 미리 정해 두었습니다. Bid Kit 은 서버가 준 `meta.kitPages` 대로 그리고 표는 `KitTableCard` 한 벌이 모든 탭을 처리하므로, 발주기관 카드나 제안서 초안 같은 탭이 새로 와도 여기서는 손댈 것이 없습니다. 모르는 `kind` 가 오면 표로 떨어지도록 해 두어서, 서버가 먼저 나가도 화면이 깨지지 않습니다.

전자입찰 투찰은 자동화하지 않기로 한 쪽입니다. 공동인증서와 보안토큰이 필요한 구간이라 사람이 직접 해야 하고, 제품의 끝을 무엇을 언제 어디에 내야 하는지로 잡은 것도 그 때문입니다.
