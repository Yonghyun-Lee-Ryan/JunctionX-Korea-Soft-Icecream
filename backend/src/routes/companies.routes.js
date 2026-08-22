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
/**
 * @openapi
 * /api/companies/current:
 *   get:
 *     tags: [companies]
 *     summary: 🔴 첫 진입 분기 — 저장된 회사가 있는가
 *     description: |
 *       있으면 회사 카드 화면으로, 없으면 회사 등록 화면으로 간다.
 *       🔴 「없음」은 오류가 아니라 정상 상태라 **404가 아니라 200 + exists:false**다.
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exists:    { type: boolean }
 *                 companyId: { type: string, nullable: true }
 *                 name:      { type: string }
 *                 savedAt:   { type: string }
 */
companiesRouter.get('/companies/current', asyncHandler(ctrl.getCurrentCompany));

/**
 * @openapi
 * /api/companies/{companyId}/card:
 *   get:
 *     tags: [companies]
 *     summary: 회사 카드 상세 — 화면이 그대로 그리는 모양
 *     description: |
 *       🔴 계약은 **바깥 구조**다 — `stats[]` · `sections[].rows[]`.
 *       프론트는 라벨로 분기하지 않고 그대로 렌더한다. 문장도 서버가 만든다.
 *       🔴 서류에서 못 읽은 값은 0으로 채우지 않고 `status:"missing"` + 「직접 입력」 자리로 둔다.
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 카드
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CompanyCardView' }
 *       404: { $ref: '#/components/responses/Error' }
 */
companiesRouter.get('/companies/:companyId/card', asyncHandler(ctrl.getCardView));

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

/**
 * @openapi
 * /api/companies/card/requirements:
 *   get:
 *     tags: [companies]
 *     summary: 회사 카드 완성 요건표
 *     description: |
 *       🔴 프론트와 백엔드가 **같은 표**를 본다. 한쪽만 고치면 화면은 되는데 저장이 막힌다.
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requirements:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:  { type: string, example: 기업 규모 }
 *                       anyOf:  { type: array, items: { type: string }, description: 이 중 하나면 충족 }
 *                       labels: { type: array, items: { type: string } }
 *                       why:    { type: string }
 */
companiesRouter.get('/companies/card/requirements', asyncHandler(ctrl.getCardRequirements));

/**
 * @openapi
 * /api/companies/card:
 *   post:
 *     tags: [companies]
 *     summary: 회사 카드를 저장한다
 *     description: |
 *       🔴 요건을 못 채우면 **저장하지 않고 422**를 준다. `error.missing[]`에 무엇이 빠졌는지 담긴다.
 *       업로드한 서류의 추출 결과를 그대로 받아 `company` + `company_document`에 적재한다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [documents]
 *             properties:
 *               companyId: { type: string, nullable: true, description: 없으면 새로 만든다 }
 *               name:      { type: string, example: 주식회사 다온피엠씨 }
 *               bizNo:     { type: string, example: 120-86-01230 }
 *               fields:    { type: object, additionalProperties: true, description: 화면이 만든 카드 7줄 }
 *               documents:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [docTypeKey, filename]
 *                   properties:
 *                     docTypeKey: { type: string, example: biz_reg }
 *                     filename:   { type: string }
 *                     uploadId:   { type: string }
 *                     confidence: { type: string }
 *                     bytes:      { type: integer }
 *                     data:       { type: object, additionalProperties: true }
 *     responses:
 *       201: { description: 저장됨 }
 *       422:
 *         description: 서류가 부족하다 — error.missing[]에 빠진 항목
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
companiesRouter.post('/companies/card', asyncHandler(ctrl.saveCard));
