import { AppError } from '../errors/AppError.js';
import { judgeEligibility } from '../services/solarJudge.service.js';

/** 🔴 판정 입력은 앞 단계 JSON **객체**다. 문자열·배열·빈 값은 400 완성문으로 돌려보낸다 */
function requireObject(value, name, hint) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('E_VALIDATION', `\`${name}\`(${hint})를 JSON 객체로 보내 주세요.`);
  }
  return value;
}

export async function eligibility(req, res) {
  const { companyCard, announcement } = req.body ?? {};
  requireObject(companyCard, 'companyCard', '회사 카드');
  requireObject(announcement, 'announcement', '공고 해부 결과');
  res.json(await judgeEligibility({ companyCard, announcement }));
}
