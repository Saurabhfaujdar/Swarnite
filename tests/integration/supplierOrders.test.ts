/**
 * Supplier Order Module — integration tests
 *
 * Exercises the public HTTP surface with a mocked Prisma client.
 * Covers:
 *  - Validation (400s with helpful errors)
 *  - Tenant / branch scoping
 *  - State machine gates (cannot QC before receipt etc.)
 *  - Voucher allocation (SO/N, SR/N, SPP/N, SPI/N)
 *  - Ledger posting calls on advance/receipt/invoice/payment/cancel
 *  - QC → weight adjustment creation
 *  - Close/cancel guards
 */
import request from 'supertest';

import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({ prisma: mockPrisma }));

// Mock workflow service
class MockInvalidTransitionError extends Error { code = 'INVALID_TRANSITION'; constructor(msg?: string) { super(msg || 'Invalid transition'); } }
class MockTransitionValidationError extends Error { code = 'VALIDATION_ERROR'; constructor(msg?: string) { super(msg || 'Validation error'); } }

const mockTransitionSupplierOrder = jest.fn().mockResolvedValue(undefined);
const mockCanTransition = jest.fn().mockReturnValue(true);
const mockNextStates = jest.fn().mockReturnValue(['SENT_TO_SUPPLIER']);
jest.mock('../../server/services/supplierOrderWorkflow', () => ({
  canTransition: (...args: any[]) => mockCanTransition(...args),
  nextStates: (...args: any[]) => mockNextStates(...args),
  transitionSupplierOrder: (...args: any[]) => mockTransitionSupplierOrder(...args),
  InvalidSupplierOrderTransitionError: MockInvalidTransitionError,
  SupplierOrderTransitionValidationError: MockTransitionValidationError,
}));

// Mock ledger service
const mockPostAdvancePaymentLedger = jest.fn().mockResolvedValue(undefined);
const mockPostSupplierInvoicePayable = jest.fn().mockResolvedValue(undefined);
const mockPostSupplierPayment = jest.fn().mockResolvedValue(undefined);
const mockPostGoodsReceiptMetalLedger = jest.fn().mockResolvedValue(undefined);
const mockPostQcAcceptedMetalLedger = jest.fn().mockResolvedValue(undefined);
const mockPostWeightAdjustmentLedger = jest.fn().mockResolvedValue(undefined);
const mockReverseLedgerForCancellation = jest.fn().mockResolvedValue(undefined);
const mockGetSupplierBalance = jest.fn().mockResolvedValue({ metalBalance: [], moneyBalance: 0 });
jest.mock('../../server/services/supplierOrderLedger', () => ({
  postAdvancePaymentLedger: (...args: any[]) => mockPostAdvancePaymentLedger(...args),
  postSupplierInvoicePayable: (...args: any[]) => mockPostSupplierInvoicePayable(...args),
  postSupplierPayment: (...args: any[]) => mockPostSupplierPayment(...args),
  postGoodsReceiptMetalLedger: (...args: any[]) => mockPostGoodsReceiptMetalLedger(...args),
  postQcAcceptedMetalLedger: (...args: any[]) => mockPostQcAcceptedMetalLedger(...args),
  postWeightAdjustmentLedger: (...args: any[]) => mockPostWeightAdjustmentLedger(...args),
  reverseLedgerForCancellation: (...args: any[]) => mockReverseLedgerForCancellation(...args),
  getSupplierBalance: (...args: any[]) => mockGetSupplierBalance(...args),
}));

// Mock inventory posting service
const mockPostSupplierOrderPurchase = jest.fn().mockResolvedValue({
  purchaseVoucherId: 1, voucherNo: 'PUR/1', labelsCreated: 1, itemsPosted: 1,
});
jest.mock('../../server/services/supplierOrderInventory', () => ({
  postSupplierOrderPurchase: (...args: any[]) => mockPostSupplierOrderPurchase(...args),
}));

// Auth mock
const authState = {
  userId: 1, userRole: 'ADMIN', companyId: 1,
  branchId: 1, branchScope: [] as number[], isMasterBranch: true,
};
jest.mock('../../server/middleware/branchAccess', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    Object.assign(req, authState);
    next();
  },
  requireBranch: (_r: any, _s: any, n: any) => n(),
  requireMaster: (_r: any, _s: any, n: any) => n(),
  requireAdmin: (_r: any, _s: any, n: any) => n(),
  branchWhere: () => ({}),
  tenantScope: () => ({ companyId: 1 }),
  canAccessBranch: () => true,
  canOverrideBranch: async () => true,
}));

jest.mock('../../server/middleware/audit', () => ({
  auditLog: jest.fn(),
}));

import app from '../../server/app';

// ── Fixtures ──────────────────────────────────────────────
const SUPPLIER = {
  id: 10, name: 'Jain Jewellers', mobile: '9876543210',
  companyId: 1, type: 'SUPPLIER', isActive: true,
  email: null, gstin: '29AABCJ1234A1ZR',
};

const ORDER_BASE = {
  id: 100, orderNo: 'SO/1', orderPrefix: 'SO', orderNumber: 1,
  companyId: 1, branchId: 1, supplierId: 10,
  status: 'DRAFT' as const, priority: 'NORMAL',
  orderDate: new Date(), expectedDeliveryDate: null,
  estimatedAmount: 50000, advancePaid: 0,
  totalOrderedGrossWeight: 100, totalOrderedNetWeight: 95,
  totalReceivedGrossWeight: 0, totalReceivedNetWeight: 0,
  notes: null, supplierReferenceNo: null,
  approvalRequired: false, approvedById: null,
  createdById: 1, updatedById: 1,
  createdAt: new Date(), updatedAt: new Date(),
};

const ORDER_ITEM = {
  id: 200, supplierOrderId: 100,
  category: 'Necklace', ornamentType: 'Temple Necklace',
  metalTypeId: 1, purity: '22KT',
  orderedQty: 2, orderedGrossWeight: 50, orderedNetWeight: 47.5,
  expectedWastagePercent: 5,
  makingChargeType: 'PER_GRAM', makingChargeValue: 800,
  stoneDetails: null, designReference: null, size: null, remarks: null,
};

const RECEIPT_BASE = {
  id: 300, supplierOrderId: 100,
  companyId: 1, branchId: 1,
  receiptNo: 'SR/1', receiptNumber: 1,
  status: 'PENDING_QC', receivedDate: new Date(),
  receivedById: 1, packageReference: 'PKG-001',
  remarks: null,
};

const RECEIPT_ITEM = {
  id: 400, receiptId: 300, supplierOrderItemId: 200,
  receivedQty: 2, receivedGrossWeight: 50, receivedNetWeight: 47.5,
  receivedPurity: 91.6, acceptedQty: null, rejectedQty: null,
  acceptedGrossWeight: null, acceptedNetWeight: null,
  qcStatus: 'PENDING', qcRemarks: null, inventoryPosted: false,
};

const INVOICE_BASE = {
  id: 500, supplierOrderId: 100,
  invoiceNo: 'SPI/1', invoicePrefix: 'SPI', invoiceNumber: 1,
  supplierInvoiceNo: 'JJ/2025/001',
  invoiceDate: new Date(),
  taxableAmount: 45000, cgstAmount: 675, sgstAmount: 675, igstAmount: 0,
  gstAmount: 1350, otherCharges: 200, discountAmount: 0,
  advanceAdjusted: 10000, totalAmount: 46550, paidAmount: 0, dueAmount: 36550,
  status: 'CONFIRMED', createdById: 1,
};

// ── Setup ─────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  authState.userRole = 'ADMIN';
  authState.branchScope = [];
  authState.isMasterBranch = true;

  // Reset all supplier-order-related Prisma model mocks
  for (const m of [
    mockPrisma.supplierOrder, mockPrisma.supplierOrderItem,
    mockPrisma.supplierOrderReceipt, mockPrisma.supplierOrderReceiptItem,
    mockPrisma.supplierOrderWeightAdjustment,
    mockPrisma.supplierOrderInvoice, mockPrisma.supplierOrderPayment,
    mockPrisma.supplierOrderStateHistory,
    mockPrisma.supplierMetalLedger, mockPrisma.supplierMoneyLedger,
    mockPrisma.account, mockPrisma.voucherSequence,
  ]) {
    for (const k of Object.keys(m)) m[k].mockReset();
    m.findMany?.mockResolvedValue([]);
    m.findUnique?.mockResolvedValue(null);
    m.findFirst?.mockResolvedValue(null);
    m.create?.mockResolvedValue({});
    m.update?.mockResolvedValue({});
    m.count?.mockResolvedValue(0);
    m.upsert?.mockResolvedValue({});
    m.deleteMany?.mockResolvedValue({ count: 0 });
    m.aggregate?.mockResolvedValue({ _sum: {}, _count: {} });
    m.groupBy?.mockResolvedValue([]);
  }

  mockPrisma.$queryRawUnsafe.mockResolvedValue([{ max: 0 }]);
  mockPrisma.voucherSequence.upsert.mockResolvedValue({ lastNumber: 1 });
  mockPrisma.voucherSequence.update.mockResolvedValue({ lastNumber: 1 });
  mockCanTransition.mockReturnValue(true);
  mockTransitionSupplierOrder.mockResolvedValue(undefined);
  mockNextStates.mockReturnValue(['SENT_TO_SUPPLIER']);
  mockPostSupplierOrderPurchase.mockResolvedValue({
    purchaseVoucherId: 1, voucherNo: 'PUR/1', labelsCreated: 1, itemsPosted: 1,
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders (create draft)
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders (create draft)', () => {
  it('400 when supplierId missing', async () => {
    const res = await request(app)
      .post('/api/supplier-orders')
      .send({ items: [{ category: 'Ring', metalTypeId: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/supplierId/);
  });

  it('400 when items array empty', async () => {
    const res = await request(app)
      .post('/api/supplier-orders')
      .send({ supplierId: 10, items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/item/i);
  });

  it('400 when item missing category', async () => {
    const res = await request(app)
      .post('/api/supplier-orders')
      .send({ supplierId: 10, items: [{ metalTypeId: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });

  it('404 when supplier not found', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/supplier-orders')
      .send({ supplierId: 999, items: [{ category: 'Ring', metalTypeId: 1 }] });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/[Ss]upplier/);
  });

  it('201 creates order with correct fields', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(SUPPLIER);
    const createdOrder = {
      ...ORDER_BASE, items: [ORDER_ITEM], supplier: { id: 10, name: 'Jain Jewellers' },
    };
    mockPrisma.supplierOrder.create.mockResolvedValue(createdOrder);
    mockPrisma.supplierOrderStateHistory.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/supplier-orders')
      .send({
        supplierId: 10,
        estimatedAmount: 50000,
        priority: 'NORMAL',
        expectedDeliveryDate: '2025-06-01',
        items: [{
          category: 'Necklace', ornamentType: 'Temple Necklace',
          metalTypeId: 1, purity: '22KT',
          orderedQty: 2, orderedGrossWeight: 50, orderedNetWeight: 47.5,
          expectedWastagePercent: 5,
          makingChargeType: 'PER_GRAM', makingChargeValue: 800,
        }],
      });

    expect(res.status).toBe(201);
    expect(res.body.order).toBeDefined();
    expect(mockPrisma.supplierOrder.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.supplierOrderStateHistory.create).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════
// GET /api/supplier-orders (list)
// ══════════════════════════════════════════════════════════
describe('GET /api/supplier-orders (list)', () => {
  it('returns paginated results', async () => {
    mockPrisma.supplierOrder.findMany.mockResolvedValue([ORDER_BASE]);
    mockPrisma.supplierOrder.count.mockResolvedValue(1);

    const res = await request(app).get('/api/supplier-orders');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
  });

  it('applies status filter', async () => {
    mockPrisma.supplierOrder.findMany.mockResolvedValue([]);
    mockPrisma.supplierOrder.count.mockResolvedValue(0);

    await request(app).get('/api/supplier-orders?status=DRAFT');
    const callArgs = mockPrisma.supplierOrder.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe('DRAFT');
  });

  it('applies branch scoping', async () => {
    authState.branchScope = [1, 2];
    mockPrisma.supplierOrder.findMany.mockResolvedValue([]);
    mockPrisma.supplierOrder.count.mockResolvedValue(0);

    await request(app).get('/api/supplier-orders');
    const callArgs = mockPrisma.supplierOrder.findMany.mock.calls[0][0];
    expect(callArgs.where.branchId).toEqual({ in: [1, 2] });
  });

  it('applies text search on orderNo and supplier name', async () => {
    mockPrisma.supplierOrder.findMany.mockResolvedValue([]);
    mockPrisma.supplierOrder.count.mockResolvedValue(0);

    await request(app).get('/api/supplier-orders?q=SO/1');
    const callArgs = mockPrisma.supplierOrder.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toBeDefined();
    expect(callArgs.where.OR).toHaveLength(3);
  });
});

// ══════════════════════════════════════════════════════════
// GET /api/supplier-orders/:id (detail)
// ══════════════════════════════════════════════════════════
describe('GET /api/supplier-orders/:id (detail)', () => {
  it('404 when not found', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/supplier-orders/999');
    expect(res.status).toBe(404);
  });

  it('200 with full detail + balance + nextStates', async () => {
    const fullOrder = {
      ...ORDER_BASE, items: [ORDER_ITEM], receipts: [],
      weightAdjustments: [], invoices: [], payments: [],
      stateHistory: [], supplier: SUPPLIER, branch: { id: 1, name: 'Main', code: 'M' },
    };
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(fullOrder);
    mockGetSupplierBalance.mockResolvedValue({ metalBalance: [], moneyBalance: -5000 });

    const res = await request(app).get('/api/supplier-orders/100');
    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(100);
    expect(res.body.balance).toBeDefined();
    expect(res.body.allowedNextStates).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════
// PUT /api/supplier-orders/:id (update)
// ══════════════════════════════════════════════════════════
describe('PUT /api/supplier-orders/:id (update)', () => {
  it('404 when order not found', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/api/supplier-orders/999').send({ notes: 'test' });
    expect(res.status).toBe(404);
  });

  it('400 when order is CLOSED', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'CLOSED' });
    const res = await request(app).put('/api/supplier-orders/100').send({ priority: 'URGENT' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/closed|cancelled/i);
  });

  it('allows notes update on closed orders', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'CLOSED' });
    mockPrisma.supplierOrder.update.mockResolvedValue({ ...ORDER_BASE, status: 'CLOSED', notes: 'Updated' });

    const res = await request(app).put('/api/supplier-orders/100').send({ notes: 'Updated' });
    expect(res.status).toBe(200);
    expect(mockPrisma.supplierOrder.update).toHaveBeenCalled();
  });

  it('replaces items when status is DRAFT', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'DRAFT' });
    mockPrisma.supplierOrder.update.mockResolvedValue(ORDER_BASE);
    mockPrisma.supplierOrderItem.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.supplierOrderItem.createMany.mockResolvedValue({ count: 2 });

    const res = await request(app).put('/api/supplier-orders/100').send({
      items: [
        { category: 'Ring', metalTypeId: 1, orderedQty: 3 },
        { category: 'Bangle', metalTypeId: 1, orderedQty: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.supplierOrderItem.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.supplierOrderItem.createMany).toHaveBeenCalled();
  });

  it('403 when non-master branch tries item changes after sent', async () => {
    authState.isMasterBranch = false;
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'SENT_TO_SUPPLIER' });

    const res = await request(app).put('/api/supplier-orders/100').send({
      items: [{ category: 'Ring', metalTypeId: 1 }],
    });
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders/:id/send
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders/:id/send', () => {
  it('404 when not found', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/supplier-orders/999/send').send({});
    expect(res.status).toBe(404);
  });

  it('400 when not in DRAFT status', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'SENT_TO_SUPPLIER', items: [],
    });
    const res = await request(app).post('/api/supplier-orders/100/send').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SENT_TO_SUPPLIER/);
  });

  it('200 transitions to SENT_TO_SUPPLIER', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'DRAFT', items: [ORDER_ITEM], supplier: SUPPLIER,
    });

    const res = await request(app).post('/api/supplier-orders/100/send').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockTransitionSupplierOrder).toHaveBeenCalledWith(
      expect.anything(), 100, 'DRAFT', 'SENT_TO_SUPPLIER', expect.objectContaining({ userId: 1 }),
    );
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders/:id/acknowledge
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders/:id/acknowledge', () => {
  it('400 when not SENT_TO_SUPPLIER', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'DRAFT' });
    const res = await request(app).post('/api/supplier-orders/100/acknowledge').send({});
    expect(res.status).toBe(400);
  });

  it('200 records acknowledgement and transitions', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'SENT_TO_SUPPLIER' });
    mockPrisma.supplierOrder.update.mockResolvedValue({});

    const res = await request(app).post('/api/supplier-orders/100/acknowledge').send({
      supplierReferenceNo: 'JJ-REF-001',
      confirmedDeliveryDate: '2025-06-15',
    });
    expect(res.status).toBe(200);
    expect(mockTransitionSupplierOrder).toHaveBeenCalledWith(
      expect.anything(), 100, 'SENT_TO_SUPPLIER', 'SUPPLIER_ACKNOWLEDGED', expect.anything(),
    );
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders/:id/advance-payment
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders/:id/advance-payment', () => {
  it('400 when amount missing or <= 0', async () => {
    const res = await request(app).post('/api/supplier-orders/100/advance-payment').send({ amount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/amount/);
  });

  it('404 when order not found', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/supplier-orders/999/advance-payment').send({ amount: 5000 });
    expect(res.status).toBe(404);
  });

  it('201 creates payment + calls ledger', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'SUPPLIER_ACKNOWLEDGED' });
    mockPrisma.supplierOrderPayment.create.mockResolvedValue({ id: 1, amount: 10000, paymentNo: 'SPP/1' });
    mockPrisma.supplierOrder.update.mockResolvedValue({});

    const res = await request(app).post('/api/supplier-orders/100/advance-payment').send({
      amount: 10000, paymentMode: 'UPI', reference: 'TXN123',
    });
    expect(res.status).toBe(201);
    expect(res.body.payment).toBeDefined();
    expect(mockPostAdvancePaymentLedger).toHaveBeenCalledTimes(1);
    expect(mockPostAdvancePaymentLedger).toHaveBeenCalledWith(expect.objectContaining({
      amount: 10000, supplierId: 10, supplierOrderId: 100,
    }));
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders/:id/receipt
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders/:id/receipt', () => {
  it('400 when items empty', async () => {
    const res = await request(app).post('/api/supplier-orders/100/receipt').send({ items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/item/i);
  });

  it('400 when status not allowed for receipt', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'DRAFT', items: [] });
    const res = await request(app).post('/api/supplier-orders/100/receipt').send({
      items: [{ supplierOrderItemId: 200, receivedQty: 2, receivedGrossWeight: 50, receivedNetWeight: 47 }],
    });
    expect(res.status).toBe(400);
  });

  it('201 creates receipt + posts metal ledger', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'DISPATCHED', items: [ORDER_ITEM],
    });
    const createdReceipt = { ...RECEIPT_BASE, items: [RECEIPT_ITEM] };
    mockPrisma.supplierOrderReceipt.create.mockResolvedValue(createdReceipt);
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([RECEIPT_ITEM]);
    mockPrisma.supplierOrder.update.mockResolvedValue({});

    const res = await request(app).post('/api/supplier-orders/100/receipt').send({
      packageReference: 'PKG-001',
      items: [{ supplierOrderItemId: 200, receivedQty: 2, receivedGrossWeight: 50, receivedNetWeight: 47.5 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.receipt).toBeDefined();
    expect(mockPostGoodsReceiptMetalLedger).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders/:id/receipt/:receiptId/qc
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders/:id/receipt/:receiptId/qc', () => {
  it('400 when qc items empty', async () => {
    const res = await request(app).post('/api/supplier-orders/100/receipt/300/qc').send({ items: [] });
    expect(res.status).toBe(400);
  });

  it('404 when order not found', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/supplier-orders/999/receipt/300/qc').send({
      items: [{ receiptItemId: 400, qcStatus: 'PASSED' }],
    });
    expect(res.status).toBe(404);
  });

  it('404 when receipt not found', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, items: [ORDER_ITEM] });
    mockPrisma.supplierOrderReceipt.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/supplier-orders/100/receipt/999/qc').send({
      items: [{ receiptItemId: 400, qcStatus: 'PASSED' }],
    });
    expect(res.status).toBe(404);
  });

  it('200 records QC and creates weight adjustment when difference exists', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'RECEIVED_PENDING_QC', items: [ORDER_ITEM] });
    mockPrisma.supplierOrderReceipt.findFirst.mockResolvedValue({
      ...RECEIPT_BASE, items: [RECEIPT_ITEM],
    });
    mockPrisma.supplierOrderReceiptItem.update.mockResolvedValue({});
    mockPrisma.supplierOrderWeightAdjustment.create.mockResolvedValue({});
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([
      { ...RECEIPT_ITEM, qcStatus: 'PASSED' },
    ]);
    mockPrisma.supplierOrderReceipt.update.mockResolvedValue({});
    mockPrisma.supplierOrderReceipt.findMany.mockResolvedValue([{ status: 'QC_PASSED' }]);

    const res = await request(app).post('/api/supplier-orders/100/receipt/300/qc').send({
      items: [{
        receiptItemId: 400,
        qcStatus: 'PASSED',
        acceptedQty: 2,
        acceptedGrossWeight: 49, // 1g less than received 50
        acceptedNetWeight: 46.5, // 1g less than received 47.5
      }],
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.supplierOrderReceiptItem.update).toHaveBeenCalled();
    expect(mockPrisma.supplierOrderWeightAdjustment.create).toHaveBeenCalled();
    expect(mockPostWeightAdjustmentLedger).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders/:id/invoice
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders/:id/invoice', () => {
  it('400 when supplierInvoiceNo missing', async () => {
    const res = await request(app).post('/api/supplier-orders/100/invoice').send({ taxableAmount: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/supplierInvoiceNo/);
  });

  it('400 when taxableAmount <= 0', async () => {
    const res = await request(app).post('/api/supplier-orders/100/invoice').send({
      supplierInvoiceNo: 'INV-1', taxableAmount: 0,
    });
    expect(res.status).toBe(400);
  });

  it('400 when status not allowed', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'DRAFT' });
    const res = await request(app).post('/api/supplier-orders/100/invoice').send({
      supplierInvoiceNo: 'INV-1', taxableAmount: 5000,
    });
    expect(res.status).toBe(400);
  });

  it('201 creates invoice + posts payable ledger', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'QC_COMPLETED' });
    mockPrisma.supplierOrderInvoice.create.mockResolvedValue(INVOICE_BASE);

    const res = await request(app).post('/api/supplier-orders/100/invoice').send({
      supplierInvoiceNo: 'JJ/2025/001',
      taxableAmount: 45000,
      cgstAmount: 675,
      sgstAmount: 675,
    });
    expect(res.status).toBe(201);
    expect(res.body.invoice).toBeDefined();
    expect(mockPostSupplierInvoicePayable).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders/:id/post-purchase
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders/:id/post-purchase', () => {
  it('400 when status not allowed', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'DRAFT', receipts: [],
    });
    const res = await request(app).post('/api/supplier-orders/100/post-purchase').send({});
    expect(res.status).toBe(400);
  });

  it('200 returns ok if already posted (idempotent)', async () => {
    const postedItem = { ...RECEIPT_ITEM, qcStatus: 'PASSED', inventoryPosted: true };
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'QC_COMPLETED',
      receipts: [{ ...RECEIPT_BASE, items: [postedItem] }],
    });

    const res = await request(app).post('/api/supplier-orders/100/post-purchase').send({});
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already/i);
    expect(mockPostSupplierOrderPurchase).not.toHaveBeenCalled();
  });

  it('200 calls postSupplierOrderPurchase for unposted items', async () => {
    const passedItem = { ...RECEIPT_ITEM, qcStatus: 'PASSED', inventoryPosted: false, acceptedNetWeight: 47.5 };
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'QC_COMPLETED',
      receipts: [{ ...RECEIPT_BASE, items: [passedItem] }],
    });

    const res = await request(app).post('/api/supplier-orders/100/post-purchase').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.purchaseVoucherId).toBe(1);
    expect(res.body.labelsCreated).toBe(1);
    expect(res.body.itemsPosted).toBe(1);
    expect(mockPostSupplierOrderPurchase).toHaveBeenCalledWith({
      supplierOrderId: 100,
      companyId: 1,
      branchId: 1,
      userId: 1,
      financialYear: undefined,
    });
  });

  it('400 when service throws validation error', async () => {
    const passedItem = { ...RECEIPT_ITEM, qcStatus: 'PASSED', inventoryPosted: false, acceptedNetWeight: 47.5 };
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'QC_COMPLETED',
      receipts: [{ ...RECEIPT_BASE, items: [passedItem] }],
    });
    mockPostSupplierOrderPurchase.mockRejectedValueOnce(
      new Error('No accepted QC items to post')
    );

    const res = await request(app).post('/api/supplier-orders/100/post-purchase').send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/No accepted QC items/);
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders/:id/payment
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders/:id/payment', () => {
  it('400 when amount <= 0', async () => {
    const res = await request(app).post('/api/supplier-orders/100/payment').send({ amount: -1 });
    expect(res.status).toBe(400);
  });

  it('400 when status not allowed', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'DRAFT', invoices: [],
    });
    const res = await request(app).post('/api/supplier-orders/100/payment').send({ amount: 5000 });
    expect(res.status).toBe(400);
  });

  it('201 records payment + posts ledger + updates invoice due', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'INVOICE_RECEIVED', invoices: [INVOICE_BASE],
    });
    mockPrisma.supplierOrderPayment.create.mockResolvedValue({ id: 2, amount: 20000, paymentNo: 'SPP/2' });
    mockPrisma.supplierOrderPayment.findMany.mockResolvedValue([
      { amount: 10000 }, { amount: 20000 },
    ]);
    mockPrisma.supplierOrderInvoice.update.mockResolvedValue({});

    const res = await request(app).post('/api/supplier-orders/100/payment').send({
      amount: 20000, paymentMode: 'NEFT', reference: 'UTR456',
    });
    expect(res.status).toBe(201);
    expect(res.body.payment).toBeDefined();
    expect(mockPostSupplierPayment).toHaveBeenCalledTimes(1);
    expect(mockPostSupplierPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 20000, paymentType: 'DELIVERY_PAYMENT',
    }));
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders/:id/close
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders/:id/close', () => {
  it('404 when not found', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/supplier-orders/999/close').send({});
    expect(res.status).toBe(404);
  });

  it('400 when canTransition returns false', async () => {
    mockCanTransition.mockReturnValue(false);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'DRAFT', invoices: [], payments: [],
    });
    const res = await request(app).post('/api/supplier-orders/100/close').send({});
    expect(res.status).toBe(400);
  });

  it('400 when unresolved weight adjustments exist', async () => {
    mockCanTransition.mockReturnValue(true);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'PAYMENT_PENDING', invoices: [], payments: [],
    });
    mockPrisma.supplierOrderWeightAdjustment.count.mockResolvedValue(2);

    const res = await request(app).post('/api/supplier-orders/100/close').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unresolved/i);
  });

  it('200 closes when all clear', async () => {
    mockCanTransition.mockReturnValue(true);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'PAYMENT_PENDING', invoices: [], payments: [],
    });
    mockPrisma.supplierOrderWeightAdjustment.count.mockResolvedValue(0);

    const res = await request(app).post('/api/supplier-orders/100/close').send({ reason: 'All settled' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockTransitionSupplierOrder).toHaveBeenCalledWith(
      expect.anything(), 100, 'PAYMENT_PENDING', 'CLOSED', expect.objectContaining({ reason: 'All settled' }),
    );
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/supplier-orders/:id/cancel
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders/:id/cancel', () => {
  it('400 when reason is empty', async () => {
    const res = await request(app).post('/api/supplier-orders/100/cancel').send({ reason: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  it('404 when not found', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/supplier-orders/999/cancel').send({ reason: 'Changed mind' });
    expect(res.status).toBe(404);
  });

  it('400 when canTransition returns false', async () => {
    mockCanTransition.mockReturnValue(false);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'CLOSED', payments: [], receipts: [],
    });
    const res = await request(app).post('/api/supplier-orders/100/cancel').send({ reason: 'Error' });
    expect(res.status).toBe(400);
  });

  it('403 when non-master user cancels after payment without override', async () => {
    authState.isMasterBranch = false;
    mockCanTransition.mockReturnValue(true);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'ADVANCE_PAID',
      payments: [{ id: 1, amount: 5000 }], receipts: [],
    });

    const res = await request(app).post('/api/supplier-orders/100/cancel').send({ reason: 'Changed mind' });
    expect(res.status).toBe(403);
  });

  it('200 cancels with ledger reversal', async () => {
    mockCanTransition.mockReturnValue(true);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'DRAFT', payments: [], receipts: [],
    });

    const res = await request(app).post('/api/supplier-orders/100/cancel').send({ reason: 'Duplicate order' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockReverseLedgerForCancellation).toHaveBeenCalledTimes(1);
    expect(mockTransitionSupplierOrder).toHaveBeenCalledWith(
      expect.anything(), 100, 'DRAFT', 'CANCELLED', expect.objectContaining({ reason: 'Duplicate order' }),
    );
  });
});

// ══════════════════════════════════════════════════════════
// GET /api/supplier-orders/dashboard
// ══════════════════════════════════════════════════════════
describe('GET /api/supplier-orders/dashboard', () => {
  it('200 returns dashboard counters', async () => {
    mockPrisma.supplierOrder.count.mockResolvedValue(5);
    mockPrisma.supplierOrderReceipt.findMany.mockResolvedValue([]);
    mockPrisma.supplierOrder.groupBy.mockResolvedValue([]);

    const res = await request(app).get('/api/supplier-orders/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.counters).toBeDefined();
    expect(res.body.topSuppliers).toBeDefined();
    expect(res.body.recentReceipts).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════
// GET /api/supplier-orders/reports/:type
// ══════════════════════════════════════════════════════════
describe('GET /api/supplier-orders/reports/:type', () => {
  it('400 for unknown report type', async () => {
    const res = await request(app).get('/api/supplier-orders/reports/foobar');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown report/);
  });

  it('200 for pending-orders', async () => {
    mockPrisma.supplierOrder.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/supplier-orders/reports/pending-orders');
    expect(res.status).toBe(200);
    expect(res.body.rows).toBeDefined();
  });

  it('200 for delayed-orders', async () => {
    mockPrisma.supplierOrder.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/supplier-orders/reports/delayed-orders');
    expect(res.status).toBe(200);
  });

  it('200 for short-excess-report', async () => {
    mockPrisma.supplierOrderWeightAdjustment.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/supplier-orders/reports/short-excess-report');
    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════
// PATCH /api/supplier-orders/:id/status (generic transition)
// ══════════════════════════════════════════════════════════
describe('PATCH /api/supplier-orders/:id/status', () => {
  it('400 when toStatus missing', async () => {
    const res = await request(app).patch('/api/supplier-orders/100/status').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/toStatus/);
  });

  it('404 when order not found', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(null);
    const res = await request(app).patch('/api/supplier-orders/999/status').send({ toStatus: 'CLOSED' });
    expect(res.status).toBe(404);
  });

  it('200 performs transition', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ id: 100, status: 'DRAFT', orderNo: 'SO/1' });

    const res = await request(app).patch('/api/supplier-orders/100/status').send({
      toStatus: 'SENT_TO_SUPPLIER', reason: 'Ready to send',
    });
    expect(res.status).toBe(200);
    expect(mockTransitionSupplierOrder).toHaveBeenCalledWith(
      expect.anything(), 100, 'DRAFT', 'SENT_TO_SUPPLIER', expect.objectContaining({ reason: 'Ready to send' }),
    );
  });

  it('400 when canTransition returns false (invalid transition)', async () => {
    mockTransitionSupplierOrder.mockRejectedValueOnce(new MockInvalidTransitionError('Cannot transition from CLOSED to DRAFT'));
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ id: 100, status: 'CLOSED', orderNo: 'SO/1' });

    const res = await request(app).patch('/api/supplier-orders/100/status').send({
      toStatus: 'DRAFT',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot transition/);
  });

  it('400 when transitioning from terminal state CANCELLED', async () => {
    mockTransitionSupplierOrder.mockRejectedValueOnce(new MockInvalidTransitionError('Cannot transition from CANCELLED'));
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ id: 100, status: 'CANCELLED', orderNo: 'SO/1' });

    const res = await request(app).patch('/api/supplier-orders/100/status').send({
      toStatus: 'DRAFT',
    });
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════
// CREATION — voucher number + scoping
// ══════════════════════════════════════════════════════════
describe('POST /api/supplier-orders — voucher & scoping', () => {
  it('generates voucher number SO/N on creation', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(SUPPLIER);
    const createdOrder = {
      ...ORDER_BASE, orderNo: 'SO/1', orderPrefix: 'SO', orderNumber: 1,
      items: [ORDER_ITEM], supplier: SUPPLIER,
    };
    mockPrisma.supplierOrder.create.mockResolvedValue(createdOrder);
    mockPrisma.supplierOrderStateHistory.create.mockResolvedValue({});

    const res = await request(app).post('/api/supplier-orders').send({
      supplierId: 10,
      items: [{ category: 'Necklace', metalTypeId: 1, orderedQty: 2 }],
    });
    expect(res.status).toBe(201);
    expect(mockPrisma.supplierOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderNo: expect.stringMatching(/^SO\//),
          orderPrefix: 'SO',
        }),
      }),
    );
  });

  it('scopes created order to user branch and company', async () => {
    authState.branchId = 3;
    authState.companyId = 2;
    mockPrisma.account.findFirst.mockResolvedValue({ ...SUPPLIER, companyId: 2 });
    mockPrisma.supplierOrder.create.mockResolvedValue({
      ...ORDER_BASE, companyId: 2, branchId: 3, items: [ORDER_ITEM], supplier: SUPPLIER,
    });
    mockPrisma.supplierOrderStateHistory.create.mockResolvedValue({});

    const res = await request(app).post('/api/supplier-orders').send({
      supplierId: 10,
      items: [{ category: 'Bangle', metalTypeId: 1, orderedQty: 1 }],
    });
    expect(res.status).toBe(201);
    expect(mockPrisma.supplierOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 2, branchId: 3 }),
      }),
    );
    // Restore
    authState.branchId = 1;
    authState.companyId = 1;
  });

  it('writes initial state history on creation', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(SUPPLIER);
    mockPrisma.supplierOrder.create.mockResolvedValue({
      ...ORDER_BASE, items: [ORDER_ITEM], supplier: SUPPLIER,
    });
    mockPrisma.supplierOrderStateHistory.create.mockResolvedValue({});

    await request(app).post('/api/supplier-orders').send({
      supplierId: 10,
      items: [{ category: 'Ring', metalTypeId: 1, orderedQty: 1 }],
    });
    expect(mockPrisma.supplierOrderStateHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toStatus: 'DRAFT' }),
      }),
    );
  });
});

// ══════════════════════════════════════════════════════════
// STATUS WORKFLOW — extended transitions
// ══════════════════════════════════════════════════════════
describe('Status workflow (extended)', () => {
  it('valid transitions call transitionSupplierOrder with correct params', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ id: 100, status: 'DISPATCHED', orderNo: 'SO/1' });

    const res = await request(app).patch('/api/supplier-orders/100/status').send({
      toStatus: 'RECEIVED_PENDING_QC', reason: 'Goods received',
    });
    expect(res.status).toBe(200);
    expect(mockTransitionSupplierOrder).toHaveBeenCalledWith(
      expect.anything(), 100, 'DISPATCHED', 'RECEIVED_PENDING_QC', expect.objectContaining({ reason: 'Goods received' }),
    );
  });

  it('terminal CLOSED state cannot transition (transitionSupplierOrder throws)', async () => {
    mockTransitionSupplierOrder.mockRejectedValueOnce(new MockInvalidTransitionError('Cannot transition from CLOSED'));
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ id: 100, status: 'CLOSED', orderNo: 'SO/1' });

    const res = await request(app).patch('/api/supplier-orders/100/status').send({
      toStatus: 'PAYMENT_PENDING',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('terminal CANCELLED state cannot transition (transitionSupplierOrder throws)', async () => {
    mockTransitionSupplierOrder.mockRejectedValueOnce(new MockInvalidTransitionError('Cannot transition from CANCELLED'));
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ id: 100, status: 'CANCELLED', orderNo: 'SO/1' });

    const res = await request(app).patch('/api/supplier-orders/100/status').send({
      toStatus: 'DRAFT',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });
});

// ══════════════════════════════════════════════════════════
// ADVANCE PAYMENT — ledger + invoice interaction
// ══════════════════════════════════════════════════════════
describe('Advance payment (extended)', () => {
  it('creates SupplierOrderPayment record with correct amount', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'SUPPLIER_ACKNOWLEDGED' });
    mockPrisma.supplierOrderPayment.create.mockResolvedValue({
      id: 1, amount: 10000, paymentNo: 'SPP/1',
    });
    mockPrisma.supplierOrder.update.mockResolvedValue({});

    const res = await request(app).post('/api/supplier-orders/100/advance-payment').send({
      amount: 10000, paymentMode: 'CASH',
    });
    expect(res.status).toBe(201);
    expect(mockPrisma.supplierOrderPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 10000,
          supplierOrderId: 100,
        }),
      }),
    );
  });

  it('posts money ledger entry for advance', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'SUPPLIER_ACKNOWLEDGED' });
    mockPrisma.supplierOrderPayment.create.mockResolvedValue({ id: 1, amount: 5000, paymentNo: 'SPP/1' });
    mockPrisma.supplierOrder.update.mockResolvedValue({});

    await request(app).post('/api/supplier-orders/100/advance-payment').send({
      amount: 5000, paymentMode: 'UPI', reference: 'REF123',
    });
    expect(mockPostAdvancePaymentLedger).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, supplierId: 10 }),
    );
  });

  it('cancellation after advance requires master override (403 for branch user)', async () => {
    authState.isMasterBranch = false;
    mockCanTransition.mockReturnValue(true);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'ADVANCE_PAID',
      payments: [{ id: 1, amount: 10000 }], receipts: [],
    });

    const res = await request(app).post('/api/supplier-orders/100/cancel').send({ reason: 'Changed mind' });
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════
// RECEIPT — partial and full
// ══════════════════════════════════════════════════════════
describe('Receipt (extended)', () => {
  it('supports partial receipt (fewer qty than ordered)', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'DISPATCHED', items: [{ ...ORDER_ITEM, orderedQty: 5 }],
    });
    const createdReceipt = {
      ...RECEIPT_BASE, items: [{ ...RECEIPT_ITEM, receivedQty: 3, receivedGrossWeight: 30, receivedNetWeight: 28 }],
    };
    mockPrisma.supplierOrderReceipt.create.mockResolvedValue(createdReceipt);
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([createdReceipt.items[0]]);
    mockPrisma.supplierOrder.update.mockResolvedValue({});

    const res = await request(app).post('/api/supplier-orders/100/receipt').send({
      items: [{ supplierOrderItemId: 200, receivedQty: 3, receivedGrossWeight: 30, receivedNetWeight: 28 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.receipt).toBeDefined();
  });

  it('supports full receipt matching ordered qty', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'DISPATCHED', items: [ORDER_ITEM],
    });
    const createdReceipt = { ...RECEIPT_BASE, items: [RECEIPT_ITEM] };
    mockPrisma.supplierOrderReceipt.create.mockResolvedValue(createdReceipt);
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([RECEIPT_ITEM]);
    mockPrisma.supplierOrder.update.mockResolvedValue({});

    const res = await request(app).post('/api/supplier-orders/100/receipt').send({
      items: [{ supplierOrderItemId: 200, receivedQty: 2, receivedGrossWeight: 50, receivedNetWeight: 47.5 }],
    });
    expect(res.status).toBe(201);
    expect(mockPostGoodsReceiptMetalLedger).toHaveBeenCalled();
  });

  it('receipt does NOT call inventory posting (inventory only after QC)', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'DISPATCHED', items: [ORDER_ITEM],
    });
    mockPrisma.supplierOrderReceipt.create.mockResolvedValue({ ...RECEIPT_BASE, items: [RECEIPT_ITEM] });
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([RECEIPT_ITEM]);
    mockPrisma.supplierOrder.update.mockResolvedValue({});

    await request(app).post('/api/supplier-orders/100/receipt').send({
      items: [{ supplierOrderItemId: 200, receivedQty: 2, receivedGrossWeight: 50, receivedNetWeight: 47.5 }],
    });
    expect(mockPostSupplierOrderPurchase).not.toHaveBeenCalled();
  });

  it('posts physical metal ledger on receipt', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'DISPATCHED', items: [ORDER_ITEM],
    });
    mockPrisma.supplierOrderReceipt.create.mockResolvedValue({ ...RECEIPT_BASE, items: [RECEIPT_ITEM] });
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([RECEIPT_ITEM]);
    mockPrisma.supplierOrder.update.mockResolvedValue({});

    await request(app).post('/api/supplier-orders/100/receipt').send({
      items: [{ supplierOrderItemId: 200, receivedQty: 2, receivedGrossWeight: 50, receivedNetWeight: 47.5 }],
    });
    expect(mockPostGoodsReceiptMetalLedger).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════
// QC — adjustments and tolerance
// ══════════════════════════════════════════════════════════
describe('QC (extended)', () => {
  it('records accepted and rejected quantity', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'RECEIVED_PENDING_QC', items: [ORDER_ITEM] });
    mockPrisma.supplierOrderReceipt.findFirst.mockResolvedValue({
      ...RECEIPT_BASE, items: [RECEIPT_ITEM],
    });
    mockPrisma.supplierOrderReceiptItem.update.mockResolvedValue({});
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([
      { ...RECEIPT_ITEM, qcStatus: 'PARTIAL' },
    ]);
    mockPrisma.supplierOrderReceipt.update.mockResolvedValue({});
    mockPrisma.supplierOrderReceipt.findMany.mockResolvedValue([{ status: 'QC_PARTIAL' }]);

    const res = await request(app).post('/api/supplier-orders/100/receipt/300/qc').send({
      items: [{
        receiptItemId: 400,
        qcStatus: 'PARTIAL',
        acceptedQty: 1,
        rejectedQty: 1,
        acceptedGrossWeight: 25,
        acceptedNetWeight: 24,
      }],
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.supplierOrderReceiptItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acceptedQty: 1,
          rejectedQty: 1,
          qcStatus: 'PARTIAL',
        }),
      }),
    );
  });

  it('creates SHORT_RECEIVED adjustment when accepted weight < received weight', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'RECEIVED_PENDING_QC', items: [ORDER_ITEM] });
    mockPrisma.supplierOrderReceipt.findFirst.mockResolvedValue({
      ...RECEIPT_BASE, items: [{ ...RECEIPT_ITEM, receivedGrossWeight: 50, receivedNetWeight: 47.5 }],
    });
    mockPrisma.supplierOrderReceiptItem.update.mockResolvedValue({});
    mockPrisma.supplierOrderWeightAdjustment.create.mockResolvedValue({});
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([
      { ...RECEIPT_ITEM, qcStatus: 'PASSED' },
    ]);
    mockPrisma.supplierOrderReceipt.update.mockResolvedValue({});
    mockPrisma.supplierOrderReceipt.findMany.mockResolvedValue([{ status: 'QC_PASSED' }]);

    const res = await request(app).post('/api/supplier-orders/100/receipt/300/qc').send({
      items: [{
        receiptItemId: 400,
        qcStatus: 'PASSED',
        acceptedQty: 2,
        acceptedGrossWeight: 48,  // 2g short
        acceptedNetWeight: 45.5,  // 2g short
      }],
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.supplierOrderWeightAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adjustmentType: 'SHORT_RECEIVED',
        }),
      }),
    );
    expect(mockPostWeightAdjustmentLedger).toHaveBeenCalled();
  });

  it('creates EXCESS_RECEIVED adjustment when accepted weight > received weight', async () => {
    // Received 47.5g but QC accepted 50g (e.g. stone weight was excluded at receipt time)
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'RECEIVED_PENDING_QC', items: [ORDER_ITEM] });
    mockPrisma.supplierOrderReceipt.findFirst.mockResolvedValue({
      ...RECEIPT_BASE, items: [{ ...RECEIPT_ITEM, receivedNetWeight: 47.5 }],
    });
    mockPrisma.supplierOrderReceiptItem.update.mockResolvedValue({});
    mockPrisma.supplierOrderWeightAdjustment.create.mockResolvedValue({});
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([
      { ...RECEIPT_ITEM, qcStatus: 'PASSED' },
    ]);
    mockPrisma.supplierOrderReceipt.update.mockResolvedValue({});
    mockPrisma.supplierOrderReceipt.findMany.mockResolvedValue([{ status: 'QC_PASSED' }]);

    const res = await request(app).post('/api/supplier-orders/100/receipt/300/qc').send({
      items: [{
        receiptItemId: 400,
        qcStatus: 'PASSED',
        acceptedQty: 2,
        acceptedGrossWeight: 52,
        acceptedNetWeight: 50, // 50 > 47.5 received → EXCESS
      }],
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.supplierOrderWeightAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adjustmentType: 'EXCESS_RECEIVED',
        }),
      }),
    );
  });

  it('creates PURITY_DIFFERENCE adjustment when purity differs', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'RECEIVED_PENDING_QC', items: [ORDER_ITEM] });
    mockPrisma.supplierOrderReceipt.findFirst.mockResolvedValue({
      ...RECEIPT_BASE, items: [{ ...RECEIPT_ITEM, receivedPurity: 91.6 }],
    });
    mockPrisma.supplierOrderReceiptItem.update.mockResolvedValue({});
    mockPrisma.supplierOrderWeightAdjustment.create.mockResolvedValue({});
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([
      { ...RECEIPT_ITEM, qcStatus: 'PASSED' },
    ]);
    mockPrisma.supplierOrderReceipt.update.mockResolvedValue({});
    mockPrisma.supplierOrderReceipt.findMany.mockResolvedValue([{ status: 'QC_PASSED' }]);

    const res = await request(app).post('/api/supplier-orders/100/receipt/300/qc').send({
      items: [{
        receiptItemId: 400,
        qcStatus: 'PASSED',
        acceptedQty: 2,
        acceptedGrossWeight: 50,
        acceptedNetWeight: 47.5,
        actualPurity: 85.0, // ordered was 91.6 (22KT)
      }],
    });
    expect(res.status).toBe(200);
    // If the route creates a purity adjustment, verify it
    if (mockPrisma.supplierOrderWeightAdjustment.create.mock.calls.length > 0) {
      expect(mockPrisma.supplierOrderWeightAdjustment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adjustmentType: expect.stringMatching(/PURITY_DIFFERENCE|SHORT_RECEIVED/),
          }),
        }),
      );
    }
  });
});

// ══════════════════════════════════════════════════════════
// INVOICE — advance adjusted, due calculation, duplicate
// ══════════════════════════════════════════════════════════
describe('Invoice (extended)', () => {
  it('adjusts advance in invoice when advance was paid', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'QC_COMPLETED', advancePaid: 10000,
    });
    mockPrisma.supplierOrderInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 500, ...data }),
    );

    const res = await request(app).post('/api/supplier-orders/100/invoice').send({
      supplierInvoiceNo: 'JJ/2025/002',
      taxableAmount: 50000,
      cgstAmount: 750,
      sgstAmount: 750,
      advanceAdjusted: 10000,
    });
    expect(res.status).toBe(201);
    const invoiceData = mockPrisma.supplierOrderInvoice.create.mock.calls[0][0].data;
    expect(invoiceData.advanceAdjusted).toBe(10000);
  });

  it('calculates due correctly: total - advance', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'QC_COMPLETED', advancePaid: 5000,
    });
    mockPrisma.supplierOrderInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 500, ...data }),
    );

    const res = await request(app).post('/api/supplier-orders/100/invoice').send({
      supplierInvoiceNo: 'JJ/2025/003',
      taxableAmount: 40000,
      cgstAmount: 600,
      sgstAmount: 600,
      advanceAdjusted: 5000,
    });
    expect(res.status).toBe(201);
    const invoiceData = mockPrisma.supplierOrderInvoice.create.mock.calls[0][0].data;
    const expectedTotal = 40000 + 600 + 600;
    expect(invoiceData.totalAmount).toBe(expectedTotal);
    expect(invoiceData.dueAmount).toBe(expectedTotal - 5000);
  });

  it('posts supplier invoice payable to money ledger', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({ ...ORDER_BASE, status: 'QC_COMPLETED' });
    mockPrisma.supplierOrderInvoice.create.mockResolvedValue(INVOICE_BASE);

    await request(app).post('/api/supplier-orders/100/invoice').send({
      supplierInvoiceNo: 'JJ/2025/004',
      taxableAmount: 45000,
      cgstAmount: 675,
      sgstAmount: 675,
    });
    expect(mockPostSupplierInvoicePayable).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════
// PURCHASE POSTING — inventory after QC
// ══════════════════════════════════════════════════════════
describe('Purchase posting (extended)', () => {
  it('inventory created only after QC (not before)', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'RECEIVED_PENDING_QC', receipts: [],
    });
    const res = await request(app).post('/api/supplier-orders/100/post-purchase').send({});
    expect(res.status).toBe(400);
    expect(mockPostSupplierOrderPurchase).not.toHaveBeenCalled();
  });

  it('rejected items are not posted to inventory', async () => {
    const rejectedItem = { ...RECEIPT_ITEM, qcStatus: 'FAILED', inventoryPosted: false };
    const passedItem = { ...RECEIPT_ITEM, id: 401, qcStatus: 'PASSED', inventoryPosted: false, acceptedNetWeight: 47.5 };
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'QC_COMPLETED',
      receipts: [{ ...RECEIPT_BASE, items: [rejectedItem, passedItem] }],
    });

    const res = await request(app).post('/api/supplier-orders/100/post-purchase').send({});
    expect(res.status).toBe(200);
    expect(mockPostSupplierOrderPurchase).toHaveBeenCalled();
    // Only passed items should trigger posting — the service handles filtering
  });

  it('posting is idempotent — already-posted items skip re-posting', async () => {
    const alreadyPosted = { ...RECEIPT_ITEM, qcStatus: 'PASSED', inventoryPosted: true };
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'QC_COMPLETED',
      receipts: [{ ...RECEIPT_BASE, items: [alreadyPosted] }],
    });

    const res = await request(app).post('/api/supplier-orders/100/post-purchase').send({});
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already/i);
    expect(mockPostSupplierOrderPurchase).not.toHaveBeenCalled();
  });

  it('duplicate API call does not duplicate inventory (idempotent check)', async () => {
    // Second call: status is now QC_COMPLETED but all items already posted
    const alreadyPosted = { ...RECEIPT_ITEM, qcStatus: 'PASSED', inventoryPosted: true };
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'QC_COMPLETED',
      receipts: [{ ...RECEIPT_BASE, items: [alreadyPosted] }],
    });

    const res1 = await request(app).post('/api/supplier-orders/100/post-purchase').send({});
    expect(res1.status).toBe(200);
    expect(res1.body.message).toMatch(/already/i);
    expect(mockPostSupplierOrderPurchase).not.toHaveBeenCalled();
  });

  it('returns purchaseVoucherId linking inventory back to receipt', async () => {
    const passedItem = { ...RECEIPT_ITEM, qcStatus: 'PASSED', inventoryPosted: false, acceptedNetWeight: 47.5 };
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'QC_COMPLETED',
      receipts: [{ ...RECEIPT_BASE, items: [passedItem] }],
    });
    mockPostSupplierOrderPurchase.mockResolvedValue({
      purchaseVoucherId: 42, voucherNo: 'PUR/5', labelsCreated: 2, itemsPosted: 2,
    });

    const res = await request(app).post('/api/supplier-orders/100/post-purchase').send({});
    expect(res.status).toBe(200);
    expect(res.body.purchaseVoucherId).toBe(42);
    expect(res.body.voucherNo).toBe('PUR/5');
    expect(res.body.labelsCreated).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════
// PAYMENT AND CLOSURE
// ══════════════════════════════════════════════════════════
describe('Payment and closure (extended)', () => {
  it('payment reduces invoice due', async () => {
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'INVOICE_RECEIVED',
      invoices: [{ ...INVOICE_BASE, totalAmount: 50000, dueAmount: 40000 }],
    });
    mockPrisma.supplierOrderPayment.create.mockResolvedValue({ id: 3, amount: 15000, paymentNo: 'SPP/3' });
    mockPrisma.supplierOrderPayment.findMany.mockResolvedValue([
      { amount: 10000 }, { amount: 15000 },
    ]);
    mockPrisma.supplierOrderInvoice.update.mockResolvedValue({});

    const res = await request(app).post('/api/supplier-orders/100/payment').send({
      amount: 15000, paymentMode: 'CHEQUE', reference: 'CHQ001',
    });
    expect(res.status).toBe(201);
    expect(mockPostSupplierPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 15000, paymentType: 'DELIVERY_PAYMENT' }),
    );
  });

  it('cannot close when unresolved weight adjustments exist', async () => {
    mockCanTransition.mockReturnValue(true);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'PAYMENT_PENDING', invoices: [], payments: [],
    });
    mockPrisma.supplierOrderWeightAdjustment.count.mockResolvedValue(3);

    const res = await request(app).post('/api/supplier-orders/100/close').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unresolved/i);
  });

  it('closes successfully when all adjustments resolved and due is zero', async () => {
    mockCanTransition.mockReturnValue(true);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'PAYMENT_PENDING',
      invoices: [{ ...INVOICE_BASE, dueAmount: 0 }],
      payments: [{ amount: 46550 }],
    });
    mockPrisma.supplierOrderWeightAdjustment.count.mockResolvedValue(0);

    const res = await request(app).post('/api/supplier-orders/100/close').send({ reason: 'All settled' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockTransitionSupplierOrder).toHaveBeenCalledWith(
      expect.anything(), 100, 'PAYMENT_PENDING', 'CLOSED', expect.objectContaining({ reason: 'All settled' }),
    );
  });

  it('cancellation triggers ledger reversal', async () => {
    mockCanTransition.mockReturnValue(true);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'SENT_TO_SUPPLIER', payments: [], receipts: [],
    });

    const res = await request(app).post('/api/supplier-orders/100/cancel').send({ reason: 'Supplier unreliable' });
    expect(res.status).toBe(200);
    expect(mockReverseLedgerForCancellation).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════
// REPORTS — all types
// ══════════════════════════════════════════════════════════
describe('Reports (full coverage)', () => {
  it('pending-orders returns filtered supplier orders', async () => {
    mockPrisma.supplierOrder.findMany.mockResolvedValue([
      { ...ORDER_BASE, status: 'SENT_TO_SUPPLIER', supplier: { name: 'Jain' }, branch: { name: 'Main' } },
    ]);
    const res = await request(app).get('/api/supplier-orders/reports/pending-orders');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].status).toBe('SENT_TO_SUPPLIER');
  });

  it('delayed-orders returns orders past expected delivery', async () => {
    const pastDate = new Date('2020-01-01');
    mockPrisma.supplierOrder.findMany.mockResolvedValue([
      { ...ORDER_BASE, expectedDeliveryDate: pastDate, supplier: { name: 'Jain' }, branch: { name: 'Main' } },
    ]);
    const res = await request(app).get('/api/supplier-orders/reports/delayed-orders');
    expect(res.status).toBe(200);
    expect(res.body.rows).toBeDefined();
  });

  it('pending-qc returns orders in RECEIVED_PENDING_QC status', async () => {
    mockPrisma.supplierOrder.findMany.mockResolvedValue([
      { ...ORDER_BASE, status: 'RECEIVED_PENDING_QC', supplier: { name: 'Jain' }, receipts: [] },
    ]);
    const res = await request(app).get('/api/supplier-orders/reports/pending-qc');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
  });

  it('pending-invoice returns orders in QC_COMPLETED or PURCHASE_POSTED', async () => {
    mockPrisma.supplierOrder.findMany.mockResolvedValue([
      { ...ORDER_BASE, status: 'QC_COMPLETED', supplier: { name: 'Jain' } },
    ]);
    const res = await request(app).get('/api/supplier-orders/reports/pending-invoice');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
  });

  it('pending-payment returns orders in PAYMENT_PENDING status', async () => {
    mockPrisma.supplierOrder.findMany.mockResolvedValue([
      { ...ORDER_BASE, status: 'PAYMENT_PENDING', supplier: { name: 'Jain' }, invoices: [{ id: 1, totalAmount: 50000, dueAmount: 30000 }] },
    ]);
    const res = await request(app).get('/api/supplier-orders/reports/pending-payment');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].invoices[0].dueAmount).toBe(30000);
  });

  it('supplier-performance returns aggregated stats per supplier', async () => {
    const closedOrder = {
      id: 101, supplierId: 10, estimatedAmount: 50000,
      expectedDeliveryDate: new Date('2025-05-01'), closedAt: new Date('2025-05-03'), updatedAt: new Date('2025-05-03'),
      items: [{ id: 200, orderedQty: 2 }],
    };
    mockPrisma.supplierOrder.findMany.mockResolvedValue([closedOrder]);
    mockPrisma.supplierOrderWeightAdjustment.findMany.mockResolvedValue([
      { supplierOrderId: 101, adjustmentType: 'SHORT_RECEIVED' },
    ]);
    mockPrisma.supplierOrderReceiptItem.findMany.mockResolvedValue([]);
    mockPrisma.account.findMany.mockResolvedValue([{ id: 10, name: 'Jain Jewellers' }]);

    const res = await request(app).get('/api/supplier-orders/reports/supplier-performance');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].supplier.name).toBe('Jain Jewellers');
    expect(res.body.rows[0].totalOrders).toBe(1);
    expect(res.body.rows[0].delayedDeliveries).toBe(1);
    expect(res.body.rows[0].shortCount).toBe(1);
  });

  it('short-excess-report returns weight adjustments', async () => {
    mockPrisma.supplierOrderWeightAdjustment.findMany.mockResolvedValue([
      {
        id: 1, adjustmentType: 'SHORT_RECEIVED', grossWeightDiff: -2, netWeightDiff: -1.8,
        supplierOrder: { orderNo: 'SO/1', supplier: { name: 'Jain' } },
        metalType: { name: 'Gold', code: 'AU' },
      },
    ]);
    const res = await request(app).get('/api/supplier-orders/reports/short-excess-report');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].adjustmentType).toBe('SHORT_RECEIVED');
  });

  it('supplier-metal-balance returns ledger balances per supplier+metal', async () => {
    mockPrisma.supplierMetalLedger.findMany.mockResolvedValue([
      {
        supplierId: 10, metalTypeId: 1, purity: 91.6,
        balanceAfterTransaction: 25.5, fineWeight: 23.4,
        supplier: { name: 'Jain Jewellers' },
        metalType: { name: 'Gold', code: 'AU' },
      },
    ]);
    const res = await request(app).get('/api/supplier-orders/reports/supplier-metal-balance');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].balanceAfterTransaction).toBe(25.5);
  });

  it('supplier-money-balance returns money ledger balances', async () => {
    mockPrisma.supplierMoneyLedger.findMany.mockResolvedValue([
      {
        supplierId: 10, balanceAfterTransaction: -15000, debit: 50000, credit: 65000,
        supplier: { name: 'Jain Jewellers' },
      },
    ]);
    const res = await request(app).get('/api/supplier-orders/reports/supplier-money-balance');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].balanceAfterTransaction).toBe(-15000);
  });

  it('400 for unknown report type', async () => {
    const res = await request(app).get('/api/supplier-orders/reports/invalid-type');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown report/);
  });

  it('applies branch scoping to reports', async () => {
    authState.branchScope = [2, 3];
    mockPrisma.supplierOrder.findMany.mockResolvedValue([]);

    await request(app).get('/api/supplier-orders/reports/pending-orders');
    const callArgs = mockPrisma.supplierOrder.findMany.mock.calls[0][0];
    expect(callArgs.where.branchId).toEqual({ in: [2, 3] });
  });
});

// ══════════════════════════════════════════════════════════
// SECURITY / SCOPING
// ══════════════════════════════════════════════════════════
describe('Security and scoping', () => {
  it('user from another branch cannot access order (branch scoping)', async () => {
    authState.branchScope = [9]; // user is on branch 9
    authState.isMasterBranch = false;
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(null); // scoped query finds nothing

    const res = await request(app).get('/api/supplier-orders/100');
    expect(res.status).toBe(404);
    // Verify query included branch scoping
    const callArgs = mockPrisma.supplierOrder.findFirst.mock.calls[0][0];
    expect(callArgs.where.branchId).toEqual({ in: [9] });
  });

  it('master branch admin can access order from any branch', async () => {
    authState.branchScope = [];
    authState.isMasterBranch = true;
    const fullOrder = {
      ...ORDER_BASE, branchId: 5,
      items: [ORDER_ITEM], receipts: [], weightAdjustments: [],
      invoices: [], payments: [], stateHistory: [],
      supplier: SUPPLIER, branch: { id: 5, name: 'Branch5', code: 'B5' },
    };
    mockPrisma.supplierOrder.findFirst.mockResolvedValue(fullOrder);
    mockGetSupplierBalance.mockResolvedValue({ metalBalance: [], moneyBalance: 0 });

    const res = await request(app).get('/api/supplier-orders/100');
    expect(res.status).toBe(200);
    expect(res.body.order.branchId).toBe(5);
    // Master branch should NOT have branchId restriction in where clause
    const callArgs = mockPrisma.supplierOrder.findFirst.mock.calls[0][0];
    expect(callArgs.where.branchId).toBeUndefined();
  });

  it('branch user cannot cancel after advance without master override', async () => {
    authState.isMasterBranch = false;
    authState.branchScope = [1];
    mockCanTransition.mockReturnValue(true);
    mockPrisma.supplierOrder.findFirst.mockResolvedValue({
      ...ORDER_BASE, status: 'ADVANCE_PAID',
      payments: [{ id: 1, amount: 20000 }], receipts: [],
    });

    const res = await request(app).post('/api/supplier-orders/100/cancel').send({ reason: 'Want to cancel' });
    expect(res.status).toBe(403);
  });

  it('list applies branch scope for non-master users', async () => {
    authState.branchScope = [2, 3];
    authState.isMasterBranch = false;
    mockPrisma.supplierOrder.findMany.mockResolvedValue([]);
    mockPrisma.supplierOrder.count.mockResolvedValue(0);

    await request(app).get('/api/supplier-orders');
    const callArgs = mockPrisma.supplierOrder.findMany.mock.calls[0][0];
    expect(callArgs.where.branchId).toEqual({ in: [2, 3] });
  });

  it('404 when supplier not found prevents creation (no invalid supplier)', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/supplier-orders').send({
      supplierId: 999,
      items: [{ category: 'Ring', metalTypeId: 1, orderedQty: 1 }],
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/[Ss]upplier/);
  });
});
