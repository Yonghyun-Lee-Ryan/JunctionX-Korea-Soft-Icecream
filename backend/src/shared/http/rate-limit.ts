import { rateLimit } from 'express-rate-limit';

import { env } from '../../config/env.js';
import { errors } from '../errors/app-error.js';

function handler(_request: unknown, _response: unknown, next: (error: unknown) => void): void {
  next(errors.rateLimited());
}

export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler,
});
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler,
});
