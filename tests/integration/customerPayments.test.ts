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
  name: 'Raj Jewellers',
  mobile: '9876543210',
  closingBalance: 15000,
  balanceType: 'DR',
};

const CUSTOMER_ADVANCE = {
  id: 11,
  name: 'Priya Sharma',
  mobile: '9988776655',
  closingBalance: -5000, // Has 5000 advance (credit)
  balanceType: 'CR',
};

const SEQUENCE = {
  prefix: 'CPR',
  entityType: 'CUSTOMER_PAYMENT',
  financialYear: '2025-2026',
  lastNumber: 1,
};

const PAYMENT_1 = {
  id: 1,
  receiptNo: 'CPR/1',
  receiptPrefix: 'CPR',
  receiptNumber: 1,
  paymentDate: new Date('2026-03-10'),
  accountId: CUSTOMER.id,
  paymentType: 'DUE_PAYMENT',
  cashAmount: 10000,
  bankAmount: 0,
  cardAmount: 0,
  upiAmount: 0,
  totalAmount: 10000,
  balanceBefore: 15000,
  balanceAfter: 5000,
  salesVoucherId: null,
  bankName: null,
  chequeNo: null,
  narration: 'Partial due payment',
  reference: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-03-10'),
  updatedAt: new Date('2026-03-10'),
};

const PAYMENT_2 = {
  id: 2,
  receiptNo: 'CPR/2',
  receiptPrefix: 'CPR',
  receiptNumber: 2,
  paymentDate: new Date('2026-03-12'),
  accountId: CUSTOMER_ADVANCE.id,
  paymentType: 'ADVANCE',
  cashAmount: 5000,
  bankAmount: 3000,
  cardAmount: 0,
  upiAmount: 0,
  totalAmount: 8000,
  balanceBefore: -5000,
  balanceAfter: -13000,
  salesVoucherId: null,
  bankName: 'SBI',
  chequeNo: 'CHQ123',
  narration: 'Advance for wedding set',
  reference: 'ADV-001',
  status: 'ACTIVE',
  createdAt: new Date('2026-03-12'),
  updatedAt: new Date('2026-03-12'),
};

const CANCELLED_PAYMENT = {
  ...PAYMENT_1,
  id: 3,
  receiptNo: 'CPR/3',
  status: 'CANCELLED',
};

const FULL_PAYMENT_1 = {
  ...PAYMENT_1,
  account: { id: CUSTOMER.id, name: CUSTOMER.name, mobile: CUSTOMER.mobile, closingBalance: 5000, balanceType: 'DR' },
};

const FULL_PAYMENT_2 = {
  ...PAYMENT_2,
  account: { id: CUSTOMER_ADVANCE.id, name: CUSTOMER_ADVANCE.name, mobile: CUSTOMER_ADVANCE.mobile, closingBalance: -13000, balanceType: 'CR' },
};

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ================================================================
// LIST CUSTOMER PAYMENTS — GET /api/customer-payments
// The endpoint now queries 4 sources: CustomerPayment, SalesVoucher,
// LayawayPayment, and SchemeInstallment — returning a unified list.
// ================================================================
describe('GET /api/customer-payments', () => {
  beforeEach(() => {
    // Default all sources to empty
    mockPrisma.customerPayment.findMany.mockResolvedValue([]);
    mockPrisma.salesVoucher.findMany.mockResolvedValue([]);
    mockPrisma.layawayPayment.findMany.mockResolvedValue([]);
    mockPrisma.schemeInstallment.findMany.mockResolvedValue([]);
  });

  it('returns empty list when no payments exist from any source', async () => {
    const res = await request(app).get('/api/customer-payments');
    expect(res.status).toBe(200);
    expect(res.body.payments).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns customer payments with source=PAYMENT', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([FULL_PAYMENT_1]);

    const res = await request(app).get('/api/customer-payments');
    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0].source).toBe('PAYMENT');
    expect(res.body.payments[0].receiptNo).toBe('CPR/1');
    expect(res.body.payments[0].totalAmount).toBe(10000);
  });

  it('returns sale payments with source=SALE', async () => {
    const sale = {
      id: 1, voucherNo: 'JGI/1', voucherDate: new Date('2026-03-12'),
      cashAmount: 50000, bankAmount: 0, cardAmount: 0, upiAmount: 0,
      paymentAmount: 50000, previousOs: 0, finalDue: 16950, status: 'ACTIVE',
      account: { id: 10, name: 'Test', mobile: '9999', closingBalance: 0, balanceType: 'NONE' },
    };
    mockPrisma.salesVoucher.findMany.mockResolvedValue([sale]);

    const res = await request(app).get('/api/customer-payments');
    expect(res.status).toBe(200);

    const salePmt = res.body.payments.find((p: any) => p.source === 'SALE');
    expect(salePmt).toBeDefined();
    expect(salePmt.receiptNo).toBe('JGI/1');
    expect(salePmt.totalAmount).toBe(50000);
    expect(salePmt.paymentType).toBe('SALE');
  });

  it('returns layaway payments with source=LAYAWAY', async () => {
    const lp = {
      id: 1, paymentDate: new Date('2026-03-15'), amount: 5000,
      paymentMode: 'Cash', narration: 'Inst 1', reference: null,
      layaway: {
        voucherNo: 'LY/1', accountId: 10,
        account: { id: 10, name: 'Test', mobile: '9999', closingBalance: 0, balanceType: 'NONE' },
      },
    };
    mockPrisma.layawayPayment.findMany.mockResolvedValue([lp]);

    const res = await request(app).get('/api/customer-payments');
    expect(res.status).toBe(200);

    const layPmt = res.body.payments.find((p: any) => p.source === 'LAYAWAY');
    expect(layPmt).toBeDefined();
    expect(layPmt.receiptNo).toBe('LY/1');
    expect(layPmt.cashAmount).toBe(5000);
    expect(layPmt.totalAmount).toBe(5000);
  });

  it('returns scheme installments with source=SCHEME', async () => {
    const si = {
      id: 1, installmentNo: 3, dueDate: new Date('2026-03-10'),
      paidDate: new Date('2026-03-10'), amount: 2000,
      paymentMode: 'UPI', status: 'PAID', narration: null,
      scheme: {
        schemeNo: 'SS/1', accountId: 10,
        account: { id: 10, name: 'Test', mobile: '9999', closingBalance: 0, balanceType: 'NONE' },
      },
    };
    mockPrisma.schemeInstallment.findMany.mockResolvedValue([si]);

    const res = await request(app).get('/api/customer-payments');
    expect(res.status).toBe(200);

    const schemePmt = res.body.payments.find((p: any) => p.source === 'SCHEME');
    expect(schemePmt).toBeDefined();
    expect(schemePmt.receiptNo).toBe('SS/1');
    expect(schemePmt.upiAmount).toBe(2000);
    expect(schemePmt.totalAmount).toBe(2000);
  });

  it('combines all 4 sources in a single response', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([FULL_PAYMENT_1]);
    mockPrisma.salesVoucher.findMany.mockResolvedValue([{
      id: 1, voucherNo: 'JGI/1', voucherDate: new Date('2026-03-12'),
      cashAmount: 50000, bankAmount: 0, cardAmount: 0, upiAmount: 0,
      paymentAmount: 50000, previousOs: 0, finalDue: 0, status: 'ACTIVE',
      account: { id: 10, name: 'Test', mobile: '9999', closingBalance: 0, balanceType: 'NONE' },
    }]);
    mockPrisma.layawayPayment.findMany.mockResolvedValue([{
      id: 1, paymentDate: new Date('2026-03-15'), amount: 5000,
      paymentMode: 'Bank', narration: null, reference: null,
      layaway: { voucherNo: 'LY/1', accountId: 10,
        account: { id: 10, name: 'Test', mobile: '9999', closingBalance: 0, balanceType: 'NONE' } },
    }]);
    mockPrisma.schemeInstallment.findMany.mockResolvedValue([{
      id: 1, installmentNo: 1, dueDate: new Date('2026-03-05'),
      paidDate: new Date('2026-03-05'), amount: 1000,
      paymentMode: 'Cash', status: 'PAID', narration: null,
      scheme: { schemeNo: 'SS/1', accountId: 10,
        account: { id: 10, name: 'Test', mobile: '9999', closingBalance: 0, balanceType: 'NONE' } },
    }]);

    const res = await request(app).get('/api/customer-payments');
    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(4);
    expect(res.body.total).toBe(4);

    const sources = res.body.payments.map((p: any) => p.source).sort();
    expect(sources).toEqual(['LAYAWAY', 'PAYMENT', 'SALE', 'SCHEME']);
  });

  it('filters to only SALE type when paymentType=SALE', async () => {
    mockPrisma.salesVoucher.findMany.mockResolvedValue([{
      id: 1, voucherNo: 'JGI/1', voucherDate: new Date('2026-03-12'),
      cashAmount: 50000, bankAmount: 0, cardAmount: 0, upiAmount: 0,
      paymentAmount: 50000, previousOs: 0, finalDue: 0, status: 'ACTIVE',
      account: { id: 10, name: 'Test', mobile: '9999', closingBalance: 0, balanceType: 'NONE' },
    }]);

    const res = await request(app).get('/api/customer-payments?paymentType=SALE');
    expect(res.status).toBe(200);
    // Should NOT query customerPayment or layaway or scheme
    expect(mockPrisma.customerPayment.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.layawayPayment.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.schemeInstallment.findMany).not.toHaveBeenCalled();
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0].source).toBe('SALE');
  });

  it('filters to only LAYAWAY type', async () => {
    const res = await request(app).get('/api/customer-payments?paymentType=LAYAWAY');
    expect(res.status).toBe(200);
    expect(mockPrisma.customerPayment.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.salesVoucher.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.schemeInstallment.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.layawayPayment.findMany).toHaveBeenCalled();
  });

  it('filters to only SCHEME type', async () => {
    const res = await request(app).get('/api/customer-payments?paymentType=SCHEME');
    expect(res.status).toBe(200);
    expect(mockPrisma.customerPayment.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.salesVoucher.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.layawayPayment.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.schemeInstallment.findMany).toHaveBeenCalled();
  });

  it('filters to only ADVANCE type (standard payment)', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([FULL_PAYMENT_2]);

    const res = await request(app).get('/api/customer-payments?paymentType=ADVANCE');
    expect(res.status).toBe(200);
    expect(mockPrisma.salesVoucher.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.layawayPayment.findMany).not.toHaveBeenCalled();
    expect(res.body.payments).toHaveLength(1);

    const where = mockPrisma.customerPayment.findMany.mock.calls[0][0].where;
    expect(where.paymentType).toBe('ADVANCE');
  });

  it('filters by accountId across all sources', async () => {
    const res = await request(app).get('/api/customer-payments?accountId=10');
    expect(res.status).toBe(200);

    // Verify accountId filter was applied to CustomerPayment
    const cpWhere = mockPrisma.customerPayment.findMany.mock.calls[0][0].where;
    expect(cpWhere.accountId).toBe(10);

    // Verify accountId filter was applied to SalesVoucher
    const svWhere = mockPrisma.salesVoucher.findMany.mock.calls[0][0].where;
    expect(svWhere.accountId).toBe(10);
  });

  it('layaway payment mode maps correctly to amount fields', async () => {
    const payments = [
      { id: 1, paymentDate: new Date(), amount: 3000, paymentMode: 'Bank', narration: null, reference: null,
        layaway: { voucherNo: 'LY/1', accountId: 10, account: { id: 10, name: 'T', mobile: '9', closingBalance: 0, balanceType: 'NONE' } } },
      { id: 2, paymentDate: new Date(), amount: 2000, paymentMode: 'Card', narration: null, reference: null,
        layaway: { voucherNo: 'LY/1', accountId: 10, account: { id: 10, name: 'T', mobile: '9', closingBalance: 0, balanceType: 'NONE' } } },
      { id: 3, paymentDate: new Date(), amount: 1000, paymentMode: 'UPI', narration: null, reference: null,
        layaway: { voucherNo: 'LY/1', accountId: 10, account: { id: 10, name: 'T', mobile: '9', closingBalance: 0, balanceType: 'NONE' } } },
    ];
    mockPrisma.layawayPayment.findMany.mockResolvedValue(payments);

    const res = await request(app).get('/api/customer-payments?paymentType=LAYAWAY');
    expect(res.status).toBe(200);

    const bankPmt = res.body.payments.find((p: any) => p.bankAmount === 3000);
    expect(bankPmt.cashAmount).toBe(0);
    expect(bankPmt.cardAmount).toBe(0);

    const cardPmt = res.body.payments.find((p: any) => p.cardAmount === 2000);
    expect(cardPmt.cashAmount).toBe(0);

    const upiPmt = res.body.payments.find((p: any) => p.upiAmount === 1000);
    expect(upiPmt.cashAmount).toBe(0);
  });

  it('paginates unified results in-memory', async () => {
    // Create 3 payments to test pagination with limit=2
    mockPrisma.customerPayment.findMany.mockResolvedValue([
      { ...FULL_PAYMENT_1, id: 1, paymentDate: new Date('2026-03-10') },
      { ...FULL_PAYMENT_1, id: 2, paymentDate: new Date('2026-03-11') },
      { ...FULL_PAYMENT_1, id: 3, paymentDate: new Date('2026-03-12') },
    ]);

    const res = await request(app).get('/api/customer-payments?page=2&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.payments).toHaveLength(1); // page 2 of 3 items with limit 2
    expect(res.body.page).toBe(2);
  });

  it('handles server error gracefully', async () => {
    mockPrisma.customerPayment.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/customer-payments');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list customer payments');
  });
});

// ================================================================
// GET SINGLE PAYMENT — GET /api/customer-payments/:id
// ================================================================
describe('GET /api/customer-payments/:id', () => {
  it('returns payment by id', async () => {
    mockPrisma.customerPayment.findFirst.mockResolvedValue(FULL_PAYMENT_1);

    const res = await request(app).get('/api/customer-payments/1');
    expect(res.status).toBe(200);
    expect(res.body.receiptNo).toBe('CPR/1');
    expect(res.body.account.name).toBe('Raj Jewellers');
  });

  it('returns 404 when not found', async () => {
    mockPrisma.customerPayment.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/customer-payments/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Payment not found');
  });
});

// ================================================================
// CREATE PAYMENT — POST /api/customer-payments
// ================================================================
describe('POST /api/customer-payments', () => {
  it('creates a due payment and updates customer balance', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValue(SEQUENCE);
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.create.mockResolvedValue(PAYMENT_1);
    mockPrisma.account.update.mockResolvedValue({ ...CUSTOMER, closingBalance: 5000 });
    mockPrisma.customerPayment.findUnique.mockResolvedValue(FULL_PAYMENT_1);

    const res = await request(app).post('/api/customer-payments').send({
      paymentDate: '2026-03-10',
      paymentType: 'DUE_PAYMENT',
      accountId: 10,
      cashAmount: 10000,
      bankAmount: 0,
      cardAmount: 0,
      narration: 'Partial due payment',
    });

    expect(res.status).toBe(201);
    expect(res.body.receiptNo).toBe('CPR/1');
  });

  it('creates an advance payment with multiple sources', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValue({ ...SEQUENCE, lastNumber: 2 });
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER_ADVANCE);
    mockPrisma.customerPayment.create.mockResolvedValue(PAYMENT_2);
    mockPrisma.account.update.mockResolvedValue({ ...CUSTOMER_ADVANCE, closingBalance: -13000 });
    mockPrisma.customerPayment.findUnique.mockResolvedValue(FULL_PAYMENT_2);

    const res = await request(app).post('/api/customer-payments').send({
      paymentDate: '2026-03-12',
      paymentType: 'ADVANCE',
      accountId: 11,
      cashAmount: 5000,
      bankAmount: 3000,
      cardAmount: 0,
      bankName: 'SBI',
      chequeNo: 'CHQ123',
      narration: 'Advance for wedding set',
      reference: 'ADV-001',
    });

    expect(res.status).toBe(201);

    // Verify customerPayment.create was called with correct totalAmount
    const createCall = mockPrisma.customerPayment.create.mock.calls[0][0].data;
    expect(createCall.totalAmount).toBe(8000);
    expect(createCall.paymentType).toBe('ADVANCE');
  });

  it('creates a payment with UPI amount included in total', async () => {
    const upiPayment = {
      ...PAYMENT_1,
      id: 4,
      receiptNo: 'CPR/4',
      cashAmount: 2000,
      bankAmount: 0,
      cardAmount: 0,
      upiAmount: 8000,
      totalAmount: 10000,
    };
    mockPrisma.voucherSequence.upsert.mockResolvedValue({ ...SEQUENCE, lastNumber: 4 });
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.create.mockResolvedValue(upiPayment);
    mockPrisma.account.update.mockResolvedValue({ ...CUSTOMER, closingBalance: 5000 });
    mockPrisma.customerPayment.findUnique.mockResolvedValue({ ...upiPayment, account: CUSTOMER });

    const res = await request(app).post('/api/customer-payments').send({
      paymentDate: '2026-03-10',
      paymentType: 'DUE_PAYMENT',
      accountId: 10,
      cashAmount: 2000,
      bankAmount: 0,
      cardAmount: 0,
      upiAmount: 8000,
    });

    expect(res.status).toBe(201);

    const createCall = mockPrisma.customerPayment.create.mock.calls[0][0].data;
    expect(createCall.totalAmount).toBe(10000);
    expect(createCall.upiAmount).toBe(8000);
    expect(createCall.cashAmount).toBe(2000);
  });

  it('creates a payment with only UPI amount', async () => {
    const upiOnlyPayment = {
      ...PAYMENT_1,
      id: 5,
      receiptNo: 'CPR/5',
      cashAmount: 0,
      bankAmount: 0,
      cardAmount: 0,
      upiAmount: 15000,
      totalAmount: 15000,
    };
    mockPrisma.voucherSequence.upsert.mockResolvedValue({ ...SEQUENCE, lastNumber: 5 });
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.create.mockResolvedValue(upiOnlyPayment);
    mockPrisma.account.update.mockResolvedValue({ ...CUSTOMER, closingBalance: 0 });
    mockPrisma.customerPayment.findUnique.mockResolvedValue({ ...upiOnlyPayment, account: CUSTOMER });

    const res = await request(app).post('/api/customer-payments').send({
      paymentDate: '2026-03-10',
      paymentType: 'DUE_PAYMENT',
      accountId: 10,
      cashAmount: 0,
      bankAmount: 0,
      cardAmount: 0,
      upiAmount: 15000,
    });

    expect(res.status).toBe(201);

    const createCall = mockPrisma.customerPayment.create.mock.calls[0][0].data;
    expect(createCall.totalAmount).toBe(15000);
    expect(createCall.upiAmount).toBe(15000);
  });

  it('rejects zero total when all payment sources are zero including UPI', async () => {
    const res = await request(app).post('/api/customer-payments').send({
      paymentType: 'ADVANCE',
      accountId: 10,
      cashAmount: 0,
      bankAmount: 0,
      cardAmount: 0,
      upiAmount: 0,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payment amount must be greater than zero');
  });

  it('rejects missing accountId', async () => {
    const res = await request(app).post('/api/customer-payments').send({
      paymentType: 'ADVANCE',
      cashAmount: 5000,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Customer (accountId) is required');
  });

  it('rejects zero payment amount', async () => {
    const res = await request(app).post('/api/customer-payments').send({
      paymentType: 'ADVANCE',
      accountId: 10,
      cashAmount: 0,
      bankAmount: 0,
      cardAmount: 0,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payment amount must be greater than zero');
  });

  it('rejects invalid payment type', async () => {
    const res = await request(app).post('/api/customer-payments').send({
      paymentType: 'INVALID',
      accountId: 10,
      cashAmount: 5000,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payment type must be ADVANCE or DUE_PAYMENT');
  });

  it('returns 404 when account not found in transaction', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValue(SEQUENCE);
    mockPrisma.account.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));

    const res = await request(app).post('/api/customer-payments').send({
      paymentType: 'ADVANCE',
      accountId: 999,
      cashAmount: 5000,
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Account not found');
  });

  it('uses correct balance calculation (decrement)', async () => {
    const customer = { closingBalance: 20000, balanceType: 'DR' };
    mockPrisma.voucherSequence.upsert.mockResolvedValue(SEQUENCE);
    mockPrisma.account.findUnique.mockResolvedValue(customer);
    mockPrisma.customerPayment.create.mockResolvedValue({ ...PAYMENT_1, balanceBefore: 20000, balanceAfter: 15000 });
    mockPrisma.account.update.mockResolvedValue({ ...customer, closingBalance: 15000 });
    mockPrisma.customerPayment.findUnique.mockResolvedValue({ ...FULL_PAYMENT_1, balanceBefore: 20000, balanceAfter: 15000 });

    const res = await request(app).post('/api/customer-payments').send({
      paymentType: 'DUE_PAYMENT',
      accountId: 10,
      cashAmount: 3000,
      bankAmount: 2000,
      cardAmount: 0,
    });

    expect(res.status).toBe(201);

    // Verify balance was decremented
    const createData = mockPrisma.customerPayment.create.mock.calls[0][0].data;
    expect(createData.balanceBefore).toBe(20000);
    expect(createData.balanceAfter).toBe(15000);
  });

  it('sets balanceType to CR when balance goes negative from advance', async () => {
    const customer = { closingBalance: 0, balanceType: 'NONE' };
    mockPrisma.voucherSequence.upsert.mockResolvedValue(SEQUENCE);
    mockPrisma.account.findUnique.mockResolvedValue(customer);
    mockPrisma.customerPayment.create.mockResolvedValue({ ...PAYMENT_2, balanceBefore: 0, balanceAfter: -10000 });
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.customerPayment.findUnique.mockResolvedValue({ ...FULL_PAYMENT_2, balanceBefore: 0, balanceAfter: -10000 });

    const res = await request(app).post('/api/customer-payments').send({
      paymentType: 'ADVANCE',
      accountId: 11,
      cashAmount: 10000,
    });

    expect(res.status).toBe(201);

    // Verify account was updated with CR balance type
    const updateCall = mockPrisma.account.update.mock.calls[0][0].data;
    expect(updateCall.closingBalance).toBe(-10000);
    expect(updateCall.balanceType).toBe('CR');
  });

  it('creates a payment with old gold included in total', async () => {
    const oldGoldPayment = {
      ...PAYMENT_1,
      id: 6,
      receiptNo: 'CPR/6',
      cashAmount: 5000,
      bankAmount: 0,
      cardAmount: 0,
      upiAmount: 0,
      oldGoldGross: 12,
      oldGoldNet: 10,
      oldGoldRate: 6500,
      oldGoldAmount: 65000,
      totalAmount: 70000,
      balanceBefore: 15000,
      balanceAfter: -55000,
    };
    mockPrisma.voucherSequence.upsert.mockResolvedValue({ ...SEQUENCE, lastNumber: 6 });
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.create.mockResolvedValue(oldGoldPayment);
    mockPrisma.account.update.mockResolvedValue({ ...CUSTOMER, closingBalance: -55000, balanceType: 'CR' });
    mockPrisma.customerPayment.findUnique.mockResolvedValue({ ...oldGoldPayment, account: { ...CUSTOMER, closingBalance: -55000, balanceType: 'CR' } });

    const res = await request(app).post('/api/customer-payments').send({
      paymentDate: '2026-03-10',
      paymentType: 'DUE_PAYMENT',
      accountId: 10,
      cashAmount: 5000,
      oldGoldGross: 12,
      oldGoldNet: 10,
      oldGoldRate: 6500,
    });

    expect(res.status).toBe(201);

    const createCall = mockPrisma.customerPayment.create.mock.calls[0][0].data;
    expect(createCall.totalAmount).toBe(70000);
    expect(createCall.oldGoldGross).toBe(12);
    expect(createCall.oldGoldNet).toBe(10);
    expect(createCall.oldGoldRate).toBe(6500);
    expect(createCall.oldGoldAmount).toBe(65000);
    expect(createCall.cashAmount).toBe(5000);
  });

  it('creates a payment with only old gold (no cash/bank/card/upi)', async () => {
    const oldGoldOnlyPayment = {
      ...PAYMENT_1,
      id: 7,
      receiptNo: 'CPR/7',
      cashAmount: 0,
      bankAmount: 0,
      cardAmount: 0,
      upiAmount: 0,
      oldGoldGross: 20,
      oldGoldNet: 18.5,
      oldGoldRate: 7000,
      oldGoldAmount: 129500,
      totalAmount: 129500,
      balanceBefore: 15000,
      balanceAfter: -114500,
    };
    mockPrisma.voucherSequence.upsert.mockResolvedValue({ ...SEQUENCE, lastNumber: 7 });
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.create.mockResolvedValue(oldGoldOnlyPayment);
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.customerPayment.findUnique.mockResolvedValue({ ...oldGoldOnlyPayment, account: CUSTOMER });

    const res = await request(app).post('/api/customer-payments').send({
      paymentDate: '2026-03-10',
      paymentType: 'ADVANCE',
      accountId: 10,
      cashAmount: 0,
      oldGoldGross: 20,
      oldGoldNet: 18.5,
      oldGoldRate: 7000,
    });

    expect(res.status).toBe(201);

    const createCall = mockPrisma.customerPayment.create.mock.calls[0][0].data;
    expect(createCall.totalAmount).toBe(129500);
    expect(createCall.oldGoldAmount).toBe(129500);
  });
});

// ================================================================
// CANCEL PAYMENT — DELETE /api/customer-payments/:id
// ================================================================
describe('DELETE /api/customer-payments/:id', () => {
  it('cancels a payment and reverses balance', async () => {
    mockPrisma.customerPayment.findFirst.mockResolvedValue(PAYMENT_1);
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.account.findUnique.mockResolvedValue({ closingBalance: 15000 });
    mockPrisma.customerPayment.update.mockResolvedValue({ ...PAYMENT_1, status: 'CANCELLED' });
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));

    const res = await request(app).delete('/api/customer-payments/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Payment cancelled successfully');

    // Verify balance was incremented back
    const accountUpdate = mockPrisma.account.update.mock.calls[0][0].data;
    expect(accountUpdate.closingBalance.increment).toBe(10000);
  });

  it('returns 404 for non-existent payment', async () => {
    mockPrisma.customerPayment.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));

    const res = await request(app).delete('/api/customer-payments/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Payment not found');
  });

  it('returns 400 for already cancelled payment', async () => {
    mockPrisma.customerPayment.findFirst.mockResolvedValue(CANCELLED_PAYMENT);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));

    const res = await request(app).delete('/api/customer-payments/3');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payment is already cancelled');
  });

  it('sets balanceType to DR after cancellation reversal', async () => {
    mockPrisma.customerPayment.findFirst.mockResolvedValue(PAYMENT_1);
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.account.findUnique.mockResolvedValue({ closingBalance: 15000 });
    mockPrisma.customerPayment.update.mockResolvedValue({ ...PAYMENT_1, status: 'CANCELLED' });
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));

    await request(app).delete('/api/customer-payments/1');

    // Second account.update sets balanceType
    const secondUpdate = mockPrisma.account.update.mock.calls[1][0].data;
    expect(secondUpdate.balanceType).toBe('DR');
  });
});

// ================================================================
// BALANCE HISTORY — GET /api/customer-payments/balance/:accountId
// ================================================================
describe('GET /api/customer-payments/balance/:accountId', () => {
  it('returns balance history for a customer', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.findMany.mockResolvedValue([{
      id: 1,
      receiptNo: 'CPR/1',
      paymentDate: new Date('2026-03-10'),
      paymentType: 'DUE_PAYMENT',
      totalAmount: 10000,
      cashAmount: 10000,
      bankAmount: 0,
      cardAmount: 0,
      balanceBefore: 15000,
      balanceAfter: 5000,
      narration: 'Partial payment',
      reference: null,
    }]);
    mockPrisma.salesVoucher.findMany.mockResolvedValue([{
      id: 1,
      voucherNo: 'JGI/1',
      voucherDate: new Date('2026-03-05'),
      voucherAmount: 50000,
      paymentAmount: 35000,
      dueAmount: 15000,
      advanceAmount: 0,
    }]);
    mockPrisma.cashEntryLine.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customer-payments/balance/10');
    expect(res.status).toBe(200);
    expect(res.body.account.name).toBe('Raj Jewellers');
    expect(res.body.currentBalance).toBe(15000);
    expect(res.body.history).toBeDefined();
    expect(res.body.history.length).toBeGreaterThan(0);
  });

  it('includes sales as debit entries in history', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.findMany.mockResolvedValue([]);
    mockPrisma.salesVoucher.findMany.mockResolvedValue([{
      id: 1,
      voucherNo: 'JGI/1',
      voucherDate: new Date('2026-03-05'),
      voucherAmount: 50000,
      paymentAmount: 35000,
      dueAmount: 15000,
      advanceAmount: 0,
    }]);
    mockPrisma.cashEntryLine.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customer-payments/balance/10');
    expect(res.status).toBe(200);

    const saleEntry = res.body.history.find((h: any) => h.type === 'SALE');
    expect(saleEntry).toBeDefined();
    expect(saleEntry.debit).toBe(15000);
    expect(saleEntry.credit).toBe(0);
  });

  it('includes advance used entries when advanceAmount > 0', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.findMany.mockResolvedValue([]);
    mockPrisma.salesVoucher.findMany.mockResolvedValue([{
      id: 1,
      voucherNo: 'JGI/1',
      voucherDate: new Date('2026-03-05'),
      voucherAmount: 50000,
      paymentAmount: 50000,
      dueAmount: 0,
      advanceAmount: 5000,
    }]);
    mockPrisma.cashEntryLine.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customer-payments/balance/10');
    expect(res.status).toBe(200);

    const advEntry = res.body.history.find((h: any) => h.type === 'ADVANCE_USED');
    expect(advEntry).toBeDefined();
    expect(advEntry.credit).toBe(5000);
  });

  it('returns 404 when account not found', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/customer-payments/balance/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Account not found');
  });

  it('supports date range filtering', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.findMany.mockResolvedValue([]);
    mockPrisma.salesVoucher.findMany.mockResolvedValue([]);
    mockPrisma.cashEntryLine.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customer-payments/balance/10?dateFrom=2026-03-01&dateTo=2026-03-31');
    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });

  it('calculates running balance correctly', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.findMany.mockResolvedValue([{
      id: 1,
      receiptNo: 'CPR/1',
      paymentDate: new Date('2026-03-10'),
      paymentType: 'DUE_PAYMENT',
      totalAmount: 10000,
      cashAmount: 10000,
      bankAmount: 0,
      cardAmount: 0,
      balanceBefore: 15000,
      balanceAfter: 5000,
      narration: null,
      reference: null,
    }]);
    mockPrisma.salesVoucher.findMany.mockResolvedValue([{
      id: 1,
      voucherNo: 'JGI/1',
      voucherDate: new Date('2026-03-05'),
      voucherAmount: 50000,
      paymentAmount: 35000,
      dueAmount: 15000,
      advanceAmount: 0,
    }]);
    mockPrisma.cashEntryLine.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customer-payments/balance/10');
    expect(res.status).toBe(200);

    // History sorted by date: sale first (March 5), then payment (March 10)
    const history = res.body.history;
    expect(history.length).toBe(2);
    expect(history[0].type).toBe('SALE');
    expect(history[0].balance).toBe(15000); // 0 + 15000
    expect(history[1].type).toBe('DUE_PAYMENT');
    expect(history[1].balance).toBe(5000); // 15000 - 10000
  });

  it('includes UPI payment in balance history entries', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.findMany.mockResolvedValue([{
      id: 4,
      receiptNo: 'CPR/4',
      paymentDate: new Date('2026-03-15'),
      paymentType: 'DUE_PAYMENT',
      totalAmount: 10000,
      cashAmount: 2000,
      bankAmount: 0,
      cardAmount: 0,
      upiAmount: 8000,
      balanceBefore: 15000,
      balanceAfter: 5000,
      narration: 'UPI payment',
      reference: null,
    }]);
    mockPrisma.salesVoucher.findMany.mockResolvedValue([]);
    mockPrisma.cashEntryLine.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customer-payments/balance/10');
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].type).toBe('DUE_PAYMENT');
    expect(res.body.history[0].credit).toBe(10000);
  });
});
