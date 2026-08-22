/**
 * 업로드된 PDF를 가르는 8갈래.
 *
 * 🔴 매칭 전에 **모든 공백을 지운다.** 이 서식들은 제목에 자간이 들어가서
 *    텍스트 추출 결과가 「사 업 자 등 록 증」으로 나온다 — 공백을 두면 하나도 안 걸린다.
 *
 * 점수 = title(제목 앵커) + support(보조 단서) × 1
 *   🔴 title은 **문서 앞부분에서 걸릴 때만** 제 무게(TITLE_HEAD)를 갖는다.
 *      뒤쪽에서만 걸리면 TITLE_TAIL로 깎는다 — 각주가 남의 표제를 인용하는 일이 실제로 있다.
 *      (지정서의 「현재 현황은 『기술인력 보유현황』을 따릅니다」가 tech_staff를 훔쳤다)
 *   - deny는 두 번째 안전망이다
 */
export const HEAD_CHARS = 700;   // 「문서 앞부분」의 범위 (공백 제거 후 기준)
export const TITLE_HEAD = 16;    // 앞부분에서 걸린 표제
export const TITLE_TAIL = 3;     // 뒤에서만 걸린 표제 — 인용일 가능성이 크다
export const MIN_SCORE = 10;     // 이보다 낮으면 판정하지 않는다 — 억지로 넣지 않는다
export const MIN_MARGIN = 6;     // 1등과 2등이 이보다 가까우면 판정하지 않는다

export const DOC_TYPES = [
  {
    key: 'biz_reg',
    label: '사업자등록증',
    agentEnv: 'STUDIO_AGENT_BIZ_REG',
    title: ['사업자등록증'],
    support: ['법인사업자', '세무서장', '국세청', '부가가치세법시행규칙', '개업연월일', '주류판매신고번호'],
    deny: [],
  },
  {
    key: 'sme_cert',
    label: '중소기업확인서',
    agentEnv: 'STUDIO_AGENT_SME_CERT',
    title: ['중소기업확인서'],
    support: ['중소기업기본법', '중소벤처기업부장관', '기업규모', '상시근로자수', '중소기업현황정보시스템'],
    deny: [],
  },
  {
    key: 'credit_rating',
    label: '신용평가등급확인서',
    agentEnv: 'STUDIO_AGENT_CREDIT_RATING',
    title: ['신용평가등급확인서'],
    support: ['기업신용등급', '등급체계', '등급정의', '채무이행능력', '경영상태평가', '유효기간'],
    deny: [],
  },
  {
    key: 'pia_designation',
    label: '개인정보 영향평가기관 지정서',
    agentEnv: 'STUDIO_AGENT_PIA_DESIGNATION',
    title: ['개인정보영향평가기관지정서'],
    support: ['개인정보보호위원회', '지정번호', '지정분야', '개인정보보호법', '변경신고'],
    deny: [],
  },
  {
    key: 'sw_business',
    label: '소프트웨어사업자 신고확인서',
    agentEnv: 'STUDIO_AGENT_SW_BUSINESS',
    title: ['소프트웨어사업자신고확인서'],
    support: ['소프트웨어진흥법', '한국소프트웨어산업협회', '신고번호', '신고사업분야', '주된사업', '부수사업'],
    deny: [],
  },
  {
    key: 'performance',
    label: '실적증명서',
    agentEnv: 'STUDIO_AGENT_PERFORMANCE',
    title: ['용역실적증명서', '실적증명서', '용역수행실적총괄표'],
    support: ['계약금액', '용역기간', '참여형태', '수행내용', '발주기관', '수행결과', '주관'],
    deny: [],
  },
  {
    key: 'financial',
    label: '재무제표',
    agentEnv: 'STUDIO_AGENT_FINANCIAL',
    title: ['재무상태표', '손익계산서'],
    support: ['부채와자본총계', '자산총계', '유동자산', '비유동부채', '이익잉여금', '매출총이익', '당기순이익', '일반기업회계기준'],
    // 중소기업확인서에도 매출액·자산총액이 있지만 저 표제는 없다
    deny: ['중소기업확인서'],
  },
  {
    key: 'tech_staff',
    label: '기술인력 보유현황',
    agentEnv: 'STUDIO_AGENT_TECH_STAFF',
    title: ['기술인력보유현황', '기술인력명부'],
    support: ['기술등급', '정규직', '계약직', '보유자격', '담당분야', '총경력', '입사년월', '구성비'],
    // 🔴 신고확인서·지정서에도 인력 표와 「기술인력 보유현황」 인용이 있다 — 그쪽 표제가 있으면 양보한다
    deny: ['소프트웨어사업자신고확인서', '개인정보영향평가기관지정서'],
  },
];

export const DOC_TYPE_MAP = Object.fromEntries(DOC_TYPES.map((t) => [t.key, t]));
export const DOC_TYPE_KEYS = DOC_TYPES.map((t) => t.key);

/** 🔴 공백 제거 + 소문자화. 매칭은 전부 이 형태 위에서 한다 */
export function normalize(text) {
  return String(text ?? '').replace(/\s+/gu, '').toLowerCase();
}
