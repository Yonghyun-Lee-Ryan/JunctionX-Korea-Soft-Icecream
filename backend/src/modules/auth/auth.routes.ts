import { Router } from 'express';

import { authenticate } from '../../shared/http/auth.middleware.js';
import { validate } from '../../shared/http/validate.js';
import * as controller from './auth.controller.js';
import { loginSchema, refreshTokenBodySchema, registerSchema } from './auth.schema.js';

export const authRouter = Router();
authRouter.post('/register', validate(registerSchema), controller.register);
authRouter.post('/login', validate(loginSchema), controller.login);
authRouter.post('/refresh', validate(refreshTokenBodySchema), controller.refresh);
authRouter.post('/logout', validate(refreshTokenBodySchema), controller.logout);
authRouter.post('/logout-all', authenticate, controller.logoutAll);
