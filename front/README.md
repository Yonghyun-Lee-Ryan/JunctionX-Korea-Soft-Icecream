# Solar for Bid — front

The screens for the pipeline that turns notices from Korea's national procurement portal into a proposal kickoff package. Built in Flutter, with web as the default target.

## Running it

```bash
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000
```

`API_BASE_URL` is a compile-time constant read through `String.fromEnvironment`. Leave it out and it defaults to `http://localhost:3000`, and once you have built, the address cannot be changed.

To serve it as a static build:

```bash
flutter build web --release --no-web-resources-cdn \
  --dart-define=API_BASE_URL=http://localhost:3000
python3 -m http.server 8123 --directory build/web
```

Drop `--no-web-resources-cdn` and CanvasKit comes from gstatic, which means a blank screen anywhere without network. `build/` is not committed, so a fresh clone does not have it.

The macOS target is scaffolding only, and we could not verify a build in this development environment. Xcode is CommandLineTools only and there is no CocoaPods. There is no iOS target yet.

## Five screens

The first entry point is not the screen's decision. It asks `GET /api/companies/current`; if a company is stored it goes to the company card, if not it goes to company registration. When it cannot reach the server at all, it shows the sentence the server gave verbatim and leaves two ways forward, retry and company registration.

| Screen | File | What it shows |
|---|---|---|
| Company registration | `company_registration_screen.dart` | Drag documents in or pick them. The five slots for required documents and the company card preview on the right fill in from the response |
| Company card | `company_card_screen.dart` | Draws the `stats[]` and `sections[]` the server assembled, in that order. The number of tiles and the column layout are the server's call |
| Notice discovery | `notice_discovery_screen.dart` | The headline is "M of N". A badge says up front whether this is a live query or a cached list |
| Notices in preparation | `bid_list_screen.dart` | Only the ones a person marked for bid preparation remain. The nearest deadline is counted in business days |
| Bid Kit | `bid_kit_screen.dart` | File submission, requirements checklist, WBS, submission readiness. The server (`meta.kitPages`) supplies the tab layout and the button text |

The path is company registration → company card → notice discovery → bid list → Bid Kit. Attachment collection from the procurement portal does not start when a notice is marked for bid preparation; it starts from 「응찰하러 가기」 (go bid) in the bid list. It takes several minutes, so we did not hold a person at the point where they decide.

Bid Kit re-asks every 4 seconds while the envelope is `collecting`, `parsing`, or `judging`, and names the stage it is in.

There are four sidebar items: company card, notice discovery, bids, settings and API keys. Only the first three have screens; settings shows a coming-soon notice.

## Structure

```
lib/
├── main.dart          Entry point. Builds HttpDocsApi and the controllers and hangs them on MaterialApp
├── app_root.dart      First-entry branch, sidebar nav, screen switching
├── api/               docs_api (interface) · http_docs_api (implementation) · models · card_view · screening · factsheet
├── state/             company_registration_controller · doc_slots (document type to slot mapping, card field extractors)
├── services/          document_picker (drop and pick collapse into one PickOutcome)
├── models/            company_document (DocStatus · FieldStatus)
├── widgets/           AppChip/AppCard · Sidebar/SidebarRail · DropRegion/DropzoneCard · DocumentRow ·
│                      CompanyCardPreview · CardStatTile · NoticeCard · KitTableCard · 5 kit_panels
├── theme/             tokens (the canonical Figma tokens) · breakpoints
└── screens/           the five screens
```

## Where it meets the backend

`api/docs_api.dart` is the interface and `api/http_docs_api.dart` is the implementation. Tests plug `test/support/fake_api.dart` into the same interface and run without http. There are fifteen methods.

| Method | Endpoint |
|---|---|
| `upload` · `types` | `POST /api/docs/upload` · `GET /api/docs/types` |
| `currentCompany` · `saveCard` · `cardView` | `GET /api/companies/current` · `POST /api/companies/card` · `GET /api/companies/{id}/card` |
| `screening` · `setDecision` | `GET /api/companies/{id}/screening` · `PUT …/screening/{caseId}/decision` |
| `saveBid` · `bids` · `dropBid` | `POST·GET·DELETE /api/companies/{id}/bids` |
| `createCase` · `factsheet` | `POST /api/cases` · `GET /api/cases/{caseId}` |
| `uploadCaseFile` · `uploadProposal` | `POST /api/cases/{caseId}/files` · `/proposal` |
| `setCheck` | `PUT /api/cases/{caseId}/checks/{tabId}` |

The three multipart uploads time out at 330 seconds. The backend's Studio polling budget is 300 seconds, so if the frontend cuts off first it never sees the 504 the server sends. The rest are between 15 and 60 seconds. Files over 30MB are filtered out before a request goes anywhere.

A finished envelope (`status == 'done'`) is cached for 10 minutes. An envelope still being analyzed is not cached, because polling has to see the new state, and saving a check clears that case's cache.

The screen does not compose Korean sentences. Errors render the `error.message` the server gave, as it came. The frontend writes a sentence only when the connection itself fails.

### Document types and slots

The design's 「필요한 서류」 (required documents) has five slots while the backend has nine document types. `kDocSlots` in `state/doc_slots.dart` absorbs the difference.

| Slot | Types it takes |
|---|---|
| Business registration certificate (사업자 등록증) | `biz_reg` |
| Track-record statement (실적증명서) | `performance` |
| Financial statements (재무제표) | `financial` |
| Technical staff roster (기술인력 보유현황) | `tech_staff` |
| SME certificate and PIA designation (중소기업 확인서・지정서) | `sme_cert` · `pia_designation` |

A type with no slot is not thrown away. When one arrives it is appended to the end of the list under the label the server gave. During upload we do not pretend to know the type and show only the filename; when the response comes back it moves into its own slot.

## Three states

A document row and a preview row each carry three states. Not hiding the fact that a value is missing is this product's discipline, so the screen shows it as it is.

| Document | Preview | Display |
|---|---|---|
| `done` | `confirmed` | Green chip or check icon |
| `reading` | `reading` | Purple chip with a progress bar, clock icon |
| `missing` | `missing` | Upload button, gray 미확인 (unverified) chip |

## Responsive

The breakpoints were derived from this screen's content width, not from general claims about devices.

```
right column width = (W − 526) × 622/1395
  526 = sidebar 400 + divider 1 + horizontal padding 110 + column gap 15
```

| Mode | Width | Sidebar | Body |
|---|---|---|---|
| `threePane` | 1400 and up | 400px, full | 2 columns |
| `stacked` | 1200-1399 | 400px, full | 1 column |
| `rail` | 600-1199 | 88px rail | 1 column |
| `compact` | under 600 | Drawer | 1 column |

This screen was already broken below 1600px before any responsive work started. We measured 39px of overflow at 1512, 71px at 1440, and 104px at 1366. The cause was not the missing breakpoints; it was a missing `Flexible` and a fixed `height`. So we fixed the structure first. `AppCard` takes `minHeight` instead of `height`, and labels got `Expanded` and ellipsis.

The sidebar cannot be collapsed by narrowing it. Two places inside are nailed to 400px (the selection pill, the company card at the bottom), so squeezing it just knocks things quietly out of line. When space is tight we draw a different widget, `SidebarRail`, and in `compact` we put the original into a Drawer as is.

We did not use a responsive package. `flutter_adaptive_scaffold` cannot hold this nav, where the icon size differs per item; `responsive_framework` scales instead of re-laying out; and `flutter_screenutil` would stretch the Figma values we decided not to round.

## File upload

Drag and drop (`desktop_drop`) and file picking (`file_selector`) converge on one type, `XFile`. `DropItem` extends `XFile`, so there is a single conversion path, `toPickedDocs()`.

Here is what actually bit us.

| Trap | What we did |
|---|---|
| Drop something that is not a file on web and the plugin exception is swallowed: `onDragDone` never arrives and the border stays lit, frozen | A watchdog in `DropRegion`. If `dragUpdated` goes quiet for 900ms it turns itself off |
| Drop a folder on web and it does not blow up, it quietly returns 0 bytes | We filter on `bytes.isEmpty` and write the reason into the banner |
| The drop area is effectively the whole browser tab, so dropping outside the card looks broken | We put `DropTarget` on the whole body rather than the card, and give only the card the highlight |
| macOS Finder multi-select mixes in `.DS_Store` | Names starting with `.` are excluded |
| The macOS sandbox had no `network.client`, so drops worked but uploads died | Added it to both entitlements files. `network.server` has nothing to do with outbound |
| Korean filenames get mangled to latin1 in multer | The backend reverses it, so the frontend sends `name` unchanged |

Filtered files are not discarded silently. If a file is not a PDF or is empty, the reason shows up in the banner.

## Design tokens

`theme/tokens.dart` alone is canonical. Screen code never writes a hex value directly.

| Figma | Dart | Value |
|---|---|---|
| `--black` | `AppColors.black` | `#090909` |
| `--line1` | `AppColors.line1` | `#F3F3F3` |
| `--font-gray1` | `AppColors.fontGray1` | `#707070` |
| `--font-gray2` | `AppColors.fontGray2` | `#9D9D9D` |
| (raw) | `AppColors.primary` | `#5D53FF` |

Letter spacing carries Figma's tracking px values over unchanged. The 23 SVGs in `assets/icons/` are the Figma originals and were not redrawn. We did not normalize them to a single size. `doc_file` is 50.5×55.5 and `check` is 36×31, neither square. They are referenced only through `AppIcons` constants.

The design uses Pretendard, but we did not ship the font file. Without it the app falls back to the system Korean font, and since the tokens hold the sizes and letter spacing, the layout does not drift. This is why the sidebar chip row is a `Wrap` and not a `Row`. The fallback font measures wider and overflowed by 14px in practice.

## Tests

```bash
flutter test      # 104 passing, 5 skipped
flutter analyze
```

The 5 skipped tests hit a real backend. Their default address is 3010, so running them plainly skips them; you have to point them at the right address.

```bash
flutter test test/live_api_test.dart --dart-define=API_BASE_URL=http://localhost:3000
```

`test/overflow_test.dart` sweeps twenty-five screen widths and forces the overflow count to 0. Golden images are captured separately with `test/golden_capture.dart`. Its filename is not `_test.dart`, so it is not part of the `flutter test` bundle.

Tests have to run with `front/` as the working directory. `test/support/fake_api.dart` reads its fixtures by relative path.

## Where the next pieces go

Five screens fill out the v1 scope. The slots for the next version are already open.

Settings and API keys in the sidebar is where company switching and key management go in v2, once there is more than one company. Opening notice detail, and direct entry on company card rows, become the channel through which a person overwrites a server judgment. Once an overwritten value feeds the next judgment, the company card gets more accurate the more it is used. The two cross-check lines against the procurement service are not wired up yet; once they are, part of the eligibility can be confirmed before any document is uploaded.

For now the screen says outright that these places are coming. Not pretending they exist was more convincing in the demo too.

We also settled in advance how much this code changes when tabs or screens are added. Bid Kit draws whatever `meta.kitPages` the server sends, and one `KitTableCard` handles the tables on every tab, so a new tab like an issuing-agency card or a proposal draft needs nothing here. An unknown `kind` falls through to a table, so the screen does not break when the server ships ahead of it.

Electronic bid submission is the side we decided not to automate. That stretch needs a joint certificate and a security token, so a person has to do it, and it is also why we set the end of the product at what has to be submitted, by when, and where.
