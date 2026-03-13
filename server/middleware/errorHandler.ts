/**
 * Global Error Handler
 * ─────────────────────
 * Catches unhandled errors, logs them, and returns a safe JSON response.
 * Must be registered AFTER all routes.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { config } from '../config';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId || 'unknown';

  logger.error('unhandled_error', {
    requestId,
    message: err.message,
    stack: config.isDev ? err.stack : undefined,
    method: req.method,
    path: req.originalUrl,
    userId: req.userId,
    companyId: req.companyId,
  });

  // Don't leak internal details in production
  const status = (err as any).status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
    requestId,
  });
}
