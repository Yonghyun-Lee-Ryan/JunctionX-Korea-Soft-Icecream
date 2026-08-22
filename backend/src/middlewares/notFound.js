import { AppError } from '../errors/AppError.js';

export function notFound(req, _res, next) {
  next(new AppError('E_VALIDATION', `${req.method} ${req.originalUrl} 경로가 없습니다.`));
}
