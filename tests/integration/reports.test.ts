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

// ── Helper to build a voucher with payment overrides ──────
function makeVoucher(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    voucherNo: 'JGI/1',
    voucherDate: new Date('2026-03-12'),
    accountId: 10,
    salesmanId: 1,
    branchId: 1,
    companyId: 1,
    status: 'ACTIVE',
    totalGrossWeight: 10,
    totalNetWeight: 9,
    totalPcs: 1,
    metalAmount: 60000,
    labourAmount: 5000,
    otherCharge: 0,
    taxableAmount: 65000,
    cgstAmount: 975,
    sgstAmount: 975,
    igstAmount: 0,
    totalGstAmount: 1950,
    discountAmount: 0,
    roundingDiscount: 0,
    voucherAmount: 66950,
    cashAmount: 0,
    bankAmount: 0,
    cardAmount: 0,
    upiAmount: 0,
    oldGoldAmount: 0,
    advanceAmount: 0,
    paymentAmount: 0,
    dueAmount: 66950,
    previousOs: 0,
    finalDue: 66950,
    account: { name: 'Test Customer', mobile: '9999999999', gstin: null },
    salesman: { name: 'Amit' },
    branch: { name: 'Main' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// DAILY SALES REPORT
// ════════════════════════════════════════════════════════════
describe('GET /api/reports/daily-sales', () => {
  const url = '/api/reports/daily-sales';
  const params = { dateFrom: '2026-03-12', dateTo: '2026-03-12' };

  it('fully paid cash sale — all amount in cashAmount', async () => {
    const v = makeVoucher({
      cashAmount: 66950,
      paymentAmount: 66950,
      dueAmount: 0,
      finalDue: 0,
    });
    mockPrisma.salesVoucher.findMany.mockResolvedValue([v]);

    const res = await request(app).get(url).query(params);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalAmount).toBe(66950);
    expect(res.body.summary.cashAmount).toBe(66950);
    expect(res.body.summary.bankAmount).toBe(0);
    expect(res.body.summary.cardAmount).toBe(0);
    expect(res.body.summary.upiAmount).toBe(0);
    expect(res.body.summary.dueAmount).toBe(0);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].cashAmount).toBe(66950);
  });

  it('fully paid card sale — all amount in cardAmount', async () => {
    const v = makeVoucher({
      cardAmount: 66950,
      paymentAmount: 66950,
      dueAmount: 0,
      finalDue: 0,
    });
    mockPrisma.salesVoucher.findMany.mockResolvedValue([v]);

    const res = await request(app).get(url).query(params);

    expect(res.status).toBe(200);
    expect(res.body.summary.cardAmount).toBe(66950);
    expect(res.body.summary.cashAmount).toBe(0);
    expect(res.body.summary.dueAmount).toBe(0);
    expect(res.body.rows[0].cardAmount).toBe(66950);
  });

  it('split payment cash + bank', async () => {
    const v = makeVoucher({
      cashAmount: 40000,
      bankAmount: 26950,
      paymentAmount: 66950,
      dueAmount: 0,
      finalDue: 0,
    });
    mockPrisma.salesVoucher.findMany.mockResolvedValue([v]);

    const res = await request(app).get(url).query(params);

    expect(res.status).toBe(200);
    expect(res.body.summary.cashAmount).toBe(40000);
    expect(res.body.summary.bankAmount).toBe(26950);
    expect(res.body.summary.totalAmount).toBe(66950);
    expect(res.body.summary.dueAmount).toBe(0);
  });

  it('partial payment with due', async () => {
    const v = makeVoucher({
      cashAmount: 30000,
      upiAmount: 10000,
      paymentAmount: 40000,
      dueAmount: 26950,
      finalDue: 26950,
    });
    mockPrisma.salesVoucher.findMany.mockResolvedValue([v]);

    const res = await request(app).get(url).query(params);

    expect(res.status).toBe(200);
    expect(res.body.summary.cashAmount).toBe(30000);
    expect(res.body.summary.upiAmount).toBe(10000);
    expect(res.body.summary.dueAmount).toBe(26950);
    expect(res.body.summary.totalCollected).toBe(40000);
    // totalAmount = voucherAmount = cash + upi + due
    expect(res.body.summary.totalAmount).toBe(66950);
  });

  it('cancelled vouchers are excluded', async () => {
    const active = makeVoucher({
      id: 1,
      cashAmount: 66950,
      paymentAmount: 66950,
      dueAmount: 0,
    });
    // Cancelled voucher should NOT be in results because the
    // backend WHERE clause filters status = ACTIVE.
    // The mock returns only what matches — test verifies summary
    // only includes the active voucher.
    mockPrisma.salesVoucher.findMany.mockResolvedValue([active]);

    const res = await request(app).get(url).query(params);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalVouchers).toBe(1);
    expect(res.body.summary.totalAmount).toBe(66950);
  });

  it('cancelled vouchers not returned when DB filters correctly', async () => {
    // If findMany is called, verify the where clause includes status: ACTIVE
    mockPrisma.salesVoucher.findMany.mockResolvedValue([]);

    await request(app).get(url).query(params);

    const call = mockPrisma.salesVoucher.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('ACTIVE');
  });

  it('aggregates multiple vouchers on the same date', async () => {
    const v1 = makeVoucher({
      id: 1,
      voucherNo: 'JGI/1',
      cashAmount: 30000,
      bankAmount: 10000,
      paymentAmount: 40000,
      dueAmount: 26950,
      voucherAmount: 66950,
    });
    const v2 = makeVoucher({
      id: 2,
      voucherNo: 'JGI/2',
      cashAmount: 20000,
      cardAmount: 15000,
      upiAmount: 5000,
      paymentAmount: 40000,
      dueAmount: 10000,
      voucherAmount: 50000,
    });
    mockPrisma.salesVoucher.findMany.mockResolvedValue([v1, v2]);

    const res = await request(app).get(url).query(params);

    expect(res.status).toBe(200);
    // Both on same date → 1 row
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].voucherCount).toBe(2);
    expect(res.body.rows[0].cashAmount).toBe(50000);
    expect(res.body.rows[0].bankAmount).toBe(10000);
    expect(res.body.rows[0].cardAmount).toBe(15000);
    expect(res.body.rows[0].upiAmount).toBe(5000);
    expect(res.body.rows[0].dueAmount).toBe(36950);
    expect(res.body.rows[0].totalAmount).toBe(116950);
    // Summary
    expect(res.body.summary.totalVouchers).toBe(2);
    expect(res.body.summary.totalAmount).toBe(116950);
    expect(res.body.summary.totalCollected).toBe(80000);
  });

  it('UPI and old gold amounts are aggregated', async () => {
    const v = makeVoucher({
      upiAmount: 20000,
      oldGoldAmount: 30000,
      advanceAmount: 5000,
      paymentAmount: 55000,
      dueAmount: 11950,
    });
    mockPrisma.salesVoucher.findMany.mockResolvedValue([v]);

    const res = await request(app).get(url).query(params);

    expect(res.body.summary.upiAmount).toBe(20000);
    expect(res.body.summary.oldGoldAmount).toBe(30000);
    expect(res.body.summary.advanceAmount).toBe(5000);
    expect(res.body.summary.dueAmount).toBe(11950);
  });

  it('groups by salesman when groupBy=salesman', async () => {
    const v1 = makeVoucher({ id: 1, salesman: { name: 'Amit' }, cashAmount: 50000, paymentAmount: 50000, dueAmount: 16950 });
    const v2 = makeVoucher({ id: 2, salesman: { name: 'Rahul' }, cashAmount: 30000, paymentAmount: 30000, dueAmount: 36950 });
    mockPrisma.salesVoucher.findMany.mockResolvedValue([v1, v2]);

    const res = await request(app).get(url).query({ ...params, groupBy: 'salesman' });

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
    const names = res.body.rows.map((r: any) => r.date);
    expect(names).toContain('Amit');
    expect(names).toContain('Rahul');
  });

  it('returns empty rows and zero summary when no data', async () => {
    mockPrisma.salesVoucher.findMany.mockResolvedValue([]);

    const res = await request(app).get(url).query(params);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
    expect(res.body.summary.totalVouchers).toBe(0);
    expect(res.body.summary.totalAmount).toBe(0);
    expect(res.body.summary.cashAmount).toBe(0);
    expect(res.body.summary.dueAmount).toBe(0);
  });
});
