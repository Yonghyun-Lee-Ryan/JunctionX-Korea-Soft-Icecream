import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function sendData<T>(response: Response, data: T, statusCode = 200): Response {
  return response.status(statusCode).json({ data });
}

export function sendList<T>(response: Response, data: T[], meta: PaginationMeta): Response {
  return response.json({ data, meta });
}
