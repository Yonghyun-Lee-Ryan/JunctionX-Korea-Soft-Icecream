import type { Request, Response } from 'express';

import { errors } from '../../shared/errors/app-error.js';
import { sendData } from '../../shared/http/response.js';

export type DatabaseCheck = () => Promise<void>;
export function live(_request: Request, response: Response): void {
  sendData(response, { status: 'alive' });
}
export function ready(checkDatabase: DatabaseCheck) {
  return async (_request: Request, response: Response): Promise<void> => {
    try {
      await checkDatabase();
      sendData(response, { status: 'ready' });
    } catch {
      throw errors.unavailable();
    }
  };
}
