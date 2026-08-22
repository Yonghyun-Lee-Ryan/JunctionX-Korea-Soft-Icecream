import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import * as ctrl from '../controllers/companyCard.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 12 },
});

export const companyCardRouter = Router();

/**
 * @openapi
 * /api/company-card/build:
 *   post:
 *     tags: [company-card]
 *     summary: 회사 카드 — 서류 묶음 → COMPANY_CARD_V1 (S2 · 화면②)
 *     description: |
 *       파일마다 `Company Card Builder` Agent 1개를 돌린다. Classify 가 갈래(CO_*)를 가르고 백엔드가 `docTypeKey` 로 옮긴다.
 *       🔴 `source_document` 는 업로드 파일명으로 백엔드가 채운다 (Studio 는 파일명을 모른다).
 *       🔴 실적 건수·갈래별·최대 단일계약·합계(`performance_summary`)는 백엔드가 센다 — Extract 는 세지 않는다.
 *       🔴 갈래를 못 정한 서류는 `review_required[]` 로 — 화면 「직접 확인」. 빠진 카드 요건은 `requirements.missing[]` 문장으로.
 *       🔴 `UPSTAGE_AGENT_API_KEY` 가 없으면 `fixtures/studio/company_card.flat.json` (다온피엠씨 실물 8장) 으로 떨어지고 `meta.cached=true`.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [documents]
 *             properties:
 *               documents:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: 회사 서류 PDF 여러 장 (최대 12)
 *     responses:
 *       200: { description: 'COMPANY_CARD_V1 — documents[] (+docTypeKey·category·confidence) · performance_summary · review_required · requirements · meta' }
 *       400: { $ref: '#/components/responses/Error' }
 *       502: { $ref: '#/components/responses/Error' }
 *       503: { $ref: '#/components/responses/Error' }
 *       504: { $ref: '#/components/responses/Error' }
 */
companyCardRouter.post('/company-card/build', upload.array('documents', 12), asyncHandler(ctrl.build));
