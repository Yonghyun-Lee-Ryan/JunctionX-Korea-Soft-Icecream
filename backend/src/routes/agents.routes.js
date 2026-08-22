import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../errors/AppError.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { workflowAgentGuard } from '../middlewares/workflowAgentGuard.js';
import * as ctrl from '../controllers/agents.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
});

function oneFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? '파일은 최대 30MB까지 올릴 수 있습니다.'
        : 'multipart/form-data의 file 필드에는 파일 하나만 올려 주세요.';
      return next(new AppError('E_VALIDATION', message, { multerCode: err.code }));
    }
    return next(err);
  });
}

export const agentsRouter = Router();
agentsRouter.use('/agents', workflowAgentGuard);

/**
 * @openapi
 * /api/agents/announcement-decomposition:
 *   post:
 *     tags: [agents]
 *     summary: 공고 원본을 5개 전용 Extract Agent로 분석하고 병합
 *     description: 파일을 변환하거나 페이지 분할하지 않고 동일한 원본 file_id를 5개 Agent에 전달한다.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: 원본 공고 파일 한 개 (최대 30MB) }
 *     responses:
 *       200: { description: 병합된 Announcement Agent JSON }
 *       400: { $ref: '#/components/responses/Error' }
 *       429: { $ref: '#/components/responses/Error' }
 *       502: { $ref: '#/components/responses/Error' }
 *       503: { $ref: '#/components/responses/Error' }
 *       504: { $ref: '#/components/responses/Error' }
 */
agentsRouter.post('/agents/announcement-decomposition', oneFile, asyncHandler(ctrl.announcementDecomposition));

/**
 * @openapi
 * /api/agents/company-bid-fit:
 *   post:
 *     tags: [agents]
 *     summary: 회사정보와 서류정보 파일로 GO 또는 NO-GO 판정
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: 입력 파일 한 개 (최대 30MB) }
 *     responses:
 *       200:
 *         description: GO 또는 NO-GO
 *         content:
 *           text/plain:
 *             schema: { type: string, enum: [GO, NO-GO] }
 *       400: { $ref: '#/components/responses/Error' }
 *       429: { $ref: '#/components/responses/Error' }
 *       502: { $ref: '#/components/responses/Error' }
 *       503: { $ref: '#/components/responses/Error' }
 *       504: { $ref: '#/components/responses/Error' }
 */
agentsRouter.post('/agents/company-bid-fit', oneFile, asyncHandler(ctrl.companyBidFit));

/**
 * @openapi
 * /api/agents/wps-cp-decomposer:
 *   post:
 *     tags: [agents]
 *     summary: 서류정보 파일을 WPS/CP JSON으로 분해
 *     description: Agent 출력 앞뒤의 Markdown이나 설명을 제거하고 유효한 JSON만 반환한다.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: 입력 파일 한 개 (최대 30MB) }
 *     responses:
 *       200: { description: WPS CP Decomposer JSON }
 *       400: { $ref: '#/components/responses/Error' }
 *       429: { $ref: '#/components/responses/Error' }
 *       502: { $ref: '#/components/responses/Error' }
 *       503: { $ref: '#/components/responses/Error' }
 *       504: { $ref: '#/components/responses/Error' }
 */
agentsRouter.post('/agents/wps-cp-decomposer', oneFile, asyncHandler(ctrl.wpsCpDecomposer));

/**
 * @openapi
 * /api/agents/submission-compliance:
 *   post:
 *     tags: [agents]
 *     summary: 회사서류와 서류정보 파일의 제출 적합성 JSON 평가
 *     description: Agent 출력 앞뒤의 Markdown이나 설명을 제거하고 유효한 JSON만 반환한다.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: 입력 파일 한 개 (최대 30MB) }
 *     responses:
 *       200: { description: Submission Package Compliance JSON }
 *       400: { $ref: '#/components/responses/Error' }
 *       429: { $ref: '#/components/responses/Error' }
 *       502: { $ref: '#/components/responses/Error' }
 *       503: { $ref: '#/components/responses/Error' }
 *       504: { $ref: '#/components/responses/Error' }
 */
agentsRouter.post('/agents/submission-compliance', oneFile, asyncHandler(ctrl.submissionCompliance));
