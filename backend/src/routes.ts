import { Router } from 'express';

import { authRouter } from './modules/auth/auth.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import type { DatabaseCheck } from './modules/health/health.controller.js';
import { usersRouter } from './modules/users/users.routes.js';

export interface RoutesOptions {
  checkDatabase?: DatabaseCheck;
}

export function createRoutes(options: RoutesOptions = {}): Router {
  const router = Router();
  router.use('/health', createHealthRouter(options.checkDatabase));
  router.use('/api/v1/auth', authRouter);
  router.use('/api/v1/users', usersRouter);
  return router;
}
