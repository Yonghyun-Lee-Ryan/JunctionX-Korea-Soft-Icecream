import { Router } from 'express';
import { authenticate } from '../../shared/http/auth.middleware.js';
import { me } from './users.controller.js';
export const usersRouter = Router();
usersRouter.get('/me', authenticate, me);
