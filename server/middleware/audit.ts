/**
 * Audit Logger
 * ─────────────
 * Records significant user actions (create, update, delete) for compliance
 * and debugging. Writes to the application log in structured format.
 *
 * Usage in routes:
 *   import { auditLog } from '../middleware/audit';
 *   auditLog(req, 'SALE_CREATED', { saleId: sale.id, total: sale.grandTotal });
 */

import { Request } from 'express';
import { logger } from '../logger';

export type AuditAction =
  | 'LOGIN' | 'LOGIN_FAILED' | 'LOGOUT' | 'LOGOUT_ALL'
  | 'REFRESH_TOKEN_REUSE' | 'PASSWORD_CHANGED'
  | 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED'
  | 'SALE_CREATED' | 'SALE_UPDATED' | 'SALE_DELETED'
  | 'PURCHASE_CREATED' | 'PURCHASE_UPDATED' | 'PURCHASE_DELETED'
  | 'INVENTORY_UPDATED' | 'LABEL_CREATED'
  | 'BRANCH_CREATED' | 'BRANCH_UPDATED' | 'BRANCH_TRANSFER'
  | 'PAYMENT_RECEIVED' | 'PAYMENT_UPDATED'
  | 'LAYAWAY_CREATED' | 'LAYAWAY_UPDATED'
  | 'MASTER_UPDATED'
  | 'CASH_ENTRY_CREATED'
  | string; // Allow custom actions

export function auditLog(
  req: Request,
  action: AuditAction,
  details?: Record<string, unknown>,
) {
  logger.info('audit', {
    action,
    userId: req.userId,
    companyId: req.companyId,
    branchId: req.branchId,
    ip: req.ip,
    requestId: req.requestId,
    userAgent: req.headers['user-agent'],
    ...details,
  });
}
