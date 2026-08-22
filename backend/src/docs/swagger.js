import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { ROOT, env } from '../config/env.js';
import { components } from './components.js';

export const openapiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Solar for Bid API',
      version: '0.1.0',
      description: [
        '나라장터 공고를 **제안 착수 패키지**로 바꾸는 파이프라인의 백엔드.',
        '',
        '### 계약 원칙',
        '- 🔴 응답의 **바깥 구조**가 계약이다. 개별 Extract 필드는 계약이 아니다 — 프리플라이트에서 바뀐다.',
        '- 🔴 프론트는 `progress[].step` 문자열이나 `tabs[].columns` 내용으로 **분기하지 않는다**.',
        '- 🔴 오류는 `error.code`를 문장으로 매핑하지 않는다. `error.message`를 **그대로 렌더**한다.',
        '- 🔴 `?live=1`이 없으면 캐시 응답(`meta.cached=true`)이다. 키가 없어도 200이 나온다.',
        '',
        '정본 계약: `plan/Solar_for_Bid/04_계약/factsheet.envelope.json` · `screening.envelope.json`',
      ].join('\n'),
    },
    servers: [{ url: `http://localhost:${env.port}`, description: 'local' }],
    tags: [
      { name: 'health', description: '헬스체크' },
      { name: 'companies', description: 'S1 회사 서류 → 카드, S2~S4 스크리닝' },
      { name: 'cases', description: 'S1 수집 · S2~S5 팩트시트 · 산출물' },
      { name: 'docs', description: '회사 서류 PDF 1장 → 8갈래 판정 → 에이전트 추출' },
    ],
    components,
  },
  apis: [path.join(ROOT, 'src/routes/*.js')],
});

export function mountDocs(app) {
  app.get('/openapi.json', (_req, res) => res.json(openapiSpec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'Solar for Bid API',
    swaggerOptions: { docExpansion: 'list', defaultModelsExpandDepth: 1, tryItOutEnabled: true },
  }));
}
