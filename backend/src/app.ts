import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { paymentWebhookRouter } from './integrations/payments/webhook.routes.js';
import { httpLogger } from './infrastructure/logging/http-logger.js';
import { openApiDocument } from './infrastructure/openapi/document.js';
import type { DatabaseCheck } from './modules/health/health.controller.js';
import { createRoutes } from './routes.js';
import { errorHandler, notFoundHandler } from './shared/http/error-handler.js';
import { apiRateLimiter, authRateLimiter } from './shared/http/rate-limit.js';
import { requestId } from './shared/http/request-id.js';
import { AppError } from './shared/errors/app-error.js';

export interface CreateAppOptions {
  checkDatabase?: DatabaseCheck;
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(httpLogger);

  // Signed payment webhooks need the untouched bytes, so provider routes are mounted before JSON.
  app.use('/api/v1/webhooks/payments', paymentWebhookRouter);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || env.CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new AppError(403, 'FORBIDDEN', '허용되지 않은 CORS origin입니다.'));
      },
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use('/api/v1', apiRateLimiter);
  app.use(['/api/v1/auth/register', '/api/v1/auth/login', '/api/v1/auth/refresh'], authRateLimiter);

  if (env.ENABLE_API_DOCS) {
    app.get('/openapi.json', (_request, response) => response.json(openApiDocument));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

  app.use(
    createRoutes({ ...(options.checkDatabase ? { checkDatabase: options.checkDatabase } : {}) }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
