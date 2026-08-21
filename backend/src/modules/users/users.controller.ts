import type { Request, Response } from 'express';
import { errors } from '../../shared/errors/app-error.js';
import { sendData } from '../../shared/http/response.js';
import { getUser } from '../auth/auth.service.js';
export async function me(request: Request, response: Response): Promise<void> {
  const userId = request.auth?.userId;
  if (!userId) throw errors.unauthorized();
  sendData(response, await getUser(userId));
}
