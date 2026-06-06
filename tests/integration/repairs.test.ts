/**
 * Repair Module — integration tests
 *
 * Exercises the public HTTP surface end-to-end with a mocked Prisma
 * client. We focus on the contracts that are easy to break:
 *  - Validation (400s with helpful errors)
 *  - Tenant / branch scoping (security)
 *  - State machine gates (cannot deliver before READY_FOR_DELIVERY etc.)
 *  - Voucher allocation (REP/N + REPI/N)
 *  - Notification fires on milestone transitions
 *  - Invoice math (subtotal + GST split + advance)
 *  - Delivery override (manager only)
 */
import request from 'supertest';

import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({ prisma: mockPrisma }));

const notifierSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../../server/services/notification', () => ({
  notifier: { send: notifierSend },
  LoggerNotifier: class { send = notifierSend; },
}));

// Default: ADMIN, master branch (no scope) — individual tests override.
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

import app from '../../server/app';

// ── Fixtures ──────────────────────────────────────────────
const REPAIR_BASE = {
  id: 100, repairNo: 'REP/1', repairPrefix: 'REP', repairNumber: 1,
  companyId: 1, branchId: 1,
  customerName: 'Saurabh', customerMobile: '7042341450',
  status: 'RECEIVED', priority: 'NORMAL',
  intakeDate: new Date(), expectedDeliveryDate: null,
  estimatedAmount: 0, advanceReceived: 0,
  customerNotes: null, internalNotes: null,
  approvalRequired: false, approvedAt: null,
  assignedKarigerId: null,
};
const ITEM_1 = {
  id: 200, repairJobId: 100, ornamentType: 'Ring',
  metalTypeId: 1, purity: '22KT',
  grossWeight: 5.0, netWeight: 4.5, stoneWeight: 0.5, quantity: 1,
  returnedWeight: null, issueDescription: 'Resize',
  metalType: { name: 'Gold', code: 'AU' },
};
const KARIGER = {
  id: 50, code: 'K001', name: 'Ramesh', companyId: 1,
  isActive: true, metalBalance: 0, moneyBalance: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  authState.userRole = 'ADMIN';
  authState.branchScope = [];
  authState.isMasterBranch = true;
  // `clearAllMocks` does NOT drain the `mockResolvedValueOnce` queue.
  // If a test queues a value but a code-path short-circuits before the
  // Prisma call, the queued value leaks into the next test and causes
  // baffling cross-test interference. Reset the methods we depend on
  // most heavily so each test starts from a clean baseline.
  for (const m of [
    mockPrisma.repairJob, mockPrisma.repairInvoice, mockPrisma.kariger,
    mockPrisma.repairCharge, mockPrisma.repairWeightAdjustment,
    mockPrisma.repairStateHistory, mockPrisma.repairKarigerAssignment,
    mockPrisma.karigerMetalLedger, mockPrisma.karigerMoneyLedger,
    mockPrisma.voucherSequence,
  ]) {
    for (const k of Object.keys(m)) m[k].mockReset();
    // Re-establish minimal defaults
    m.findMany?.mockResolvedValue([]);
    m.findUnique?.mockResolvedValue(null);
    m.findFirst?.mockResolvedValue(null);
    m.create?.mockResolvedValue({});
    m.update?.mockResolvedValue({});
    m.count?.mockResolvedValue(0);
    m.upsert?.mockResolvedValue({});
    m.aggregate?.mockResolvedValue({ _sum: {}, _count: {} });
    m.groupBy?.mockResolvedValue([]);
  }
  // Sensible defaults for voucher allocation (no prior records)
  mockPrisma.$queryRawUnsafe.mockResolvedValue([{ max: 0 }]);
  mockPrisma.voucherSequence.upsert.mockResolvedValue({ lastNumber: 1 });
  mockPrisma.voucherSequence.update.mockResolvedValue({ lastNumber: 1 });
});

// ══════════════════════════════════════════════════════════
// POST /api/repairs (intake)
// ══════════════════════════════════════════════════════════
describe('POST /api/repairs (intake)', () => {
  it('400 when customerName missing', async () => {
    const res = await request(app).post('/api/repairs').send({ items: [ITEM_1] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customerName/);
  });

  it('400 when items array empty', async () => {
    const res = await request(app).post('/api/repairs').send({ customerName: 'X', items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/item/i);
  });

  it('400 when an item has zero gross weight', async () => {
    const res = await request(app).post('/api/repairs').send({
      customerName: 'X',
      items: [{ ornamentType: 'Ring', metalTypeId: 1, grossWeight: 0 }],
    });
    expect(res.status).toBe(400);
  });

  it('creates repair with allocated REP/N number and writes initial state history', async () => {
    mockPrisma.repairJob.create.mockResolvedValueOnce({
      ...REPAIR_BASE, items: [ITEM_1],
    });
    const res = await request(app).post('/api/repairs').send({
      customerName: 'Saurabh', customerMobile: '7042341450',
      items: [{ ornamentType: 'Ring', metalTypeId: 1, grossWeight: 5, netWeight: 4.5, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.repair.repairNo).toBe('REP/1');
    expect(mockPrisma.repairJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repairNo: 'REP/1', status: 'RECEIVED', companyId: 1, branchId: 1,
        }),
      }),
    );
    expect(mockPrisma.repairStateHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromState: null, toState: 'RECEIVED' }),
      }),
    );
  });

  it('fires REPAIR_RECEIVED notification', async () => {
    mockPrisma.repairJob.create.mockResolvedValueOnce({ ...REPAIR_BASE, items: [ITEM_1] });
    await request(app).post('/api/repairs').send({
      customerName: 'Saurabh',
      items: [{ ornamentType: 'Ring', metalTypeId: 1, grossWeight: 5 }],
    });
    expect(notifierSend).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'REPAIR_RECEIVED', repairNo: 'REP/1' }),
    );
  });
});

// ══════════════════════════════════════════════════════════
// GET /api/repairs (list) — branch scoping
// ══════════════════════════════════════════════════════════
describe('GET /api/repairs', () => {
  it('master branch: lists without branchId restriction', async () => {
    mockPrisma.repairJob.findMany.mockResolvedValueOnce([{ ...REPAIR_BASE, _count: { items: 1, photos: 0 } }]);
    mockPrisma.repairJob.count.mockResolvedValueOnce(1);
    const res = await request(app).get('/api/repairs');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    const where = mockPrisma.repairJob.findMany.mock.calls[0][0].where;
    expect(where.branchId).toBeUndefined();
  });

  it('branch user: filters to their branch hierarchy', async () => {
    authState.branchScope = [2, 3];
    authState.isMasterBranch = false;
    mockPrisma.repairJob.findMany.mockResolvedValueOnce([]);
    mockPrisma.repairJob.count.mockResolvedValueOnce(0);
    await request(app).get('/api/repairs');
    const where = mockPrisma.repairJob.findMany.mock.calls[0][0].where;
    expect(where.branchId).toEqual({ in: [2, 3] });
  });

  it('forwards status / kariger / search filters', async () => {
    mockPrisma.repairJob.findMany.mockResolvedValueOnce([]);
    mockPrisma.repairJob.count.mockResolvedValueOnce(0);
    await request(app).get('/api/repairs?status=IN_PROGRESS&karigerId=50&q=Saurabh');
    const where = mockPrisma.repairJob.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('IN_PROGRESS');
    expect(where.assignedKarigerId).toBe(50);
    expect(where.OR).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════
// GET /api/repairs/:id  — branch scoping (security)
// ══════════════════════════════════════════════════════════
describe('GET /api/repairs/:id', () => {
  it('returns 404 when branch user looks at another branch repair', async () => {
    authState.branchScope = [9];
    authState.isMasterBranch = false;
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/repairs/100');
    expect(res.status).toBe(404);
    const where = mockPrisma.repairJob.findFirst.mock.calls[0][0].where;
    expect(where.branchId).toEqual({ in: [9] });
  });

  it('includes allowedNextStates so the UI can drive transitions', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, items: [ITEM_1], photos: [], stateHistory: [], assignments: [],
      weightAdjustments: [], charges: [], invoice: null,
    });
    const res = await request(app).get('/api/repairs/100');
    expect(res.status).toBe(200);
    expect(res.body.allowedNextStates).toEqual(
      expect.arrayContaining(['UNDER_INSPECTION', 'CANCELLED']),
    );
  });
});

// ══════════════════════════════════════════════════════════
// PATCH /api/repairs/:id/status
// ══════════════════════════════════════════════════════════
describe('PATCH /api/repairs/:id/status', () => {
  it('400 on illegal transition', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({ ...REPAIR_BASE, status: 'RECEIVED' });
    const res = await request(app).patch('/api/repairs/100/status').send({ toState: 'DELIVERED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/transition/i);
  });

  it('200 + writes history on legal transition', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({ ...REPAIR_BASE, status: 'RECEIVED' });
    const res = await request(app).patch('/api/repairs/100/status').send({ toState: 'UNDER_INSPECTION' });
    expect(res.status).toBe(200);
    expect(mockPrisma.repairStateHistory.create).toHaveBeenCalled();
    expect(mockPrisma.repairJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'UNDER_INSPECTION' }) }),
    );
  });

  it('fires READY_FOR_DELIVERY notification on that transition', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({ ...REPAIR_BASE, status: 'QUALITY_CHECK' });
    await request(app).patch('/api/repairs/100/status').send({ toState: 'READY_FOR_DELIVERY' });
    expect(notifierSend).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'READY_FOR_DELIVERY' }),
    );
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/repairs/:id/assign-kariger
// ══════════════════════════════════════════════════════════
describe('POST /api/repairs/:id/assign-kariger', () => {
  it('400 when called from wrong status (RECEIVED — must be UNDER_INSPECTION first)', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, status: 'RECEIVED', items: [ITEM_1],
    });
    mockPrisma.kariger.findFirst.mockResolvedValueOnce(KARIGER);
    const res = await request(app).post('/api/repairs/100/assign-kariger')
      .send({ karigerId: 50 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/RECEIVED/);
  });

  it('404 when kariger inactive / wrong company', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, status: 'UNDER_INSPECTION', items: [ITEM_1],
    });
    mockPrisma.kariger.findFirst.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/repairs/100/assign-kariger').send({ karigerId: 99 });
    expect(res.status).toBe(404);
  });

  it('creates assignment + writes metal ledger + transitions status', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, status: 'UNDER_INSPECTION', items: [ITEM_1],
    });
    mockPrisma.kariger.findFirst.mockResolvedValueOnce(KARIGER);
    mockPrisma.kariger.findUnique.mockResolvedValue({ metalBalance: 0, moneyBalance: 0 });
    mockPrisma.repairKarigerAssignment.create.mockResolvedValueOnce({ id: 1, issuedWeight: 5 });

    const res = await request(app).post('/api/repairs/100/assign-kariger')
      .send({ karigerId: 50, ratePerGram: 6500 });
    expect(res.status).toBe(201);

    // Assignment row created with the summed gross weight
    expect(mockPrisma.repairKarigerAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ karigerId: 50, issuedWeight: 5 }) }),
    );
    // Metal ledger posted (+ve weight = shop GAVE)
    expect(mockPrisma.karigerMetalLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          karigerId: 50, weight: 5, transactionType: 'GOLD_RECEIVABLE',
        }),
      }),
    );
    // Workflow transitioned
    expect(mockPrisma.repairJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ASSIGNED_TO_KARIGER' }) }),
    );
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/repairs/:id/weight-adjustment
// ══════════════════════════════════════════════════════════
describe('POST /api/repairs/:id/weight-adjustment', () => {
  it('400 when adjustmentType missing', async () => {
    // Note: validation runs BEFORE the Prisma findFirst, so we don't
    // queue a `repairJob.findFirst` mock here — doing so would leak
    // an unconsumed value into the next test.
    const res = await request(app).post('/api/repairs/100/weight-adjustment')
      .send({ originalWeight: 5, finalWeight: 4 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/adjustmentType/);
  });

  it('NORMAL_WASTAGE on assigned kariger writes a -ve metal ledger row', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, items: [ITEM_1], assignedKarigerId: 50,
    });
    mockPrisma.kariger.findUnique.mockResolvedValue({ metalBalance: 5, moneyBalance: 0 });
    mockPrisma.repairWeightAdjustment.create.mockResolvedValueOnce({ id: 1 });

    const res = await request(app).post('/api/repairs/100/weight-adjustment').send({
      adjustmentType: 'NORMAL_WASTAGE', originalWeight: 5, finalWeight: 4.95, ratePerGram: 6000,
    });
    expect(res.status).toBe(201);
    expect(mockPrisma.karigerMetalLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          karigerId: 50, transactionType: 'WASTAGE',
          weight: -0.04999999999999982, // |5 - 4.95|
        }),
      }),
    );
  });

  it('EXTRA_GOLD_ADDED auto-creates a charge and flags approval above threshold', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, items: [ITEM_1], assignedKarigerId: 50,
    });
    mockPrisma.kariger.findUnique.mockResolvedValue({ metalBalance: 0, moneyBalance: 0 });
    mockPrisma.repairWeightAdjustment.create.mockResolvedValueOnce({ id: 1 });

    // 1g extra @ ₹6500 = ₹6500 → above ₹5000 threshold → approvalRequired
    const res = await request(app).post('/api/repairs/100/weight-adjustment').send({
      adjustmentType: 'EXTRA_GOLD_ADDED',
      originalWeight: 5, finalWeight: 6, ratePerGram: 6500,
    });
    expect(res.status).toBe(201);
    expect(mockPrisma.repairCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ chargeType: 'EXTRA_GOLD', amount: 6500 }),
      }),
    );
    expect(mockPrisma.repairJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalRequired: true }) }),
    );
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/repairs/:id/invoice
// ══════════════════════════════════════════════════════════
describe('POST /api/repairs/:id/invoice', () => {
  it('400 when invoice already exists', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, charges: [{ amount: 100, gstApplicable: true, gstPercent: 3 }],
      invoice: { id: 1 },
    });
    const res = await request(app).post('/api/repairs/100/invoice');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already/i);
  });

  it('400 when no charges', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, charges: [], invoice: null,
    });
    const res = await request(app).post('/api/repairs/100/invoice');
    expect(res.status).toBe(400);
  });

  it('computes subtotal + GST split + applies advance', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE,
      advanceReceived: 100,
      charges: [
        { amount: 1000, gstApplicable: true, gstPercent: 3 },  // 30 → 15+15
        { amount: 200, gstApplicable: false, gstPercent: 0 },  // GST-free
      ],
      invoice: null,
    });
    mockPrisma.repairInvoice.create.mockImplementationOnce(({ data }: any) =>
      Promise.resolve({ id: 1, ...data }),
    );

    const res = await request(app).post('/api/repairs/100/invoice');
    expect(res.status).toBe(201);
    const inv = mockPrisma.repairInvoice.create.mock.calls[0][0].data;
    expect(inv.subtotal).toBe(1200);     // 1000 + 200
    expect(inv.cgstAmount).toBe(15);     // half of 30
    expect(inv.sgstAmount).toBe(15);
    expect(inv.totalAmount).toBe(1230);  // 1200 + 30
    expect(inv.paidAmount).toBe(100);    // capped to advance
    expect(inv.dueAmount).toBe(1130);
    expect(inv.paymentStatus).toBe('PARTIAL');
  });

  it('marks invoice PAID when advance >= total', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, advanceReceived: 5000,
      charges: [{ amount: 1000, gstApplicable: false, gstPercent: 0 }],
      invoice: null,
    });
    mockPrisma.repairInvoice.create.mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 1, ...data }));
    const res = await request(app).post('/api/repairs/100/invoice');
    expect(res.status).toBe(201);
    const inv = mockPrisma.repairInvoice.create.mock.calls[0][0].data;
    expect(inv.paymentStatus).toBe('PAID');
    expect(inv.dueAmount).toBe(0);
    expect(inv.paidAmount).toBe(1000); // capped to total, not full advance
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/repairs/:id/invoice/payment
// ══════════════════════════════════════════════════════════
describe('POST /api/repairs/:id/invoice/payment', () => {
  it('rejects overpayment', async () => {
    mockPrisma.repairInvoice.findFirst.mockResolvedValueOnce({
      id: 1, totalAmount: 1000, paidAmount: 800, dueAmount: 200,
    });
    const res = await request(app).post('/api/repairs/100/invoice/payment')
      .send({ cash: 500 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds/i);
  });

  it('settles invoice fully and marks PAID', async () => {
    mockPrisma.repairInvoice.findFirst.mockResolvedValueOnce({
      id: 1, totalAmount: 1000, paidAmount: 800, dueAmount: 200,
    });
    mockPrisma.repairInvoice.update.mockImplementationOnce(({ data }: any) =>
      Promise.resolve({ id: 1, ...data, totalAmount: 1000 }),
    );
    const res = await request(app).post('/api/repairs/100/invoice/payment')
      .send({ cash: 100, upi: 100 });
    expect(res.status).toBe(200);
    const upd = mockPrisma.repairInvoice.update.mock.calls[0][0].data;
    expect(upd.paidAmount).toBe(1000);
    expect(upd.dueAmount).toBe(0);
    expect(upd.paymentStatus).toBe('PAID');
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/repairs/:id/deliver
// ══════════════════════════════════════════════════════════
describe('POST /api/repairs/:id/deliver', () => {
  it('400 when status is not READY_FOR_DELIVERY', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, status: 'IN_PROGRESS', invoice: null,
    });
    const res = await request(app).post('/api/repairs/100/deliver').send({ receivedBy: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/READY_FOR_DELIVERY/);
  });

  it('400 when invoice has dueAmount and no override', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, status: 'READY_FOR_DELIVERY',
      invoice: { dueAmount: 500 },
    });
    const res = await request(app).post('/api/repairs/100/deliver').send({ receivedBy: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dueAmount/);
  });

  it('403 when staff (non-manager) tries to override unpaid', async () => {
    authState.userRole = 'STAFF';
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, status: 'READY_FOR_DELIVERY',
      invoice: { dueAmount: 500 },
    });
    const res = await request(app).post('/api/repairs/100/deliver')
      .send({ receivedBy: 'X', override: true });
    expect(res.status).toBe(403);
  });

  it('400 when receivedBy missing', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, status: 'READY_FOR_DELIVERY',
      invoice: { dueAmount: 0 },
    });
    const res = await request(app).post('/api/repairs/100/deliver').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/receivedBy/);
  });

  it('200 + transitions to DELIVERED + fires DELIVERED notification', async () => {
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, status: 'READY_FOR_DELIVERY',
      invoice: { dueAmount: 0 },
    });
    const res = await request(app).post('/api/repairs/100/deliver')
      .send({ receivedBy: 'Saurabh', signature: 'sig-ref' });
    expect(res.status).toBe(200);
    expect(mockPrisma.repairJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ receivedBy: 'Saurabh', deliverySignature: 'sig-ref' }),
      }),
    );
    expect(notifierSend).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'DELIVERED' }),
    );
  });

  it('manager override succeeds even with dueAmount', async () => {
    authState.userRole = 'MANAGER';
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({
      ...REPAIR_BASE, status: 'READY_FOR_DELIVERY',
      invoice: { dueAmount: 500 },
    });
    const res = await request(app).post('/api/repairs/100/deliver')
      .send({ receivedBy: 'Saurabh', override: true });
    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/repairs/:id/approve  — role gate
// ══════════════════════════════════════════════════════════
describe('POST /api/repairs/:id/approve', () => {
  it('403 for non-manager', async () => {
    authState.userRole = 'STAFF';
    const res = await request(app).post('/api/repairs/100/approve').send({});
    expect(res.status).toBe(403);
  });

  it('404 when repair belongs to different branch (branch user)', async () => {
    authState.userRole = 'MANAGER';
    authState.branchScope = [9];
    authState.isMasterBranch = false;
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/repairs/100/approve').send({});
    expect(res.status).toBe(404);
    // confirm branch filter was applied
    const where = mockPrisma.repairJob.findFirst.mock.calls[0][0].where;
    expect(where.branchId).toEqual({ in: [9] });
  });

  it('200 + sets approvedAt + approvedBy', async () => {
    authState.userRole = 'MANAGER';
    mockPrisma.repairJob.findFirst.mockResolvedValueOnce({ id: 100 });
    mockPrisma.repairJob.update.mockResolvedValueOnce({ ...REPAIR_BASE, approvedAt: new Date(), approvedBy: 1 });
    const res = await request(app).post('/api/repairs/100/approve').send({ remarks: 'ok' });
    expect(res.status).toBe(200);
    const upd = mockPrisma.repairJob.update.mock.calls[0][0].data;
    expect(upd.approvedBy).toBe(1);
    expect(upd.approvalRemarks).toBe('ok');
  });
});

// ══════════════════════════════════════════════════════════
// GET /api/repairs/dashboard
// ══════════════════════════════════════════════════════════
describe('GET /api/repairs/dashboard', () => {
  it('returns counters/revenue/workload/recent', async () => {
    mockPrisma.repairJob.count.mockResolvedValue(0);
    mockPrisma.repairWeightAdjustment.count.mockResolvedValue(0);
    mockPrisma.repairInvoice.aggregate.mockResolvedValue({
      _sum: { paidAmount: 1000, dueAmount: 200, totalAmount: 1200 },
    });
    mockPrisma.repairJob.groupBy.mockResolvedValue([]);
    mockPrisma.repairJob.findMany.mockResolvedValue([]);
    mockPrisma.kariger.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/repairs/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.counters).toBeDefined();
    expect(res.body.revenue30d.invoiced).toBe(1200);
    expect(res.body.revenue30d.collected).toBe(1000);
    expect(res.body.revenue30d.outstanding).toBe(200);
  });
});
