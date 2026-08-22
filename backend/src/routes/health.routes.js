import { Router } from 'express';
import { envReport } from '../config/env.js';

export const healthRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [health]
 *     summary: 헬스체크
 *     description: 🔴 환경변수가 비어 있어도 200이어야 한다. 키가 없으면 studioReady가 false일 뿐이다.
 *     responses:
 *       200:
 *         description: 서버가 살아 있다
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:          { type: boolean, example: true }
 *                 uptimeSec:   { type: integer, example: 42 }
 *                 studioReady: { type: boolean, description: UPSTAGE_API_KEY와 STUDIO_AGENT_ID가 둘 다 있는가 }
 *                 listSourceReady: { type: boolean, description: 조달청 OpenAPI 키가 있는가 }
 */
healthRouter.get('/health', (_req, res) => {
  res.json({ ok: true, uptimeSec: Math.round(process.uptime()), ...envReport() });
});
