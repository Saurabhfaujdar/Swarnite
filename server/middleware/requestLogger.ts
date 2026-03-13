/**
 * Request Logger Middleware
 * ─────────────────────────
 * Logs every HTTP request with method, path, status, duration, and user context.
 * Assigns a unique request ID for correlation.
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../logger';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

export function requestId(req: Request, _res: Response, next: NextFunction) {
  req.requestId = (req.headers['x-request-id'] as string) || randomUUID();
  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - (req.startTime ?? Date.now());
    const meta: Record<string, unknown> = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    };

    if (req.userId) meta.userId = req.userId;
    if (req.companyId) meta.companyId = req.companyId;
    if (req.branchId) meta.branchId = req.branchId;

    if (res.statusCode >= 500) {
      logger.error('request', meta);
    } else if (res.statusCode >= 400) {
      logger.warn('request', meta);
    } else {
      logger.info('request', meta);
    }
  });

  next();
}
