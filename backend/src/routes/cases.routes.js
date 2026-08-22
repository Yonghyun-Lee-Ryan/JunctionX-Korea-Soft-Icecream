import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import multer from 'multer';
import * as ctrl from '../controllers/cases.controller.js';
import * as files from '../controllers/caseFiles.controller.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } });

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
 *       🔴 응답은 즉시 202로 돌아온다. 첨부 수집 → 공고 해부(Studio) → 판정(Solar) → 탭까지 뒤에서 이어진다.
 *       🔴 응답 첫 순간부터 `progress[]` 4줄을 **전부** 내보낸다 — 첫 줄만 running. 화면은 `status`가 done/failed 가 될 때까지 GET 으로 폴링한다.
 *       🔴 Upstage 크레딧 — 7일 안에 끝난 케이스는 **200** 으로 저장된 봉투를 그대로 준다(`meta.pipeline.reused`). 다시 돌리려면 `refresh: true`.
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
 *               refresh:     { type: boolean, description: '🔴 true 면 7일 캐시를 무시하고 Upstage 를 다시 부른다' }
 *     responses:
 *       200:
 *         description: 7일 안에 끝난 케이스 — 저장된 봉투 그대로 (Upstage 호출 없음)
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

/**
 * @openapi
 * /api/cases/{caseId}/files:
 *   post:
 *     tags: [cases]
 *     summary: 제출 서류 올리기 — 화면⑥ 파일제출·화면⑨ 「보완 자료 올리기」
 *     description: |
 *       파일을 `data/uploads/<caseId>/` 에 남기고, PDF 면 텍스트 레이어로 8갈래 규칙 분류만 한다(Studio 호출 없음).
 *       🔴 분석이 끝난 케이스면 **제출 검사(Solar)만 다시 돌려** 파일제출·제출준비 탭을 갱신한다 — 규칙은 저장본을 다시 쓰니 1회.
 *       🔴 올린 파일이 어느 서류용인지는 `requirement`(서류 이름)가 말한다. 드롭존에서 올리면 비워도 된다.
 *       응답은 갱신된 팩트시트 봉투(GET /api/cases/{caseId} 와 같다).
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:        { type: string, format: binary }
 *               requirement: { type: string, description: '파일제출 탭의 서류 이름 그대로 (예: 사업자등록증 및 법인등기부등본)' }
 *     responses:
 *       200: { description: 갱신된 봉투 }
 *       400: { $ref: '#/components/responses/Error' }
 *       404: { $ref: '#/components/responses/Error' }
 *   get:
 *     tags: [cases]
 *     summary: 이 케이스에 올린 파일 목록
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{ caseId, files[] }' }
 *       404: { $ref: '#/components/responses/Error' }
 */
casesRouter.post('/cases/:caseId/files', upload.single('file'), asyncHandler(files.upload));
casesRouter.get('/cases/:caseId/files', asyncHandler(files.list));
