import '../../infrastructure/openapi/zod.js';
import { z } from 'zod';
export const healthResponseSchema = z
  .object({ status: z.enum(['alive', 'ready']) })
  .openapi('HealthResponse');
