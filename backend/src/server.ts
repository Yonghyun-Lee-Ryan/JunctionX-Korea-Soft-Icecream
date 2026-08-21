import { createServer } from 'node:http';

import { app } from './app.js';
import { env } from './config/env.js';
import { disconnectDatabase } from './infrastructure/database/disconnect.js';
import { logger } from './infrastructure/logging/logger.js';

const server = createServer(app);

// Attach a provider-specific WebSocket/Socket.IO gateway to `server` here when the topic needs it.

let shutdownPromise: Promise<void> | undefined;

function closeHttpServer(): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
}

function shutdown(reason: string, exitCode = 0): Promise<void> {
  shutdownPromise ??= (async () => {
    logger.info({ reason }, 'graceful shutdown started');
    const forceTimer = setTimeout(() => {
      logger.error('graceful shutdown timed out');
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    try {
      await closeHttpServer();
      await disconnectDatabase();
      process.exitCode = exitCode;
      logger.info('graceful shutdown completed');
    } catch (error) {
      process.exitCode = 1;
      logger.error({ err: error }, 'graceful shutdown failed');
    } finally {
      clearTimeout(forceTimer);
    }
  })();
  return shutdownPromise;
}

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'HTTP server listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

process.once('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection');
  void shutdown('unhandledRejection', 1);
});

process.once('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  void shutdown('uncaughtException', 1);
});

server.once('error', (error) => {
  logger.fatal({ err: error }, 'HTTP server failed');
  void shutdown('serverError', 1);
});
