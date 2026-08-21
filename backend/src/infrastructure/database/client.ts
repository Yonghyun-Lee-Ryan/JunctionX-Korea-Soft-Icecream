import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { env } from '../../config/env.js';
import { PrismaClient } from '../../generated/prisma/client.js';

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
});

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pgPool),
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
