/**
 * Supplier Order Workflow State Machine
 * ──────────────────────────────────────
 * Single source of truth for which SupplierOrderStatus transitions are
 * allowed, and the only place that should write to SupplierOrderStateHistory.
 *
 * Inventory does NOT increase until PURCHASE_POSTED is reached.
 * Every weight discrepancy must be classified.
 * Cancellation after advance requires manager/admin approval.
 *
 * Public API:
 *  - canTransition(from, to)
 *  - nextStates(from)
 *  - transitionSupplierOrder(tx, orderId, from, to, userId, opts?)
 *  - validateSupplierOrderTransition(tx, orderId, from, to)
 *  - createStateHistory(tx, orderId, from, to, userId, reason?, metadata?)
 *  - requireManagerApprovalIfNeeded(tx, order, toState, userId)
 */

import { Prisma, SupplierOrderStatus } from '@prisma/client';

// ─── Allowed Transitions ─────────────────────────────────────────────

const ALLOWED: Record<SupplierOrderStatus, SupplierOrderStatus[]> = {
  DRAFT: ['SENT_TO_SUPPLIER', 'CANCELLED'],
  SENT_TO_SUPPLIER: ['SUPPLIER_ACKNOWLEDGED', 'REJECTED', 'CANCELLED'],
  SUPPLIER_ACKNOWLEDGED: ['ADVANCE_PAID', 'IN_PRODUCTION', 'DISPATCHED', 'CANCELLED'],
  ADVANCE_PAID: ['IN_PRODUCTION', 'DISPATCHED', 'CANCELLED'],
  IN_PRODUCTION: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['PARTIALLY_RECEIVED', 'RECEIVED_PENDING_QC'],
  PARTIALLY_RECEIVED: ['PARTIALLY_RECEIVED', 'RECEIVED_PENDING_QC', 'SHORT_DELIVERED', 'RETURNED_TO_SUPPLIER'],
  RECEIVED_PENDING_QC: ['QC_COMPLETED', 'RETURNED_TO_SUPPLIER', 'DISPUTED'],
  QC_COMPLETED: ['INVOICE_RECEIVED', 'PURCHASE_POSTED', 'RETURNED_TO_SUPPLIER', 'SHORT_DELIVERED', 'EXCESS_DELIVERED'],
  INVOICE_RECEIVED: ['PURCHASE_POSTED', 'DISPUTED'],
  PURCHASE_POSTED: ['PAYMENT_PENDING', 'CLOSED'],
  PAYMENT_PENDING: ['CLOSED'],
  // Special states
  CLOSED: [],           // terminal
  CANCELLED: [],        // terminal
  REJECTED: ['DRAFT'],  // can re-draft after supplier rejects
  SHORT_DELIVERED: ['INVOICE_RECEIVED', 'RECEIVED_PENDING_QC', 'CANCELLED', 'DISPUTED'],
  EXCESS_DELIVERED: ['INVOICE_RECEIVED', 'RECEIVED_PENDING_QC', 'RETURNED_TO_SUPPLIER'],
  RETURNED_TO_SUPPLIER: ['DISPATCHED', 'CLOSED', 'CANCELLED'],
  DISPUTED: ['QC_COMPLETED', 'RECEIVED_PENDING_QC', 'RETURNED_TO_SUPPLIER', 'CANCELLED', 'CLOSED'],
};

// States from which CANCELLED is reachable (all non-terminal except CLOSED)
const CANCELLABLE_STATES: SupplierOrderStatus[] = [
  'DRAFT', 'SENT_TO_SUPPLIER', 'SUPPLIER_ACKNOWLEDGED', 'ADVANCE_PAID',
  'IN_PRODUCTION', 'DISPATCHED', 'PARTIALLY_RECEIVED',
  'SHORT_DELIVERED', 'RETURNED_TO_SUPPLIER', 'DISPUTED',
];

// ─── Public Helpers ──────────────────────────────────────────────────

export function canTransition(from: SupplierOrderStatus, to: SupplierOrderStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function nextStates(from: SupplierOrderStatus): SupplierOrderStatus[] {
  return ALLOWED[from] ?? [];
}

export function isTerminal(status: SupplierOrderStatus): boolean {
  return status === 'CLOSED' || status === 'CANCELLED';
}

// ─── Custom Errors ───────────────────────────────────────────────────

export class InvalidSupplierOrderTransitionError extends Error {
  constructor(public from: SupplierOrderStatus, public to: SupplierOrderStatus) {
    super(`Cannot transition supplier order from ${from} to ${to}`);
    this.name = 'InvalidSupplierOrderTransitionError';
  }
}

export class SupplierOrderTransitionValidationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'SupplierOrderTransitionValidationError';
  }
}

// ─── Transition Options ──────────────────────────────────────────────

export interface TransitionOptions {
  reason?: string;
  metadata?: Record<string, unknown>;
  managerOverride?: boolean;
  userId: number;
}

// ─── State History ───────────────────────────────────────────────────

export async function createStateHistory(
  tx: Prisma.TransactionClient,
  orderId: number,
  fromStatus: SupplierOrderStatus | null,
  toStatus: SupplierOrderStatus,
  userId: number,
  reason?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await tx.supplierOrderStateHistory.create({
    data: {
      supplierOrderId: orderId,
      fromStatus,
      toStatus,
      reason,
      metadataJson: metadata ? metadata as Prisma.InputJsonValue : undefined,
      changedById: userId,
    },
  });
}

// ─── Validation Rules ────────────────────────────────────────────────

/**
 * Validate domain-specific pre-conditions for a transition.
 * Throws SupplierOrderTransitionValidationError if unmet.
 */
export async function validateSupplierOrderTransition(
  tx: Prisma.TransactionClient,
  orderId: number,
  from: SupplierOrderStatus,
  to: SupplierOrderStatus,
): Promise<void> {
  switch (to) {
    case 'SENT_TO_SUPPLIER': {
      // Must have at least one item
      const itemCount = await tx.supplierOrderItem.count({
        where: { supplierOrderId: orderId },
      });
      if (itemCount === 0) {
        throw new SupplierOrderTransitionValidationError(
          'SO_EMPTY_ITEMS',
          'Cannot send order to supplier without at least one item',
        );
      }
      break;
    }

    case 'SUPPLIER_ACKNOWLEDGED': {
      // Must have at least one item (same gate)
      const itemCount = await tx.supplierOrderItem.count({
        where: { supplierOrderId: orderId },
      });
      if (itemCount === 0) {
        throw new SupplierOrderTransitionValidationError(
          'SO_EMPTY_ITEMS',
          'Cannot acknowledge order without at least one item',
        );
      }
      break;
    }

    case 'ADVANCE_PAID': {
      // Must have at least one payment recorded
      const paymentCount = await tx.supplierOrderPayment.count({
        where: { supplierOrderId: orderId },
      });
      if (paymentCount === 0) {
        throw new SupplierOrderTransitionValidationError(
          'SO_NO_ADVANCE',
          'Cannot mark as advance paid without at least one payment',
        );
      }
      break;
    }

    case 'DISPATCHED': {
      // Must have been acknowledged (from must be >= SUPPLIER_ACKNOWLEDGED)
      const validFromForDispatch: SupplierOrderStatus[] = [
        'SUPPLIER_ACKNOWLEDGED', 'ADVANCE_PAID', 'IN_PRODUCTION', 'RETURNED_TO_SUPPLIER',
      ];
      if (!validFromForDispatch.includes(from)) {
        throw new SupplierOrderTransitionValidationError(
          'SO_NOT_ACKNOWLEDGED',
          'Cannot mark as dispatched — order must be acknowledged first',
        );
      }
      break;
    }

    case 'RECEIVED_PENDING_QC': {
      // Must have at least one receipt
      const receiptCount = await tx.supplierOrderReceipt.count({
        where: { supplierOrderId: orderId },
      });
      if (receiptCount === 0) {
        throw new SupplierOrderTransitionValidationError(
          'SO_NO_RECEIPT',
          'Cannot move to pending QC without at least one receipt',
        );
      }
      break;
    }

    case 'QC_COMPLETED': {
      // All received receipt items must have qcStatus != PENDING
      const pendingQcItems = await tx.supplierOrderReceiptItem.count({
        where: {
          receipt: { supplierOrderId: orderId },
          qcStatus: 'PENDING',
        },
      });
      if (pendingQcItems > 0) {
        throw new SupplierOrderTransitionValidationError(
          'SO_QC_INCOMPLETE',
          `Cannot complete QC — ${pendingQcItems} item(s) still pending QC`,
        );
      }
      break;
    }

    case 'INVOICE_RECEIVED': {
      // Must have at least one invoice
      const invoiceCount = await tx.supplierOrderInvoice.count({
        where: { supplierOrderId: orderId },
      });
      if (invoiceCount === 0) {
        throw new SupplierOrderTransitionValidationError(
          'SO_NO_INVOICE',
          'Cannot mark invoice received without recording supplier invoice',
        );
      }
      break;
    }

    case 'PURCHASE_POSTED': {
      // QC must be completed — check from state or presence of passing items
      const validFromForPurchase: SupplierOrderStatus[] = [
        'QC_COMPLETED', 'INVOICE_RECEIVED',
      ];
      if (!validFromForPurchase.includes(from)) {
        throw new SupplierOrderTransitionValidationError(
          'SO_QC_NOT_DONE',
          'Cannot post purchase until QC is completed',
        );
      }

      // Check no pending approvals
      const order = await tx.supplierOrder.findUnique({
        where: { id: orderId },
        select: { approvalRequired: true },
      });
      if (order?.approvalRequired) {
        throw new SupplierOrderTransitionValidationError(
          'SO_APPROVAL_PENDING',
          'Cannot post purchase — pending approval exists',
        );
      }
      break;
    }

    case 'CLOSED': {
      // Check via caller's managerOverride — handled in transitionSupplierOrder
      // No hard gate here; the transition function checks dueAmount
      break;
    }
  }
}

// ─── Manager Approval Check ──────────────────────────────────────────

/**
 * Returns true if manager approval is needed for this transition.
 * Does NOT block the transition — the caller should use this to set
 * `approvalRequired = true` on the order.
 */
export async function requireManagerApprovalIfNeeded(
  tx: Prisma.TransactionClient,
  orderId: number,
  from: SupplierOrderStatus,
  to: SupplierOrderStatus,
): Promise<{ required: boolean; reason?: string }> {
  // Cancellation after advance paid requires manager/admin approval
  if (to === 'CANCELLED') {
    const order = await tx.supplierOrder.findUnique({
      where: { id: orderId },
      select: { advancePaid: true },
    });
    if (order && Number(order.advancePaid) > 0) {
      return { required: true, reason: 'Cancellation after advance payment requires approval' };
    }
  }

  return { required: false };
}

// ─── Main Transition Function ────────────────────────────────────────

/**
 * Atomically validate, check approval, write history, and update status.
 * MUST be called inside a Prisma transaction (`prisma.$transaction`).
 */
export async function transitionSupplierOrder(
  tx: Prisma.TransactionClient,
  orderId: number,
  fromState: SupplierOrderStatus,
  toState: SupplierOrderStatus,
  opts: TransitionOptions,
): Promise<void> {
  // No-op if same state
  if (fromState === toState) return;

  // Check terminal state
  if (isTerminal(fromState)) {
    throw new InvalidSupplierOrderTransitionError(fromState, toState);
  }

  // Check allowed transition
  if (!canTransition(fromState, toState)) {
    throw new InvalidSupplierOrderTransitionError(fromState, toState);
  }

  // Validate domain-specific pre-conditions
  await validateSupplierOrderTransition(tx, orderId, fromState, toState);

  // Check if CLOSED requires manager override for outstanding balance
  if (toState === 'CLOSED' && !opts.managerOverride) {
    const order = await tx.supplierOrder.findUnique({
      where: { id: orderId },
      select: { estimatedAmount: true, advancePaid: true, invoices: { select: { dueAmount: true } } },
    });
    if (order) {
      const totalDue = order.invoices.reduce((sum, inv) => sum + Number(inv.dueAmount), 0);
      if (totalDue > 0) {
        throw new SupplierOrderTransitionValidationError(
          'SO_BALANCE_DUE',
          `Cannot close order — ₹${totalDue.toFixed(2)} due. Use manager override.`,
        );
      }
    }
  }

  // Check if cancellation needs manager approval
  if (toState === 'CANCELLED' && !opts.managerOverride) {
    const approvalCheck = await requireManagerApprovalIfNeeded(tx, orderId, fromState, toState);
    if (approvalCheck.required) {
      throw new SupplierOrderTransitionValidationError(
        'SO_CANCEL_NEEDS_APPROVAL',
        approvalCheck.reason || 'Cancellation requires manager approval',
      );
    }
  }

  // Write immutable state history
  await createStateHistory(
    tx, orderId, fromState, toState, opts.userId, opts.reason, opts.metadata,
  );

  // Update order status + set relevant timestamps
  const updateData: Prisma.SupplierOrderUpdateInput = {
    status: toState,
    updatedById: opts.userId,
  };

  if (toState === 'SUPPLIER_ACKNOWLEDGED') {
    updateData.acknowledgementDate = new Date();
  }
  if (toState === 'CANCELLED') {
    updateData.cancelledAt = new Date();
  }
  if (toState === 'CLOSED') {
    updateData.closedAt = new Date();
  }

  await tx.supplierOrder.update({
    where: { id: orderId },
    data: updateData,
  });
}
