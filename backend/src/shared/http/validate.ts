import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

import { errors } from '../errors/app-error.js';

type RequestSource = 'body' | 'params' | 'query';

export function validate(schema: ZodType, source: RequestSource = 'body'): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      next(errors.validation(result.error.issues));
      return;
    }
    request[source] = result.data as never;
    next();
  };
}
