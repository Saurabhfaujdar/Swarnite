/**
 * Notification Service (interface-only for now)
 * ──────────────────────────────────────────────
 * Repair workflow fires events at key moments (intake, estimate ready,
 * approval required, ready for delivery, delivered). Today we just
 * structured-log the event so it's visible in Cloud Logging; tomorrow
 * the same callsite can route through WhatsApp Business / SMS providers
 * without touching any business code.
 *
 * Real adapters intentionally deferred — see scoping discussion in
 * the chat. Only `LoggerNotifier` is wired up.
 */

import { logger } from '../logger';

export type RepairNotificationEvent =
  | 'REPAIR_RECEIVED'
  | 'ESTIMATE_READY'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERED';

export interface RepairNotificationPayload {
  event: RepairNotificationEvent;
  repairNo: string;
  customerName: string;
  customerMobile?: string | null;
  branchName?: string;
  amount?: number;
  extra?: Record<string, unknown>;
}

export interface Notifier {
  send(payload: RepairNotificationPayload): Promise<void>;
}

/** Default implementation: structured log only. */
class LoggerNotifier implements Notifier {
  async send(payload: RepairNotificationPayload): Promise<void> {
    logger.info('repair.notification', payload);
  }
}

export const notifier: Notifier = new LoggerNotifier();
