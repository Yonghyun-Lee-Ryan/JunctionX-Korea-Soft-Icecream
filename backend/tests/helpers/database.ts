import { prisma } from '../../src/infrastructure/database/client.js';

export async function cleanTestDatabase(): Promise<void> {
  await prisma.$transaction([prisma.refreshSession.deleteMany(), prisma.user.deleteMany()]);
}
