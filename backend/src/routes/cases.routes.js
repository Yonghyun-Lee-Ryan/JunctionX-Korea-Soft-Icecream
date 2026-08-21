import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import * as ctrl from '../controllers/cases.controller.js';

export const casesRouter = Router();

/**
 * @openapi
 * /api/cases:
 *   get:
 *     tags: [cases]
 *     summary: 케이스 목록 (개발용)
 *     responses:
 *       200: { description: OK }
 *   post:
 *     tags: [cases]
 *     summary: 공고번호로 케이스를 만들고 첨부 수집을 시작한다 (S1)
 *     description: |
 *       🔴 응답은 즉시 202로 돌아온다. 첨부 수집은 뒤에서 돈다.
 *       🔴 응답 첫 순간부터 `progress[]` 4줄을 **전부** 내보낸다 — 첫 줄만 running.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bidPbancNo]
 *             properties:
 *               bidPbancNo:  { type: string, example: R25BK00645031 }
 *               bidPbancOrd: { type: string, example: "000" }
 *               companyId:   { type: string, nullable: true }
 *     responses:
 *       202:
 *         description: 수집 시작
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Factsheet' }
 *       400: { $ref: '#/components/responses/Error' }
 */
casesRouter.get('/cases', asyncHandler(ctrl.listCases));
casesRouter.post('/cases', asyncHandler(ctrl.createCase));

/**
 * @openapi
 * /api/cases/{caseId}:
 *   get:
 *     tags: [cases]
 *     summary: 팩트시트 봉투 (화면②·④가 폴링하는 곳)
 *     description: |
 *       🔴 프론트는 이 봉투의 **바깥 구조**에만 의존한다. `progress[].step` 문자열이나
 *       `tabs[].columns` 내용으로 분기하지 않는다 — Extract 필드가 바뀌어도 화면 코드가 안 바뀐다.
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *         example: R25BK00645031-000
 *       - in: query
 *         name: live
 *         schema: { type: string, enum: ['1'] }
 *         description: 🔴 기본은 캐시(meta.cached=true). `live=1`이면 실호출을 시도한다
 *     responses:
 *       200:
 *         description: 봉투
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Factsheet' }
 *       404: { $ref: '#/components/responses/Error' }
 */
casesRouter.get('/cases/:caseId', asyncHandler(ctrl.getCase));

/**
 * @openapi
 * /api/cases/{caseId}/files/{file}:
 *   get:
 *     tags: [cases]
 *     summary: 탭 하나를 xlsx로 내려받는다
 *     description: |
 *       🔴 탭별 빌더가 아니라 제너릭 한 벌이다 — 1행 warnings · 2행 columns · 3행~ rows.
 *       🔴 조견표(compliance)는 웹 체크리스트라 downloads[]에 없다. WBS·임계경로만 파일이다.
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: file
 *         required: true
 *         schema: { type: string }
 *         example: wbs.xlsx
 *     responses:
 *       200:
 *         description: xlsx
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *       404: { $ref: '#/components/responses/Error' }
 */
casesRouter.get('/cases/:caseId/files/:file', asyncHandler(ctrl.downloadTab));
