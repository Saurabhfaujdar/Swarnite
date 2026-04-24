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

// ── Cart items (simulating what CartDrawer sends to layaway/sales pages) ──
const CART_LABEL_1 = {
  id: 100,
  labelNo: 'GP/1',
  itemId: 1,
  itemName: 'Gold Pendant 22KT',
  grossWeight: 5.2,
  netWeight: 4.8,
  pcsCount: 1,
  metalType: 'Gold',
  purityCode: '22KT',
  purityPercentage: 91.6,
  labourRate: 500,
};

const CART_LABEL_2 = {
  id: 101,
  labelNo: 'GN/51',
  itemId: 2,
  itemName: 'Gold Necklace 22KT',
  grossWeight: 10.5,
  netWeight: 9.8,
  pcsCount: 1,
  metalType: 'Gold',
  purityCode: '22KT',
  purityPercentage: 91.6,
  labourRate: 750,
};

const CART_LABEL_MULTI_PCS = {
  id: 102,
  labelNo: 'SC/1',
  itemId: 3,
  itemName: 'Silver Coin',
  grossWeight: 100,
  netWeight: 100,
  pcsCount: 5,
  metalType: 'Silver',
  purityCode: 'S999',
  purityPercentage: 99.9,
  labourRate: 0,
};

const CUSTOMER = {
  id: 10,
  name: 'Test Customer',
  mobile: '9999999999',
  closingBalance: 0,
  balanceType: 'NONE',
};

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// Cart → Layaway flow (multiple cart items to POST /api/layaway)
// ════════════════════════════════════════════════════════════
describe('Cart → Layaway: multi-item creation', () => {
  const makeCartLayawayPayload = (cartLabels: any[]) => ({
    accountId: CUSTOMER.id,
    branchId: 1,
    voucherDate: '2026-04-24',
    financialYear: '2025-2026',
    salesmanName: 'Amit',
    totalGrossWeight: cartLabels.reduce((s, l) => s + l.grossWeight, 0),
    totalNetWeight: cartLabels.reduce((s, l) => s + l.netWeight, 0),
    totalFineWeight: 0,
    totalPcs: cartLabels.reduce((s, l) => s + l.pcsCount, 0),
    metalAmount: 0,
    labourAmount: 0,
    otherCharge: 0,
    discountAmount: 0,
    taxableAmount: 50000,
    cgstAmount: 750,
    sgstAmount: 750,
    totalAmount: 51500,
    roundingDiscount: 0,
    voucherAmount: 51500,
    cashAmount: 10000,
    bankAmount: 0,
    cardAmount: 0,
    oldGoldAmount: 0,
    paymentAmount: 10000,
    dueAmount: 41500,
    previousOs: 0,
    finalDue: 41500,
    narration: 'Cart items layaway',
    items: cartLabels.map((l) => ({
      labelId: l.id,
      itemId: l.itemId,
      labelNo: l.labelNo,
      itemName: l.itemName,
      grossWeight: l.grossWeight,
      netWeight: l.netWeight,
      fineWeight: 0,
      pcs: l.pcsCount,
      metalRate: 0,
      metalAmount: 0,
      diamondWeight: 0,
      labourRate: l.labourRate,
      labourAmount: l.netWeight * l.labourRate,
      otherCharge: 0,
      discountAmt: 0,
      taxableAmount: 25000,
      totalAmount: 25750,
    })),
  });

  it('creates layaway with 2 cart items, each label pcsCount decremented', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({
      prefix: 'LY', entityType: 'LAYAWAY', lastNumber: 5,
    });
    mockPrisma.layawayEntry.create.mockResolvedValueOnce({
      id: 5, voucherNo: 'LY/5', status: 'ACTIVE',
    });
    mockPrisma.layawayStatusHistory.create.mockResolvedValueOnce({});
    // Two items created
    mockPrisma.layawayItem.create
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 });
    // Each label has 1 pc → 0 after decrement → LAYAWAY
    mockPrisma.label.findUnique
      .mockResolvedValueOnce({ pcsCount: 1 })
      .mockResolvedValueOnce({ pcsCount: 1 });
    mockPrisma.label.update
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      id: 5, voucherNo: 'LY/5', status: 'ACTIVE',
      account: CUSTOMER, items: [], payments: [],
    });

    const payload = makeCartLayawayPayload([CART_LABEL_1, CART_LABEL_2]);
    const res = await request(app).post('/api/layaway').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.voucherNo).toBe('LY/5');
    expect(mockPrisma.layawayItem.create).toHaveBeenCalledTimes(2);

    // Verify both labels had pcsCount decremented
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: { pcsCount: 0, status: 'LAYAWAY' },
      }),
    );
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 101 },
        data: { pcsCount: 0, status: 'LAYAWAY' },
      }),
    );
  });

  it('creates layaway from cart with multi-pcs label, only partial pcs taken', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({
      prefix: 'LY', entityType: 'LAYAWAY', lastNumber: 6,
    });
    mockPrisma.layawayEntry.create.mockResolvedValueOnce({
      id: 6, voucherNo: 'LY/6', status: 'ACTIVE',
    });
    mockPrisma.layawayStatusHistory.create.mockResolvedValueOnce({});
    mockPrisma.layawayItem.create.mockResolvedValueOnce({ id: 1 });
    // Label has 5 pcs, taking 2
    mockPrisma.label.findUnique.mockResolvedValueOnce({ pcsCount: 5 });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      id: 6, voucherNo: 'LY/6', status: 'ACTIVE',
      account: CUSTOMER, items: [], payments: [],
    });

    const payload = makeCartLayawayPayload([{
      ...CART_LABEL_MULTI_PCS,
      pcsCount: 2, // customer selects 2 out of 5
    }]);

    const res = await request(app).post('/api/layaway').send(payload);
    expect(res.status).toBe(201);

    // Label should still have remaining pcs = 3 (status not changed since pcs > 0)
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 102 },
        data: { pcsCount: 3 },
      }),
    );
  });

  it('rejects cart layaway when customer not specified', async () => {
    const payload = makeCartLayawayPayload([CART_LABEL_1]);
    payload.accountId = undefined as any;

    const res = await request(app).post('/api/layaway').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Customer is required');
  });

  it('rejects cart layaway when items array is empty', async () => {
    const payload = makeCartLayawayPayload([]);

    const res = await request(app).post('/api/layaway').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one item/i);
  });
});

// ════════════════════════════════════════════════════════════
// Cart → Sales flow (multiple cart items to POST /api/sales)
// ════════════════════════════════════════════════════════════
describe('Cart → Sales: multi-item creation', () => {
  const makeCartSalesPayload = (cartLabels: any[]) => ({
    voucherDate: '2026-04-24',
    voucherPrefix: 'JGI',
    financialYear: '2025-2026',
    accountId: CUSTOMER.id,
    salesmanId: 1,
    branchId: 1,
    totalGrossWeight: cartLabels.reduce((s, l) => s + l.grossWeight, 0),
    totalNetWeight: cartLabels.reduce((s, l) => s + l.netWeight, 0),
    totalPcs: cartLabels.reduce((s, l) => s + (l.pcs || 1), 0),
    metalAmount: 50000,
    labourAmount: 5000,
    otherCharge: 0,
    totalAmount: 55000,
    taxableAmount: 55000,
    cgstAmount: 825,
    sgstAmount: 825,
    voucherAmount: 56650,
    cashAmount: 56650,
    bankAmount: 0,
    dueAmount: 0,
    narration: 'Cart sale',
    items: cartLabels.map((l) => ({
      labelId: l.id,
      itemId: l.itemId,
      labelNo: l.labelNo,
      itemName: l.itemName,
      grossWeight: l.grossWeight,
      netWeight: l.netWeight,
      fineWeight: 0,
      pcs: l.pcs || 1,
      metalRate: 6950,
      metalAmount: 25000,
      labourRate: l.labourRate,
      labourAmount: 2500,
      otherCharge: 0,
      discountStAmt: 0,
      totalAmount: 27500,
      taxableAmount: 27500,
    })),
  });

  it('creates sale from 2 cart items, marks both labels SOLD', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 10 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce({
      id: 10, voucherNo: 'JGI/10', status: 'ACTIVE',
    });
    // Two items created
    mockPrisma.salesItem.create
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 });
    // Each label: verify branch access + status check
    mockPrisma.label.findUnique
      .mockResolvedValueOnce({ branchId: 1, status: 'IN_STOCK', labelNo: 'GP/1' })
      .mockResolvedValueOnce({ branchId: 1, status: 'IN_STOCK', labelNo: 'GN/51' });
    mockPrisma.label.update
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce({
      id: 10, voucherNo: 'JGI/10', status: 'ACTIVE',
      items: [], account: CUSTOMER, salesman: { name: 'Amit' }, branch: { name: 'Main' },
    });

    const payload = makeCartSalesPayload([CART_LABEL_1, CART_LABEL_2]);
    const res = await request(app).post('/api/sales').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.voucherNo).toBe('JGI/10');
    expect(mockPrisma.salesItem.create).toHaveBeenCalledTimes(2);

    // Verify both labels' pcsCount decremented
    expect(mockPrisma.label.update).toHaveBeenCalledTimes(2);
  });

  it('creates sale from cart with multi-pcs label, sells 1 pc out of 5', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 11 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce({
      id: 11, voucherNo: 'JGI/11', status: 'ACTIVE',
    });
    mockPrisma.salesItem.create.mockResolvedValueOnce({ id: 1 });
    // Multi-pcs label - IN_STOCK with branchId and pcsCount
    mockPrisma.label.findUnique.mockResolvedValueOnce({
      branchId: 1, status: 'IN_STOCK', labelNo: 'SC/1', pcsCount: 5,
    });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce({
      id: 11, voucherNo: 'JGI/11', status: 'ACTIVE',
      items: [], account: CUSTOMER, salesman: { name: 'Amit' }, branch: { name: 'Main' },
    });

    const payload = makeCartSalesPayload([{
      ...CART_LABEL_MULTI_PCS,
      pcs: 1, // sell only 1 pc (frontend defaults to 1 from cart)
    }]);

    const res = await request(app).post('/api/sales').send(payload);
    expect(res.status).toBe(201);

    // Route: remainingPcs = label.pcsCount(5) - salePcs(1) = 4, status stays IN_STOCK
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 102 },
        data: { pcsCount: 4, status: 'IN_STOCK' },
      }),
    );
  });

  it('rejects cart sale when a label is already SOLD', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 12 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce({
      id: 12, voucherNo: 'JGI/12', status: 'ACTIVE',
    });
    mockPrisma.salesItem.create.mockResolvedValueOnce({ id: 1 });
    // Label is already SOLD
    mockPrisma.label.findUnique.mockResolvedValueOnce({
      branchId: 1, status: 'SOLD', labelNo: 'GP/1',
    });

    const payload = makeCartSalesPayload([CART_LABEL_1]);
    const res = await request(app).post('/api/sales').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available for sale/);
  });

  it('rejects cart sale without customer', async () => {
    const payload = makeCartSalesPayload([CART_LABEL_1]);
    payload.accountId = undefined as any;

    const res = await request(app).post('/api/sales').send(payload);
    expect(res.status).toBe(400);
  });

  it('creates sale with empty items array (voucher-only)', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 13 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce({
      id: 13, voucherNo: 'JGI/13', status: 'ACTIVE',
    });
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce({
      id: 13, voucherNo: 'JGI/13', status: 'ACTIVE',
      items: [], account: CUSTOMER, salesman: { name: 'Amit' }, branch: { name: 'Main' },
    });

    const payload = makeCartSalesPayload([]);
    const res = await request(app).post('/api/sales').send(payload);
    // Sales route allows empty items (creates header-only voucher)
    expect(res.status).toBe(201);
  });
});

// ════════════════════════════════════════════════════════════
// Old Gold Purchase in Sales (OG amount adjusted in bill)
// ════════════════════════════════════════════════════════════
describe('Old Gold Purchase adjustment in Sales', () => {
  const makeOGSalesPayload = (ogAmount: number) => ({
    voucherDate: '2026-04-24',
    voucherPrefix: 'JGI',
    financialYear: '2025-2026',
    accountId: CUSTOMER.id,
    salesmanId: 1,
    branchId: 1,
    totalGrossWeight: 5.2,
    totalNetWeight: 4.8,
    totalPcs: 1,
    metalAmount: 30000,
    labourAmount: 5000,
    otherCharge: 0,
    totalAmount: 35000,
    taxableAmount: 35000,
    cgstAmount: 525,
    sgstAmount: 525,
    voucherAmount: 36050,
    cashAmount: 10000,
    bankAmount: 0,
    cardAmount: 0,
    upiAmount: 0,
    oldGoldAmount: ogAmount,
    advanceAmount: 0,
    paymentAmount: 10000 + ogAmount,
    dueAmount: 36050 - (10000 + ogAmount),
    previousOs: 0,
    finalDue: 36050 - (10000 + ogAmount),
    narration: 'Sale with OG purchase',
    items: [
      {
        labelId: 100,
        itemId: 1,
        labelNo: 'GP/1',
        itemName: 'Gold Pendant 22KT',
        grossWeight: 5.2,
        netWeight: 4.8,
        pcs: 1,
        metalRate: 6250,
        metalAmount: 30000,
        labourRate: 1042,
        labourAmount: 5000,
        totalAmount: 35000,
        taxableAmount: 35000,
      },
    ],
  });

  it('creates sale with oldGoldAmount included in payment', async () => {
    const ogAmount = 15000;
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 20 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce({
      id: 20, voucherNo: 'JGI/20', status: 'ACTIVE',
      oldGoldAmount: ogAmount,
      paymentAmount: 25000,
      dueAmount: 11050,
    });
    mockPrisma.salesItem.create.mockResolvedValueOnce({ id: 1 });
    mockPrisma.label.findUnique.mockResolvedValueOnce({
      branchId: 1, status: 'IN_STOCK', labelNo: 'GP/1', pcsCount: 1,
    });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce({
      id: 20, voucherNo: 'JGI/20', status: 'ACTIVE',
      oldGoldAmount: ogAmount,
      items: [], account: CUSTOMER, salesman: { name: 'Amit' }, branch: { name: 'Main' },
    });

    const payload = makeOGSalesPayload(ogAmount);
    const res = await request(app).post('/api/sales').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.voucherNo).toBe('JGI/20');

    // Verify oldGoldAmount was stored in the voucher
    expect(mockPrisma.salesVoucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          oldGoldAmount: ogAmount,
          paymentAmount: 25000,
        }),
      }),
    );
  });

  it('reduces customer balance increment by oldGoldAmount in payment', async () => {
    const ogAmount = 20000;
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 21 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce({
      id: 21, voucherNo: 'JGI/21', status: 'ACTIVE',
    });
    mockPrisma.salesItem.create.mockResolvedValueOnce({ id: 1 });
    mockPrisma.label.findUnique.mockResolvedValueOnce({
      branchId: 1, status: 'IN_STOCK', labelNo: 'GP/1', pcsCount: 1,
    });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce({
      id: 21, voucherNo: 'JGI/21', status: 'ACTIVE',
      items: [], account: CUSTOMER, salesman: { name: 'Amit' }, branch: { name: 'Main' },
    });

    const payload = makeOGSalesPayload(ogAmount);
    const res = await request(app).post('/api/sales').send(payload);
    expect(res.status).toBe(201);

    // Customer balance increment should be dueAmount (36050 - 30000 = 6050)
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CUSTOMER.id },
        data: expect.objectContaining({
          closingBalance: { increment: 6050 },
        }),
      }),
    );
  });

  it('creates sale with ogAmount = 0 (no old gold)', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 22 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce({
      id: 22, voucherNo: 'JGI/22', status: 'ACTIVE',
    });
    mockPrisma.salesItem.create.mockResolvedValueOnce({ id: 1 });
    mockPrisma.label.findUnique.mockResolvedValueOnce({
      branchId: 1, status: 'IN_STOCK', labelNo: 'GP/1', pcsCount: 1,
    });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce({
      id: 22, voucherNo: 'JGI/22', status: 'ACTIVE',
      items: [], account: CUSTOMER, salesman: { name: 'Amit' }, branch: { name: 'Main' },
    });

    const payload = makeOGSalesPayload(0);
    const res = await request(app).post('/api/sales').send(payload);
    expect(res.status).toBe(201);

    // Verify oldGoldAmount is 0
    expect(mockPrisma.salesVoucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          oldGoldAmount: 0,
        }),
      }),
    );
  });

  it('full payment with old gold covers entire bill', async () => {
    // ogAmount covers the gap after cash
    const ogAmount = 26050; // 36050 - 10000 = 26050
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 23 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.salesVoucher.create.mockResolvedValueOnce({
      id: 23, voucherNo: 'JGI/23', status: 'ACTIVE',
    });
    mockPrisma.salesItem.create.mockResolvedValueOnce({ id: 1 });
    mockPrisma.label.findUnique.mockResolvedValueOnce({
      branchId: 1, status: 'IN_STOCK', labelNo: 'GP/1', pcsCount: 1,
    });
    mockPrisma.label.update.mockResolvedValueOnce({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.salesVoucher.findUnique.mockResolvedValueOnce({
      id: 23, voucherNo: 'JGI/23', status: 'ACTIVE',
      items: [], account: CUSTOMER, salesman: { name: 'Amit' }, branch: { name: 'Main' },
    });

    const payload = makeOGSalesPayload(ogAmount);
    const res = await request(app).post('/api/sales').send(payload);
    expect(res.status).toBe(201);

    // Due should be 0 (fully paid with cash + old gold)
    expect(mockPrisma.salesVoucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dueAmount: 0,
          paymentAmount: 36050,
        }),
      }),
    );
  });
});
