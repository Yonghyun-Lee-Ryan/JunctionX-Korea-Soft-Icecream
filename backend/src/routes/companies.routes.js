import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import * as ctrl from '../controllers/companies.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
});

export const companiesRouter = Router();

/**
 * @openapi
 * /api/companies:
 *   post:
 *     tags: [companies]
 *     summary: 회사 서류를 올려 회사 카드를 만든다 (S1)
 *     description: |
 *       사업자등록증 · 실적증명서 · 재무제표 · 기술인력 보유현황 · 신용평가등급확인서 ·
 *       중소기업확인서 · 영향평가기관 지정서 등을 함께 올린다.
 *       🔴 카드에 **없는 값은 [확인필요]로 둔다** — 지어내지 않는다.
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:      { type: string, example: 주식회사 다온피엠씨 }
 *               bizNo:     { type: string, example: 120-86-01230 }
 *               documents: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: 회사 생성 }
 *       400: { $ref: '#/components/responses/Error' }
 */
companiesRouter.post('/companies', upload.array('documents', 20), asyncHandler(ctrl.createCompany));

/**
 * @openapi
 * /api/companies/{companyId}:
 *   get:
 *     tags: [companies]
 *     summary: 회사 카드 조회
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *         example: co_daon_demo
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: '#/components/responses/Error' }
 */
companiesRouter.get('/companies/:companyId', asyncHandler(ctrl.getCompany));

/**
 * @openapi
 * /api/companies/{companyId}/screening:
 *   get:
 *     tags: [companies]
 *     summary: 추천 공고 목록 — 분모를 함께 준다 (S2~S4)
 *     description: |
 *       🔴 `summary.scanned` / `excluded` / `shortlisted`가 이 응답의 핵심이다.
 *       「127건을 훑어 3건」이 이 제품의 문장이고, 그 분모가 없으면 화면에서 우리가 한 일이 안 보인다.
 *       🔴 판정은 **추천 / 제외** 둘뿐이다. 「조건부」는 만들지 않는다.
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *         example: co_daon_demo
 *       - in: query
 *         name: live
 *         schema: { type: string, enum: ['1'] }
 *     responses:
 *       200:
 *         description: 스크리닝 봉투
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Screening' }
 *       404: { $ref: '#/components/responses/Error' }
 */
companiesRouter.get('/companies/:companyId/screening', asyncHandler(ctrl.getScreening));

/**
 * @openapi
 * /api/companies/{companyId}/screening/{caseId}/decision:
 *   put:
 *     tags: [companies]
 *     summary: 🚪 사람 게이트 — 응찰 여부를 찍는다
 *     description: 🔴 go를 찍은 건만 S5 이후가 돈다. 기계는 이 값을 쓰지 않는다.
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision: { type: string, enum: [pending, go, skip] }
 *     responses:
 *       200: { description: OK }
 *       400: { $ref: '#/components/responses/Error' }
 */
companiesRouter.put('/companies/:companyId/screening/:caseId/decision', asyncHandler(ctrl.putDecision));
