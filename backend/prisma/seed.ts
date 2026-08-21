import { env } from '../src/config/env.js';
import { disconnectDatabase } from '../src/infrastructure/database/disconnect.js';
import { prisma } from '../src/infrastructure/database/client.js';
import { hashPassword } from '../src/shared/security/password.service.js';

async function main(): Promise<void> {
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    console.info(
      'Admin seed skipped: set both SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to enable it.',
    );
    return;
  }

  const email = env.SEED_ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'ADMIN',
    },
    create: {
      email,
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.info(`Admin seed applied for ${email}.`);
}

main()
  .then(async () => {
    await disconnectDatabase();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await disconnectDatabase();
    process.exit(1);
  });
