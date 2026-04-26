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

  it('applies branchId filter when provided', async () => {
    mockPrisma.salesVoucher.findMany.mockResolvedValue([]);

    await request(app).get(url).query({ ...params, branchId: '5' });

    const call = mockPrisma.salesVoucher.findMany.mock.calls[0][0];
    expect(call.where.branchId).toBe(5);
  });
});

// ════════════════════════════════════════════════════════════
// BRANCH FILTER ENDPOINT
// ════════════════════════════════════════════════════════════
describe('GET /api/reports/branches', () => {
  it('returns list of branches for master user', async () => {
    const branches = [
      { id: 1, name: 'Main', code: 'M', isMaster: true },
      { id: 2, name: 'Branch 1', code: 'B1', isMaster: false },
    ];
    mockPrisma.branch.findMany.mockResolvedValue(branches);

    const res = await request(app).get('/api/reports/branches');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Main');
  });
});

// ════════════════════════════════════════════════════════════
// ITEM-WISE SALES REPORT
// ════════════════════════════════════════════════════════════
describe('GET /api/reports/item-wise-sales', () => {
  const url = '/api/reports/item-wise-sales';
  const params = { dateFrom: '2026-03-01', dateTo: '2026-03-31' };

  function makeSalesItem(overrides: Record<string, any> = {}) {
    return {
      id: 1,
      salesVoucherId: 1,
      labelId: null,
      itemId: 1,
      labelNo: 'AA22/1',
      itemName: 'Gold Ring 22KT',
      grossWeight: 10,
      netWeight: 9,
      fineWeight: 8.25,
      pcs: 1,
      metalRate: 6500,
      metalAmount: 58500,
      diamondWeight: 0,
      labourRate: 500,
      labourAmount: 4500,
      otherCharge: 0,
      discountStAmt: 0,
      totalAmount: 63000,
      taxableAmount: 63000,
      item: {
        name: 'Gold Ring 22KT',
        itemGroup: { name: 'RING' },
        metalType: { name: 'GOLD' },
        purity: { name: '22 KT' },
      },
      salesVoucher: {
        salesman: { name: 'Amit' },
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    mockPrisma.salesItem.findMany.mockResolvedValue([]);
    mockPrisma.label.findMany.mockResolvedValue([]);
    mockPrisma.itemGroup.findMany.mockResolvedValue([{ name: 'RING' }, { name: 'CHAIN' }]);
    mockPrisma.metalType.findMany.mockResolvedValue([{ name: 'GOLD' }, { name: 'SILVER' }]);
  });

  it('returns empty rows when no sales items', async () => {
    const res = await request(app).get(url).query(params);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
    expect(res.body.summary.totalSales).toBe(0);
    expect(res.body.summary.totalQty).toBe(0);
    expect(res.body.filters.categories).toEqual(['RING', 'CHAIN']);
    expect(res.body.filters.metals).toEqual(['GOLD', 'SILVER']);
  });

  it('aggregates items by name (default grouping)', async () => {
    const items = [
      makeSalesItem({ id: 1, pcs: 1, grossWeight: 10, totalAmount: 63000, metalAmount: 58500, labourAmount: 4500 }),
      makeSalesItem({ id: 2, pcs: 2, grossWeight: 20, totalAmount: 126000, metalAmount: 117000, labourAmount: 9000 }),
    ];
    mockPrisma.salesItem.findMany.mockResolvedValue(items);

    const res = await request(app).get(url).query(params);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1); // Same item name grouped
    expect(res.body.rows[0].qtySold).toBe(3);
    expect(res.body.rows[0].totalWeight).toBe(30);
    expect(res.body.rows[0].totalSales).toBe(189000);
    expect(res.body.rows[0].metalAmount).toBe(175500);
    expect(res.body.rows[0].labourAmount).toBe(13500);
    expect(res.body.rows[0].avgPrice).toBeCloseTo(63000, 0);
    expect(res.body.rows[0].avgWeight).toBeCloseTo(10, 0);
    expect(res.body.rows[0].labourPercent).toBeCloseTo(7.69, 1);
  });

  it('groups by category when groupBy=category', async () => {
    const items = [
      makeSalesItem({ id: 1, item: { ...makeSalesItem().item, itemGroup: { name: 'RING' } } }),
      makeSalesItem({ id: 2, item: { ...makeSalesItem().item, itemGroup: { name: 'CHAIN' } } }),
    ];
    mockPrisma.salesItem.findMany.mockResolvedValue(items);

    const res = await request(app).get(url).query({ ...params, groupBy: 'category' });

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
    const names = res.body.rows.map((r: any) => r.name).sort();
    expect(names).toEqual(['CHAIN', 'RING']);
  });

  it('groups by metal when groupBy=metal', async () => {
    const items = [
      makeSalesItem({ id: 1, item: { ...makeSalesItem().item, metalType: { name: 'GOLD' } } }),
      makeSalesItem({ id: 2, item: { ...makeSalesItem().item, metalType: { name: 'SILVER' } } }),
    ];
    mockPrisma.salesItem.findMany.mockResolvedValue(items);

    const res = await request(app).get(url).query({ ...params, groupBy: 'metal' });

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
    const names = res.body.rows.map((r: any) => r.name).sort();
    expect(names).toEqual(['GOLD', 'SILVER']);
  });

  it('groups by salesman when groupBy=salesman', async () => {
    const items = [
      makeSalesItem({ id: 1, salesVoucher: { salesman: { name: 'Amit' } } }),
      makeSalesItem({ id: 2, salesVoucher: { salesman: { name: 'Rahul' } } }),
      makeSalesItem({ id: 3, salesVoucher: { salesman: null } }),
    ];
    mockPrisma.salesItem.findMany.mockResolvedValue(items);

    const res = await request(app).get(url).query({ ...params, groupBy: 'salesman' });

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(3);
    const names = res.body.rows.map((r: any) => r.name).sort();
    expect(names).toContain('Amit');
    expect(names).toContain('Rahul');
    expect(names).toContain('No Salesman');
  });

  it('includes making charge percentage in response', async () => {
    mockPrisma.salesItem.findMany.mockResolvedValue([
      makeSalesItem({ metalAmount: 100000, labourAmount: 15000, totalAmount: 115000 }),
    ]);

    const res = await request(app).get(url).query(params);

    expect(res.body.rows[0].labourPercent).toBeCloseTo(15, 0);
    expect(res.body.summary.totalMetal).toBe(100000);
    expect(res.body.summary.totalLabour).toBe(15000);
  });

  it('returns dead stock items (in stock with zero sales)', async () => {
    // No sales items
    mockPrisma.salesItem.findMany.mockResolvedValue([]);
    // But items in stock
    mockPrisma.label.findMany.mockResolvedValue([
      { itemId: 5, pcsCount: 1, grossWeight: 15, item: { name: 'Dead Ring', itemGroup: { name: 'RING' }, metalType: { name: 'GOLD' } } },
      { itemId: 5, pcsCount: 1, grossWeight: 12, item: { name: 'Dead Ring', itemGroup: { name: 'RING' }, metalType: { name: 'GOLD' } } },
      { itemId: 6, pcsCount: 2, grossWeight: 50, item: { name: 'Dead Chain', itemGroup: { name: 'CHAIN' }, metalType: { name: 'GOLD' } } },
    ]);

    const res = await request(app).get(url).query(params);

    expect(res.status).toBe(200);
    expect(res.body.deadStock).toHaveLength(2);
    const deadRing = res.body.deadStock.find((d: any) => d.name === 'Dead Ring');
    expect(deadRing.stockQty).toBe(2);
    expect(deadRing.stockWeight).toBe(27);
    const deadChain = res.body.deadStock.find((d: any) => d.name === 'Dead Chain');
    expect(deadChain.stockQty).toBe(2);
    expect(deadChain.stockWeight).toBe(50);
  });

  it('excludes sold item types from dead stock', async () => {
    // Item 1 was sold
    mockPrisma.salesItem.findMany.mockResolvedValue([
      makeSalesItem({ itemId: 1 }),
    ]);
    // Item 1 AND item 5 are in stock — only item 5 should be dead stock
    mockPrisma.label.findMany.mockResolvedValue([
      { itemId: 1, pcsCount: 1, grossWeight: 10, item: { name: 'Sold Ring', itemGroup: { name: 'RING' }, metalType: { name: 'GOLD' } } },
      { itemId: 5, pcsCount: 1, grossWeight: 20, item: { name: 'Unsold Bangle', itemGroup: { name: 'BANGLE' }, metalType: { name: 'GOLD' } } },
    ]);

    const res = await request(app).get(url).query(params);

    expect(res.body.deadStock).toHaveLength(1);
    expect(res.body.deadStock[0].name).toBe('Unsold Bangle');
  });

  it('applies branchId filter', async () => {
    const res = await request(app).get(url).query({ ...params, branchId: '3' });

    expect(res.status).toBe(200);
    const salesWhere = mockPrisma.salesItem.findMany.mock.calls[0][0].where;
    expect(salesWhere.salesVoucher.branchId).toBe(3);
  });

  it('handles server error gracefully', async () => {
    mockPrisma.salesItem.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get(url).query(params);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to generate item-wise sales report');
  });
});
