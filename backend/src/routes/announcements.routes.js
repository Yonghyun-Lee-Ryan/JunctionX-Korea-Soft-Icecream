import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import * as ctrl from '../controllers/announcements.controller.js';

// 🔴 HWP 원본을 그대로 받는다 — Studio Parse 가 변환 없이 읽는다 (77쪽 2MB 실측)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 2 },
});

export const announcementsRouter = Router();

/**
 * @openapi
 * /api/announcements/decompose:
 *   post:
 *     tags: [announcements]
 *     summary: 공고 해부 — 제안요청서(+입찰공고서) → ANNOUNCEMENT_CORE_V1 (S3)
 *     description: |
 *       제안요청서를 Studio Extract 5종(01~05)에 **같은 file_id** 로 보내고, 입찰공고서는 04(BID_NOTICE) 에만 보낸 뒤 병합한다.
 *       🔴 「공고서가 이긴다」 — 마감·전자입찰·접수처는 공고서, 분량 상한은 제안요청서.
 *       🔴 제안서 부수가 계약 후 산출물(COMPLETION)의 부수와 같으면 버린다 (실측 오귀속 「최종보고서 5부」).
 *       🔴 `UPSTAGE_AGENT_API_KEY` 가 없으면 `fixtures/studio/` 실물 출력으로 떨어지고 `meta.cached=true` 로 밝힌다.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [rfp]
 *             properties:
 *               rfp:    { type: string, format: binary, description: 제안요청서 (HWP·PDF) }
 *               notice: { type: string, format: binary, description: 입찰공고서 (HWP·PDF · 선택) }
 *     responses:
 *       200: { description: 'ANNOUNCEMENT_CORE_V1 + constraint_* + eligibility_rules[].source_doc + meta' }
 *       400: { $ref: '#/components/responses/Error' }
 *       502: { $ref: '#/components/responses/Error' }
 *       503: { $ref: '#/components/responses/Error' }
 *       504: { $ref: '#/components/responses/Error' }
 */
announcementsRouter.post(
  '/announcements/decompose',
  upload.fields([{ name: 'rfp', maxCount: 1 }, { name: 'notice', maxCount: 1 }]),
  asyncHandler(ctrl.decompose),
);
