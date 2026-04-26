import request from 'supertest';

// ── Mock Prisma before importing app ──────────────────────
import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({
  prisma: mockPrisma,
}));

// ── Mock branchAccess middleware (bypass auth) ────────────
jest.mock('../../server/middleware/branchAccess', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = 1; req.userRole = 'ADMIN'; req.companyId = 1;
    req.branchId = 1; req.branchScope = []; req.isMasterBranch = true;
    next();
  },
  requireBranch: (_req: any, _res: any, next: any) => next(),
  requireMaster: (_req: any, _res: any, next: any) => next(),
  requireAdmin: (_req: any, _res: any, next: any) => next(),
  branchWhere: () => ({}),
  tenantScope: () => ({ companyId: 1 }),
  canAccessBranch: () => true,
  canOverrideBranch: async () => true,
}));

import app from '../../server/app';

// ── Dummy data ─────────────────────────────────────────────
const DUMMY_URD_VOUCHER = {
  id: 1, voucherNo: 'URD/1', voucherDate: '2024-12-20',
  purchaseType: 'URD', description: null, group: null,
  totalGrossWeight: 10.5, totalNetWeight: 10.0, totalFineWeight: 9.16,
  metalAmount: 63960, totalAmount: 63960, finalAmount: 65877,
  status: 'ACTIVE', companyId: 1, branchId: 1,
  account: { id: 1, name: 'Gold Suppliers Inc', mobile: '9876543210' },
  items: [],
};

const DUMMY_OG_VOUCHER = {
  id: 2, voucherNo: 'URD/2', voucherDate: '2024-12-21',
  purchaseType: 'URD', description: 'OLD GOLD', group: 'OGN',
  totalGrossWeight: 5.0, totalNetWeight: 4.8, totalFineWeight: 4.4,
  metalAmount: 30560, totalAmount: 30560, finalAmount: 31477,
  status: 'ACTIVE', companyId: 1, branchId: 1,
  account: { id: 2, name: 'Rajesh Kumar', mobile: '9876543211' },
  items: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// GET /api/purchase – List purchase vouchers
// ════════════════════════════════════════════════════════════
describe('GET /api/purchase', () => {
  it('returns list of purchase vouchers', async () => {
    mockPrisma.purchaseVoucher.findMany.mockResolvedValueOnce([DUMMY_URD_VOUCHER, DUMMY_OG_VOUCHER]);
    mockPrisma.purchaseVoucher.count.mockResolvedValueOnce(2);

    const res = await request(app).get('/api/purchase?dateFrom=2024-12-01&dateTo=2024-12-31');
    expect(res.status).toBe(200);
    expect(res.body.vouchers).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('filters by OLD_GOLD type using description/group', async () => {
    mockPrisma.purchaseVoucher.findMany.mockResolvedValueOnce([DUMMY_OG_VOUCHER]);
    mockPrisma.purchaseVoucher.count.mockResolvedValueOnce(1);

    const res = await request(app).get('/api/purchase?type=OLD_GOLD');
    expect(res.status).toBe(200);

    // Verify the where clause includes OR condition for description/group
    const call = mockPrisma.purchaseVoucher.findMany.mock.calls[0][0];
    expect(call.where.AND).toBeDefined();
    const andConditions = call.where.AND;
    const ogFilter = andConditions.find((c: any) => c.OR);
    expect(ogFilter.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: { contains: 'OLD GOLD', mode: 'insensitive' } }),
        expect.objectContaining({ group: 'OGN' }),
      ]),
    );
  });

  it('filters by URD type excluding old gold entries', async () => {
    mockPrisma.purchaseVoucher.findMany.mockResolvedValueOnce([DUMMY_URD_VOUCHER]);
    mockPrisma.purchaseVoucher.count.mockResolvedValueOnce(1);

    const res = await request(app).get('/api/purchase?type=URD');
    expect(res.status).toBe(200);

    const call = mockPrisma.purchaseVoucher.findMany.mock.calls[0][0];
    expect(call.where.purchaseType).toBe('URD');
    expect(call.where.NOT).toBeDefined();
  });

  it('supports search by voucher number or account name', async () => {
    mockPrisma.purchaseVoucher.findMany.mockResolvedValueOnce([DUMMY_URD_VOUCHER]);
    mockPrisma.purchaseVoucher.count.mockResolvedValueOnce(1);

    const res = await request(app).get('/api/purchase?search=Gold');
    expect(res.status).toBe(200);

    const call = mockPrisma.purchaseVoucher.findMany.mock.calls[0][0];
    expect(call.where.AND).toBeDefined();
    const andConditions = call.where.AND;
    const searchFilter = andConditions.find((c: any) =>
      c.OR?.some((o: any) => o.voucherNo),
    );
    expect(searchFilter).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/purchase – Create purchase voucher
// ════════════════════════════════════════════════════════════
describe('POST /api/purchase', () => {
  const mockTransaction = (result: any) => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn({
      voucherSequence: {
        upsert: jest.fn().mockResolvedValue({ lastNumber: 1 }),
      },
      purchaseVoucher: {
        create: jest.fn().mockResolvedValue(result),
      },
      purchaseItem: {
        create: jest.fn().mockResolvedValue({}),
      },
      account: {
        update: jest.fn().mockResolvedValue({}),
      },
    }));
    mockPrisma.purchaseVoucher.findUnique.mockResolvedValue({ ...result, account: { name: 'Test' }, items: [] });
  };

  it('creates a URD purchase voucher', async () => {
    mockTransaction({ id: 1, voucherNo: 'URD/1', purchaseType: 'URD' });

    const res = await request(app).post('/api/purchase').send({
      purchaseType: 'URD',
      accountId: 1,
      voucherDate: '2024-12-20',
      totalAmount: 50000,
      finalAmount: 51500,
      items: [{ styleName: 'Gold Ring', weight: 5.0, pcs: 1, rate: 6950, amount: 34750 }],
    });

    expect(res.status).toBe(201);
  });

  it('creates an OLD_GOLD purchase with description and group auto-set', async () => {
    const createdVoucher = { id: 2, voucherNo: 'URD/2', purchaseType: 'URD', description: 'OLD GOLD', group: 'OGN' };
    mockTransaction(createdVoucher);

    const res = await request(app).post('/api/purchase').send({
      purchaseType: 'OLD_GOLD',
      accountId: 2,
      voucherDate: '2024-12-21',
      totalAmount: 30000,
      finalAmount: 30900,
      items: [{ styleName: 'Old Gold Chain', weight: 4.8, pcs: 1, rate: 6950, amount: 33360 }],
    });

    expect(res.status).toBe(201);

    // Verify the create call included description and group
    const txFn = mockPrisma.$transaction.mock.calls[0][0];
    const mockTx = {
      voucherSequence: { upsert: jest.fn().mockResolvedValue({ lastNumber: 2 }) },
      purchaseVoucher: { create: jest.fn().mockResolvedValue(createdVoucher) },
      purchaseItem: { create: jest.fn().mockResolvedValue({}) },
      account: { update: jest.fn().mockResolvedValue({}) },
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    // Re-run to capture the create call
    await request(app).post('/api/purchase').send({
      purchaseType: 'OLD_GOLD',
      accountId: 2,
      voucherDate: '2024-12-21',
      totalAmount: 30000,
      finalAmount: 30900,
      items: [],
    });

    const createData = mockTx.purchaseVoucher.create.mock.calls[0][0].data;
    expect(createData.description).toBe('OLD GOLD');
    expect(createData.group).toBe('OGN');
    expect(createData.purchaseType).toBe('URD'); // mapped from OLD_GOLD
  });

  it('does not auto-set description for regular URD purchase', async () => {
    const createdVoucher = { id: 3, voucherNo: 'URD/3', purchaseType: 'URD' };
    const mockTx = {
      voucherSequence: { upsert: jest.fn().mockResolvedValue({ lastNumber: 3 }) },
      purchaseVoucher: { create: jest.fn().mockResolvedValue(createdVoucher) },
      purchaseItem: { create: jest.fn().mockResolvedValue({}) },
      account: { update: jest.fn().mockResolvedValue({}) },
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockPrisma.purchaseVoucher.findUnique.mockResolvedValue({ ...createdVoucher, account: { name: 'Test' }, items: [] });

    await request(app).post('/api/purchase').send({
      purchaseType: 'URD',
      accountId: 1,
      voucherDate: '2024-12-20',
      totalAmount: 50000,
      finalAmount: 51500,
      items: [],
    });

    const createData = mockTx.purchaseVoucher.create.mock.calls[0][0].data;
    expect(createData.description).toBeUndefined();
    expect(createData.group).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/purchase/:id – Cancel purchase voucher
// ════════════════════════════════════════════════════════════
describe('DELETE /api/purchase/:id', () => {
  it('cancels an active purchase voucher', async () => {
    mockPrisma.purchaseVoucher.findFirst.mockResolvedValueOnce(DUMMY_URD_VOUCHER);
    mockPrisma.purchaseVoucher.update.mockResolvedValueOnce({ ...DUMMY_URD_VOUCHER, status: 'CANCELLED' });

    const res = await request(app).delete('/api/purchase/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Purchase voucher cancelled');
  });

  it('returns 404 for non-existent voucher', async () => {
    mockPrisma.purchaseVoucher.findFirst.mockResolvedValueOnce(null);

    const res = await request(app).delete('/api/purchase/999');
    expect(res.status).toBe(404);
  });
});
