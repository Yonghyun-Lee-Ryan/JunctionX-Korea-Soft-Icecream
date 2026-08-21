/**
 * 🔴 임시 표다. 정본은 `plan/Solar_for_Bid/04_계약/error-codes.md`(정운 소유)이고,
 *    그 파일이 생기면 여기 값을 **복사**해 온다 — 여기서 새 코드를 짓지 않는다.
 * 🔴 프론트는 code를 문장으로 매핑하지 않는다. `error.message`를 그대로 렌더한다.
 *    그래서 message는 서버가 **완성문**으로 만든다.
 */
export const ERROR_CODES = {
  E_VALIDATION:        { status: 400, message: '입력값을 확인해 주세요.' },
  E_CASE_NOT_FOUND:    { status: 404, message: '해당 공고 건을 찾지 못했습니다. 공고번호와 차수를 다시 확인해 주세요.' },
  E_COMPANY_NOT_FOUND: { status: 404, message: '회사 정보를 찾지 못했습니다. 회사 서류를 먼저 올려 주세요.' },
  E_TAB_NOT_FOUND:     { status: 404, message: '요청하신 표를 찾지 못했습니다.' },
  E_NO_ATTACHMENT:     { status: 404, message: '첨부를 찾지 못했습니다. 공고번호와 차수를 다시 확인해 주세요.' },
  E_UPSTREAM_G2B:      { status: 502, message: '나라장터에서 첨부를 받지 못했습니다. 잠시 후 다시 시도해 주세요.' },
  E_UPSTREAM_STUDIO:   { status: 502, message: '문서 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
  E_NOT_CONFIGURED:    { status: 503, message: '실시간 분석 설정이 없어 저장된 결과를 보여 드립니다.' },
  E_INTERNAL:          { status: 500, message: '처리 중 오류가 발생했습니다.' },
};
