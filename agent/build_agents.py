#!/usr/bin/env python3
"""Solar for Bid — Upstage Studio 에이전트 설정 생성기.

🔴 JSON을 손으로 고치지 않는다. 이 스크립트를 고쳐서 다시 뽑는다.

    python3 agent/build_agents.py

Studio의 「에이전트 설정 일괄 가져오기」가 여기서 나온 JSON을 그대로 받는다.
2026-08-22 실측 — 임포트는 왕복이 정확하다(추출 스키마의 description까지 보존).
다만 Studio가 손대는 것이 셋 있다:

  1. `agent_name`을 무시하고 「Agent」로 만든다 → 임포트 후 이름을 따로 고친다
  2. `outputFormats`에 "text"를, `base64Encoding`에 "figure"를 더한다
  3. `confidenceThreshold`를 버린다(null)

그래서 아래 PARSE는 Studio가 정규화한 값을 그대로 쓰고 confidenceThreshold는 넣지 않는다.
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
ANNOUNCEMENT_DIR = ROOT / "announcement_agents"

# 🔴 Studio가 임포트 후 실제로 갖는 값. 우리가 [] 로 줘도 이렇게 정규화된다
PARSE = {
    "modelName": "document-parse",
    "mode": "auto",
    "ocrMode": "auto",
    "lang": "",
    "chartRecognition": False,
    "coordinates": False,
    "mergeMultipageTables": True,
    "outputFormats": ["html", "text"],
    "base64Encoding": ["figure"],
}

# 🔴 Studio는 분류 노드를 Classify-1로 이름 붙인다. 엣지가 이 이름을 참조한다
CLASSIFY_NODE = "Classify-1"


def draft(agent_config):
    return {
        "kind": "studio.agent-config-draft",
        "exportedAt": "2026-08-22T00:00:00.000Z",
        "exportedFrom": {},
        "agentConfig": agent_config,
    }


def write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  {path.relative_to(ROOT.parent)}  ({path.stat().st_size:,} bytes)")


def s(desc):
    """문자열 필드."""
    return {"type": "string", "description": desc}


def i(desc):
    return {"type": "integer", "description": desc}


def arr(desc, props):
    return {
        "type": "array",
        "items": {"type": "object", "properties": props},
        "description": desc,
    }


def layout(root_fields=(), tables=()):
    """Studio 스키마 편집기의 열 배치. (표 키, [열 이름]) 목록을 받는다."""
    columns = [{"name": name, "source": "root"} for name in root_fields]
    for table_key, names in tables:
        columns.extend(
            {"name": name, "source": "group_table", "groupTableKey": table_key} for name in names
        )
    return {"version": 1, "columns": columns}


def extract_schema(name, properties, schema_layout, user_prompt):
    return {
        "type": "json_schema",
        "json_schema": {"name": name, "schema": {"type": "object", "properties": properties}},
        "schemaLayout": schema_layout,
        "mode": "standard",
        "modelName": "",
        "nodeMode": "extract",
        "userSystemPrompt": user_prompt,
    }


def classify_extract_agent(agent_name, branches, classify_prompt, schemas, mapping):
    """Parse → Classify → Extract(갈래별) 파이프라인."""
    edges = [{"id": "e0", "source": {"nodeType": "parse"},
              "target": {"nodeType": "classify", "name": CLASSIFY_NODE}}]
    for idx, (branch, schema_name) in enumerate(mapping.items(), start=1):
        edges.append({
            "id": f"e{idx}",
            "source": {"nodeType": "classify", "name": CLASSIFY_NODE},
            "target": {"nodeType": "extract", "name": schema_name},
            "condition": {"conditionName": branch},
        })
    return {
        "agent_name": agent_name,
        "pipelineType": "classify-extract",
        "documentParseConfiguration": PARSE,
        "documentClassifyConfiguration": {
            "schema": {
                "type": "json_schema",
                "json_schema": {
                    "name": "document-classify",
                    "schema": {
                        "type": "string",
                        "oneOf": [{"const": c, "description": d} for c, d in branches],
                    },
                },
            },
            "modelName": "",
            "userSystemPrompt": classify_prompt,
        },
        "informationExtractConfiguration": {
            "modelName": "",
            "schemas": schemas,
            "categorySchemaMapping": mapping,
            "location": False,
            "manyRows": True,
            "manyRowsThreshold": 20,
            "manyRowsMaxRowsPerBatch": 40,
            "manyRowsMaxConcurrent": 5,
        },
        "pipelineEdges": edges,
    }


def instruct_agent(agent_name, node_name, prompt):
    """Parse → Instruct 단일 노드 파이프라인."""
    return {
        "agent_name": agent_name,
        "pipelineType": "instruct",
        "documentParseConfiguration": PARSE,
        "instructConfiguration": {
            "nodes": [{"name": node_name, "modelName": "solar-pro3", "prompt": prompt}],
            "connectionMapping": {node_name: {"targetType": "parse"}},
        },
        "pipelineEdges": [{
            "id": "e0",
            "source": {"nodeType": "parse"},
            "target": {"nodeType": "instruct", "name": node_name},
        }],
    }


# ─────────────────────────────────────────────────────────────────────────────
# 공고 해부 5종이 공유하는 분류 갈래
# ─────────────────────────────────────────────────────────────────────────────

# 🔴 2026-08-23 실측으로 더한 갈래 — SERVICE_OPERATION_RFP
#
#   나라장터 R25BK00645031(체육진흥투표권 온라인발매 결제서비스(PG) 대행 용역)의 제안요청서를 넣었더니
#   01·02·03·05 의 Classify 가 전부 OTHER_REVIEW_REQUIRED 로 보내 Extract 가 안 돌았다(04만 BUILD 로 통과).
#   갈래가 「직접 구축」과 「PMO/PIA」 둘뿐이라 결제대행·운영·유지관리·컨설팅 같은 **용역 RFP** 가 설 자리가 없었다.
#   용역 RFP 도 사업 범위·요구사항·자격·평가를 같은 틀로 갖고 있으므로 구축용 Extract 노드를 그대로 태운다.
ANNOUNCEMENT_BRANCHES = [
    ("BUILD_IMPLEMENTATION_RFP",
     "현재 입찰 대상이 정보시스템·앱·웹·인프라·플랫폼·DB·보안 등을 직접 개발·구축·도입하는 "
     "사업인 제안요청서 또는 과업문서"),
    ("PMO_PIA_SERVICE_SPEC",
     "현재 입찰 대상이 다른 구축사업을 관리·감독하는 PMO, 전자정부사업관리 또는 개인정보 "
     "영향평가 용역인 과업설명서·제안요청서"),
    ("SERVICE_OPERATION_RFP",
     "현재 입찰 대상이 시스템 구축도 PMO·PIA도 아닌 용역 — 결제·발매 대행, 서비스 운영·위탁, "
     "유지관리, 콜센터, 데이터·콘텐츠 제작, 컨설팅·연구, 교육, 홍보 등 — 의 제안요청서·과업내용서·"
     "과업지시서. 사업 범위와 요구사항(또는 과업 내용) 표가 있으면 여기다"),
    ("OTHER_REVIEW_REQUIRED",
     "세 유형에 명확히 해당하지 않거나, 제안요청서·과업문서가 아니거나(입찰공고서·계약특수조건·"
     "서식·협정서), 표지·사업범위·요구사항이 불충분한 문서"),
]

ANNOUNCEMENT_CLASSIFY_PROMPT = (
    "표지의 현재 사업명, 현재 계약의 주요 범위, 요구사항 접두어, 입찰참가자격 순으로 판단한다. "
    "PMO·PIA 문서에 포함된 대상 구축사업 설명을 현재 계약으로 오인하지 않는다. "
    "🔴 「제안요청서」·「과업내용서」·「과업지시서」 표제가 있고 사업 범위와 요구사항(과업 내용)이 적혀 있으면 "
    "OTHER_REVIEW_REQUIRED가 아니다 — 구축이면 BUILD_IMPLEMENTATION_RFP, PMO·PIA면 PMO_PIA_SERVICE_SPEC, "
    "그 밖의 용역(대행·운영·유지관리·컨설팅 등)이면 SERVICE_OPERATION_RFP다. "
    "제안요청서가 아닌 문서(입찰공고서·특수조건·서식)이거나 근거가 부족하면 OTHER_REVIEW_REQUIRED다."
)

EMPTY_VALUE_RULE = (
    "[빈 값 처리]\n"
    "모든 배열형 테이블에서 원문에 존재하는 행은 유지하되, 해당 행의 어떤 셀이 문서에 없거나 "
    "확인되지 않으면 추론·보완·대체하지 말고 반드시 빈 문자열(\"\")로 둔다. 다른 열의 값을 "
    "복사하거나 \"없음\", \"해당없음\", 0, null을 대신 넣지 않는다. 원문에 행 자체가 없으면 "
    "빈 행을 새로 만들지 않는다."
)

PAGE_RULE = (
    "[쪽 번호 강제]\n"
    "source_page는 그 값이 인쇄된 쪽 번호를 정수로 적는다. 문서에 인쇄된 쪽 번호를 우선하고, "
    "없으면 파싱된 순서상의 쪽을 쓴다. 어느 쪽인지 확정할 수 없으면 0으로 둔다. "
    "🔴 쪽을 지어내지 않는다 — 0이 틀린 숫자보다 낫다. source_reference에는 절 제목을 그대로 둔다."
)


# ─────────────────────────────────────────────────────────────────────────────
# 03 — 요구사항  (화면⑦ 요구사항 체크리스트)
#   개정: ※ 단서를 note_clause로 떼어내고, 근거 쪽을 source_page 정수로 뽑는다.
#         화면이 「단서」열과 「근거 페이지」열을 따로 그리기 때문이다.
# ─────────────────────────────────────────────────────────────────────────────

REQUIREMENTS_PROPS = {
    "requirement_count": i("현재 입찰사업의 요구사항 총괄표에 명시된 총 건수. 없으면 0"),
    "requirement_summary": arr("요구사항 총괄표의 분류별 건수", {
        "category_code": s("분류코드 또는 접두어"),
        "category_name": s("분류명"),
        "declared_count": s("문서에 적힌 분류별 건수. 값이 없거나 확인되지 않으면 빈 문자열"),
    }),
    "requirements": arr("현재 계약의 상세 요구사항을 고유번호별로 모두 추출한다.", {
        "requirement_id": s("인쇄된 고유번호. 예: SFR-001, PMR-003"),
        "requirement_category": s("요구사항 분류. 화면의 「분류」열에 그대로 쓰인다"),
        "requirement_name": s("요구사항 명칭. 한 줄로 끝나는 짧은 이름"),
        "detailed_content": s("세부내용 전체. 하위 불릿, 수치, 기한, 단, 다만, 예외와 금지를 생략하지 않는다."),
        "note_clause": s(
            "🔴 이 요구사항에 붙은 ※ 단서만 원문 그대로 옮긴다. ※ 기호로 시작하는 문장, "
            "「단」·「다만」으로 시작하는 제한, 적용 범위를 좁히거나 뒤집는 조건이 대상이다. "
            "예: 「※신규 도입장비에 한함」. 여러 개면 줄바꿈으로 잇는다. 없으면 빈 문자열. "
            "🔴 요약하거나 바꿔 쓰지 않는다 — 이 문장은 뜻을 뒤집는 자리라 원문이 그대로 필요하다."
        ),
        "scope_role": s("PRIMARY_CONTRACT 또는 TARGET_PROJECT"),
        "service_component": s("BUILD, PMO, PIA, COMMON, OTHER 중 하나"),
        "source_reference": s("절 제목"),
        "source_page": i("이 요구사항이 인쇄된 쪽 번호. 확정할 수 없으면 0"),
    }),
}

REQUIREMENTS_LAYOUT = layout(
    root_fields=["requirement_count"],
    tables=[
        ("requirement_summary", ["category_code", "category_name", "declared_count"]),
        ("requirements", ["requirement_id", "requirement_category", "requirement_name",
                          "detailed_content", "note_clause", "scope_role",
                          "service_component", "source_reference", "source_page"]),
    ],
)

REQUIREMENTS_SCOPE = (
    "[이 Agent 전용 출력 범위]\n"
    "요구사항 총괄표의 건수와 분류를 확인하고 현재 계약의 상세 요구사항을 고유번호별로 빠짐없이 "
    "추출한다.\n"
    "허용된 최상위 필드: requirement_count, requirement_summary, requirements\n"
    "허용 목록 밖의 최상위 필드는 출력하지 않는다. 결과는 전체 ANNOUNCEMENT_CORE_V1 중 이 "
    "Agent가 담당하는 부분 객체다.\n\n"
    "[검산]\n"
    "requirement_count와 requirements 배열 길이를 대조한다. 총괄표가 선언한 분류별 건수와 실제 "
    "추출된 건수가 다르면 값을 맞추려고 행을 지어내거나 지우지 않는다 — 있는 그대로 둔다."
)

REQ_BUILD_PROMPT = (
    "입력은 정보시스템을 직접 개발·구축·도입하는 사업의 제안요청서 또는 과업문서다. 문서에 "
    "명시된 사실만 ANNOUNCEMENT_CORE_V1 계약으로 추출하고 추측·권고·요약 보고서를 만들지 않는다.\n\n"
    "[현재 계약]\n"
    "표지와 사업일반의 현재 입찰사업만 PRIMARY_CONTRACT로 둔다. 대상·관련·선행사업은 "
    "TARGET_PROJECT 또는 RELATED_PROJECT로 분리한다. service_component는 주로 BUILD다.\n\n"
    "[누락 금지]\n"
    "요구사항 총괄표와 상세 요구사항을 문서 끝까지 확인한다. 기능(SFR)·성능(PFR)·데이터(DAR)·"
    "인터페이스(INR)·보안(SER)·품질(QUR)·제약(COR)·사업관리(PMR)·시스템장비(ECR)·테스트(TER) 등 "
    "접두어를 가리지 않고 현재 계약의 요구사항이면 모두 넣는다. 상세 요구사항의 하위 불릿, 숫자, "
    "기한, 각주, 승인·협의, 예외와 금지를 detailed_content에서 줄이지 않는다.\n\n"
    "[※ 단서 분리]\n"
    "🔴 ※ 로 시작하는 문장과 「단」·「다만」 제한은 detailed_content에 남기면서 note_clause에도 "
    "원문 그대로 옮긴다. 이 문장들은 요구사항의 적용 범위를 좁히거나 뜻을 뒤집기 때문에 화면에서 "
    "따로 보여야 한다.\n\n"
    + PAGE_RULE + "\n\n" + EMPTY_VALUE_RULE + "\n\n"
    "[출력 경계]\n"
    "자격은 이 Agent가 다루지 않는다. 평가기준·제출서류·계약조건도 넣지 않는다. 단순 목차, 반복 "
    "머리말, 홍보문, 법령 전문, 빈 서식은 제외한다.\n\n"
    + REQUIREMENTS_SCOPE
)

REQ_PMO_PROMPT = (
    "입력은 PMO·전자정부사업관리·개인정보 영향평가 용역의 과업설명서 또는 제안요청서다. 문서에 "
    "명시된 사실만 ANNOUNCEMENT_CORE_V1 계약으로 추출하고 추측·권고·요약 보고서를 만들지 않는다.\n\n"
    "[계약 경계]\n"
    "표지와 사업일반의 PMO·PIA 용역이 PRIMARY_CONTRACT다. 관리·평가 대상 정보시스템 구축사업은 "
    "TARGET_PROJECT다. 대상사업의 앱·웹·서버·플랫폼·DB·보안솔루션 개발·도입을 현재 수행사의 "
    "업무로 바꾸지 않는다. 현재 수행사가 검토·조정·점검·감독하도록 명시된 활동만 "
    "PRIMARY_CONTRACT로 둔다.\n\n"
    "[누락 금지]\n"
    "현재 용역의 CSR·PAR·SER·QUR·COR·PMR·PSR 등만 requirements에 넣고 대상 구축사업의 "
    "ECR·SFR·PER·SIR·UIR·DAR·TER는 넣지 않는다. 상세내용의 불릿, 숫자, 기한, 각주, 승인·협의, "
    "예외와 금지를 줄이지 않는다.\n\n"
    "[※ 단서 분리]\n"
    "🔴 ※ 로 시작하는 문장과 「단」·「다만」 제한은 detailed_content에 남기면서 note_clause에도 "
    "원문 그대로 옮긴다. PMO 문서의 ※ 는 「대상사업 일정에 종속되는 구간은 제외」처럼 책임 경계를 "
    "가르는 자리라 특히 중요하다.\n\n"
    + PAGE_RULE + "\n\n" + EMPTY_VALUE_RULE + "\n\n"
    "[출력 경계]\n"
    "자격·평가·제출서류·계약조건은 이 Agent가 다루지 않는다. 단순 목차, 반복 머리말, 홍보문, "
    "법령 전문, 빈 서식은 제외한다.\n\n"
    + REQUIREMENTS_SCOPE
)

# 🔴 2026-08-23 실측 — 용역 RFP(PG 대행)는 «요구사항 총괄표»가 없다. 과업 내용이 절·불릿·표로 산문처럼 적혀 있어
#    구축용 프롬프트(REQ_BUILD_PROMPT)는 0건을 돌려줬다. 용역 RFP 는 과업 내용을 요구사항으로 «세어서» 뽑아야 한다.
REQ_SERVICE_PROMPT = (
    "입력은 시스템 구축이 아닌 **용역**(결제·발매 대행, 운영·위탁, 유지관리, 컨설팅 등)의 제안요청서·과업내용서다. "
    "문서에 명시된 사실만 ANNOUNCEMENT_CORE_V1 계약으로 추출하고 추측·권고·요약 보고서를 만들지 않는다.\n\n"
    "[요구사항의 자리]\n"
    "🔴 이런 문서에는 「요구사항 총괄표」가 없는 일이 많다. 그때는 「과업 내용」·「제안요청 내용」·「세부 과업」·"
    "「서비스 요구사항」·「운영·정산·보안·연계·장애 대응」 같은 절에서 수행사가 해야 할 일을 **한 줄에 하나씩** "
    "requirements 행으로 옮긴다. 불릿·번호·표의 행 하나가 요구사항 하나다. 요구사항을 합치거나 요약하지 않는다.\n"
    "- requirement_id: 문서에 번호·코드가 있으면 그대로, 없으면 문서 순서대로 SVR-001, SVR-002 … 형식\n"
    "- requirement_category: 문서의 절 제목을 그대로(예: 「결제서비스」, 「정산」, 「정보보안」, 「시스템 연계」, 「장애 대응」, 「사업관리」)\n"
    "- requirement_name: 그 줄의 핵심을 20자 안팎으로\n"
    "- detailed_content: 불릿·숫자·기한·수수료율·응답시간·가용률·승인·협의·예외·금지를 줄이지 않고 원문대로\n"
    "- requirement_count 는 실제로 뽑은 행 수\n\n"
    "[현재 계약]\n"
    "표지와 사업개요의 현재 입찰 용역만 PRIMARY_CONTRACT다. 발주기관이 이미 운영하는 시스템(연계 대상)은 TARGET_PROJECT 로 "
    "두되, 그 시스템을 새로 구축하는 요구사항으로 바꾸지 않는다. service_component 는 주로 OTHER 또는 BUILD(연계 개발이 있으면)다.\n\n"
    "[※ 단서 분리]\n"
    "🔴 ※ 로 시작하는 문장과 「단」·「다만」 제한은 detailed_content에 남기면서 note_clause에도 원문 그대로 옮긴다.\n\n"
    + PAGE_RULE + "\n\n" + EMPTY_VALUE_RULE + "\n\n"
    "[출력 경계]\n"
    "자격·평가기준·제출서류·계약조건은 이 Agent가 다루지 않는다. 단순 목차, 반복 머리말, 홍보문, 법령 전문, 빈 서식은 제외한다.\n\n"
    + REQUIREMENTS_SCOPE
)

AGENT_03 = classify_extract_agent(
    "Announcement 3 - Requirements",
    ANNOUNCEMENT_BRANCHES,
    ANNOUNCEMENT_CLASSIFY_PROMPT,
    [
        extract_schema("extract_build_requirements", REQUIREMENTS_PROPS,
                       REQUIREMENTS_LAYOUT, REQ_BUILD_PROMPT),
        extract_schema("extract_pmo_requirements", REQUIREMENTS_PROPS,
                       REQUIREMENTS_LAYOUT, REQ_PMO_PROMPT),
        extract_schema("extract_service_requirements", REQUIREMENTS_PROPS,
                       REQUIREMENTS_LAYOUT, REQ_SERVICE_PROMPT),
    ],
    {
        "BUILD_IMPLEMENTATION_RFP": "extract_build_requirements",
        "SERVICE_OPERATION_RFP": "extract_service_requirements",   # 🔴 용역은 과업 내용을 요구사항으로 센다 — 구축용은 0건을 낸다(실측)
        "PMO_PIA_SERVICE_SPEC": "extract_pmo_requirements",
    },
)


# ─────────────────────────────────────────────────────────────────────────────
# 04 — 참가자격·제출  (화면⑥ 파일제출 · 화면⑨ 제출준비)
#   개정: 부수·유효기간·제출방법을 한 문장에 뭉쳐 두지 않고 열로 가른다.
#         화면⑨가 「부수」·「유효기간」·「P」를 각각 다른 칸에 그리기 때문이다.
#         + submission_constraints — 화면⑨ 맨 위 노란 띠 한 줄
# ─────────────────────────────────────────────────────────────────────────────

ELIGIBILITY_SUBMISSION_PROPS = {
    "eligibility_rules": arr(
        "입찰참가자격 조항을 한 줄에 하나씩 모두 추출한다. 🔴 이 배열이 참여 판정의 유일한 근거다.",
        {
            "rule_id": s("문서에 번호가 있으면 그대로, 없으면 문서 순서대로 ELIG_001 형식"),
            "eligibility_type": s(
                "REGISTRATION(등록·신고·지정), CERTIFICATE(확인서·증명서), PERFORMANCE(실적), "
                "FINANCIAL(재무·신용), RESTRICTION(참여 제한·배제), STAFF(인력), "
                "JOINT(공동수급·하도급), OTHER 중 하나"),
            "condition": s("자격 조건 원문. 수치·업종코드·품명번호·기한을 줄이지 않는다"),
            "required_evidence": s("이 조건을 증명하는 서류 이름. 문서에 적힌 대로"),
            "gate_level": s("HARD_GATE(못 갖추면 입찰 무효) 또는 PREFERENCE(가점·우대)"),
            "mandatory": s("YES 또는 NO. 문서가 정하지 않았으면 빈 문자열"),
            "joint_fulfillment_allowed": s(
                "공동수급체 구성원 중 하나만 갖춰도 되면 YES, 각자 모두 갖춰야 하면 NO, "
                "문서가 말하지 않으면 빈 문자열"),
            "valid_until_rule": s(
                "유효기간 기준 원문. 예: 「제안서 마감일 전일까지 발행되고 유효기간 내」. 없으면 빈 문자열"),
            "source_reference": s("절 제목"),
            "source_page": i("이 조항이 인쇄된 쪽 번호. 확정할 수 없으면 0"),
        }),
    "submission_requirements": arr(
        "제출해야 하는 서류·서식·제안서 항목을 한 줄에 하나씩 추출한다.",
        {
            "item_type": s("DOCUMENT(증빙서류), FORM(지정서식), PROPOSAL_SECTION(제안서 항목), OTHER"),
            "item_id": s("서식 번호나 항목 번호. 없으면 빈 문자열"),
            "name": s("서류 이름. 화면의 「서류」열에 그대로 쓰인다"),
            "requirement": s("무엇을 어떻게 갖춰야 하는지 원문"),
            "copies": s(
                "🔴 제출 부수만 숫자로. 예: 「5」. 문서가 부수를 정하지 않았으면 빈 문자열. "
                "「1부」면 「1」로 적는다. 부수가 아닌 쪽수·매수를 여기 넣지 않는다"),
            "validity_basis": s(
                "🔴 유효기간 기준만. 예: 「발급 30일 내」, 「2026-11-30」, 「제안서 마감일 전일까지 발급」. "
                "기간 제한이 없으면 빈 문자열"),
            "submission_stage": s("BID(입찰 제출), CONTRACT, KICKOFF, DURING_PROJECT, COMPLETION 중 하나"),
            "submission_method": s(
                "🔴 제출 수단만. 전자입찰, 나라장터, 인편, 방문, 우편, 이메일 중 문서가 말한 것. "
                "없으면 빈 문자열"),
            "method_or_format": s("파일 형식·용지·규격 등 형식 요건. 없으면 빈 문자열"),
            "quantity_or_limit": s("분량 상한·용량 상한 등 수량 제한. 없으면 빈 문자열"),
            "condition_or_note": s("단서·예외·주의. ※ 문장이 있으면 원문 그대로"),
            "template_id": s("지정 서식 번호. 예: 「붙임2 가」. 없으면 빈 문자열"),
            "signature_or_seal": s("서명·날인·직인 요구. 문서가 말하지 않으면 빈 문자열"),
            "mandatory": s("YES 또는 NO. 문서가 정하지 않았으면 빈 문자열"),
            "source_reference": s("절 제목"),
            "source_page": i("이 제출 항목이 인쇄된 쪽 번호. 확정할 수 없으면 0"),
        }),
    # 🔴 2026-08-22 실측 — 최상위 object로 두면 Studio가 통째로 버린다.
    #    schemaLayout이 표 지향이라 열로 선언되지 않은 중첩 객체가 결과에서 사라졌다.
    #    03의 requirement_count처럼 **최상위 스칼라**는 살아남으므로 평탄화한다.
    "constraint_method": s(
        "🔴 제출 전체에 걸리는 방식. 예: 「전자입찰(나라장터)」, 「인편 제출」. 없으면 빈 문자열"),
    "constraint_deadline": s(
        "🔴 입찰서·제안서 접수 마감 일시 원문. 예: 「2026. 08. 24(월) 10:30」. 요일과 분까지 남긴다"),
    "constraint_opens_at": s("접수 시작 일시 원문. 없으면 빈 문자열"),
    "constraint_proposal_copies": s(
        "🔴 «제안서·입찰서류»를 몇 부 제출하라는 문장에서만 숫자를 옮긴다. "
        "최종보고서·착수계획서·산출물·매뉴얼의 부수(계약 후 납품물)는 제안서 부수가 아니다 — "
        "그 숫자를 여기 넣지 않는다. 전자입찰이면 보통 부수가 없으므로 빈 문자열. 없으면 빈 문자열"),
    "constraint_page_limit": s("제안서 본문 분량 상한. 예: 「100쪽 이내 권고」. 없으면 빈 문자열"),
    "constraint_summary_page_limit": s("제안 요약본 분량 상한. 없으면 빈 문자열"),
    "constraint_price_sealed": s(
        "가격제안서를 별도 밀봉·별도 제출하라는 요구가 있으면 그 원문. 없으면 빈 문자열"),
    "constraint_place": s("제출 장소 또는 접수처. 없으면 빈 문자열"),
    "constraint_source_page": i("이 제약이 인쇄된 쪽 번호. 확정할 수 없으면 0"),
}

CONSTRAINT_FIELDS = [
    "constraint_method", "constraint_deadline", "constraint_opens_at",
    "constraint_proposal_copies", "constraint_page_limit", "constraint_summary_page_limit",
    "constraint_price_sealed", "constraint_place", "constraint_source_page",
]

ELIGIBILITY_SUBMISSION_LAYOUT = layout(
    root_fields=CONSTRAINT_FIELDS,
    tables=[
        ("eligibility_rules", ["rule_id", "eligibility_type", "condition", "required_evidence",
                               "gate_level", "mandatory", "joint_fulfillment_allowed",
                               "valid_until_rule", "source_reference", "source_page"]),
        ("submission_requirements", ["item_type", "item_id", "name", "requirement", "copies",
                                     "validity_basis", "submission_stage", "submission_method",
                                     "method_or_format", "quantity_or_limit", "condition_or_note",
                                     "template_id", "signature_or_seal", "mandatory",
                                     "source_reference", "source_page"]),
    ],
)

ELIGIBILITY_SCOPE = (
    "[이 Agent 전용 출력 범위]\n"
    "입찰참가자격과 제출물 규칙만 추출한다.\n"
    "허용된 최상위 필드: eligibility_rules, submission_requirements, constraint_method, constraint_deadline, constraint_opens_at, constraint_proposal_copies, constraint_page_limit, constraint_summary_page_limit, constraint_price_sealed, constraint_place, constraint_source_page\n"
    "허용 목록 밖의 최상위 필드는 출력하지 않는다. 결과는 전체 ANNOUNCEMENT_CORE_V1 중 이 "
    "Agent가 담당하는 부분 객체다."
)

ELIGIBILITY_COMMON = (
    "[자격 조항 — 가장 중요한 배열]\n"
    "🔴 eligibility_rules가 이 사업에 낼 수 있는지를 가르는 유일한 근거다. 참가자격 절을 한 줄씩 "
    "훑어 조건을 쪼갠다. 한 불릿에 조건이 둘 이상이면 행을 나눈다. 업종코드·세부품명번호·"
    "법령 조문 번호·금액 기준·기간 기준을 숫자 그대로 옮긴다.\n"
    "제한(RESTRICTION)도 자격이다 — 「대기업·중견기업 참여 불가」, 「상호출자제한기업집단 제외」, "
    "「부정당업자 제한을 받지 않은 자」를 빠뜨리지 않는다.\n"
    "공동수급 허용 여부, 구성원 수 상한, 최소 지분율, 하도급 허용 여부는 JOINT 유형으로 넣는다.\n\n"
    "[부수 — 2026-08-22 실측에서 잡힌 오귀속]\n"
    "🔴 제안요청서에서 「최종보고서 5부」(계약 후 산출물, submission_stage=COMPLETION)의 5를 "
    "constraint_proposal_copies에 넣은 사례가 있었다. 부수는 «그 문장이 무엇을 제출하라는 것인지» "
    "주어를 확인하고 옮긴다. 제안서·제안요약서·입찰서류가 주어일 때만이다. 산출물 부수는 "
    "submission_requirements의 해당 행(copies)에만 남기고 constraint_*로 올리지 않는다.\n\n"
    "[부수·유효기간·제출방법을 가른다]\n"
    "🔴 「제안서 5부를 인편으로 마감일까지」 같은 한 문장을 그대로 두지 말고 copies=5, "
    "submission_method=인편, 마감은 constraint_deadline으로 나눈다. 화면이 이 셋을 "
    "다른 칸에 그린다.\n"
    "🔴 부수를 모르면 빈 문자열이다. 「1부」라고 지어내지 않는다.\n\n"
    "[법령 해석 금지]\n"
    "조문 이름과 번호만 그대로 옮긴다. 그 조문이 무슨 뜻인지 풀어 쓰거나, 문서에 없는 자격 요건을 "
    "일반적인 조달 관행으로 보충하지 않는다.\n\n"
    + PAGE_RULE + "\n\n" + EMPTY_VALUE_RULE
)

ELIG_BUILD_PROMPT = (
    "입력은 정보시스템을 직접 개발·구축·도입하는 사업의 제안요청서, 과업문서 또는 입찰공고서다. "
    "문서에 명시된 사실만 추출하고 추측·권고·요약 보고서를 만들지 않는다.\n\n"
    "[문서 종류]\n"
    "입찰공고서와 제안요청서가 같은 사업을 다르게 적을 수 있다. 지금 읽고 있는 문서의 값만 적고 "
    "다른 문서의 값을 상상해 채우지 않는다. 🔴 공고서에만 있는 마감일시·전자입찰 여부는 공고서를 "
    "읽을 때만 나온다 — 제안요청서에서 못 찾으면 빈 문자열이다.\n\n"
    + ELIGIBILITY_COMMON + "\n\n"
    "[출력 경계]\n"
    "상세 요구사항·평가배점·계약 수행조건은 이 Agent가 다루지 않는다.\n\n"
    + ELIGIBILITY_SCOPE
)

ELIG_PMO_PROMPT = (
    "입력은 PMO·전자정부사업관리·개인정보 영향평가 용역의 과업설명서, 제안요청서 또는 "
    "입찰공고서다. 문서에 명시된 사실만 추출하고 추측·권고·요약 보고서를 만들지 않는다.\n\n"
    "[계약 경계]\n"
    "현재 용역의 참가자격만 넣는다. 대상 구축사업 수행사에게 걸린 자격을 현재 용역의 자격으로 "
    "옮기지 않는다.\n\n"
    + ELIGIBILITY_COMMON + "\n\n"
    "[출력 경계]\n"
    "상세 요구사항·평가배점·계약 수행조건은 이 Agent가 다루지 않는다.\n\n"
    + ELIGIBILITY_SCOPE
)

# 🔴 2026-08-22 실측으로 고친 것 — 04만 갈래가 넷이다
#
#   입찰공고서를 넣었더니 Classify가 OTHER_REVIEW_REQUIRED로 보내 Extract가 안 돌았다.
#   분류기가 틀린 게 아니다. 공유 갈래는 「제안요청서 또는 과업문서」만 BUILD로 정의하는데
#   입찰공고서는 둘 다 아니다.
#
#   🔴 그런데 마감일시·전자입찰 여부·제출 부수는 **공고서에만 있다** — 제안요청서는
#      「입찰관련 안내 : 입찰공고문 참조」로 넘긴다. 04가 공고서를 못 읽으면 화면⑨가 빈다.
#      그래서 04에만 BID_NOTICE 갈래를 더한다. 03은 그대로 둔다 —
#      공고서에는 상세 요구사항이 없으니 03이 OTHER로 보내는 게 맞다.

BID_NOTICE_BRANCH = (
    "BID_NOTICE",
    "입찰공고서·재공고·용역 입찰공고. 관리번호, 수요기관, 입찰명, 추정가격, 입찰방법, "
    "낙찰자선정방법, 전자입찰서 접수기간, 입찰참가자격, 공동수급 허용 여부가 목록으로 적혀 있고 "
    "상세 요구사항 표는 없는 문서",
)

ANNOUNCEMENT_BRANCHES_WITH_NOTICE = [
    ANNOUNCEMENT_BRANCHES[0],
    ANNOUNCEMENT_BRANCHES[1],
    ANNOUNCEMENT_BRANCHES[2],   # SERVICE_OPERATION_RFP
    BID_NOTICE_BRANCH,
    ANNOUNCEMENT_BRANCHES[3],   # OTHER_REVIEW_REQUIRED
]

ELIGIBILITY_CLASSIFY_PROMPT = (
    "이 Agent는 참가자격과 제출 규칙을 뽑는다. 입력 문서가 넷 중 무엇인지 가른다.\n"
    "🔴 표제를 먼저 본다. 「입찰공고서」·「용역 입찰공고」·「재공고」로 시작하고 관리번호·"
    "추정가격·접수기간이 목록으로 적혀 있으면 BID_NOTICE다. 쪽수가 10쪽 안팎으로 짧고 "
    "상세 요구사항 표가 없는 것도 신호다.\n"
    "「제안요청서」·「과업내용서」·「과업설명서」이고 사업 범위·요구사항 표가 있으면 "
    "BUILD_IMPLEMENTATION_RFP · PMO_PIA_SERVICE_SPEC · SERVICE_OPERATION_RFP 중 하나다. 현재 계약이 다른 구축사업을 "
    "관리·감독하는 PMO·전자정부사업관리·개인정보 영향평가면 PMO_PIA_SERVICE_SPEC, "
    "직접 개발·구축·도입하면 BUILD_IMPLEMENTATION_RFP, 그 밖의 용역(결제·발매 대행, 운영·위탁, 유지관리, "
    "컨설팅 등)이면 SERVICE_OPERATION_RFP다.\n"
    "PMO·PIA 문서에 포함된 대상 구축사업 설명을 현재 계약으로 오인하지 않는다. "
    "근거가 부족하면 OTHER_REVIEW_REQUIRED다."
)

ELIG_NOTICE_PROMPT = (
    "입력은 **입찰공고서**다. 조달 절차에서 공고서는 제안요청서보다 우선하며, "
    "🔴 마감일시·전자입찰 여부·제출 부수·접수처는 **이 문서에만 있는 일이 많다**. "
    "문서에 명시된 사실만 추출하고 추측·권고·요약 보고서를 만들지 않는다.\n\n"
    "[공고서에서 특히 놓치지 말 것]\n"
    "- 전자입찰서(제안서·입찰서류 포함) **접수 시작·마감 일시**를 인쇄된 표기 그대로. "
    "「2026. 08. 24(월) 10:30」처럼 요일과 분까지 남긴다\n"
    "- 입찰 방식이 전자입찰(나라장터)인지 인편·방문인지\n"
    "- 관리번호·수요기관·추정금액·추정가격·입찰방법·낙찰자선정방법\n"
    "- 개찰·기술평가·설명회 일시와 장소가 있으면 submission_requirements에 stage와 함께\n"
    "- 참가자격 조항 전부. 🔴 등록·증명서·업종코드·세부품명번호·제한(대기업 배제 등)·"
    "공동수급 구성원 수 상한과 최소 지분율·하도급 허용 여부\n\n"
    "[이 문서에 없는 것]\n"
    "🔴 공고서에는 상세 요구사항 표가 없다. 없는 것을 만들지 않는다. "
    "제안서 분량 상한처럼 제안요청서에만 있는 값은 빈 문자열로 둔다.\n\n"
    + ELIGIBILITY_COMMON + "\n\n"
    + ELIGIBILITY_SCOPE
)

AGENT_04 = classify_extract_agent(
    "Announcement 4 - Eligibility and Submission",
    ANNOUNCEMENT_BRANCHES_WITH_NOTICE,
    ELIGIBILITY_CLASSIFY_PROMPT,
    [
        extract_schema("extract_build_eligibility_submission", ELIGIBILITY_SUBMISSION_PROPS,
                       ELIGIBILITY_SUBMISSION_LAYOUT, ELIG_BUILD_PROMPT),
        extract_schema("extract_pmo_eligibility_submission", ELIGIBILITY_SUBMISSION_PROPS,
                       ELIGIBILITY_SUBMISSION_LAYOUT, ELIG_PMO_PROMPT),
        extract_schema("extract_notice_eligibility_submission", ELIGIBILITY_SUBMISSION_PROPS,
                       ELIGIBILITY_SUBMISSION_LAYOUT, ELIG_NOTICE_PROMPT),
    ],
    {
        "BUILD_IMPLEMENTATION_RFP": "extract_build_eligibility_submission",
        "SERVICE_OPERATION_RFP": "extract_build_eligibility_submission",   # 용역 RFP 도 구축용 Extract 를 탄다
        "PMO_PIA_SERVICE_SPEC": "extract_pmo_eligibility_submission",
        "BID_NOTICE": "extract_notice_eligibility_submission",
    },
)


# ─────────────────────────────────────────────────────────────────────────────
# Company Card Builder — 신규  (화면① 회사 등록 · 화면② 회사 카드)
#
#   🔴 이 제품의 진입점이다. 회사 서류 묶음을 갈라 「회사 카드」를 만든다.
#   갈래 아홉은 데모 회사가 실제로 가진 서류 여덟에 KISTI 공고가 요구하는
#   직접생산확인증명서를 더한 것이다 — 이 서류 하나가 제외/추천을 가른다.
# ─────────────────────────────────────────────────────────────────────────────

COMPANY_BRANCHES = [
    ("CO_BIZ_REG", "사업자등록증 또는 법인등기부등본. 상호·사업자등록번호·대표자·소재지·업태·종목이 있다."),
    ("CO_SME_CERT", "중소기업확인서, 중·소기업·소상공인확인서 또는 중견기업 확인서. 기업규모 구분과 유효기간이 있다."),
    ("CO_CREDIT_RATING", "신용평가등급확인서 또는 기업신용평가 보고서. 신용등급과 평가기관·유효기간이 있다."),
    ("CO_PIA_DESIGNATION", "개인정보 영향평가기관 지정서. 지정번호와 지정일·유효기간이 있다."),
    ("CO_SW_BUSINESS", "소프트웨어사업자 신고확인서. 신고번호와 업종·업종코드가 있다."),
    ("CO_DIRECT_PRODUCTION", "직접생산확인증명서. 세부품명번호와 유효기간이 있다."),
    ("CO_PERFORMANCE", "실적증명서, 용역수행확인서 또는 계약이행실적증명. 사업명·발주처·계약금액·기간이 있다."),
    ("CO_FINANCIAL", "재무제표, 감사보고서 또는 표준재무제표증명. 매출·자본금·자산·부채가 있다."),
    ("CO_TECH_STAFF", "기술인력 보유현황, 인력현황표 또는 기술자 보유증명. 등급별 인원이 있다."),
    ("CO_OTHER_REVIEW_REQUIRED", "위 아홉에 해당한다고 확정할 근거가 부족하거나, 여러 종류가 한 파일에 섞인 회사 서류."),
]

COMPANY_CLASSIFY_PROMPT = (
    "업로드된 회사 서류 한 건의 종류를 가른다. 표제(문서 맨 위 제목)를 먼저 보고, 그다음 발급기관과 "
    "본문의 항목 이름으로 확인한다.\n"
    "🔴 파일명만으로 단정하지 않는다 — 본문 근거를 쓴다.\n"
    "🔴 서류가 다른 서류를 인용하는 경우(예: 실적증명서 안에 사업자등록번호가 적힘)에 인용된 쪽으로 "
    "분류하지 않는다. 표제가 이긴다.\n"
    "확정할 근거가 부족하거나 두 종류 이상이 한 파일에 섞였으면 CO_OTHER_REVIEW_REQUIRED다. "
    "🔴 애매한 것을 억지로 한 갈래에 밀어 넣지 않는다 — 회사 카드의 값이 틀리면 자격 판정이 통째로 틀린다."
)

COMPANY_CARD_RULES = (
    "[지어내지 않기 — 이 Agent의 첫 번째 규율]\n"
    "🔴 회사 카드의 값이 틀리면 뒤따르는 자격 판정이 통째로 틀린다. 서류에 인쇄되어 있지 않은 값은 "
    "어떤 경우에도 만들지 않는다. 모르면 빈 문자열이고, 화면이 그 자리를 「[확인필요] · 직접 입력」으로 "
    "그린다. 업계 평균·통상적인 값·다른 서류에서 본 값으로 메우지 않는다.\n\n"
    "[값마다 근거]\n"
    "🔴 모든 값에 그 값이 적힌 서류 이름(source_document)과 쪽(source_page)을 붙인다. 화면이 값 "
    "아래에 「사업자 등록증_다온피엠씨.pdf」처럼 근거를 같이 그린다. 근거를 못 붙이는 값은 "
    "안 뽑은 것과 같다.\n\n"
    "[표기 보존]\n"
    "금액·날짜·등급은 서류에 인쇄된 표기를 그대로 옮긴다. 「6억 1200만원」을 612000000으로 바꾸거나 "
    "「A0」를 「A」로 줄이지 않는다. 단위 환산·반올림·정규화를 하지 않는다.\n\n"
    "[유효기간]\n"
    "발급일과 유효기간은 자격 판정에서 결정적이다. 「2026-11-30까지」처럼 인쇄된 그대로 옮기고, "
    "기간이 안 적혀 있으면 빈 문자열이다. 발급일에 관행적인 유효기간을 더해 만들지 않는다."
)

COMPANY_COMMON_PROPS = {
    "document_kind": s("이 서류의 종류. 분류 갈래 이름과 같게 적는다"),
    "company_name": s("서류에 적힌 상호 또는 법인명. 없으면 빈 문자열"),
    "business_number": s("사업자등록번호. 하이픈을 포함해 인쇄된 그대로. 없으면 빈 문자열"),
    "issuer": s("발급기관·발급처 이름. 없으면 빈 문자열"),
    "issued_at": s("발급일. 인쇄된 표기 그대로. 없으면 빈 문자열"),
    "expires_at": s("유효기간 만료일. 인쇄된 표기 그대로. 없으면 빈 문자열"),
    "source_document": s("이 값들이 나온 파일 이름"),
    "source_page": i("표제가 인쇄된 쪽 번호. 확정할 수 없으면 0"),
}


def company_schema(name, extra_props, extra_tables, focus):
    props = dict(COMPANY_COMMON_PROPS)
    props.update(extra_props)
    root = [k for k in props if not isinstance(props[k], dict) or props[k].get("type") != "array"]
    tables = [(key, list(props[key]["items"]["properties"])) for key in extra_tables]
    return extract_schema(
        name, props, layout(root_fields=root, tables=tables),
        "입력은 회사가 제출·보관하는 증빙 서류 한 건이다. 「회사 카드」의 한 조각을 만든다.\n\n"
        + focus + "\n\n" + COMPANY_CARD_RULES + "\n\n" + EMPTY_VALUE_RULE + "\n\n"
        "[출력 경계]\n"
        "이 스키마에 있는 필드만 채운다. 다른 서류가 담당하는 값을 짐작해 넣지 않는다.",
    )


COMPANY_SCHEMAS = [
    company_schema("extract_co_biz_reg", {
        "representative": s("대표자 성명"),
        "address": s("사업장 소재지 전체 주소. 화면의 「소재지」는 이 값의 시·도 부분을 쓴다"),
        "corporate_number": s("법인등록번호. 없으면 빈 문자열"),
        "established_at": s("법인 설립일 또는 개업일"),
        "business_type": s("업태"),
        "business_item": s("종목"),
    }, [], "[이 서류에서 뽑을 것]\n상호·사업자등록번호·대표자·소재지·설립일·업태·종목."),

    company_schema("extract_co_sme_cert", {
        "enterprise_size": s(
            "기업규모 구분. 서류에 인쇄된 그대로 — 소상공인 / 소기업 / 중기업 / 중소기업 / 중견기업 / 대기업"),
        "certificate_number": s("확인서 번호"),
        "industry_code": s("주된 업종코드. 없으면 빈 문자열"),
        "based_on_fiscal_year": s("판정 기준 사업연도. 없으면 빈 문자열"),
    }, [], "[이 서류에서 뽑을 것]\n기업규모 구분과 유효기간. 🔴 「20억 미만 사업은 대기업·중견기업 참여 불가」 "
           "같은 조항이 이 값 하나로 갈린다."),

    company_schema("extract_co_credit_rating", {
        "credit_grade": s("신용평가등급. 「A0」처럼 인쇄된 그대로. 등급 뒤 부호를 지우지 않는다"),
        "rating_agency": s("평가기관 이름"),
        "evaluated_at": s("평가 기준일"),
    }, [], "[이 서류에서 뽑을 것]\n신용등급·평가기관·유효기간. 화면②의 「신용 평가 등급」 카드가 이 값이다."),

    company_schema("extract_co_pia_designation", {
        "designation_number": s("지정번호"),
        "designated_at": s("지정일"),
        "industry_code": s("업종코드. 없으면 빈 문자열"),
    }, [], "[이 서류에서 뽑을 것]\n개인정보 영향평가기관 지정 사실과 지정번호·유효기간."),

    company_schema("extract_co_sw_business", {
        "report_number": s("신고확인번호"),
        "business_category": s("신고 업종 이름. 예: 컴퓨터관련 서비스 사업"),
        "industry_code": s("업종코드. 예: 1468. 없으면 빈 문자열"),
    }, [], "[이 서류에서 뽑을 것]\n소프트웨어사업자 신고 사실과 업종코드. 🔴 업종코드는 공고가 특정 코드를 "
           "지정하는 일이 많아 숫자를 정확히 옮긴다."),

    company_schema("extract_co_direct_production", {
        "product_name": s("직접생산 확인을 받은 세부품명. 인쇄된 그대로"),
        "product_code": s("세부품명번호. 예: 8111159801. 숫자를 그대로 옮긴다"),
        "certificate_number": s("증명서 번호"),
    }, [], "[이 서류에서 뽑을 것]\n세부품명번호와 유효기간. 🔴 공고가 특정 세부품명번호를 지정하므로 "
           "숫자 한 자리도 바꾸지 않는다."),

    company_schema("extract_co_performance", {
        "performance_items": arr(
            "실적 한 건을 한 행으로. 서류에 여러 건이 있으면 모두 넣는다.", {
                "project_name": s("사업명"),
                "client": s("발주처·수요기관 이름"),
                "client_sector": s("PUBLIC(공공·정부·지자체·공공기관), FINANCE(은행·금고·보험·증권), "
                                   "PRIVATE(민간), UNKNOWN 중 하나. 발주처 이름으로 판단하고 "
                                   "모르면 UNKNOWN"),
                "service_category": s("PMO, AUDIT(감리), ISP, PIA(영향평가), BUILD(구축·개발), "
                                      "MAINTENANCE, OTHER 중 하나. 사업명에 근거해 고르고 "
                                      "애매하면 OTHER"),
                "contract_amount": s("계약금액. 인쇄된 표기 그대로"),
                "our_share_amount": s("공동수급일 때 자사 지분 금액. 없으면 빈 문자열"),
                "period_start": s("사업 시작일"),
                "period_end": s("사업 종료일"),
                "is_ongoing": s("수행 중이면 YES, 완료면 NO, 모르면 빈 문자열"),
                "source_page": i("이 실적이 인쇄된 쪽. 확정할 수 없으면 0"),
            }),
    }, ["performance_items"],
        "[이 서류에서 뽑을 것]\n실적을 건별로 모두. 🔴 화면②가 「공공 PMO 8 · 금융 PMO 0 · 감리 3 · "
        "ISP 2 · 영향평가 2」처럼 갈래별로 세므로 client_sector와 service_category를 반드시 채운다.\n"
        "🔴 합계·최대 단일 계약을 여기서 계산하지 않는다 — 행만 정확히 뽑는다. 세는 것은 뒤 단계다."),

    company_schema("extract_co_financial", {
        "fiscal_year": s("회계연도. 예: 2025"),
        "revenue": s("매출액. 인쇄된 표기 그대로"),
        "capital": s("자본금. 인쇄된 표기 그대로. 없으면 빈 문자열"),
        "total_assets": s("자산총계. 없으면 빈 문자열"),
        "total_liabilities": s("부채총계. 없으면 빈 문자열"),
        "total_equity": s("자본총계. 없으면 빈 문자열"),
        "debt_ratio": s("🔴 부채비율이 서류에 인쇄되어 있을 때만 그 값을 옮긴다. "
                        "부채총계÷자본총계로 직접 계산하지 않는다. 없으면 빈 문자열"),
        "operating_profit": s("영업이익. 없으면 빈 문자열"),
        "net_income": s("당기순이익. 없으면 빈 문자열"),
    }, [], "[이 서류에서 뽑을 것]\n직전연도 매출·자본금·부채비율. 화면②의 「재무」 칸과 「미확인 2건」이 "
           "이 값들로 정해진다."),

    company_schema("extract_co_tech_staff", {
        "total_headcount": s("기술인력 총원. 서류에 총계가 인쇄되어 있을 때만. 없으면 빈 문자열"),
        "staff_grades": arr(
            "등급별 인원을 한 행씩. 서류의 등급 구분을 그대로 따른다.", {
                "grade": s("기술사 / 특급 / 고급 / 중급 / 초급 등 인쇄된 등급 이름"),
                "count": s("그 등급의 인원 수"),
                "qualification": s("자격 종류. 없으면 빈 문자열"),
            }),
    }, ["staff_grades"],
        "[이 서류에서 뽑을 것]\n등급별 인원. 화면②가 「기술사 6 · 특급 24 · 고급 19 · 중급 15 · 초급 4」로 "
        "그린다. 🔴 총원이 인쇄되어 있지 않으면 등급을 더해 만들지 않는다 — 빈 문자열이다."),

    company_schema("extract_co_other", {
        "observed_title": s("문서 맨 위에 인쇄된 표제 그대로"),
        "why_uncertain": s("왜 한 갈래로 확정하지 못했는지 한 문장"),
        "candidate_kinds": s("가능해 보이는 갈래 이름을 쉼표로. 없으면 빈 문자열"),
    }, [], "[이 서류에서 뽑을 것]\n표제와 회사 식별 정보만. 🔴 값을 억지로 뽑지 않는다 — "
           "이 갈래로 온 서류는 사람이 확인할 자리다."),
]

AGENT_COMPANY_CARD = classify_extract_agent(
    "Company Card Builder",
    COMPANY_BRANCHES,
    COMPANY_CLASSIFY_PROMPT,
    COMPANY_SCHEMAS,
    {
        "CO_BIZ_REG": "extract_co_biz_reg",
        "CO_SME_CERT": "extract_co_sme_cert",
        "CO_CREDIT_RATING": "extract_co_credit_rating",
        "CO_PIA_DESIGNATION": "extract_co_pia_designation",
        "CO_SW_BUSINESS": "extract_co_sw_business",
        "CO_DIRECT_PRODUCTION": "extract_co_direct_production",
        "CO_PERFORMANCE": "extract_co_performance",
        "CO_FINANCIAL": "extract_co_financial",
        "CO_TECH_STAFF": "extract_co_tech_staff",
        "CO_OTHER_REVIEW_REQUIRED": "extract_co_other",
    },
)


# ─────────────────────────────────────────────────────────────────────────────
# Instruct 3종이 공유하는 규율
# ─────────────────────────────────────────────────────────────────────────────

SINGLE_FILE_CONTRACT = (
    "[파일 입력 계약]\n"
    "입력은 업로드된 단일 파일 하나뿐이다. 별도 텍스트 입력, 추가 변수, 두 번째 파일은 사용하지 "
    "않는다. 🔴 Studio의 Instruct 노드는 소스를 하나만 받으므로, 여러 문서를 맞대야 하는 판정은 "
    "호출하는 쪽이 문서들을 한 파일로 이어 붙여 올린다. 구분 표식이 없으면 각 영역이 시작되는 "
    "schema_version 또는 agent 값으로 경계를 찾는다. 영역 간 사실을 서로 바꾸지 않는다."
)

VERDICT_VOCAB = (
    "[판정 어휘 고정]\n"
    "🔴 항목 판정은 셋뿐이다 — 충족 / 미충족 / [확인필요]. 건 판정은 둘뿐이다 — 추천 / 제외.\n"
    "🔴 [확인필요]는 제외 사유가 아니다. 못 읽어서 기회를 지우는 쪽이 잘못 추천하는 쪽보다 나쁘다.\n"
    "🔴 조건부·보류·검토필요·CONDITIONAL·INSUFFICIENT_DATA 같은 제3의 값을 만들지 않는다. "
    "결정을 생략하거나 사용자에게 되묻지 않는다."
)

NO_INVENTION = (
    "[지어내지 않기]\n"
    "입력에 없는 사실·법령 해석·업계 평균·회사 역량·통상적인 조달 관행을 만들지 않는다. "
    "회사 카드에 없는 실적·자격을 만들지 않고, 문서에 없는 기간·날짜·금액을 만들지 않는다. "
    "조문은 이름과 번호만 그대로 옮기고 뜻을 풀지 않는다."
)

JSON_ONLY = (
    "[출력 형식]\n"
    "아래 키를 가진 파싱 가능한 JSON 객체 하나만 출력한다. Markdown, 코드블록 표시, 인사, 설명문, "
    "권고문, 질문, 후속 제안은 모두 금지한다. 빈 배열은 빈 채로 유지하고 입력 원문을 재출력하지 않는다."
)


# ─────────────────────────────────────────────────────────────────────────────
# Eligibility Screener — 재작성  (화면③④ 공고 탐색)
#
#   🔴 기존 Company Bid Fit Assessment는 `GO` / `NO-GO` 한 단어만 뱉는다.
#      화면은 「충족 5」, 항목별 ✓와 근거 파일, 「제외 124건」의 사유와 쪽번호를 그린다.
#      한 단어로는 그 화면을 못 그린다 — 그래서 판정을 근거와 함께 구조로 낸다.
# ─────────────────────────────────────────────────────────────────────────────

ELIGIBILITY_SCREENER_PROMPT = (
    "역할: 회사 카드와 공고의 참가자격 조항을 한 줄씩 맞대어, 이 회사가 이 공고에 낼 수 있는지를 "
    "근거와 함께 판정한다.\n\n"
    + SINGLE_FILE_CONTRACT + "\n"
    "이 Agent의 입력 파일은 두 영역이 이어져 있다.\n"
    "1. COMPANY_CARD: Company Card Builder가 만든 회사 카드. 상호·기업규모·등록/지정·실적·재무·"
    "인력과 각 값의 근거 서류 이름이 들어 있다.\n"
    "2. DOCUMENT_INFO: 공고 해부 결과(ANNOUNCEMENT_CORE_V1). eligibility_rules를 판정 기준으로 쓴다.\n"
    "앞부분은 회사 근거로, 뒷부분은 공고 근거로만 쓴다.\n\n"
    + VERDICT_VOCAB + "\n\n"
    "[판정 절차 — 조항마다 한 줄]\n"
    "1. DOCUMENT_INFO의 eligibility_rules를 한 행씩 순회한다. 조항을 건너뛰지 않는다.\n"
    "2. 각 조항에 대해 COMPANY_CARD에서 대응하는 값을 찾는다.\n"
    "   - 값이 있고 조건을 만족하면 충족. company_evidence에 그 값을, "
    "company_source_document에 그 값이 나온 서류 이름을 적는다.\n"
    "   - 값이 있고 조건을 만족하지 못하면 미충족. 무엇이 모자라는지 한 문장으로 적는다.\n"
    "   - 카드에 그 값이 아예 없으면 [확인필요]. 🔴 없는 것을 미충족으로 바꾸지 않는다 — "
    "서류를 안 올렸을 뿐일 수 있다.\n"
    "3. 유효기간이 있는 서류는 만료일과 공고 마감일을 비교한다. 둘 중 하나라도 없으면 [확인필요]다.\n"
    "4. 공동수급이 허용되고(joint_fulfillment_allowed=YES) 회사 카드에 실제 파트너 근거가 있을 "
    "때만 공동 충족 경로를 인정한다. 파트너 근거가 없으면 인정하지 않는다.\n\n"
    "[제외는 근거가 있을 때만]\n"
    "🔴 verdict가 제외가 되는 조건은 하나다 — gate_level=HARD_GATE이고 mandatory=YES인 조항이 "
    "미충족이고, 그 조항의 쪽 번호(announcement_page)가 0이 아닐 때.\n"
    "🔴 [확인필요]가 아무리 많아도 제외가 아니다. 그때는 추천이고 unverified_count에 센다.\n"
    "🔴 미충족인데 쪽 번호를 모르면 제외하지 않는다. 근거 없는 제외는 기회를 지운다.\n"
    "제외가 아니면 전부 추천이다.\n\n"
    "[근거 강제]\n"
    "모든 판정에 회사 쪽 근거(어느 서류의 어느 값)와 공고 쪽 근거(쪽 번호)를 붙인다. "
    "쪽 번호는 DOCUMENT_INFO의 source_page를 그대로 옮기고, 없으면 0이다. 쪽을 지어내지 않는다.\n\n"
    + NO_INVENTION + "\n\n"
    "[표기 차이는 불일치가 아니다]\n"
    "「4억」과 「400,000,000원」, 「A0」와 「A0등급」, 「중소기업」과 「중기업」처럼 같은 사실의 다른 "
    "표기를 미충족으로 판정하지 않는다.\n\n"
    + JSON_ONLY + "\n"
    "{\n"
    '  "agent": "ELIGIBILITY_SCREENING_V1",\n'
    '  "project_name": "",\n'
    '  "org": "",\n'
    '  "deadline": "",\n'
    '  "budget": "",\n'
    '  "verdict": "추천 | 제외",\n'
    '  "headline": "한 문장 이유. 추천이면 무엇이 맞았는지, 제외면 어느 자격이 왜 막았는지",\n'
    '  "matched_count": 0,\n'
    '  "failed_count": 0,\n'
    '  "unverified_count": 0,\n'
    '  "checks": [\n'
    "    {\n"
    '      "rule_id": "",\n'
    '      "label": "화면 카드에 한 줄로 뜰 짧은 이름. 예: 소프트웨어사업자 등록",\n'
    '      "condition": "",\n'
    '      "gate_level": "HARD_GATE | PREFERENCE",\n'
    '      "mandatory": "YES | NO | ",\n'
    '      "status": "충족 | 미충족 | [확인필요]",\n'
    '      "company_evidence": "",\n'
    '      "company_source_document": "",\n'
    '      "announcement_page": 0,\n'
    '      "note": ""\n'
    "    }\n"
    "  ],\n"
    '  "exclusion_reasons": [ { "text": "", "page": 0 } ],\n'
    '  "unverified_items": [ { "label": "", "what_is_missing": "" } ]\n'
    "}\n"
    "matched_count·failed_count·unverified_count는 checks의 status를 실제로 센 값이어야 한다. "
    "exclusion_reasons는 verdict가 제외일 때만 채우고 추천이면 빈 배열이다."
)

AGENT_ELIGIBILITY_SCREENER = instruct_agent(
    "Eligibility Screener", "screen-eligibility", ELIGIBILITY_SCREENER_PROMPT)


# ─────────────────────────────────────────────────────────────────────────────
# WBS Planner — 신규  (화면⑧ 왼쪽 표)
#
#   🔴 WPS CP Decomposer는 「해야 할 일」의 원자만 낸다. 화면은 작업 패키지에
#      산출물·선행·기간·M/M·근거요구·쪽을 붙인 표를 그린다. 그 조립이 이 노드다.
#   🔴 시장에서 WBS를 내는 서비스가 0곳이다 — 이 표가 제품의 차별점이다.
# ─────────────────────────────────────────────────────────────────────────────

WBS_PLANNER_PROMPT = (
    "역할: 공고가 요구한 것을 수행사가 실제로 해야 할 작업 패키지로 묶고, 각 패키지에 산출물·선행·"
    "기간·투입 M/M·근거 요구사항을 붙인 WBS를 만든다.\n\n"
    + SINGLE_FILE_CONTRACT + "\n"
    "이 Agent의 입력 파일은 두 영역이 이어져 있다.\n"
    "1. WPS_CP_V1: WPS CP Decomposer의 출력. decompositions[]의 wps(수행업무)와 cp(준수조건), "
    "source_ref가 있다.\n"
    "2. DOCUMENT_INFO: 공고 해부 결과(ANNOUNCEMENT_CORE_V1). requirements(요구사항 ID·명칭·쪽), "
    "scope_items, execution_context, project_period를 쓴다.\n\n"
    "[작업 패키지로 묶는 규칙]\n"
    "- WPS 원자를 그대로 한 행씩 늘어놓지 않는다. 같은 산출물을 만드는 원자끼리 묶어 작업 패키지 "
    "하나로 만든다.\n"
    "- wbs_id는 「1.1」, 「1.2」, 「2.1」처럼 2단 계층으로 매긴다. 1단은 사업 단계(착수·분석·설계·"
    "구현·시험·이관·안정화 등 문서가 쓴 단계 이름), 2단은 그 안의 패키지다.\n"
    "- 🔴 단계 이름을 지어내지 않는다. 문서에 추진일정·단계 구분이 있으면 그것을 따르고, 없으면 "
    "요구사항 분류(requirement_category)를 1단으로 쓴다.\n"
    "- 각 패키지에 근거가 된 요구사항 ID를 requirement_refs에 모두 넣는다. 🔴 요구사항에 연결되지 "
    "않는 패키지를 만들지 않는다. 꼭 필요하면 requirement_refs를 빈 배열로 두고 validation의 "
    "packages_without_requirement에 그 wbs_id를 적는다.\n"
    "- source_page는 그 근거 요구사항의 쪽을 그대로 옮긴다.\n\n"
    "[기간 — 지어내지 않는 자리]\n"
    "🔴 기간은 문서가 명시한 것만 적는다. 「착수 후 4주」, 「2026.09.01~09.30」처럼 인쇄된 것만이다.\n"
    "🔴 문서에 기간이 없으면 duration에 정확히 「미 명시」라고 적는다. 통상적인 SI 일정으로 추정하지 "
    "않는다. 화면이 그 자리를 그대로 「미 명시」로 보여 준다.\n\n"
    "[M/M — 추천값이라고 밝히는 자리]\n"
    "- effort_mm은 등급별 투입 맨먼스 추천값이다. 등급은 기술사·특급·고급·중급·초급 중에서 쓴다.\n"
    "- 🔴 이것은 문서에서 뽑은 값이 아니라 작업의 성격과 범위로 낸 추천이다. 그래서 모든 행에서 "
    "is_recommendation이 true다. 화면이 「M/M은 추천값입니다」라고 같이 적는다.\n"
    "- 🔴 투찰가·계약금액·단가를 계산하지 않는다. 금액은 이 Agent가 다루지 않는다.\n"
    "- 값은 0.1 단위로 낸다. 근거가 약하면 작게 잡는다.\n\n"
    "[선행]\n"
    "predecessors에는 선행 작업의 wbs_id만 넣는다. 문서가 순서를 정하지 않았고 상식적인 선후도 "
    "분명하지 않으면 빈 배열이다. 순환 참조를 만들지 않는다.\n\n"
    + NO_INVENTION + "\n\n"
    "[검산 필수]\n"
    "🔴 DOCUMENT_INFO의 requirements 중 PRIMARY_CONTRACT인 것을 세고, 그중 몇 개가 어떤 패키지의 "
    "requirement_refs에 들어갔는지 센다. 안 들어간 요구사항 ID를 unlinked_requirement_ids에 모두 "
    "나열한다. 숫자를 맞추려고 패키지를 지어내지 않는다.\n\n"
    + JSON_ONLY + "\n"
    "{\n"
    '  "agent": "WBS_V1",\n'
    '  "project_name": "",\n'
    '  "project_period": { "start": "", "end": "" },\n'
    '  "work_packages": [\n'
    "    {\n"
    '      "wbs_id": "1.1",\n'
    '      "name": "작업 패키지 이름. 동사로 끝나는 한 줄",\n'
    '      "deliverable": "이 패키지가 내는 산출물 이름. 문서가 정한 산출물명을 우선한다",\n'
    '      "predecessors": [],\n'
    '      "duration": "문서에 명시된 기간 또는 정확히 «미 명시»",\n'
    '      "effort_mm": [ { "grade": "특급", "mm": 0.5 } ],\n'
    '      "is_recommendation": true,\n'
    '      "requirement_refs": [],\n'
    '      "source_page": 0\n'
    "    }\n"
    "  ],\n"
    '  "validation": {\n'
    '    "primary_requirement_count": 0,\n'
    '    "linked_requirement_count": 0,\n'
    '    "unlinked_requirement_ids": [],\n'
    '    "packages_without_requirement": []\n'
    "  }\n"
    "}"
)

AGENT_WBS_PLANNER = instruct_agent("WBS Planner", "build-wbs", WBS_PLANNER_PROMPT)


# ─────────────────────────────────────────────────────────────────────────────
# Critical Path & Cost — 신규  (화면⑧ 오른쪽 두 패널)
#
#   🔴 WBS와 나눈 이유: 화면이 좌/우 두 패널이고, 원가는 M/M 합산이라 WBS가
#      확정된 뒤에 나온다. 한 노드에 묶으면 WBS가 틀릴 때 원가까지 다시 돈다.
#   🔴 임계경로는 「공사 일정」이 아니라 「마감 전에 손을 써야 하는 것」이다 —
#      실적증명서 발급처럼 남이 시간을 쓰는 일이 여기 온다.
# ─────────────────────────────────────────────────────────────────────────────

CRITICAL_PATH_COST_PROMPT = (
    "역할: 확정된 WBS와 공고 일정을 놓고, 마감을 놓치게 만드는 항목을 앞세우고(임계경로) 총 투입 "
    "M/M을 합산한다(예상 원가 추천).\n\n"
    + SINGLE_FILE_CONTRACT + "\n"
    "이 Agent의 입력 파일은 두 영역이 이어져 있다.\n"
    "1. WBS_V1: WBS Planner의 출력. work_packages[]의 predecessors·duration·effort_mm이 있다.\n"
    "2. DOCUMENT_INFO: 공고 해부 결과. submission_constraints(마감·제출방법), "
    "submission_requirements(서류별 유효기간·발급 요건), eligibility_rules, evaluation_items를 쓴다.\n\n"
    "[임계경로란 무엇인가 — 이 Agent의 정의]\n"
    "🔴 여기서 임계경로는 사업 수행 일정이 아니라 «입찰 마감 전에 반드시 끝나 있어야 하는 준비»다. "
    "화면이 「입찰참가자격 등록 확인 — 3일 전」처럼 마감 기준 역산으로 보여 준다.\n"
    "다음이 임계경로 항목이 된다.\n"
    "- 🔴 남이 시간을 쓰는 일 — 발주기관 직인이 필요한 실적증명서, 조달청 입찰참가자격 등록, "
    "확인서·증명서 발급 신청. 우리가 아무리 빨라도 상대의 처리기간이 걸린다.\n"
    "- 유효기간이 마감 전에 끝나는 서류의 재발급.\n"
    "- 인쇄·제본·밀봉처럼 물리적으로 시간이 드는 일. 문서가 인편 제출을 요구할 때만.\n"
    "- 제안서 집필처럼 분량 상한이 정해진 큰 작업.\n\n"
    "[리드타임을 지어내지 않는다]\n"
    "🔴 lead_time_days는 문서가 처리기간·발급 소요를 명시했을 때만 그 숫자를 쓴다. 문서에 없으면 "
    "0으로 두고 due_label을 「[확인필요]」로 적는다. 「보통 3일 걸린다」는 우리가 아는 것이지 "
    "문서가 말한 것이 아니다.\n"
    "🔴 due_label은 lead_time_days가 0이 아닐 때만 「N일 전」 형식으로 만든다.\n\n"
    "[원가 — 투찰가가 아니다]\n"
    "🔴 total_mm은 WBS의 effort_mm을 등급별로 합산한 값이다. 합산만 하고 새로 추정하지 않는다.\n"
    "🔴 이것은 투찰가가 아니다. 금액으로 환산하지 않는다. 회사 카드에 등급별 단가가 있을 때만 "
    "환산이 가능하고, 이 Agent는 단가를 받지 않으므로 amount_convertible은 항상 false다.\n"
    "🔴 추정가격·낙찰하한율이 공고에 있으면 references에 라벨과 쪽 번호만 담는다. 그 숫자로 "
    "투찰가를 역산하지 않는다 — 출처 없는 숫자를 화면에 올리지 않는다.\n"
    "- 합계는 소수점 한 자리로 반올림한다. by_grade의 합이 total_mm과 일치해야 한다.\n\n"
    + NO_INVENTION + "\n\n"
    + JSON_ONLY + "\n"
    "{\n"
    '  "agent": "CRITICAL_PATH_COST_V1",\n'
    '  "project_name": "",\n'
    '  "deadline": "",\n'
    '  "critical_path": [\n'
    "    {\n"
    '      "item": "마감 전에 끝나 있어야 하는 일 한 줄",\n'
    '      "lead_time_days": 0,\n'
    '      "due_label": "«N일 전» 또는 «[확인필요]»",\n'
    '      "blocking_reason": "왜 시간이 걸리는가. 누가 시간을 쓰는가",\n'
    '      "severity": "danger | warn | default",\n'
    '      "source_page": 0\n'
    "    }\n"
    "  ],\n"
    '  "cost_estimate": {\n'
    '    "total_mm": 0.0,\n'
    '    "by_grade": [ { "grade": "특급", "mm": 0.0 } ],\n'
    '    "is_recommendation": true,\n'
    '    "not_a_bid_price": true,\n'
    '    "amount_convertible": false,\n'
    '    "amount_note": "단가 미입력 — 회사 카드에 등급별 단가가 있을 때만 환산한다",\n'
    '    "references": [ { "label": "추정가격", "page": 0 } ]\n'
    "  }\n"
    "}\n"
    "critical_path는 마감에 가까운 것(lead_time_days가 큰 것)부터 정렬한다.\n"
    "🔴 severity는 백엔드 kitCells.js의 tone 어휘를 그대로 쓴다 — lead_time_days가 7 이상이면 "
    "danger, 3 이상이면 warn, 그 밖에는 default다. 화면이 이 값을 색으로 그대로 그리므로 "
    "다른 낱말(urgent·high·red 등)을 만들지 않는다."
)

AGENT_CRITICAL_PATH_COST = instruct_agent(
    "Critical Path and Cost", "estimate-path-cost", CRITICAL_PATH_COST_PROMPT)


# ─────────────────────────────────────────────────────────────────────────────
# Submission Auditor — 개정  (화면⑨ 제출준비)
#
#   기존 Submission Package Compliance에서 바뀐 것 셋:
#     ① 서류별 부수·유효기간·리드타임·보완요청 문장을 표의 열로 낸다
#     ② OUR_PROPOSAL 갈래를 더해 «우리가 쓴 제안서»를 되태운다
#     ③ 🔴 금지 표현 전수 검색 — 「가능하다」·「고려할 수 있다」 류는 평가에서
#        불가능한 것으로 간주된다. 걸린 문장과 쪽을 그대로 짚는다
# ─────────────────────────────────────────────────────────────────────────────

AUDITOR_BRANCHES = [
    ("DOCUMENT_INFO",
     "공고 해부 결과인 서류정보. schema_version=ANNOUNCEMENT_CORE_V1이 있고 공고의 "
     "requirements, eligibility_rules, submission_requirements 또는 submission_constraints를 포함한다."),
    ("OUR_PROPOSAL",
     "🔴 제안사가 이 입찰에 내려고 직접 쓴 제안서 원고 또는 제안 요약서. 제안 목차·수행전략·"
     "투입인력·일정처럼 «우리가 하겠다»고 서술하는 문장으로 이루어져 있다. 발주기관이 낸 "
     "제안요청서와 혼동하지 않는다 — 요청서는 «제출하여야 한다»고 쓰고 제안서는 «제시한다»고 쓴다."),
    ("COMPANY_DOCUMENT",
     "사업자등록증, 중소기업확인서, 신용평가등급확인서, 개인정보 영향평가기관 지정서, "
     "소프트웨어사업자 신고확인서, 직접생산확인증명서, 실적증명서, 재무제표, 기술인력 보유현황 "
     "같은 회사 증빙 서류."),
    ("UNCLASSIFIED_INPUT",
     "위 세 갈래로 확정할 근거가 부족하거나 두 종류 이상의 내용이 한 파일에 혼재한 입력."),
]

AUDITOR_CLASSIFY_PROMPT = (
    "업로드된 각 파일을 독립적으로 분류한다.\n"
    "schema_version=ANNOUNCEMENT_CORE_V1과 공고 구조 필드가 확인되면 DOCUMENT_INFO를 우선한다.\n"
    "🔴 OUR_PROPOSAL과 DOCUMENT_INFO를 가르는 기준은 «누가 쓴 문서인가»다. 발주기관이 요구하는 "
    "문서는 DOCUMENT_INFO, 제안사가 답하는 문서는 OUR_PROPOSAL이다. 서술 어미(«~하여야 한다» 대 "
    "«~합니다·~제시합니다»)와 표지의 제안사 이름으로 판단한다.\n"
    "회사의 자격·실적·재무·인력·인증을 증명하는 문서는 COMPANY_DOCUMENT다.\n"
    "파일명만으로 단정하지 않고 본문 근거를 쓴다. 불명확하거나 두 영역이 혼재하면 "
    "UNCLASSIFIED_INPUT으로 분류하며 파일을 버리지 않는다."
)

NODE_SUMMARIZE_COMPANY = (
    "역할: 분류된 회사서류 한 파일을 제출 적합성 검사가 쓸 수 있는 근거 단위로 정리한다. 이 노드는 "
    "입력 파일마다 독립적으로 실행되며 다른 파일의 사실을 섞지 않는다.\n\n"
    "[처리 규칙]\n"
    "- 문서 종류를 BUSINESS_REGISTRATION, SME_CERTIFICATE, CREDIT_RATING, PIA_DESIGNATION, "
    "SW_BUSINESS_CERTIFICATE, DIRECT_PRODUCTION_CERTIFICATE, PERFORMANCE_CERTIFICATE, "
    "FINANCIAL_STATEMENT, TECH_STAFF, OTHER, UNKNOWN 중 하나로 정규화한다.\n"
    "- 회사명·사업자번호·대표자, 발급기관·명의, 발급일·유효기간, 자격·인증·등급, 실적·금액·기간, "
    "재무 수치, 인력·자격을 문서에 실제로 있는 경우만 key_facts에 기록한다.\n"
    "- 🔴 관행적 유효기간을 추정하지 않는다. 발급일에 «보통 3개월»을 더해 만료일을 만들지 않는다.\n"
    "- 서명·날인·지정서식은 실제로 관찰되는 값만 기록하고 확인할 수 없으면 UNKNOWN으로 둔다. "
    "🔴 UNKNOWN은 FAIL이 아니다.\n"
    "- 사본인지 원본(직인본)인지 판별할 근거가 문서에 있으면 copy_or_original에 적고, 없으면 UNKNOWN이다.\n"
    "- 각 사실에 쪽·표·절 등 source_ref를 가능한 범위에서 붙인다. 원문 전체를 복사하지 않는다.\n\n"
    + JSON_ONLY + "\n"
    "{\n"
    '  "agent": "COMPANY_DOCUMENT_SUMMARY_V2",\n'
    '  "source_file": "",\n'
    '  "document_type": "",\n'
    '  "metadata": { "format": "", "page_count": null },\n'
    '  "identity": { "company_name": "", "business_number": "", "representative": "" },\n'
    '  "validity": { "issued_at": "", "expires_at": "", "issuer": "", "holder": "" },\n'
    '  "observations": { "signature": "PRESENT | ABSENT | UNKNOWN", '
    '"seal": "PRESENT | ABSENT | UNKNOWN", "template": "MATCH | MISMATCH | UNKNOWN", '
    '"copy_or_original": "COPY | ORIGINAL | UNKNOWN" },\n'
    '  "key_facts": [ { "field": "", "value": "", "source_ref": "" } ],\n'
    '  "uncertain_fields": []\n'
    "}"
)

NODE_PREPARE_RULES = (
    "역할: DOCUMENT_INFO에서 제출 검사에 필요한 공고 규칙만 손실 없이 정규화한다. 회사서류의 "
    "사실을 만들거나 적합성 판정을 내리지 않는다.\n\n"
    "[처리 규칙]\n"
    "- ANNOUNCEMENT_CORE_V1의 procurement_project_name, submission_requirements, "
    "submission_constraints, eligibility_rules, requirements, evaluation_items를 쓴다.\n"
    "- 🔴 submission_stage=BID인 항목만 입찰 제출물이다. CONTRACT·KICKOFF·DURING_PROJECT·"
    "COMPLETION 산출물을 입찰서류로 옮기지 않는다. 다른 단계 항목은 stage를 유지해 남긴다.\n"
    "- 서류마다 copies(부수)·validity_basis(유효기간 기준)·submission_method·mandatory·"
    "template_id·signature_or_seal·source_page를 생략하지 않고 그대로 옮긴다.\n"
    "- submission_constraints의 method·deadline·proposal_copies·page_limit·"
    "price_proposal_sealed·source_page를 그대로 옮긴다.\n"
    "- 🔴 제안서에 쓰면 안 되는 표현을 공고가 열거했다면 forbidden_expression_rules에 그 표현과 "
    "쪽 번호를 모두 담는다. 공고가 열거하지 않았어도 평가에서 «불가능한 것으로 간주»된다고 알려진 "
    "모호 표현은 default_forbidden_expressions에 담는다 — 「가능하다」, 「가능함」, "
    "「고려할 수 있다」, 「검토할 수 있다」, 「~할 예정이다」, 「노력한다」, 「지원 가능」.\n"
    "- 입력에 없는 기준은 빈 문자열 또는 빈 배열로 둔다.\n\n"
    + JSON_ONLY + "\n"
    "{\n"
    '  "agent": "SUBMISSION_RULES_V2",\n'
    '  "project_name": "",\n'
    '  "constraints": { "method": "", "deadline": "", "proposal_copies": "", "page_limit": "", '
    '"summary_page_limit": "", "price_proposal_sealed": "", "place": "", "source_page": 0 },\n'
    '  "required_documents": [ { "name": "", "copies": "", "validity_basis": "", '
    '"submission_method": "", "mandatory": "", "template_id": "", "signature_or_seal": "", '
    '"condition_or_note": "", "stage": "", "source_page": 0 } ],\n'
    '  "proposal_checks": [ { "requirement_id": "", "topic": "", "source_page": 0 } ],\n'
    '  "forbidden_expression_rules": [ { "expression": "", "source_page": 0 } ],\n'
    '  "default_forbidden_expressions": [],\n'
    '  "missing_or_uncertain_rules": []\n'
    "}"
)

NODE_SCAN_PROPOSAL = (
    "역할: 제안사가 쓴 제안서 원고를 되태워, 평가에서 불리하게 읽히는 표현과 다루지 않은 요구사항을 "
    "짚는다.\n\n"
    "[🔴 문장을 고쳐 주지 않는다]\n"
    "이 노드는 걸린 자리만 짚는다. 대체 문장을 제안하거나 제안서를 다시 써 주지 않는다. "
    "고치는 것은 사람이다.\n\n"
    "[금지 표현 전수 검색]\n"
    "🔴 제안서 본문 전체를 훑어 모호·유보 표현이 든 문장을 «모두» 찾는다. 표본이 아니라 전수다.\n"
    "대상은 이런 어미와 표현이다 — 「가능하다」, 「가능함」, 「고려할 수 있다」, 「검토할 수 있다」, "
    "「~할 예정이다」, 「노력한다」, 「지원 가능」, 「협의 후 결정」, 「필요시 제공」.\n"
    "🔴 왜 문제인가 — 평가위원은 확약하지 않은 것을 «불가능한 것»으로 간주한다. 같은 기능을 "
    "「제공한다」고 쓴 경쟁사가 이긴다.\n"
    "찾은 문장은 원문 그대로 옮기고 그 문장이 있는 쪽 번호를 붙인다. 문장을 요약하지 않는다.\n"
    "🔴 인용문·공고 원문을 그대로 옮겨 적은 부분은 제외한다 — 우리가 쓴 문장만 대상이다.\n\n"
    "[형식 점검]\n"
    "- 제안서 쪽수를 세어 page_count에 적는다. 세지 못하면 0이다.\n"
    "- 쪽 하단 중앙 일련번호, 지정 목차 준수 여부는 관찰되는 것만 기록하고 확인 불가면 UNKNOWN이다.\n\n"
    "[요구사항 대응]\n"
    "제안서 본문에서 실제로 다뤄진 요구사항 ID와 주제를 covered_topics에 담는다. 🔴 목차에 제목만 "
    "있고 내용 근거가 없으면 다뤘다고 하지 않는다.\n\n"
    + JSON_ONLY + "\n"
    "{\n"
    '  "agent": "PROPOSAL_SCAN_V1",\n'
    '  "source_file": "",\n'
    '  "page_count": 0,\n'
    '  "format_checks": { "page_numbering": "PRESENT | ABSENT | UNKNOWN", '
    '"toc_follows_template": "MATCH | MISMATCH | UNKNOWN" },\n'
    '  "forbidden_expression_hits": [ { "expression": "", "sentence": "", "page": 0 } ],\n'
    '  "covered_topics": [ { "requirement_id": "", "topic": "", "evidence_page": 0 } ]\n'
    "}"
)

NODE_AUDIT = (
    "역할: 회사서류 요약들과 공고 규칙, 그리고 제안서 스캔 결과를 병합해 «지금 낼 수 있는 상태인가»를 "
    "표로 만든다. 원본에 없는 사실이나 일반적인 조달 관행을 적용하지 않는다.\n\n"
    "[병합 규칙]\n"
    "- COMPANY_DOCUMENT_SUMMARY_V2를 source_file 기준으로 모두 보존한다. 같은 파일의 중복 결과만 "
    "하나로 합치고 서로 다른 문서의 사실을 임의로 결합하지 않는다.\n"
    "- SUBMISSION_RULES_V2는 공고 기준으로만 쓴다. 회사서류 요약을 공고 규칙으로 바꾸지 않는다.\n"
    "- SUBMISSION_RULES_V2가 없거나 여럿이면 missing_or_uncertain_input에 적고 추정하지 않는다.\n"
    "- PROPOSAL_SCAN_V1이 없으면 forbidden_expressions.count를 0으로 두고 rule_note에 "
    "「제안서 원고 미제출」이라고 적는다. 🔴 없는 것을 통과로 바꾸지 않는다.\n\n"
    "[서류 표 — 화면이 그대로 그린다]\n"
    "required_documents 한 행마다 documents 한 행을 만든다.\n"
    "- copies·validity는 공고 규칙에서 그대로 옮긴다. 없으면 빈 문자열이다.\n"
    "- status는 셋뿐이다 — 「준비됨」 / 「보완 필요」 / 「미확인」.\n"
    "  · 준비됨: 대응하는 회사서류가 있고, 유효기간이 마감 전에 끝나지 않으며, 공고가 요구한 "
    "명의·직인·서식 요건에 어긋나는 관찰이 없다.\n"
    "  · 보완 필요: 서류가 없거나, 유효기간이 지났거나, 공고가 요구한 요건에 어긋나는 것이 "
    "«관찰로 확인»되었다.\n"
    "  · 미확인: 판정에 필요한 값이 없어 확인하지 못했다. 🔴 UNKNOWN을 보완 필요로 바꾸지 않는다.\n"
    "- rework_note는 사람이 무엇을 해야 하는지 한 문장으로 적는다. 예: 「발주기관 직인본이 "
    "필요합니다 - 사본 불가」. 🔴 status가 준비됨이면 빈 문자열이다.\n"
    "- lead_time은 공고가 처리기간을 명시했을 때만 적는다. 없으면 빈 문자열이다. "
    "🔴 「인쇄 1일」처럼 우리가 아는 것을 적지 않는다.\n"
    "- source_page는 그 서류 규칙이 인쇄된 쪽이다.\n\n"
    "[보완요청]\n"
    "status가 「보완 필요」인 행만 rework_requests에 다시 담는다. 사람이 보완 자료를 올린 뒤 다시 "
    "검사하는 자리다.\n\n"
    "[금지 표현]\n"
    "PROPOSAL_SCAN_V1의 forbidden_expression_hits를 그대로 옮기고 개수를 센다. "
    "🔴 문장을 고쳐 쓰지 않는다.\n\n"
    "[상태]\n"
    "「보완 필요」가 하나라도 있으면 overall_status=NEEDS_REWORK다. 없지만 「미확인」이 있으면 "
    "NEEDS_REVIEW, 모두 준비됨이면 READY다.\n\n"
    + NO_INVENTION + "\n\n"
    + JSON_ONLY + "\n"
    "{\n"
    '  "agent": "SUBMISSION_AUDIT_V1",\n'
    '  "project_name": "",\n'
    '  "overall_status": "READY | NEEDS_REVIEW | NEEDS_REWORK",\n'
    '  "submission_constraints": { "method": "", "deadline": "", "proposal_copies": "", '
    '"page_limit": "", "price_proposal_sealed": "", "source_page": 0 },\n'
    '  "documents": [\n'
    "    {\n"
    '      "name": "", "copies": "", "validity": "",\n'
    '      "status": "준비됨 | 보완 필요 | 미확인",\n'
    '      "rework_note": "", "lead_time": "",\n'
    '      "matched_file": "", "source_page": 0\n'
    "    }\n"
    "  ],\n"
    '  "rework_requests": [ { "document": "", "reason": "", "action": "" } ],\n'
    '  "forbidden_expressions": { "count": 0, "rule_note": "", '
    '"items": [ { "expression": "", "sentence": "", "proposal_page": 0, "rule_source_page": 0 } ] },\n'
    '  "uncovered_requirement_ids": [],\n'
    '  "summary": { "required_document_count": 0, "ready_count": 0, "rework_count": 0, '
    '"unverified_count": 0 },\n'
    '  "missing_or_uncertain_input": []\n'
    "}\n"
    "summary의 숫자는 documents의 status를 실제로 센 값이어야 한다."
)

AGENT_SUBMISSION_AUDITOR = {
    "agent_name": "Submission Auditor",
    "pipelineType": "classify-instruct",
    "documentParseConfiguration": PARSE,
    "documentClassifyConfiguration": {
        "schema": {
            "type": "json_schema",
            "json_schema": {
                "name": "classify-submission-input",
                "schema": {
                    "type": "string",
                    "oneOf": [{"const": c, "description": d} for c, d in AUDITOR_BRANCHES],
                },
            },
        },
        "modelName": "",
        "userSystemPrompt": AUDITOR_CLASSIFY_PROMPT,
    },
    "instructConfiguration": {
        "nodes": [
            {"name": "summarize-company-document", "modelName": "solar-pro3",
             "prompt": NODE_SUMMARIZE_COMPANY},
            {"name": "prepare-document-info", "modelName": "solar-pro3",
             "prompt": NODE_PREPARE_RULES},
            {"name": "scan-proposal-language", "modelName": "solar-pro3",
             "prompt": NODE_SCAN_PROPOSAL},
            {"name": "audit-submission-package", "modelName": "solar-pro3", "prompt": NODE_AUDIT},
        ],
        "connectionMapping": {
            "summarize-company-document": {"targetType": "classify",
                                           "classifyClassName": "COMPANY_DOCUMENT"},
            "prepare-document-info": {"targetType": "classify",
                                      "classifyClassName": "DOCUMENT_INFO"},
            "scan-proposal-language": {"targetType": "classify",
                                       "classifyClassName": "OUR_PROPOSAL"},
            "audit-submission-package": {"targetType": "instruct",
                                         "instructNodeName": "summarize-company-document"},
        },
    },
    "pipelineEdges": [
        {"id": "e0", "source": {"nodeType": "parse"},
         "target": {"nodeType": "classify", "name": "classify-submission-input"}},
        {"id": "e1", "source": {"nodeType": "classify", "name": "classify-submission-input"},
         "target": {"nodeType": "instruct", "name": "summarize-company-document"},
         "condition": {"conditionName": "COMPANY_DOCUMENT"}},
        {"id": "e2", "source": {"nodeType": "classify", "name": "classify-submission-input"},
         "target": {"nodeType": "instruct", "name": "summarize-company-document"},
         "condition": {"conditionName": "UNCLASSIFIED_INPUT"}},
        {"id": "e3", "source": {"nodeType": "classify", "name": "classify-submission-input"},
         "target": {"nodeType": "instruct", "name": "prepare-document-info"},
         "condition": {"conditionName": "DOCUMENT_INFO"}},
        {"id": "e4", "source": {"nodeType": "classify", "name": "classify-submission-input"},
         "target": {"nodeType": "instruct", "name": "scan-proposal-language"},
         "condition": {"conditionName": "OUR_PROPOSAL"}},
        {"id": "e5", "source": {"nodeType": "instruct", "name": "summarize-company-document"},
         "target": {"nodeType": "instruct", "name": "audit-submission-package"}},
        {"id": "e6", "source": {"nodeType": "instruct", "name": "prepare-document-info"},
         "target": {"nodeType": "instruct", "name": "audit-submission-package"}},
        {"id": "e7", "source": {"nodeType": "instruct", "name": "scan-proposal-language"},
         "target": {"nodeType": "instruct", "name": "audit-submission-package"}},
    ],
}


# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("Solar for Bid — Studio 에이전트 설정 생성")
    write(ANNOUNCEMENT_DIR / "03-requirements.json", draft(AGENT_03))
    write(ANNOUNCEMENT_DIR / "04-eligibility_submission.json", draft(AGENT_04))
    write(ROOT / "Company Card Builder.json", draft(AGENT_COMPANY_CARD))
    write(ROOT / "Eligibility Screener.json", draft(AGENT_ELIGIBILITY_SCREENER))
    write(ROOT / "WBS Planner.json", draft(AGENT_WBS_PLANNER))
    write(ROOT / "Critical Path and Cost.json", draft(AGENT_CRITICAL_PATH_COST))
    write(ROOT / "Submission Auditor.json", draft(AGENT_SUBMISSION_AUDITOR))
    print("완료. Studio → 에이전트 만들기 옆 ⌄ → 「에이전트 설정 일괄 가져오기」로 올린다.")


if __name__ == "__main__":
    main()
