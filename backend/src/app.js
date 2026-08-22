import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { requestLogger } from './config/logger.js';
import { router } from './routes/index.js';
import { mountDocs } from './docs/swagger.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // 🔴 CORS 전체 허용이 기본이다 (WBS X1). 데모에서 프론트 호스트가 계속 바뀐다
  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  mountDocs(app);
  app.use(router);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
