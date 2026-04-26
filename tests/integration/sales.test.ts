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
const CUSTOMER = {
  id: 10,
  name: 'Saurabh Faudar',
  mobile: '7042341450',
  gstin: '09AAACH7409R1ZZ',
};

const SALESMAN = { id: 1, name: 'Amit' };

const ITEM_1 = {
  id: 1,
  salesVoucherId: 1,
  labelId: 100,
  itemId: 1,
  labelNo: 'GN/51',
  itemName: 'Gold Necklace 22KT',
  grossWeight: 10.5,
  netWeight: 9.8,
  fineWeight: 8.98,
  pcs: 1,
  metalRate: 6950,
  metalAmount: 68110,
  diamondWeight: 0,
  labourRate: 750,
  labourAmount: 7350,
  otherCharge: 0,
  discountStAmt: 0,
  totalAmount: 77722,
  taxableAmount: 75460,
};

const VOUCHER_1 = {
  id: 1,
  voucherNo: 'JGI/1',
  voucherPrefix: 'JGI',
  voucherNumber: 1,
  voucherDate: new Date('2026-03-05'),
  accountId: CUSTOMER.id,
  salesmanId: SALESMAN.id,
  branchId: 1,
  userId: 1,
  status: 'ACTIVE',
  totalGrossWeight: 10.5,
  totalNetWeight: 9.8,
  totalPcs: 1,
  metalAmount: 68110,
  labourAmount: 7350,
  otherCharge: 0,
  discountStAmount: 0,
  totalAmount: 77722,
  taxableAmount: 75460,
  cgstAmount: 1132,
  sgstAmount: 1132,
  igstAmount: 0,
  totalGstAmount: 2264,
  discountPercent: 0,
  discountAmount: 0,
  roundingDiscount: 0,
  voucherAmount: 77722,
  cashAmount: 50000,
  bankAmount: 20000,
  cardAmount: 0,
  upiAmount: 0,
  oldGoldAmount: 0,
  advanceAmount: 0,
  paymentAmount: 70000,
  dueAmount: 7722,
  previousOs: 0,
  finalDue: 7722,
  discountScheme: null,
  narration: 'Wedding order necklace',
  reference: 'REF001',
  isReturned: false,
  createdAt: new Date('2026-03-05'),
  updatedAt: new Date('2026-03-05'),
};

const VOUCHER_2 = {
  ...VOUCHER_1,
  id: 2,
  voucherNo: 'JGI/2',
  voucherNumber: 2,
  voucherDate: new Date('2026-03-06'),
  accountId: 11,
  salesmanId: 2,
  totalGrossWeight: 5.2,
  totalNetWeight: 4.8,
  metalAmount: 33350,
  voucherAmount: 36885,
  cashAmount: 36885,
  bankAmount: 0,
  upiAmount: 0,
  dueAmount: 0,
  narration: null,
  reference: null,
  status: 'ACTIVE',
};

const CANCELLED_VOUCHER = {
  ...VOUCHER_1,
  id: 3,
  voucherNo: 'JGI/3',
  status: 'CANCELLED',
};

// Voucher with updatedAt > 20 days ago (stale)
const STALE_VOUCHER = {
  ...VOUCHER_1,
  id: 4,
  voucherNo: 'JGI/4',
  updatedAt: new Date('2026-02-01'), // > 20 days old
};

const CLOSED_VOUCHER = {
  ...VOUCHER_1,
  id: 5,
  voucherNo: 'JGI/5',
  status: 'CLOSED',
  updatedAt: new Date('2026-02-01'),
};

const FULL_VOUCHER = {
  ...VOUCHER_1,
  account: CUSTOMER,
  salesman: SALESMAN,
  items: [ITEM_1],
};

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// GET /api/sales – List with comprehensive filters
// ════════════════════════════════════════════════════════════
describe('GET /api/sales', () => {
  const mockList = (vouchers: any[] = [FULL_VOUCHER], total = vouchers.length) => {
    mockPrisma.salesVoucher.findMany.mockResolvedValueOnce(vouchers);
    mockPrisma.salesVoucher.count.mockResolvedValueOnce(total);
  };

  // ── Basic listing ────────────────────────────────────────
  it('returns all sales vouchers with default pagination', async () => {
    mockList([FULL_VOUCHER]);

    const res = await request(app).get('/api/sales');
    expect(res.status).toBe(200);
    expect(res.body.vouchers).toHaveLength(1);
    expect(res.body.vouchers[0].voucherNo).toBe('JGI/1');
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
  });

  it('returns empty array when no vouchers exist', async () => {
    mockList([]);

    const res = await request(app).get('/api/sales');
    expect(res.status).toBe(200);
    expect(res.body.vouchers).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  // ── Date range ──────────────────────────────────────────
  it('filters by dateFrom and dateTo', async () => {
    mockList();

    const res = await request(app)
      .get('/api/sales?dateFrom=2026-03-01&dateTo=2026-03-31');
    expect(res.status).toBe(200);

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.voucherDate.gte).toEqual(new Date('2026-03-01T00:00:00'));
    expect(where.voucherDate.lte.getTime()).toBeGreaterThan(new Date('2026-03-31').getTime());
  });

  it('filters by dateFrom only', async () => {
    mockList();
    await request(app).get('/api/sales?dateFrom=2026-03-01');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.voucherDate.gte).toEqual(new Date('2026-03-01T00:00:00'));
    expect(where.voucherDate.lte).toBeUndefined();
  });

  it('filters by dateTo only', async () => {
    mockList();
    await request(app).get('/api/sales?dateTo=2026-03-31');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.voucherDate.lte).toBeDefined();
    expect(where.voucherDate.gte).toBeUndefined();
  });

  // ── Customer / Salesman ID ──────────────────────────────
  it('filters by customerId', async () => {
    mockList();
    await request(app).get('/api/sales?customerId=10');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.accountId).toBe(10);
  });

  it('filters by salesmanId', async () => {
    mockList();
    await request(app).get('/api/sales?salesmanId=1');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.salesmanId).toBe(1);
  });

  // ── Voucher number ─────────────────────────────────────
  it('filters by voucherNo partial match', async () => {
    mockList();
    await request(app).get('/api/sales?voucherNo=JGI/1');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.voucherNo).toEqual({
      contains: 'JGI/1',
      mode: 'insensitive',
    });
  });

  // ── Status filter ───────────────────────────────────────
  it('filters by status=ACTIVE', async () => {
    mockList();
    await request(app).get('/api/sales?status=ACTIVE');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('ACTIVE');
  });

  it('filters by status=CANCELLED', async () => {
    mockList([{ ...FULL_VOUCHER, status: 'CANCELLED' }]);
    const res = await request(app).get('/api/sales?status=CANCELLED');

    expect(res.status).toBe(200);
    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('CANCELLED');
  });

  it('status=ALL does not add status filter', async () => {
    mockList();
    await request(app).get('/api/sales?status=ALL');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
  });

  // ── Salesman name ──────────────────────────────────────
  it('filters by salesmanName partial match', async () => {
    mockList();
    await request(app).get('/api/sales?salesmanName=Amit');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.salesman).toEqual({
      name: { contains: 'Amit', mode: 'insensitive' },
    });
  });

  it('salesmanName is ignored when salesmanId is present', async () => {
    mockList();
    await request(app).get('/api/sales?salesmanId=1&salesmanName=Amit');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.salesmanId).toBe(1);
    expect(where.salesman).toBeUndefined();
  });

  // ── Narration ──────────────────────────────────────────
  it('filters by narration partial match', async () => {
    mockList();
    await request(app).get('/api/sales?narration=wedding');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.narration).toEqual({
      contains: 'wedding',
      mode: 'insensitive',
    });
  });

  // ── Reference ──────────────────────────────────────────
  it('filters by reference partial match', async () => {
    mockList();
    await request(app).get('/api/sales?reference=REF001');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.reference).toEqual({
      contains: 'REF001',
      mode: 'insensitive',
    });
  });

  // ── Amount range ───────────────────────────────────────
  it('filters by minAmount', async () => {
    mockList();
    await request(app).get('/api/sales?minAmount=50000');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.voucherAmount.gte).toBe(50000);
  });

  it('filters by maxAmount', async () => {
    mockList();
    await request(app).get('/api/sales?maxAmount=100000');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.voucherAmount.lte).toBe(100000);
  });

  it('filters by amount range (min + max)', async () => {
    mockList();
    await request(app).get('/api/sales?minAmount=50000&maxAmount=100000');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.voucherAmount).toEqual({ gte: 50000, lte: 100000 });
  });

  // ── Due range ──────────────────────────────────────────
  it('filters by due amount range', async () => {
    mockList();
    await request(app).get('/api/sales?minDue=1000&maxDue=10000');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.dueAmount).toEqual({ gte: 1000, lte: 10000 });
  });

  // ── Gross weight range ────────────────────────────────
  it('filters by gross weight range', async () => {
    mockList();
    await request(app).get('/api/sales?minGrossWeight=5&maxGrossWeight=15');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.totalGrossWeight).toEqual({ gte: 5, lte: 15 });
  });

  // ── Net weight range ──────────────────────────────────
  it('filters by net weight range', async () => {
    mockList();
    await request(app).get('/api/sales?minNetWeight=4&maxNetWeight=10');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.totalNetWeight).toEqual({ gte: 4, lte: 10 });
  });

  // ── Payment mode ──────────────────────────────────────
  it('filters by paymentMode=CASH (cashAmount > 0)', async () => {
    mockList();
    await request(app).get('/api/sales?paymentMode=CASH');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.cashAmount).toEqual({ gt: 0 });
  });

  it('filters by paymentMode=BANK', async () => {
    mockList();
    await request(app).get('/api/sales?paymentMode=BANK');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.bankAmount).toEqual({ gt: 0 });
  });

  it('filters by paymentMode=CARD', async () => {
    mockList();
    await request(app).get('/api/sales?paymentMode=CARD');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.cardAmount).toEqual({ gt: 0 });
  });

  it('filters by paymentMode=OLD_GOLD', async () => {
    mockList();
    await request(app).get('/api/sales?paymentMode=OLD_GOLD');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.oldGoldAmount).toEqual({ gt: 0 });
  });

  it('filters by paymentMode=UPI', async () => {
    mockList();
    await request(app).get('/api/sales?paymentMode=UPI');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.upiAmount).toEqual({ gt: 0 });
  });

  it('filters by paymentMode=DUE', async () => {
    mockList();
    await request(app).get('/api/sales?paymentMode=DUE');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.dueAmount).toEqual({ gt: 0 });
  });

  // ── Item-level filters ────────────────────────────────
  it('filters by labelNo (item-level search)', async () => {
    mockList();
    await request(app).get('/api/sales?labelNo=GN/51');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.items.some.labelNo).toEqual({
      contains: 'GN/51',
      mode: 'insensitive',
    });
  });

  it('filters by itemName (item-level search)', async () => {
    mockList();
    await request(app).get('/api/sales?itemName=Necklace');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.items.some.itemName).toEqual({
      contains: 'Necklace',
      mode: 'insensitive',
    });
  });

  it('combines label and item name filter', async () => {
    mockList();
    await request(app).get('/api/sales?labelNo=GN&itemName=Gold');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.items.some).toEqual({
      labelNo: { contains: 'GN', mode: 'insensitive' },
      itemName: { contains: 'Gold', mode: 'insensitive' },
    });
  });

  // ── Free-text search ──────────────────────────────────
  it('search queries across voucherNo, customer, narration, reference, salesman', async () => {
    mockList();
    await request(app).get('/api/sales?search=wedding');

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(5);
    expect(where.OR[0]).toEqual({ voucherNo: { contains: 'wedding', mode: 'insensitive' } });
    expect(where.OR[1]).toEqual({ account: { name: { contains: 'wedding', mode: 'insensitive' } } });
    expect(where.OR[2]).toEqual({ narration: { contains: 'wedding', mode: 'insensitive' } });
    expect(where.OR[3]).toEqual({ reference: { contains: 'wedding', mode: 'insensitive' } });
    expect(where.OR[4]).toEqual({ salesman: { name: { contains: 'wedding', mode: 'insensitive' } } });
  });

  // ── Sorting ───────────────────────────────────────────
  it('sorts by voucherDate desc by default', async () => {
    mockList();
    await request(app).get('/api/sales');

    const orderBy = mockPrisma.salesVoucher.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ voucherDate: 'desc' });
  });

  it('sorts by voucherAmount asc when requested', async () => {
    mockList();
    await request(app).get('/api/sales?sortBy=voucherAmount&sortOrder=asc');

    const orderBy = mockPrisma.salesVoucher.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ voucherAmount: 'asc' });
  });

  it('sorts by dueAmount desc', async () => {
    mockList();
    await request(app).get('/api/sales?sortBy=dueAmount&sortOrder=desc');

    const orderBy = mockPrisma.salesVoucher.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ dueAmount: 'desc' });
  });

  it('sorts by totalGrossWeight', async () => {
    mockList();
    await request(app).get('/api/sales?sortBy=totalGrossWeight&sortOrder=asc');

    const orderBy = mockPrisma.salesVoucher.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ totalGrossWeight: 'asc' });
  });

  it('rejects invalid sort field and defaults to voucherDate', async () => {
    mockList();
    await request(app).get('/api/sales?sortBy=INVALID_FIELD');

    const orderBy = mockPrisma.salesVoucher.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ voucherDate: 'desc' });
  });

  it('rejects invalid sort order and defaults to desc', async () => {
    mockList();
    await request(app).get('/api/sales?sortOrder=INVALID');

    const orderBy = mockPrisma.salesVoucher.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ voucherDate: 'desc' });
  });

  // ── Pagination ────────────────────────────────────────
  it('paginates with page and limit params', async () => {
    mockList([], 100);
    const res = await request(app).get('/api/sales?page=3&limit=20');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(3);
    expect(res.body.limit).toBe(20);

    const findArgs = mockPrisma.salesVoucher.findMany.mock.calls[0][0];
    expect(findArgs.skip).toBe(40); // (3-1)*20
    expect(findArgs.take).toBe(20);
  });

  // ── Combined filters ─────────────────────────────────
  it('combines multiple filters together', async () => {
    mockList();
    await request(app).get(
      '/api/sales?dateFrom=2026-03-01&dateTo=2026-03-31&status=ACTIVE&salesmanName=Amit&minAmount=50000&paymentMode=CASH&sortBy=voucherAmount&sortOrder=desc',
    );

    const where = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('ACTIVE');
    expect(where.voucherDate.gte).toEqual(new Date('2026-03-01T00:00:00'));
    expect(where.salesman).toEqual({ name: { contains: 'Amit', mode: 'insensitive' } });
    expect(where.voucherAmount.gte).toBe(50000);
    expect(where.cashAmount).toEqual({ gt: 0 });

    const orderBy = mockPrisma.salesVoucher.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ voucherAmount: 'desc' });
  });

  // ── Error handling ────────────────────────────────────
  it('handles server error gracefully', async () => {
    mockPrisma.salesVoucher.findMany.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/sales');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch sales vouchers');
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/sales/:id – Single voucher
// ════════════════════════════════════════════════════════════
describe('GET /api/sales/:id', () => {
  it('returns a single sales voucher with all relations', async () => {
    mockPrisma.salesVoucher.findFirst.mockResolvedValueOnce(FULL_VOUCHER);

    const res = await request(app).get('/api/sales/1');
    expect(res.status).toBe(200);
    expect(res.body.voucherNo).toBe('JGI/1');
    expect(res.body.account.name).toBe('Saurabh Faudar');
    expect(res.body.items).toHaveLength(1);
  });

  it('returns 404 for non-existent voucher', async () => {
    mockPrisma.salesVoucher.findFirst.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/sales/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Voucher not found');
  });

  it('handles server error', async () => {
    mockPrisma.salesVoucher.findFirst.mockRejectedValueOnce(new Error('DB'));

    const res = await request(app).get('/api/sales/1');
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/sales – Create sales voucher
// ════════════════════════════════════════════════════════════
describe('POST /api/sales', () => {
  const makeSalesPayload = (overrides: any = {}) => ({
    voucherDate: '2026-03-05',
    voucherPrefix: 'JGI',
    financialYear: '2025-2026',
    accountId: CUSTOMER.id,
    salesmanId: SALESMAN.id,
    branchId: 1,
    userId: 1,
    totalGrossWeight: 10.5,
    totalNetWeight: 9.8,
    totalPcs: 1,
    metalAmount: 68110,
    labourAmount: 7350,
    otherCharge: 0,
    totalAmount: 77722,
    taxableAmount: 75460,
    cgstAmount: 1132,
    sgstAmount: 1132,
    voucherAmount: 77722,
    cashAmount: 50000,
    bankAmount: 20000,
    dueAmount: 7722,
    narration: 'Wedding order necklace',
    items: [
      {
        labelId: 100,
        itemId: 1,
        labelNo: 'GN/51',
        itemName: 'Gold Necklace 22KT',
        grossWeight: 10.5,
        netWeight: 9.8,
        fineWeight: 8.98,
        pcs: 1,
        metalRate: 6950,
        metalAmount: 68110,
        labourRate: 750,
        labourAmount: 7350,
        totalAmount: 77722,
        taxableAmount: 75460,
      },
    ],
    ...overrides,
  });

  it('creates a sales voucher and updates label to SOLD', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 1 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce(VOUCHER_1);
    mockPrisma.salesItem.create.mockResolvedValueOnce(ITEM_1);
    mockPrisma.label.findUnique.mockResolvedValueOnce({ branchId: 1, status: 'IN_STOCK', labelNo: 'GB/13' });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce(FULL_VOUCHER);

    const res = await request(app).post('/api/sales').send(makeSalesPayload());
    expect(res.status).toBe(201);
    expect(res.body.voucherNo).toBe('JGI/1');
  });

  it('rejects sale when label is already SOLD', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 2 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce({ ...VOUCHER_1, id: 2, voucherNo: 'JGI/2' });
    mockPrisma.salesItem.create.mockResolvedValueOnce(ITEM_1);
    mockPrisma.label.findUnique.mockResolvedValueOnce({ branchId: 1, status: 'SOLD', labelNo: 'GB/13' });

    const res = await request(app).post('/api/sales').send(makeSalesPayload());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available for sale/);
  });

  it('handles server error during creation', async () => {
    mockPrisma.voucherSequence.upsert.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).post('/api/sales').send(makeSalesPayload());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DB error');
  });

  it('creates a PurchaseVoucher when oldGoldDetails is provided', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValue({ lastNumber: 1 });
    mockPrisma.salesVoucher.create.mockResolvedValueOnce(VOUCHER_1);
    mockPrisma.salesItem.create.mockResolvedValueOnce(ITEM_1);
    mockPrisma.label.findUnique.mockResolvedValue({ branchId: 1, status: 'IN_STOCK', labelNo: 'GB/13', pcsCount: 1 });
    mockPrisma.label.update.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.purchaseVoucher.create.mockResolvedValueOnce({ id: 10, voucherNo: 'URD/1' });
    mockPrisma.purchaseVoucher.findUnique.mockResolvedValueOnce({ id: 10 });
    mockPrisma.purchaseItem.create.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce(FULL_VOUCHER);

    const res = await request(app).post('/api/sales').send(makeSalesPayload({
      oldGoldAmount: 64120,
      cashAmount: 0,
      bankAmount: 0,
      paymentAmount: 64120,
      dueAmount: 77722 - 64120,
      oldGoldDetails: {
        grossWeight: 10,
        lessWeight: 0,
        netWeight: 10,
        purityCode: '916',
        purityPercent: 91.6,
        fineWeight: 9.16,
        metalRate: 7000,
        amount: 64120,
      },
    }));

    expect(res.status).toBe(201);
    // Verify PurchaseVoucher was created with OLD GOLD description
    expect(mockPrisma.purchaseVoucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: 'OLD GOLD',
          group: 'OGN',
          totalGrossWeight: 10,
          totalNetWeight: 10,
          totalFineWeight: 9.16,
          metalRate: 7000,
          finalAmount: 64120,
        }),
      }),
    );
    // Verify PurchaseItem was created
    expect(mockPrisma.purchaseItem.create).toHaveBeenCalled();
  });

  it('does not create PurchaseVoucher when oldGoldAmount is 0', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValue({ lastNumber: 1 });
    mockPrisma.salesVoucher.create.mockResolvedValueOnce(VOUCHER_1);
    mockPrisma.salesItem.create.mockResolvedValueOnce(ITEM_1);
    mockPrisma.label.findUnique.mockResolvedValue({ branchId: 1, status: 'IN_STOCK', labelNo: 'GB/13', pcsCount: 1 });
    mockPrisma.label.update.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce(FULL_VOUCHER);

    const res = await request(app).post('/api/sales').send(makeSalesPayload({
      oldGoldAmount: 0,
    }));

    expect(res.status).toBe(201);
    expect(mockPrisma.purchaseVoucher.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/sales/:id – Cancel voucher
// ════════════════════════════════════════════════════════════
describe('DELETE /api/sales/:id', () => {
  it('cancels voucher, restores labels and customer balance', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.findFirst.mockResolvedValueOnce({
      ...VOUCHER_1,
      items: [ITEM_1],
    });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.update.mockResolvedValueOnce({});

    const res = await request(app).delete('/api/sales/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Voucher cancelled');

    // Verify label restored to IN_STOCK
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: { pcsCount: { increment: 1 }, status: 'IN_STOCK' },
      }),
    );
  });

  it('handles server error during cancellation', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async () => {
      throw new Error('TX error');
    });

    const res = await request(app).delete('/api/sales/1');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to cancel voucher');
  });
});

// ════════════════════════════════════════════════════════════
// Payment overpayment validation
// ════════════════════════════════════════════════════════════
describe('Payment overpayment validation', () => {
  const makeSalesPayload = (overrides: any = {}) => ({
    voucherDate: '2026-03-05',
    voucherPrefix: 'JGI',
    financialYear: '2025-2026',
    accountId: CUSTOMER.id,
    salesmanId: SALESMAN.id,
    branchId: 1,
    userId: 1,
    totalGrossWeight: 10.5,
    totalNetWeight: 9.8,
    totalPcs: 1,
    metalAmount: 68110,
    labourAmount: 7350,
    voucherAmount: 77722,
    cashAmount: 50000,
    bankAmount: 20000,
    dueAmount: 7722,
    items: [{ labelId: 100, itemId: 1, labelNo: 'GN/51', itemName: 'Gold Necklace', grossWeight: 10.5, netWeight: 9.8, pcs: 1, metalRate: 6950, metalAmount: 68110, labourAmount: 7350, totalAmount: 77722, taxableAmount: 75460 }],
    ...overrides,
  });

  it('POST rejects when total payment exceeds voucher amount', async () => {
    const res = await request(app).post('/api/sales').send(makeSalesPayload({
      cashAmount: 80000,
      bankAmount: 20000,
      // total = 100000 > voucherAmount 77722
    }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Total payment cannot exceed voucher amount plus outstanding balance');
  });

  it('POST allows payment equal to voucher amount', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 10 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce(VOUCHER_1);
    mockPrisma.salesItem.create.mockResolvedValueOnce(ITEM_1);
    mockPrisma.label.findUnique.mockResolvedValueOnce({ branchId: 1, status: 'IN_STOCK', labelNo: 'GN/51' });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce(FULL_VOUCHER);

    const res = await request(app).post('/api/sales').send(makeSalesPayload({
      cashAmount: 77722,
      bankAmount: 0,
      dueAmount: 0,
    }));
    expect(res.status).toBe(201);
  });

  it('PUT rejects when total payment exceeds voucher amount', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.findFirst.mockResolvedValueOnce({ ...VOUCHER_1, items: [ITEM_1] });

    const res = await request(app).put('/api/sales/1').send({
      cashAmount: 100000,
      bankAmount: 50000,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Total payment cannot exceed voucher amount');
  });

  it('POST allows partial payment (due > 0)', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 11 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce(VOUCHER_1);
    mockPrisma.salesItem.create.mockResolvedValueOnce(ITEM_1);
    mockPrisma.label.findUnique.mockResolvedValueOnce({ branchId: 1, status: 'IN_STOCK', labelNo: 'GN/51' });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce(FULL_VOUCHER);

    const res = await request(app).post('/api/sales').send(makeSalesPayload({
      cashAmount: 30000,
      bankAmount: 0,
      dueAmount: 47722,
    }));
    expect(res.status).toBe(201);
  });
});

// ════════════════════════════════════════════════════════════
// Auto-close stale vouchers & CLOSED status edit blocking
// ════════════════════════════════════════════════════════════
describe('CLOSED voucher handling', () => {
  it('GET detail auto-closes a stale ACTIVE voucher (>20 days)', async () => {
    mockPrisma.salesVoucher.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.salesVoucher.findFirst.mockResolvedValueOnce({
      ...STALE_VOUCHER,
      account: CUSTOMER,
      salesman: SALESMAN,
      items: [ITEM_1],
      branch: { id: 1, name: 'Main' },
      user: { id: 1, fullName: 'Admin' },
    });
    mockPrisma.salesVoucher.update.mockResolvedValueOnce({ ...STALE_VOUCHER, status: 'CLOSED' });

    const res = await request(app).get('/api/sales/4');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED');
  });

  it('PUT rejects editing a CLOSED voucher', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.findFirst.mockResolvedValueOnce({ ...CLOSED_VOUCHER, items: [ITEM_1] });

    const res = await request(app).put('/api/sales/5').send({ cashAmount: 60000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('closed');
  });

  it('GET detail does NOT close a recent ACTIVE voucher', async () => {
    const recentVoucher = {
      ...VOUCHER_1,
      updatedAt: new Date(), // just now
      account: CUSTOMER,
      salesman: SALESMAN,
      items: [ITEM_1],
      branch: { id: 1, name: 'Main' },
      user: { id: 1, fullName: 'Admin' },
    };
    mockPrisma.salesVoucher.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.salesVoucher.findFirst.mockResolvedValueOnce(recentVoucher);

    const res = await request(app).get(`/api/sales/${VOUCHER_1.id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('GET list calls auto-close for stale vouchers', async () => {
    mockPrisma.salesVoucher.updateMany.mockResolvedValueOnce({ count: 2 });
    mockPrisma.salesVoucher.findMany.mockResolvedValueOnce([]);
    mockPrisma.salesVoucher.count.mockResolvedValueOnce(0);

    const res = await request(app).get('/api/sales');
    expect(res.status).toBe(200);
    expect(mockPrisma.salesVoucher.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          updatedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
        data: { status: 'CLOSED' },
      })
    );
  });
});

// ════════════════════════════════════════════════════════════
// Label pcs handling on sales
// ════════════════════════════════════════════════════════════
describe('Label pcs handling', () => {
  const makeSalesPayload = (overrides: any = {}) => ({
    voucherDate: '2026-03-05',
    voucherPrefix: 'JGI',
    financialYear: '2025-2026',
    accountId: CUSTOMER.id,
    salesmanId: SALESMAN.id,
    branchId: 1,
    userId: 1,
    totalGrossWeight: 10.5,
    totalNetWeight: 9.8,
    totalPcs: 1,
    metalAmount: 68110,
    labourAmount: 7350,
    otherCharge: 0,
    totalAmount: 77722,
    taxableAmount: 75460,
    cgstAmount: 1132,
    sgstAmount: 1132,
    voucherAmount: 77722,
    cashAmount: 50000,
    bankAmount: 20000,
    dueAmount: 7722,
    narration: 'Wedding order necklace',
    items: [
      {
        labelId: 100,
        itemId: 1,
        labelNo: 'GN/51',
        itemName: 'Gold Necklace 22KT',
        grossWeight: 10.5,
        netWeight: 9.8,
        fineWeight: 8.98,
        pcs: 1,
        metalRate: 6950,
        metalAmount: 68110,
        labourRate: 750,
        labourAmount: 7350,
        totalAmount: 77722,
        taxableAmount: 75460,
      },
    ],
    ...overrides,
  });

  it('POST decrements label pcsCount and keeps IN_STOCK when pcs remain', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 20 });
    mockPrisma.salesVoucher.create.mockResolvedValueOnce(VOUCHER_1);
    mockPrisma.salesItem.create.mockResolvedValueOnce(ITEM_1);
    // Label has 5 pcs, selling 2
    mockPrisma.label.findUnique.mockResolvedValueOnce({ branchId: 1, status: 'IN_STOCK', labelNo: 'GN/51', pcsCount: 5 });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce(FULL_VOUCHER);

    const res = await request(app).post('/api/sales').send(makeSalesPayload({
      items: [{
        ...ITEM_1,
        pcs: 2, // selling 2 of 5 pcs
      }],
    }));
    expect(res.status).toBe(201);
    
    // Verify label was updated with correct pcsCount and status
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pcsCount: 3, // 5 - 2 = 3 remaining
          status: 'IN_STOCK', // should stay IN_STOCK
        }),
      })
    );
  });

  it('POST sets label status to SOLD when all pcs are sold', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 21 });
    mockPrisma.salesVoucher.create.mockResolvedValueOnce(VOUCHER_1);
    mockPrisma.salesItem.create.mockResolvedValueOnce(ITEM_1);
    // Label has 3 pcs, selling all 3
    mockPrisma.label.findUnique.mockResolvedValueOnce({ branchId: 1, status: 'IN_STOCK', labelNo: 'GN/51', pcsCount: 3 });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce(FULL_VOUCHER);

    const res = await request(app).post('/api/sales').send(makeSalesPayload({
      items: [{
        ...ITEM_1,
        pcs: 3, // selling all 3 pcs
      }],
    }));
    expect(res.status).toBe(201);
    
    // Verify label was marked SOLD
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pcsCount: 0,
          status: 'SOLD',
        }),
      })
    );
  });

  it('POST rejects when selling more pcs than available', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 22 });
    mockPrisma.salesVoucher.create.mockResolvedValueOnce(VOUCHER_1);
    mockPrisma.salesItem.create.mockResolvedValueOnce(ITEM_1);
    // Label has only 2 pcs, trying to sell 5
    mockPrisma.label.findUnique.mockResolvedValueOnce({ branchId: 1, status: 'IN_STOCK', labelNo: 'GN/51', pcsCount: 2 });

    const res = await request(app).post('/api/sales').send(makeSalesPayload({
      items: [{
        ...ITEM_1,
        pcs: 5, // trying to sell 5 when only 2 available
      }],
    }));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('only 2 pcs available');
  });

  it('POST rejects when pcs is less than 1', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 23 });
    mockPrisma.salesVoucher.create.mockResolvedValueOnce(VOUCHER_1);
    mockPrisma.salesItem.create.mockResolvedValueOnce(ITEM_1);
    mockPrisma.label.findUnique.mockResolvedValueOnce({ branchId: 1, status: 'IN_STOCK', labelNo: 'GN/51', pcsCount: 5 });

    const res = await request(app).post('/api/sales').send(makeSalesPayload({
      items: [{
        ...ITEM_1,
        pcs: -1, // invalid: must sell at least 1
      }],
    }));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Must sell at least 1');
  });
});
