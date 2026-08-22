import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import * as ctrl from '../controllers/judge.controller.js';

export const judgeRouter = Router();

/**
 * @openapi
 * /api/judge/eligibility:
 *   post:
 *     tags: [judge]
 *     summary: 자격 판정 — 회사 카드 ↔ 공고 참가자격을 조항마다 맞댄다 (S4 · 화면③④)
 *     description: |
 *       Solar Chat API로 `agent/Eligibility Screener.json` 의 프롬프트를 태운다.
 *       🔴 판정은 **제외 / 추천** 둘뿐이고, 항목은 **충족 / 미충족 / [확인필요]** 셋뿐이다.
 *       🔴 `[확인필요]`는 제외 사유가 아니다. 근거 쪽이 없는 미충족도 제외 사유가 아니다 —
 *       서버가 개수를 다시 세고, 근거 없는 제외는 추천으로 되돌린다(`_meta.overridden`).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyCard, announcement]
 *             properties:
 *               companyCard:   { type: object, description: 'COMPANY_CARD_V1 — fixtures/studio/company_card.flat.json 모양' }
 *               announcement:  { type: object, description: 'ANNOUNCEMENT_CORE_V1 — 공고 해부 병합 결과' }
 *     responses:
 *       200: { description: ELIGIBILITY_SCREENING_V1 + meta }
 *       400: { $ref: '#/components/responses/Error' }
 *       502: { $ref: '#/components/responses/Error' }
 *       503: { $ref: '#/components/responses/Error' }
 */
judgeRouter.post('/judge/eligibility', asyncHandler(ctrl.eligibility));
