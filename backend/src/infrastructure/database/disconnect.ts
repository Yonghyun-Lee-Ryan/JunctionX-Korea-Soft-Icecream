import { pgPool, prisma } from './client.js';

let disconnectPromise: Promise<void> | undefined;

export function disconnectDatabase(): Promise<void> {
  disconnectPromise ??= (async () => {
    try {
      await prisma.$disconnect();
    } finally {
      await pgPool.end();
    }
  })();
  return disconnectPromise;
}
