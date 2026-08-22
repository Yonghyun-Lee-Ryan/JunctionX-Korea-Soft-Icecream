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
  E_TAB_NOT_TABULAR:   { status: 409, message: '이 자료는 표가 아니라 파일로 내려받을 수 없습니다.' },
  E_NO_ATTACHMENT:     { status: 404, message: '첨부를 찾지 못했습니다. 공고번호와 차수를 다시 확인해 주세요.' },
  E_UPSTREAM_G2B:      { status: 502, message: '나라장터에서 첨부를 받지 못했습니다. 잠시 후 다시 시도해 주세요.' },
  E_UPSTREAM_STUDIO:   { status: 502, message: '문서 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
  E_STUDIO_TIMEOUT:    { status: 504, message: '문서 분석이 예상보다 오래 걸립니다. 파일을 줄이거나 잠시 후 다시 시도해 주세요.' },
  E_UNSUPPORTED_FILE:  { status: 415, message: 'PDF 파일만 올릴 수 있습니다.' },
  E_FILE_REQUIRED:     { status: 400, message: '분석할 PDF 파일을 올려 주세요.' },
  E_DOC_TYPE_UNKNOWN:  { status: 422, message: '문서 종류를 판정하지 못했습니다. 지원하는 8종(사업자등록증·중소기업확인서·신용평가등급확인서·개인정보 영향평가기관 지정서·소프트웨어사업자 신고확인서·실적증명서·재무제표·기술인력 보유현황) 중 하나인지 확인해 주세요.' },
  E_AGENT_NOT_SET:     { status: 503, message: '이 문서 종류를 처리할 분석기가 아직 연결되지 않았습니다.' },
  E_CARD_INCOMPLETE:   { status: 422, message: '회사 카드를 만들기에 서류가 부족합니다.' },
  E_RFP_NOT_FOUND:     { status: 422, message: '공고 첨부에서 제안요청서를 찾지 못했습니다. 첨부에 제안요청서(HWP·PDF)가 있는지 확인해 주세요.' },
  E_NOT_CONFIGURED:    { status: 503, message: '실시간 분석 설정이 없어 저장된 결과를 보여 드립니다.' },
  E_UPSTREAM_SOLAR:    { status: 502, message: '판정 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
  E_JUDGE_OUTPUT_INVALID: { status: 502, message: '판정 결과를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.' },
  E_INTERNAL:          { status: 500, message: '처리 중 오류가 발생했습니다.' },
};
