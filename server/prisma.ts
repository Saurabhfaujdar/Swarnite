import { PrismaClient } from '@prisma/client';
import { config } from './config';
import { logger } from './logger';

export const prisma = new PrismaClient({
  // Log slow queries in production, all queries in dev
  log: config.isDev
    ? ['query', 'warn', 'error']
    : ['warn', 'error'],
});

// Prisma lifecycle events
prisma.$connect()
  .then(() => logger.info('Database connected'))
  .catch((err: Error) => {
    logger.error('Database connection failed', { error: err.message });
    process.exit(1);
  });

export async function disconnectDb() {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
