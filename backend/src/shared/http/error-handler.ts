import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { AppError, errors } from '../errors/app-error.js';

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return errors.validation(error.issues);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return errors.conflict('이미 사용 중인 고유 값입니다.');
    if (error.code === 'P2025') return errors.notFound();
  }
  return new AppError(500, 'INTERNAL_ERROR', '서버 내부 오류가 발생했습니다.');
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(errors.notFound(`${request.method} ${request.path} 경로를 찾을 수 없습니다.`));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  void _next;
  const normalized = normalizeError(error);
  if (normalized.statusCode >= 500) {
    logger.error(
      { err: error, requestId: request.requestId, method: request.method, path: request.path },
      'request failed',
    );
  }
  response.status(normalized.statusCode).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details ?? [],
      requestId: request.requestId,
      ...(env.NODE_ENV !== 'production' && normalized.statusCode >= 500
        ? { stack: normalized.stack }
        : {}),
    },
  });
};
