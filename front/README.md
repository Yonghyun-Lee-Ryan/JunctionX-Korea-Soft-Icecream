# Solar for Bid — front

Flutter 앱. 나라장터 공고를 제안 착수 패키지로 바꾸는 파이프라인의 화면.

```bash
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000
flutter run -d macos  --dart-define=API_BASE_URL=http://localhost:3000

flutter test                                   # 위젯·컨트롤러 테스트
flutter test --dart-define=API_BASE_URL=http://localhost:3010 \
  test/live_api_test.dart                      # 🔴 진짜 백엔드에 붙는다
```

🔴 백엔드가 꺼져 있으면 `live_api_test`는 **스스로 skip**한다 — CI를 빨갛게 만들지 않는다.

## 지금 있는 화면

| 화면 | 파일 | Figma |
|---|---|---|
| ① **회사 등록** | `lib/screens/company_registration_screen.dart` | `정션2026` node `47:896` |

기획안 §8 기준으로 남은 화면은 ② 추천 목록 + 응찰 게이트 · ③ 처리중 · ④ Bid Kit이다.

## 반응형

브레이크포인트는 기기 일반론이 아니라 **이 화면의 내용 폭에서 역산**했다. `lib/theme/breakpoints.dart`.

```
우측 컬럼폭 = (W − 526) × 622/1395
  526 = 사이드바 400 + 구분선 1 + 좌우 패딩 110 + 컬럼 간격 15
```

| 모드 | 폭 | 사이드바 | 본문 |
|---|---|---|---|
| `threePane` | ≥ 1400 | 400px 전체 | 2단 (773:622) |
| `stacked` | 1200~1399 | 400px 전체 | 1단 (우측이 아래로) |
| `rail` | 600~1199 | **88px 레일** | 1단 |
| `compact` | < 600 | **Drawer** | 1단 + 헤더 세로 |

> [!WARNING]
> 🔴 **이 화면은 반응형 이전에 이미 1600px 미만에서 깨져 있었다.** 실측: 1512→39px, 1440→71px, 1366→104px 오버플로.
> 원인은 브레이크포인트 부재가 아니라 `Flexible` 누락과 고정 `height`였다. 그래서 구조부터 고쳤다 —
> `AppCard`가 `height`가 아니라 **`minHeight`**를 받고, 라벨에 `Expanded`+ellipsis가 붙었다.
> `test/overflow_test.dart`가 **18개 폭**을 훑으며 오버플로 0건을 강제한다.

🔴 **Sidebar는 폭을 줄이는 방식으로 접을 수 없다.** 안에 400px에 못 박힌 곳이 둘 있다 —
선택 알약(44+312+44)과 하단 회사 카드(50+300+50). 눌러도 **예외 없이 조용히 어긋난다.**
그래서 좁을 때는 `SidebarRail`이라는 **다른 위젯**을 그리고, compact에서는 `Drawer(width: 400)`에 원본을 그대로 넣는다.

🔴 **패키지를 쓰지 않았다.** `flutter_adaptive_scaffold`는 아이콘 크기가 항목마다 다른 이 내비를 못 담고,
`responsive_framework`는 재배치가 아니라 스케일이며, `flutter_screenutil`은 `50.5×55.5` 같은
「반올림하지 않는다」고 못 박은 Figma 값을 같이 늘린다.

## 파일 업로드

드래그앤드롭(`desktop_drop`)과 파일 선택(`file_selector`)이 **같은 타입 하나**(`XFile`)로 모인다 —
`DropItem`이 `XFile`을 상속하므로 변환 경로가 `toPickedDocs()` 하나다.

```
드롭 ─┐
      ├→ List<XFile> → toPickedDocs() → PickOutcome{docs, rejected}
선택 ─┘                                        ↓
                            CompanyRegistrationController.uploadAll()
                                               ↓
                            POST /api/docs/upload  (필드명 `file`, 1건씩)
```

### 🔴 실제로 물린 것들

| 함정 | 대응 |
|---|---|
| 웹에서 **파일이 아닌 것**(텍스트·URL)을 드롭하면 플러그인 내부 예외가 삼켜져 `onDragDone`이 **영영 안 온다** → 테두리가 켜진 채 굳는다 | `DropRegion`의 **워치독 타이머** — `dragUpdated`가 900ms 끊기면 스스로 끈다 |
| 웹에서 **폴더**를 드롭하면 터지지 않고 **0바이트를 조용히** 돌려준다 | `bytes.isEmpty`를 거르고 이유를 배너로 |
| 드롭 영역이 사실상 **브라우저 탭 전체**다. 카드 밖에 놓으면 브라우저 기본동작도 막혀 「먹통」처럼 보인다 | `DropTarget`을 카드가 아니라 **본문 전체**에 걸고, 하이라이트만 카드에 |
| macOS Finder 다중 선택 시 `.DS_Store`가 섞여 온다 | `.`으로 시작하는 이름 제외 |
| 🔴 macOS 샌드박스에 **`network.client`가 없었다** — 드롭은 되는데 업로드가 `SocketException`으로 죽는다 | 두 entitlements 파일에 추가 (`network.server`는 **아웃바운드와 무관**하다) |
| 한글 파일명이 multer에서 latin1로 깨진다 | 백엔드가 이미 되돌린다 — **프론트는 `name`을 그대로 보낸다** |

🔴 **거른 파일을 조용히 버리지 않는다.** PDF가 아니거나 빈 파일이면 배너에 이유가 뜬다.

## 구조

```
lib/
├── main.dart                    앱 진입 + MaterialApp 테마
├── theme/
│   └── tokens.dart              🔴 Figma 토큰 정본 — 화면 코드에 hex를 직접 쓰지 않는다
├── api/
│   ├── models.dart              봉투 파싱. 🔴 extraction.data는 파싱하지 않는다
│   ├── docs_api.dart            인터페이스 + PickedDoc (테스트가 가짜를 넣는다)
│   └── http_docs_api.dart       multipart. 🔴 타임아웃 120초 — 서버가 에이전트를 동기로 기다린다
├── state/
│   ├── company_registration_controller.dart   업로드 → 칸·카드 갱신
│   └── doc_slots.dart           🔴 백엔드 8갈래 ↔ 화면 5칸 매핑 + 카드 필드 추출기
├── services/
│   └── document_picker.dart     드롭·선택 → PickOutcome
├── models/
│   └── company_document.dart    DocStatus(missing·reading·done) · FieldStatus
├── widgets/
│   ├── app_chip.dart            AppChip(info/success/primary/neutral) · AppCard · FigmaDivider
│   ├── sidebar.dart             400px 좌측 내비 + 하단 회사 카드
│   ├── drop_region.dart         🔴 DropTarget + 하이라이트 워치독
│   ├── dropzone_card.dart       업로드 카드 (그리기만 — 드롭은 안 받는다)
│   ├── sidebar_rail.dart        88px 레일
│   ├── upload_failure_banner.dart  🔴 서버 문장을 그대로 렌더
│   ├── document_row.dart        「필요한 서류」 한 줄 — 상태 셋을 한 위젯이 그린다
│   └── company_card_preview.dart 우측 미리보기 + 조달청 교차 확인
└── screens/
    └── company_registration_screen.dart
```

## 디자인 토큰

`lib/theme/tokens.dart` 하나가 정본이다. Figma의 CSS 변수를 그대로 옮겼다.

| Figma | Dart | 값 |
|---|---|---|
| `--black` | `AppColors.black` | `#090909` |
| `--line1` | `AppColors.line1` | `#F3F3F3` |
| `--font-gray1` | `AppColors.fontGray1` | `#707070` |
| `--font-gray2` | `AppColors.fontGray2` | `#9D9D9D` |
| `--chip-bg1` / `--chip-typo1` | `AppColors.chipBg1` / `chipTypo1` | `#EEF3FB` / `#7C97B6` |
| (raw) | `AppColors.primary` | `#5D53FF` |

자간(`letterSpacing`)은 Figma의 `tracking` px 값을 그대로 옮겼다 — `-1.02`, `-0.6`, `-0.54`, `-0.48`, `-0.42`.

## 🔴 상태 셋이 이 화면의 요점이다

서류 한 줄과 미리보기 한 줄이 각각 세 상태를 갖는다. **값이 없다는 사실을 숨기지 않는 것**이
이 제품의 규율이라 화면에서도 그대로 드러낸다.

| 서류 (`DocStatus`) | 미리보기 (`FieldStatus`) | 표시 |
|---|---|---|
| `done` | `confirmed` | 초록 칩(docType key) / 체크 아이콘 |
| `reading` | `reading` | 보라 칩 + 진행 막대 / 시계 아이콘 + 보라 글자 |
| `missing` | `unknown` | 「업로드」 버튼 / 회색 「미확인」 칩 |

## 백엔드와 잇는 자리

**연결 완료.** `POST /api/docs/upload` 응답이 화면을 채운다.

| 백엔드 | 화면 |
|---|---|
| `docType.key` | 해당 서류 칸 → 초록 칩 `co_<key>` |
| `docType.key == null` | 🔴 **어느 칸에도 넣지 않는다** — 배너로 알린다 |
| `extraction.data` | 회사 카드 미리보기 (`doc_slots.dart`의 추출기) |
| `extraction.confidence == 'low'` | 카드 줄을 확정으로 표시하지 않는다 |
| `error.message` | 배너에 **그대로** |

### 8갈래 ↔ 5칸

디자인의 「필요한 서류」는 5칸인데 백엔드는 8갈래다. `kDocSlots`가 그 차이를 흡수한다.

| 칸 | 받는 갈래 |
|---|---|
| 사업자 등록증 | `biz_reg` |
| 실적증명서 | `performance` |
| 재무제표 | `financial` |
| 기술인력 보유현황 | `tech_staff` |
| 중소기업 확인서・지정서 | `sme_cert` · `pia_designation` |

🔴 **칸에 없는 갈래(`credit_rating`·`sw_business`)도 버리지 않는다** — 올라오면 서버가 준 label로 목록 끝에 붙는다.

🔴 **업로드 중에는 문서 종류를 아는 척하지 않는다.** 우리 API는 동기라 응답 전에는 갈래를 모른다.
그동안은 파일명만 보여 주고, 응답이 오면 제 칸으로 들어간다.

🔴 **프론트가 한국어 문장을 짓지 않는다.** 오류는 `error.message`를 그대로 렌더한다 (WBS 규율).

## 폰트

디자인은 **Pretendard**를 쓴다. 폰트 파일은 넣지 않았고, 없으면 시스템 한글 폰트로 떨어진다 —
크기·자간·굵기는 `tokens.dart`가 잡고 있어 레이아웃은 어긋나지 않는다.
넣는 방법은 `assets/fonts/README.md`.

🔴 사이드바 칩 줄이 `Row`가 아니라 `Wrap`인 이유가 이것이다 — 대체 폰트가 더 넓게 잡혀 실제로 14px 넘쳤다.

## macOS 실행 전 확인

`macos/Runner/DebugProfile.entitlements`와 `Release.entitlements` **둘 다**에 아래가 있어야 한다.

```xml
<key>com.apple.security.network.client</key><true/>
<key>com.apple.security.files.user-selected.read-only</key><true/>
```

🔴 **entitlements는 코드사인 시점에 박힌다** — hot reload/restart로 반영되지 않는다. 앱을 완전히 끄고 다시 실행할 것.

## 자산

`assets/icons/*.svg` 11개는 전부 Figma에서 내보낸 원본이다. 다시 그리지 않았다.
🔴 **크기를 하나로 통일하지 않는다** — `doc_file`은 50.5×55.5, `check`는 36×31, `nav_bids`는 40×44.5로
정사각형이 아니다. `tokens.dart`의 `AppIcons` 상수로만 참조한다.
