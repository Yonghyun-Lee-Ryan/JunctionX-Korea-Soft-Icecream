import { AppError } from '../errors/AppError.js';
import { judgeEligibility, judgePlan, judgeSubmission } from '../services/solarJudge.service.js';
import { buildKit } from '../services/kit.service.js';

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

/** 판정 결과 → 탭 봉투. Solar 를 부르지 않는다 — 순수 매핑 */
export function kit(req, res) {
  const { announcement, eligibility, plan, submission, caseId } = req.body ?? {};
  requireObject(announcement, 'announcement', '공고 해부 결과');
  for (const [name, value, hint] of [[ 'eligibility', eligibility, '자격 판정'], ['plan', plan, '계획 판정'], ['submission', submission, '제출 검사']]) {
    if (value !== undefined && value !== null) requireObject(value, name, hint);
  }
  res.json(buildKit({
    announcement, eligibility: eligibility ?? undefined, plan: plan ?? undefined, submission: submission ?? undefined,
    caseId: typeof caseId === 'string' ? caseId : undefined,
  }));
}
