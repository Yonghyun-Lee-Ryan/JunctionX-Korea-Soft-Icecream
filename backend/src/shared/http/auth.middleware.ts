import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { errors } from '../errors/app-error.js';
import type { UserRole } from '../security/jwt.service.js';
import { verifyAccessToken } from '../security/jwt.service.js';

export async function authenticate(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = request.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw errors.unauthorized();
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw errors.unauthorized();
  const payload = await verifyAccessToken(token);
  request.auth = { userId: payload.sub, role: payload.role };
  next();
}

export function authorize(...roles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) return next(errors.unauthorized());
    if (!roles.includes(request.auth.role)) return next(errors.forbidden());
    next();
  };
}
