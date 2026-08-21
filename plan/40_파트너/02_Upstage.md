---
type: reference
tags: [junction, 파트너, 기업해부]
created: 2026-08-21
updated: 2026-08-21
---

# Upstage (업스테이지)

> `/jx-biz` 2026-08-21 · **트랙 브리핑 없이** 회사 사업만으로 판 것 → [[00_파트너_MOC]]

## 🔴 가장 아픈 곳

**파는 단위(페이지당 1~6센트)와 메워야 할 구멍(연 300억대 영업손실)의 자릿수가 안 맞는다.**

| 연도 | 매출 | 영업손익 |
| --- | ---: | ---: |
| 2023 | 46억 | -189억 |
| 2024 | 139억 | -401억 |
| **2025** | **248억** | **-304억** |

*(보도 — 더팩트 2026-05, 사람인 재무정보 인용)*

**매출보다 손실이 크다.** 그래서 이 회사는 **「부품(API)」이 아니라 「업무 통째(워크플로)」를 팔아야 하는 자리**에 있다. 최근 12개월 움직임이 전부 그 방향이다 — Studio(2026-04 노코드 워크플로) · AI Space · Solar Pro 4(*"finishes the job"*) · Solar Open 2(온프레미스).

🔴 **그런데 "업무가 통째로 끝난다"의 증거로 지금 내밀 수 있는 게 벤치마크 점수뿐이다.** 회사 스스로 남긴 진단이 그 빈칸을 가리킨다:

> *"individual tool calls succeed but end-to-end workflows fail to complete"* — Solar Pro 3 블로그

**이 문장이 이 트랙의 과녁일 가능성이 크다.**
⚠️ 매출 구성비·부문별 손익은 비공개다. **연간 총액 3개만으로 읽은 방향이다.**

## A. 무엇으로 돈을 버는가 — **네 층**

| 층 | 단위 | 값 (회사 가격표, VAT 별도) |
| --- | --- | --- |
| **건당** | 페이지당 | Document Parse **$0.01**(Enhanced $0.03) · OCR $0.0015 · Classify $0.004 · **Information Extract $0.04**(Enhanced $0.06) |
| **토큰당** | 1M 토큰 | Solar Pro 4 입력 **$0.30** / 출력 **$1.20** |
| 선불 커밋 | 월·연 | Explore $100+ / Build $500+ / Scale $5,000+ |
| 라이선스 | 엔터프라이즈 | 온프레미스·프라이빗 클라우드 |

🔴 **Embed 2 무료가 2026-08-23에 끝난다 — 대회 마지막 날이다.**

**고객은 규제산업 기업.** 금융권 비중 **약 70%**(보도). 삼성생명·K뱅크(KT 경유) 등. HIPAA·ISO 27001·SOC 2. **참가자 234명은 이 회사의 구매자가 아니다.**

## B. 이 과제로 무엇이 생기나 → **아직 모르는 것을 알게 된다(앎↑)**

근거 셋 — ① 11일 전 Solar Pro 4를 내놨는데 사례 목록이 아직 벤치마크뿐 ② **자기 해커톤을 이미 운영 중**(Global AI Week, 주제 "AGI for Work", API 필수, $200 크레딧) ③ 정부 독자 AI 모델 평가에 **「사용자 평가 25점」이 새로 들어갔고 연말에 3팀→2팀으로 자른다**.

*(매출↑은 2순위 — 셀프서브 퍼널이 있지만 매출 70%가 금융 엔터프라이즈·SI 경유라 경로가 느리다)*

## 🔴 C. 이미 파는 것 — 만들면 즉사

**「문서를 넣으면 구조화해서 뽑고, 사람이 검수하고, 워크플로로 엮고, 인용 달아 답하는 것」은 이미 다 있다. 노코드 빌더까지.**

| 완전히 같다 | |
| --- | --- |
| **Document Parse / OCR / Classify / Information Extract** | 문서 → 구조화 데이터 |
| 🔴 **Upstage Studio** (2026-04 런칭) | **노코드 워크플로 빌더** — 드래그앤드롭, 템플릿, **human-in-the-loop 검수**, 에이전트별 API |
| 🔴 **AI Space** | 문서 Q&A + **문장 단위 인용·시각 하이라이트**, 요약, 버전 비교, 컴플라이언스 체크 |
| **File Search (Beta)** | 저장·처리·검색 **무료** |
| **Solar Pro 4 / Embed** | 에이전트·장문(512K)·툴 사용 |

**회사 밖**: 네이버 클로바 OCR(한국어 97~99%) · Google Document AI · Azure Document Intelligence · Amazon Textract · **Reducto · LlamaParse · Unstructured · Mistral OCR**.

⚠️ **자사 성능 근거는 DP-Bench인데 그건 업스테이지가 만든 벤치마크다.** 경쟁사를 이름 대며 부족하다고 적은 문장은 없다.

## D. 건드리면 안 되는 것

**🔴 ① 페이지 수·토큰 수를 줄여주는 방향** — **페이지당 과금**이다. "덜 파싱해도 되게" 만드는 건 파트너 매출을 직접 깎는다. 게다가 비용 최적화 레버는 **이미 회사가 쥐고 있다**(가격표의 Auto mode).

**🔴 ② Solar를 다른 LLM으로 갈아끼우기 쉽게 보여주는 것** — 이미 OpenRouter·OpenAI 호환 API로 나가 있다. 교체 용이성을 내세우면 **자기 락인을 스스로 깎아 보여주는 셈**이다.

**③ 실제 금융·보험 고객 데이터 전제** — 반출이 안 된다. 금융 망분리(전자금융감독규정 제15조). 쓸 수 있는 건 **공개·합성 문서뿐**이다.

**④ Solar License 표기 의무** — 파생 모델은 이름에 **"Solar" 접두사** + **"Built with Solar"** 표기.

**🔴 ⑤ 두 가지는 정치적으로 민감하다**
- **모델 출처 의혹** — 2026-01 Solar Open 100B의 중국 GLM 파생 의혹 제기 → 회사가 다음 날 **공개 검증회**를 열어 학습 로그 전면 공개 → 제기자 공개 사과. **"Solar가 정말 자체 모델인가"를 건드리지 마라**
- **공적자금 특혜 논란** — 국민성장펀드 5,600억을 두고 "만년 적자 특혜" 보도. **부스에서 재무를 들이대지 마라**

**⑥ 이미 한 것** — 노코드 문서 워크플로 빌더(Studio) · 문서 Q&A+인용(AI Space). *아숙업(AskUp)은 2023년 160만 이용자였으나 현재 제품 라인업에 없다 — **종료 발표는 못 찾았다. 단정 금지.***

## E. 워크숍 첫 질문

1. 🔴 *"지금 **Studio와 AI Space에서 이미 되는 게 어디까지**인가요? 저희가 그걸 다시 만들면 감점이겠죠?"*
2. *"**Document Parse랑 Information Extract로 아직 잘 안 되는** 문서 종류가 뭔가요?"*
3. *"고객이 Studio를 쓰다가 **'여기서부터는 못 하겠다'고 멈추는 지점**이 어디인가요?"*
4. *"솔라 프로 4가 열흘 전에 나왔는데, 이 트랙이 **그 모델의 어떤 부분을 확인하려는 자리**인가요?"*
5. *"페이지당 과금 구조인데, **처리 페이지 수를 줄이는 방향**은 어떻게 보이시나요?"*

## 출처

[가격표](https://www.upstage.ai/pricing/api) · [Solar Pro 4](https://www.upstage.ai/blog/en/solar-pro-4) · [Solar Pro 3 — 진단 문장](https://www.upstage.ai/blog/en/solar-pro-3-0323) · [Studio 런칭](https://www.prnewswire.com/news-releases/upstage-ai-launches-ai-powered-agentic-workflow-solution-for-document-heavy-processes-302730567.html) · [AI Space](https://www.upstage.ai/products/ai-space) · [금융권 70% 인터뷰](https://byline.network/2024/05/29-273/) · [재무·펀드 보도](https://news.tf.co.kr/read/economy/2320265.htm) · [자체 해커톤](https://global-ai-week-upstage.devpost.com/)
