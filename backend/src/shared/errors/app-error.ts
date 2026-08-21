export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

export const errors = {
  validation: (details?: unknown) =>
    new AppError(400, 'VALIDATION_ERROR', '요청이 올바르지 않습니다.', details),
  unauthorized: (message = '인증이 필요합니다.') => new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = '요청을 수행할 권한이 없습니다.') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (message = '요청한 리소스를 찾을 수 없습니다.') =>
    new AppError(404, 'NOT_FOUND', message),
  conflict: (message = '이미 존재하는 리소스입니다.') => new AppError(409, 'CONFLICT', message),
  rateLimited: () =>
    new AppError(429, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'),
  unavailable: (message = '서비스가 아직 준비되지 않았습니다.') =>
    new AppError(503, 'SERVICE_UNAVAILABLE', message),
};
