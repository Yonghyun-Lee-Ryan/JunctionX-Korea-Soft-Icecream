import { AppError } from '../errors/AppError.js';
import { logger } from '../config/logger.js';

// eslint-disable-next-line no-unused-vars -- express는 인자 4개로 에러 핸들러를 식별한다
export function errorHandler(err, req, res, _next) {
  const e = err instanceof AppError ? err : new AppError('E_INTERNAL', undefined, { cause: err?.message });

  logger.error('request_failed', {
    path: req.originalUrl,
    code: e.code,
    status: e.status,
    detail: e.detail,
    stack: err?.stack?.split('\n').slice(0, 4).join(' | '),
  });

  res.status(e.status).json({ error: e.toEnvelope() });
}
