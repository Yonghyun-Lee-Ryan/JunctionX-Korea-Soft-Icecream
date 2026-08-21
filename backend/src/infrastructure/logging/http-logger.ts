import { pinoHttp } from 'pino-http';

import { logger } from './logger.js';

function requestPath(request: {
  originalUrl?: string | undefined;
  url?: string | undefined;
}): string {
  return (request.originalUrl ?? request.url ?? '').split('?', 1)[0] ?? '';
}

export const httpLogger = pinoHttp({
  logger,
  quietReqLogger: true,
  customAttributeKeys: { reqId: 'requestId' },
  customProps(request) {
    return {
      method: request.method,
      path: requestPath(request),
    };
  },
  customSuccessObject(_request, response, value) {
    return {
      ...(value as Record<string, unknown>),
      statusCode: response.statusCode,
    };
  },
  customErrorObject(_request, response, _error, value) {
    return {
      ...(value as Record<string, unknown>),
      statusCode: response.statusCode,
    };
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'request.headers.authorization',
      'request.headers.cookie',
      'response.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
});
