import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestId(request: Request, response: Response, next: NextFunction): void {
  const candidate = request.get('x-request-id');
  request.requestId = candidate && candidate.length <= 128 ? candidate : randomUUID();
  request.id = request.requestId;
  response.setHeader('X-Request-Id', request.requestId);
  next();
}
