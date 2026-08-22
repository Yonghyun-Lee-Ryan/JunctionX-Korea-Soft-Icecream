import { AppError } from '../errors/AppError.js';
import { caseRepo } from '../services/case.service.js';
import { setCheck as saveCheck } from '../repositories/caseCheck.repo.js';

/** 체크리스트의 체크 하나를 저장한다 → 그 탭에서 지금 체크된 키 전부 */
export function setCheck(req, res) {
  const { caseId, tabId } = req.params;
  if (!caseRepo.findCase(caseId)) throw new AppError('E_CASE_NOT_FOUND');
  const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
  if (!key) throw new AppError('E_VALIDATION', '어느 행인지 `key`(행의 첫 칸, 예: SFR-001)를 보내 주세요.');
  if (typeof req.body?.checked !== 'boolean') throw new AppError('E_VALIDATION', '`checked` 는 true/false 여야 합니다.');
  res.json({ caseId, tabId, checked: saveCheck(caseId, tabId, key, req.body.checked) });
}
