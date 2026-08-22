import { AppError } from '../errors/AppError.js';
import { judgeEligibility, judgePlan, judgeSubmission } from '../services/solarJudge.service.js';

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

export async function plan(req, res) {
  const { announcement } = req.body ?? {};
  requireObject(announcement, 'announcement', '공고 해부 결과');
  res.json(await judgePlan({ announcement }));
}

export async function submission(req, res) {
  const { announcement, companyCard, proposalText } = req.body ?? {};
  requireObject(announcement, 'announcement', '공고 해부 결과');
  requireObject(companyCard, 'companyCard', '회사 카드');
  if (proposalText !== undefined && proposalText !== null && typeof proposalText !== 'string') {
    throw new AppError('E_VALIDATION', '`proposalText`(제안서 본문)는 문자열로 보내 주세요. 없으면 생략합니다.');
  }
  res.json(await judgeSubmission({ announcement, companyCard, proposalText }));
}
