import pino from 'pino';

import { env } from '../../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'request.headers.authorization',
      'request.headers.cookie',
      'response.headers["set-cookie"]',
      'headers.authorization',
      'headers.cookie',
      'headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.accessToken',
      '*.refreshToken',
      '*.tokenHash',
      '*.JWT_ACCESS_SECRET',
      '*.JWT_REFRESH_SECRET',
      '*.DATABASE_URL',
      'password',
      'passwordHash',
      'accessToken',
      'refreshToken',
      'tokenHash',
    ],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', singleLine: true },
        },
      }
    : {}),
});
