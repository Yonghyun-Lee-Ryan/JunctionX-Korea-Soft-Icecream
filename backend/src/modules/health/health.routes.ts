import { Router } from 'express';

import type { DatabaseCheck } from './health.controller.js';
import * as controller from './health.controller.js';
import { checkDatabase as defaultDatabaseCheck } from './health.service.js';

export function createHealthRouter(checkDatabase: DatabaseCheck = defaultDatabaseCheck): Router {
  const router = Router();
  router.get('/live', controller.live);
  router.get('/ready', controller.ready(checkDatabase));
  return router;
}
