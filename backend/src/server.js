import { createApp } from './app.js';
import { env, envReport } from './config/env.js';
import { logger } from './config/logger.js';
import { migrate } from './db/migrate.js';
import { closeDb } from './db/index.js';

migrate();

const app = createApp();
const server = app.listen(env.port, () => {
  logger.info('server_listening', {
    port: env.port,
    env: env.nodeEnv,
    docs: `http://localhost:${env.port}/docs`,
    ...envReport(),
  });
  // 🔴 키가 없어도 부팅한다. 없다는 사실만 로그에 남긴다
  if (!envReport().studioReady) {
    logger.warn('studio_not_configured', { hint: 'UPSTAGE_API_KEY / STUDIO_AGENT_ID 없음 — 캐시 응답으로 동작합니다' });
  }
});

function shutdown(signal) {
  logger.info('shutdown', { signal });
  server.close(() => { closeDb(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
