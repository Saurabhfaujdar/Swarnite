/**
 * Supplier Order Workflow State Machine — unit + integration tests
 *
 * Validates the full transition matrix, domain pre-conditions,
 * approval gates, and immutable history writes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canTransition,
  nextStates,
  isTerminal,
  transitionSupplierOrder,
  validateSupplierOrderTransition,
  createStateHistory,
  requireManagerApprovalIfNeeded,
  InvalidSupplierOrderTransitionError,
  SupplierOrderTransitionValidationError,
} from '../../server/services/supplierOrderWorkflow';
import type { SupplierOrderStatus } from '@prisma/client';

const ALL_STATES: SupplierOrderStatus[] = [
  'DRAFT', 'SENT_TO_SUPPLIER', 'SUPPLIER_ACKNOWLEDGED', 'ADVANCE_PAID',
  'IN_PRODUCTION', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED_PENDING_QC',
  'QC_COMPLETED', 'INVOICE_RECEIVED', 'PURCHASE_POSTED', 'PAYMENT_PENDING',
  'CLOSED', 'CANCELLED', 'REJECTED', 'SHORT_DELIVERED', 'EXCESS_DELIVERED',
  'RETURNED_TO_SUPPLIER', 'DISPUTED',
];

const TERMINAL: SupplierOrderStatus[] = ['CLOSED', 'CANCELLED'];

// ─── canTransition ──────────────────────────────────────────────────

describe('supplierOrderWorkflow.canTransition', () => {
  it('allows the documented happy-path chain', () => {
    const happyPath: SupplierOrderStatus[] = [
      'DRAFT', 'SENT_TO_SUPPLIER', 'SUPPLIER_ACKNOWLEDGED', 'ADVANCE_PAID',
      'IN_PRODUCTION', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED_PENDING_QC',
      'QC_COMPLETED', 'INVOICE_RECEIVED', 'PURCHASE_POSTED', 'PAYMENT_PENDING', 'CLOSED',
    ];
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(canTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it('allows skip-advance path: ACKNOWLEDGED → IN_PRODUCTION', () => {
    expect(canTransition('SUPPLIER_ACKNOWLEDGED', 'IN_PRODUCTION')).toBe(true);
  });

  it('allows immediate dispatch: ACKNOWLEDGED → DISPATCHED (stock items)', () => {
    expect(canTransition('SUPPLIER_ACKNOWLEDGED', 'DISPATCHED')).toBe(true);
  });

  it('allows partial receipts: PARTIALLY_RECEIVED → PARTIALLY_RECEIVED', () => {
    expect(canTransition('PARTIALLY_RECEIVED', 'PARTIALLY_RECEIVED')).toBe(true);
  });

  it('allows final receipt: PARTIALLY_RECEIVED → RECEIVED_PENDING_QC', () => {
    expect(canTransition('PARTIALLY_RECEIVED', 'RECEIVED_PENDING_QC')).toBe(true);
  });

  it('allows dispute from RECEIVED_PENDING_QC and INVOICE_RECEIVED', () => {
    expect(canTransition('RECEIVED_PENDING_QC', 'DISPUTED')).toBe(true);
    expect(canTransition('INVOICE_RECEIVED', 'DISPUTED')).toBe(true);
  });

  it('allows dispute resolution: DISPUTED → QC_COMPLETED', () => {
    expect(canTransition('DISPUTED', 'QC_COMPLETED')).toBe(true);
  });

  it('allows return from QC_COMPLETED', () => {
    expect(canTransition('QC_COMPLETED', 'RETURNED_TO_SUPPLIER')).toBe(true);
  });

  it('allows short/excess delivery classification from QC_COMPLETED', () => {
    expect(canTransition('QC_COMPLETED', 'SHORT_DELIVERED')).toBe(true);
    expect(canTransition('QC_COMPLETED', 'EXCESS_DELIVERED')).toBe(true);
  });

  it('allows SHORT_DELIVERED/EXCESS_DELIVERED → INVOICE_RECEIVED', () => {
    expect(canTransition('SHORT_DELIVERED', 'INVOICE_RECEIVED')).toBe(true);
    expect(canTransition('EXCESS_DELIVERED', 'INVOICE_RECEIVED')).toBe(true);
  });

  it('allows RETURNED_TO_SUPPLIER → DISPATCHED (re-dispatch after fix)', () => {
    expect(canTransition('RETURNED_TO_SUPPLIER', 'DISPATCHED')).toBe(true);
  });

  it('allows REJECTED → DRAFT (re-draft after rejection)', () => {
    expect(canTransition('REJECTED', 'DRAFT')).toBe(true);
  });

  it('allows PURCHASE_POSTED → CLOSED (already paid via advance)', () => {
    expect(canTransition('PURCHASE_POSTED', 'CLOSED')).toBe(true);
  });

  // ─── Invalid transitions ─────────────────────────────────────────

  it('rejects skipping QC: DISPATCHED → INVOICE_RECEIVED', () => {
    expect(canTransition('DISPATCHED', 'INVOICE_RECEIVED')).toBe(false);
  });

  it('rejects skipping receipt: DISPATCHED → QC_COMPLETED', () => {
    expect(canTransition('DISPATCHED', 'QC_COMPLETED')).toBe(false);
  });

  it('rejects backward from PAYMENT_PENDING to INVOICE_RECEIVED', () => {
    expect(canTransition('PAYMENT_PENDING', 'INVOICE_RECEIVED')).toBe(false);
  });

  it('rejects DRAFT → CLOSED (cannot close without processing)', () => {
    expect(canTransition('DRAFT', 'CLOSED')).toBe(false);
  });

  // ─── Terminal states ──────────────────────────────────────────────

  it('treats CLOSED and CANCELLED as terminal (no outgoing transitions)', () => {
    for (const to of ALL_STATES) {
      expect(canTransition('CLOSED', to)).toBe(false);
      expect(canTransition('CANCELLED', to)).toBe(false);
    }
  });

  it('refuses self-transitions', () => {
    for (const s of ALL_STATES) {
      if (s === 'PARTIALLY_RECEIVED') continue; // exception: self-transition allowed
      expect(canTransition(s, s)).toBe(false);
    }
  });

  it('PARTIALLY_RECEIVED self-transition is the only self-transition', () => {
    expect(canTransition('PARTIALLY_RECEIVED', 'PARTIALLY_RECEIVED')).toBe(true);
  });

  // ─── Cancellation rules ───────────────────────────────────────────

  it('allows CANCELLED from early states', () => {
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransition('SENT_TO_SUPPLIER', 'CANCELLED')).toBe(true);
    expect(canTransition('SUPPLIER_ACKNOWLEDGED', 'CANCELLED')).toBe(true);
    expect(canTransition('ADVANCE_PAID', 'CANCELLED')).toBe(true);
    expect(canTransition('IN_PRODUCTION', 'CANCELLED')).toBe(true);
  });

  it('disallows CANCELLED from QC/Invoice/Purchase/Payment states (must go via special)', () => {
    expect(canTransition('QC_COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransition('INVOICE_RECEIVED', 'CANCELLED')).toBe(false);
    expect(canTransition('PURCHASE_POSTED', 'CANCELLED')).toBe(false);
    expect(canTransition('PAYMENT_PENDING', 'CANCELLED')).toBe(false);
  });
});

// ─── nextStates ─────────────────────────────────────────────────────

describe('supplierOrderWorkflow.nextStates', () => {
  it('returns arrays for all states', () => {
    for (const s of ALL_STATES) {
      expect(Array.isArray(nextStates(s))).toBe(true);
    }
  });

  it('returns [] for terminal states', () => {
    expect(nextStates('CLOSED')).toEqual([]);
    expect(nextStates('CANCELLED')).toEqual([]);
  });

  it('returns at least one option for non-terminal states', () => {
    for (const s of ALL_STATES) {
      if (TERMINAL.includes(s)) continue;
      expect(nextStates(s).length).toBeGreaterThan(0);
    }
  });
});

// ─── isTerminal ─────────────────────────────────────────────────────

describe('supplierOrderWorkflow.isTerminal', () => {
  it('CLOSED is terminal', () => expect(isTerminal('CLOSED')).toBe(true));
  it('CANCELLED is terminal', () => expect(isTerminal('CANCELLED')).toBe(true));
  it('DRAFT is not terminal', () => expect(isTerminal('DRAFT')).toBe(false));
  it('PAYMENT_PENDING is not terminal', () => expect(isTerminal('PAYMENT_PENDING')).toBe(false));
});

// ─── createStateHistory ─────────────────────────────────────────────

describe('supplierOrderWorkflow.createStateHistory', () => {
  it('writes immutable history row with all fields', async () => {
    const tx = {
      supplierOrderStateHistory: { create: vi.fn().mockResolvedValue({}) },
    } as any;

    await createStateHistory(tx, 10, 'DRAFT', 'SENT_TO_SUPPLIER', 5, 'Sending to supplier', { note: 'test' });

    expect(tx.supplierOrderStateHistory.create).toHaveBeenCalledWith({
      data: {
        supplierOrderId: 10,
        fromStatus: 'DRAFT',
        toStatus: 'SENT_TO_SUPPLIER',
        reason: 'Sending to supplier',
        metadataJson: { note: 'test' },
        changedById: 5,
      },
    });
  });

  it('handles null fromStatus (initial creation)', async () => {
    const tx = {
      supplierOrderStateHistory: { create: vi.fn().mockResolvedValue({}) },
    } as any;

    await createStateHistory(tx, 10, null, 'DRAFT', 5);

    expect(tx.supplierOrderStateHistory.create).toHaveBeenCalledWith({
      data: {
        supplierOrderId: 10,
        fromStatus: null,
        toStatus: 'DRAFT',
        reason: undefined,
        metadataJson: undefined,
        changedById: 5,
      },
    });
  });
});

// ─── validateSupplierOrderTransition ────────────────────────────────

describe('supplierOrderWorkflow.validateSupplierOrderTransition', () => {
  it('throws SO_EMPTY_ITEMS when sending without items', async () => {
    const tx = {
      supplierOrderItem: { count: vi.fn().mockResolvedValue(0) },
    } as any;

    await expect(
      validateSupplierOrderTransition(tx, 1, 'DRAFT', 'SENT_TO_SUPPLIER'),
    ).rejects.toThrow(SupplierOrderTransitionValidationError);

    await expect(
      validateSupplierOrderTransition(tx, 1, 'DRAFT', 'SENT_TO_SUPPLIER'),
    ).rejects.toMatchObject({ code: 'SO_EMPTY_ITEMS' });
  });

  it('passes SENT_TO_SUPPLIER when items exist', async () => {
    const tx = {
      supplierOrderItem: { count: vi.fn().mockResolvedValue(3) },
    } as any;

    await expect(
      validateSupplierOrderTransition(tx, 1, 'DRAFT', 'SENT_TO_SUPPLIER'),
    ).resolves.toBeUndefined();
  });

  it('throws SO_NO_ADVANCE when marking advance paid without payment', async () => {
    const tx = {
      supplierOrderPayment: { count: vi.fn().mockResolvedValue(0) },
    } as any;

    await expect(
      validateSupplierOrderTransition(tx, 1, 'SUPPLIER_ACKNOWLEDGED', 'ADVANCE_PAID'),
    ).rejects.toMatchObject({ code: 'SO_NO_ADVANCE' });
  });

  it('throws SO_NO_RECEIPT when moving to RECEIVED_PENDING_QC without receipts', async () => {
    const tx = {
      supplierOrderReceipt: { count: vi.fn().mockResolvedValue(0) },
    } as any;

    await expect(
      validateSupplierOrderTransition(tx, 1, 'DISPATCHED', 'RECEIVED_PENDING_QC'),
    ).rejects.toMatchObject({ code: 'SO_NO_RECEIPT' });
  });

  it('throws SO_QC_INCOMPLETE when items still pending QC', async () => {
    const tx = {
      supplierOrderReceiptItem: { count: vi.fn().mockResolvedValue(2) },
    } as any;

    await expect(
      validateSupplierOrderTransition(tx, 1, 'RECEIVED_PENDING_QC', 'QC_COMPLETED'),
    ).rejects.toMatchObject({ code: 'SO_QC_INCOMPLETE' });
  });

  it('passes QC_COMPLETED when no pending items', async () => {
    const tx = {
      supplierOrderReceiptItem: { count: vi.fn().mockResolvedValue(0) },
    } as any;

    await expect(
      validateSupplierOrderTransition(tx, 1, 'RECEIVED_PENDING_QC', 'QC_COMPLETED'),
    ).resolves.toBeUndefined();
  });

  it('throws SO_NO_INVOICE when moving to INVOICE_RECEIVED without invoice', async () => {
    const tx = {
      supplierOrderInvoice: { count: vi.fn().mockResolvedValue(0) },
    } as any;

    await expect(
      validateSupplierOrderTransition(tx, 1, 'QC_COMPLETED', 'INVOICE_RECEIVED'),
    ).rejects.toMatchObject({ code: 'SO_NO_INVOICE' });
  });

  it('throws SO_APPROVAL_PENDING when posting purchase with pending approval', async () => {
    const tx = {
      supplierOrder: { findUnique: vi.fn().mockResolvedValue({ approvalRequired: true }) },
    } as any;

    await expect(
      validateSupplierOrderTransition(tx, 1, 'INVOICE_RECEIVED', 'PURCHASE_POSTED'),
    ).rejects.toMatchObject({ code: 'SO_APPROVAL_PENDING' });
  });

  it('passes PURCHASE_POSTED when no pending approval', async () => {
    const tx = {
      supplierOrder: { findUnique: vi.fn().mockResolvedValue({ approvalRequired: false }) },
    } as any;

    await expect(
      validateSupplierOrderTransition(tx, 1, 'QC_COMPLETED', 'PURCHASE_POSTED'),
    ).resolves.toBeUndefined();
  });
});

// ─── requireManagerApprovalIfNeeded ─────────────────────────────────

describe('supplierOrderWorkflow.requireManagerApprovalIfNeeded', () => {
  it('requires approval for cancellation when advance > 0', async () => {
    const tx = {
      supplierOrder: { findUnique: vi.fn().mockResolvedValue({ advancePaid: 50000 }) },
    } as any;

    const result = await requireManagerApprovalIfNeeded(tx, 1, 'ADVANCE_PAID', 'CANCELLED');
    expect(result.required).toBe(true);
  });

  it('does not require approval for cancellation when no advance', async () => {
    const tx = {
      supplierOrder: { findUnique: vi.fn().mockResolvedValue({ advancePaid: 0 }) },
    } as any;

    const result = await requireManagerApprovalIfNeeded(tx, 1, 'DRAFT', 'CANCELLED');
    expect(result.required).toBe(false);
  });

  it('does not require approval for non-cancellation transitions', async () => {
    const tx = {} as any;

    const result = await requireManagerApprovalIfNeeded(tx, 1, 'DRAFT', 'SENT_TO_SUPPLIER');
    expect(result.required).toBe(false);
  });
});

// ─── transitionSupplierOrder (integration-like with mocks) ──────────

describe('supplierOrderWorkflow.transitionSupplierOrder', () => {
  let tx: any;

  beforeEach(() => {
    tx = {
      supplierOrderStateHistory: { create: vi.fn().mockResolvedValue({}) },
      supplierOrder: {
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ approvalRequired: false, advancePaid: 0, estimatedAmount: 0, invoices: [] }),
      },
      supplierOrderItem: { count: vi.fn().mockResolvedValue(5) },
      supplierOrderPayment: { count: vi.fn().mockResolvedValue(1) },
      supplierOrderReceipt: { count: vi.fn().mockResolvedValue(2) },
      supplierOrderReceiptItem: { count: vi.fn().mockResolvedValue(0) },
      supplierOrderInvoice: { count: vi.fn().mockResolvedValue(1) },
    };
  });

  it('writes history + updates status on valid transition', async () => {
    await transitionSupplierOrder(tx, 1, 'DRAFT', 'SENT_TO_SUPPLIER', { userId: 5, reason: 'Sending' });

    expect(tx.supplierOrderStateHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        supplierOrderId: 1,
        fromStatus: 'DRAFT',
        toStatus: 'SENT_TO_SUPPLIER',
        reason: 'Sending',
        changedById: 5,
      }),
    });
    expect(tx.supplierOrder.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ status: 'SENT_TO_SUPPLIER', updatedById: 5 }),
    });
  });

  it('is a no-op when from === to', async () => {
    await transitionSupplierOrder(tx, 1, 'DRAFT', 'DRAFT', { userId: 5 });
    expect(tx.supplierOrderStateHistory.create).not.toHaveBeenCalled();
    expect(tx.supplierOrder.update).not.toHaveBeenCalled();
  });

  it('throws InvalidSupplierOrderTransitionError for disallowed move', async () => {
    await expect(
      transitionSupplierOrder(tx, 1, 'DRAFT', 'CLOSED', { userId: 5 }),
    ).rejects.toThrow(InvalidSupplierOrderTransitionError);
  });

  it('throws InvalidSupplierOrderTransitionError from terminal state', async () => {
    await expect(
      transitionSupplierOrder(tx, 1, 'CLOSED', 'DRAFT', { userId: 5 }),
    ).rejects.toThrow(InvalidSupplierOrderTransitionError);

    await expect(
      transitionSupplierOrder(tx, 1, 'CANCELLED', 'DRAFT', { userId: 5 }),
    ).rejects.toThrow(InvalidSupplierOrderTransitionError);
  });

  it('sets acknowledgementDate when transitioning to SUPPLIER_ACKNOWLEDGED', async () => {
    await transitionSupplierOrder(tx, 1, 'SENT_TO_SUPPLIER', 'SUPPLIER_ACKNOWLEDGED', { userId: 5 });

    const updateCall = tx.supplierOrder.update.mock.calls[0][0];
    expect(updateCall.data.acknowledgementDate).toBeInstanceOf(Date);
  });

  it('sets cancelledAt when transitioning to CANCELLED', async () => {
    await transitionSupplierOrder(tx, 1, 'DRAFT', 'CANCELLED', { userId: 5 });

    const updateCall = tx.supplierOrder.update.mock.calls[0][0];
    expect(updateCall.data.cancelledAt).toBeInstanceOf(Date);
  });

  it('sets closedAt when transitioning to CLOSED', async () => {
    tx.supplierOrder.findUnique.mockResolvedValue({
      approvalRequired: false, advancePaid: 0, estimatedAmount: 0, invoices: [],
    });

    await transitionSupplierOrder(tx, 1, 'PAYMENT_PENDING', 'CLOSED', { userId: 5 });

    const updateCall = tx.supplierOrder.update.mock.calls[0][0];
    expect(updateCall.data.closedAt).toBeInstanceOf(Date);
  });

  it('throws SO_BALANCE_DUE when closing with outstanding balance (no override)', async () => {
    tx.supplierOrder.findUnique.mockResolvedValue({
      approvalRequired: false,
      advancePaid: 0,
      estimatedAmount: 100000,
      invoices: [{ dueAmount: 50000 }],
    });

    await expect(
      transitionSupplierOrder(tx, 1, 'PAYMENT_PENDING', 'CLOSED', { userId: 5 }),
    ).rejects.toMatchObject({ code: 'SO_BALANCE_DUE' });
  });

  it('allows closing with balance due when managerOverride = true', async () => {
    tx.supplierOrder.findUnique.mockResolvedValue({
      approvalRequired: false,
      advancePaid: 0,
      estimatedAmount: 100000,
      invoices: [{ dueAmount: 50000 }],
    });

    await expect(
      transitionSupplierOrder(tx, 1, 'PAYMENT_PENDING', 'CLOSED', { userId: 5, managerOverride: true }),
    ).resolves.toBeUndefined();
  });

  it('throws SO_CANCEL_NEEDS_APPROVAL when cancelling after advance (no override)', async () => {
    tx.supplierOrder.findUnique.mockResolvedValue({ advancePaid: 25000 });

    await expect(
      transitionSupplierOrder(tx, 1, 'ADVANCE_PAID', 'CANCELLED', { userId: 5 }),
    ).rejects.toMatchObject({ code: 'SO_CANCEL_NEEDS_APPROVAL' });
  });

  it('allows cancellation after advance with managerOverride', async () => {
    tx.supplierOrder.findUnique.mockResolvedValue({ advancePaid: 25000 });

    await expect(
      transitionSupplierOrder(tx, 1, 'ADVANCE_PAID', 'CANCELLED', { userId: 5, managerOverride: true }),
    ).resolves.toBeUndefined();
  });

  it('validates items exist before SENT_TO_SUPPLIER', async () => {
    tx.supplierOrderItem.count.mockResolvedValue(0);

    await expect(
      transitionSupplierOrder(tx, 1, 'DRAFT', 'SENT_TO_SUPPLIER', { userId: 5 }),
    ).rejects.toMatchObject({ code: 'SO_EMPTY_ITEMS' });
  });

  it('validates payment exists before ADVANCE_PAID', async () => {
    tx.supplierOrderPayment.count.mockResolvedValue(0);

    await expect(
      transitionSupplierOrder(tx, 1, 'SUPPLIER_ACKNOWLEDGED', 'ADVANCE_PAID', { userId: 5 }),
    ).rejects.toMatchObject({ code: 'SO_NO_ADVANCE' });
  });

  it('validates receipt exists before RECEIVED_PENDING_QC', async () => {
    tx.supplierOrderReceipt.count.mockResolvedValue(0);

    await expect(
      transitionSupplierOrder(tx, 1, 'DISPATCHED', 'RECEIVED_PENDING_QC', { userId: 5 }),
    ).rejects.toMatchObject({ code: 'SO_NO_RECEIPT' });
  });

  it('validates QC complete before QC_COMPLETED', async () => {
    tx.supplierOrderReceiptItem.count.mockResolvedValue(3);

    await expect(
      transitionSupplierOrder(tx, 1, 'RECEIVED_PENDING_QC', 'QC_COMPLETED', { userId: 5 }),
    ).rejects.toMatchObject({ code: 'SO_QC_INCOMPLETE' });
  });

  it('validates invoice exists before INVOICE_RECEIVED', async () => {
    tx.supplierOrderInvoice.count.mockResolvedValue(0);

    await expect(
      transitionSupplierOrder(tx, 1, 'QC_COMPLETED', 'INVOICE_RECEIVED', { userId: 5 }),
    ).rejects.toMatchObject({ code: 'SO_NO_INVOICE' });
  });

  it('supports metadata passed through to history', async () => {
    const meta = { receiptId: 42, challan: 'CH-001' };
    await transitionSupplierOrder(tx, 1, 'DRAFT', 'SENT_TO_SUPPLIER', {
      userId: 5,
      reason: 'Test',
      metadata: meta,
    });

    expect(tx.supplierOrderStateHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadataJson: meta }),
    });
  });

  it('purchase posting rejects when approval is pending', async () => {
    tx.supplierOrder.findUnique.mockResolvedValue({ approvalRequired: true });

    await expect(
      transitionSupplierOrder(tx, 1, 'INVOICE_RECEIVED', 'PURCHASE_POSTED', { userId: 5 }),
    ).rejects.toMatchObject({ code: 'SO_APPROVAL_PENDING' });
  });
});
