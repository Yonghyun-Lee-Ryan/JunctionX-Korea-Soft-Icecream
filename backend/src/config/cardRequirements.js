/**
 * 🔴 회사 카드가 «완성»되려면 무엇이 있어야 하는가.
 *    프론트와 백엔드가 **같은 표를 본다** — 한쪽만 고치면 화면은 되는데 저장이 막히는 일이 생긴다.
 *    정본은 여기이고, 프론트는 `GET /api/companies/card/requirements`로 받아 간다.
 */
export const CARD_REQUIREMENTS = [
  { field: '상호',      anyOf: ['biz_reg'],                       why: '사업자등록증에서만 확정할 수 있습니다.' },
  { field: '소재지',    anyOf: ['biz_reg'],                       why: '사업자등록증에서만 확정할 수 있습니다.' },
  { field: '기업 규모', anyOf: ['sme_cert'],                      why: '중소기업확인서가 필요합니다.' },
  { field: '등록・지정', anyOf: ['sw_business', 'pia_designation'], why: '소프트웨어사업자 신고확인서 또는 영향평가기관 지정서가 필요합니다.' },
  { field: '최근 실적', anyOf: ['performance'],                    why: '실적증명서가 필요합니다.' },
  { field: '재무',      anyOf: ['financial'],                      why: '재무제표가 필요합니다.' },
  { field: '인력',      anyOf: ['tech_staff'],                     why: '기술인력 보유현황이 필요합니다.' },
];

/**
 * @param {string[]} presentKeys 올라온 docType.key 목록
 * @returns {{complete: boolean, missing: Array<{field:string, anyOf:string[], why:string}>}}
 */
export function checkCardRequirements(presentKeys) {
  const have = new Set(presentKeys ?? []);
  const missing = CARD_REQUIREMENTS.filter((r) => !r.anyOf.some((k) => have.has(k)));
  return { complete: missing.length === 0, missing };
}
