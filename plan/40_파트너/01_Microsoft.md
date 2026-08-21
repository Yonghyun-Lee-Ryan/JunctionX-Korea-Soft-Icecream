---
type: reference
tags: [junction, 파트너, 기업해부]
created: 2026-08-21
updated: 2026-08-21
---

# Microsoft (Azure AI)

> `/jx-biz` 2026-08-21 · **트랙 브리핑 없이** 회사 사업만으로 판 것 → [[00_파트너_MOC]]

## 🔴 가장 아픈 곳

**에이전트를 만드는 층에서는 돈을 한 푼도 안 받는데, 그 층을 3년 동안 여섯 번 자기 손으로 갈아엎었다.**

회사 가격표 원문: *"There is no additional charge for creating or running Foundry-native agents using prompts and workflows."*

⚠️ **"아프다"는 우리 해석이다.** Microsoft가 이 문제를 공개적으로 인정한 문서는 없다.

## A. 무엇으로 돈을 버는가

**에이전트를 만드는 층은 공짜, 에이전트가 돌 때 소비하는 것에서 받는다.**

| 받는 것 | 단위 |
| --- | --- |
| 모델 토큰 | 1M 입력 / 1M 출력 |
| Hosted agent | 컨테이너 **컴퓨트 시간당** |
| 내장 툴 | File Search=GB/일 · Code Interpreter=세션당 · Web Search=1,000건당 |
| 좌석 구독 | M365 Copilot **30M+ 유료 좌석** · GitHub Copilot |

**고객은 압도적으로 기업(B2B).** 세 부문 중 개인 대상(More Personal Computing)이 **유일하게 역성장(−4%)**했고 Intelligent Cloud만 **+32%**다. **성장 엔진이 Azure 하나다.**

🔴 **회사가 「토큰」을 실적 지표로 쓴다.** Nadella(FY26 Q4): *"turn tokens into business results"*, *"advancing the frontier on the cost-to-outcome curve"*

## B. 이 과제로 무엇이 생기나 → **매출↑**

단 **볼륨이 아니라 「토큰당 성과 증명」** 쪽이다.

에이전트 층이 무료라 라이선스 판매가 목적일 수 없고, 개발자 확보에 이미 돈을 쓴다(Startups Founders Hub Azure 크레딧 최대 $150K). **크레딧을 먼저 주고 소비로 회수하는 구조다.**

⚠️ **반례 — 같이 읽어야 한다.** 보도에 **공급 부족(supply-demand imbalance)**이 언급된다. 수요가 아니라 **용량이 병목**이면, 원하는 건 토큰 총량이 아니라 **토큰당 성과를 증명하는 사례**다.

## 🔴 C. 이미 파는 것 — 만들면 즉사

**에이전트 스택의 거의 모든 층이 GA다.**

| 완전히 같다 | |
| --- | --- |
| **Foundry Agent Service** | 에이전트 호스팅 런타임 |
| **Microsoft Agent Framework 1.0** | 오케스트레이션 SDK (2026-04 GA, SK+AutoGen 흡수) |
| **Multi-Agent Workflows** | *"agents can call other agents as tools"* |
| **Foundry IQ** | 관리형 RAG |
| **Copilot Studio** | 로우코드 에이전트 빌더 |
| **Agent 365** (2026-05 GA) | 에이전트 통제면·레지스트리 |
| **Entra Agent ID** | 에이전트 신원·권한 |
| **Foundry Observability** | 에이전트 추적·평가 |
| **Foundry Models** | 11,000개+ 모델 카탈로그 |

**공백은 「층」이 아니라 「그 층 위의 특정 업무」다.** 이게 C가 주는 유일한 실용 정보다.

🔴 **LangGraph 연동이 결정적 신호다.** 회사 발표: *"Teams building multi-agent workflows in LangGraph can now connect directly to the new Foundry Agent Service"* → **프레임워크 전쟁을 이기려는 게 아니라, 어느 프레임워크를 쓰든 자기 런타임에서 돌게 만들려 한다.**

## D. 건드리면 안 되는 것

**① 계약이 금지한 것** — Azure OpenAI는 **Limited Access 서비스**다. 콘텐츠 필터 수정은 관리 고객·파트너로 제한되고, Code of Conduct가 *"meaningful human oversight"*를 의무화한다.
→ **"AI인 걸 숨기는 에이전트" · "필터를 끄고 돌리는 데모" · "사람 개입 없는 자율 실행"은 계약서로 금지된 영역이다.**
→ **EU AI Act Article 50이 2026-08-02 발효**됐다(챗봇 고지·AI 생성물 표시).

**② 거버넌스 밖에서 도는 에이전트** — Microsoft가 *"agent sprawl"*을 적으로 규정하고 Agent 365·Entra Agent ID를 그 문제 팔려고 만들었다.

**③ 모델 성능 비교·우열 주장** — Foundry는 11,000개 모델을 파는 **중립 마켓플레이스**다. 특정 모델을 깎으면 파트너사(Anthropic·OpenAI·Mistral)를 동시에 건드린다.

**🔴 ④ 이미 여섯 번 죽인 자리** — Power Virtual Agents(2023-11) → Bot Framework SDK LTS(2025-12) → Semantic Kernel·AutoGen 흡수(2026-04) → **Assistants API 은퇴 2026-08-26(닷새 뒤)** → Foundry Agents classic(2027-03) → prompt flow(2027-04).
**전부 「에이전트를 만드는 층」이다.** 그 자리를 다시 채우는 방향이 가장 시큰둥한 답이다.
⚠️ 회사는 이걸 "실패"가 아니라 **통합(consolidation)**으로 설명한다.

## E. 워크숍 첫 질문

1. 🔴 *"지금 Foundry Agent Service·Copilot Studio·Agent 365로 이미 되는 것 중에, **참가팀들이 모르고 다시 만드는 게** 뭔가요?"*
2. *"반대로 그 제품들로 **아직 안 되는 것** 중에 고객이 계속 물어보는 게 있나요?"*
3. *"이 트랙에서 좋은 결과가 나오면 Microsoft 쪽에는 **구체적으로 무엇이 남나요**? 새 Azure 사용량인가요, 저희 같은 팀이 무엇을 만드는지 보는 쪽인가요?"*
4. *"Azure 크레딧이 제공되나요? **팀당 얼마이고 언제 발급**되나요?"* / *"Azure를 쓰는 게 **필수인가요 선택인가요**?"*

## 모르는 것 — 비운 칸

Foundry·Copilot Studio의 **매출 기여도** · Foundry **전체 고객 수** · Azure AI 부문 **마진** · **한국 시장 매출** · Microsoft가 **해커톤을 후원하는 공식 이유**(문서 없음).

## 출처

[FY26 Q4 실적](https://www.microsoft.com/en-us/investor/earnings/fy-2026-q4/press-release-webcast) · [Foundry Agent Service 가격](https://azure.microsoft.com/en-us/pricing/details/foundry-agent-service/) · [Build 2026 Foundry](https://devblogs.microsoft.com/foundry/whats-new-in-microsoft-foundry-build-2026/) · [Agent 365 GA](https://www.microsoft.com/en-us/security/blog/2026/05/01/microsoft-agent-365-now-generally-available-expands-capabilities-and-integrations/) · [모델 은퇴 일정](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirements) · [Limited Access](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/limited-access)
