import { prisma } from '../../infrastructure/database/client.js';

export async function checkDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
