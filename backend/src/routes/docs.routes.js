import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import * as ctrl from '../controllers/docs.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
});

export const docsRouter = Router();

/**
 * @openapi
 * /api/docs/types:
 *   get:
 *     tags: [docs]
 *     summary: 지원하는 문서 8종과 에이전트 연결 상태
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 docTypes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:             { type: string, example: biz_reg }
 *                       label:           { type: string, example: 사업자등록증 }
 *                       titles:          { type: array, items: { type: string } }
 *                       agentConfigured: { type: boolean }
 *                       agentEnv:        { type: string, example: STUDIO_AGENT_BIZ_REG }
 */
docsRouter.get('/docs/types', asyncHandler(ctrl.listDocTypes));

/**
 * @openapi
 * /api/docs/upload:
 *   post:
 *     tags: [docs]
 *     summary: PDF 한 장을 올려 종류를 가르고 값을 뽑는다
 *     description: |
 *       ① PDF 텍스트를 읽어 **8갈래 중 어느 것인지 판정**하고
 *       ② 그 갈래에 맞는 **Upstage Studio 에이전트**를 불러 값을 JSON으로 뽑는다.
 *
 *       🔴 **동기 응답**이다 — 추출이 끝날 때까지 기다렸다가 한 번에 돌려준다.
 *
 *       🔴 **판정이 서지 않으면 아무 에이전트도 돌리지 않는다.** 422와 함께 후보를 돌려준다.
 *       엉뚱한 에이전트를 돌리면 그럴듯하게 틀린 JSON이 나오고, 그게 제일 나쁘다.
 *
 *       🟢 `extraction.fields`에 **필드별 confidence·근거 쪽·좌표**가 함께 온다.
 *       하나라도 low면 `extraction.confidence`가 low가 된다 — 낙관하지 않는다.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: PDF (최대 30MB) }
 *     responses:
 *       200:
 *         description: 판정 + 추출 결과
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/DocUpload' }
 *       400: { $ref: '#/components/responses/Error' }
 *       415: { $ref: '#/components/responses/Error' }
 *       422:
 *         description: 문서 종류를 판정하지 못했다 — 후보를 함께 준다
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       502: { $ref: '#/components/responses/Error' }
 *       504: { $ref: '#/components/responses/Error' }
 */
docsRouter.post('/docs/upload', upload.single('file'), asyncHandler(ctrl.upload));
