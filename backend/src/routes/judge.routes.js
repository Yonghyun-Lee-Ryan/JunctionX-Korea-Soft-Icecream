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

/**
 * @openapi
 * /api/judge/plan:
 *   post:
 *     tags: [judge]
 *     summary: 계획 — WPS/CP 분해 → WBS → 임계경로·M/M 원가 (S6 · 화면⑧)
 *     description: |
 *       Solar 3호출을 순서대로 잇는다. 앞 판정의 **가드를 거친** 결과가 다음 입력이 된다.
 *       🔴 기간은 문서가 말한 것만 — 없으면 「미 명시」. M/M 은 전부 추천값(`is_recommendation`).
 *       🔴 임계경로의 리드타임을 지어내지 않는다 — 0 이면 「[확인필요]」. 원가는 WBS 합산 M/M 이고 **투찰가가 아니다**.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [announcement]
 *             properties:
 *               announcement: { type: object, description: 'ANNOUNCEMENT_CORE_V1 — requirements·scope_items 가 있어야 한다' }
 *     responses:
 *       200: { description: '{ wpsCp: WPS_CP_V1, wbs: WBS_V1, criticalPath: CRITICAL_PATH_COST_V1, meta }' }
 *       400: { $ref: '#/components/responses/Error' }
 *       502: { $ref: '#/components/responses/Error' }
 *       503: { $ref: '#/components/responses/Error' }
 */
judgeRouter.post('/judge/plan', asyncHandler(ctrl.plan));
