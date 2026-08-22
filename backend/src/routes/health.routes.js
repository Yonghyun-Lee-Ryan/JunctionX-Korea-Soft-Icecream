import { Router } from 'express';
import { envReport } from '../config/env.js';
import { agentCoverage } from '../config/agents.js';

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
 *                 studioReady: { type: boolean, description: API 키가 있고 갈래별 에이전트가 하나라도 연결됐는가 }
 *                 agentsConfigured: { type: integer, description: 연결된 갈래 수 (0~8) }
 *                 listSourceReady: { type: boolean, description: 조달청 OpenAPI 키가 있는가 }
 */
healthRouter.get('/health', (_req, res) => {
  const report = envReport();
  const agents = agentCoverage();
  const configured = agents.filter((a) => a.configured).length;
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    ...report,
    // 🔴 studioReady는 「갈래별 에이전트가 하나라도 붙었나」다.
    //    예전엔 쓰지도 않는 STUDIO_AGENT_ID를 봐서 항상 false였다.
    studioReady: Boolean(report.hasApiKey && configured > 0),
    agentsConfigured: configured,
    agentsTotal: agents.length,
  });
});
