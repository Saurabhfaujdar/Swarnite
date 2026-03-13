export { prisma } from './prisma';
import app from './app';
import { config } from './config';
import { logger } from './logger';
import { disconnectDb } from './prisma';

// Only start the server when run directly (not during tests)
if (!config.isTest) {
  const server = app.listen(config.port, () => {
    logger.info(`JewelERP API running`, { port: config.port, env: config.nodeEnv });
  });

  // ─── Graceful Shutdown ──────────────────────────────────────
  function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down gracefully...`);

    server.close(async () => {
      await disconnectDb();
      logger.info('Server stopped');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, config.shutdownTimeoutMs);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled errors so the process doesn't crash silently
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
  });
}

export default app;
