import request from 'supertest';

// ── Mock Prisma before importing app ──────────────────────
import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({
  prisma: mockPrisma,
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
// ================================================================
describe('GET /api/customer-payments', () => {
  it('returns empty list when no payments exist', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([]);
    mockPrisma.customerPayment.count.mockResolvedValue(0);

    const res = await request(app).get('/api/customer-payments');
    expect(res.status).toBe(200);
    expect(res.body.payments).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns all payments with pagination', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([FULL_PAYMENT_1, FULL_PAYMENT_2]);
    mockPrisma.customerPayment.count.mockResolvedValue(2);

    const res = await request(app).get('/api/customer-payments');
    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
  });

  it('filters by accountId', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([FULL_PAYMENT_1]);
    mockPrisma.customerPayment.count.mockResolvedValue(1);

    const res = await request(app).get('/api/customer-payments?accountId=10');
    expect(res.status).toBe(200);

    const where = mockPrisma.customerPayment.findMany.mock.calls[0][0].where;
    expect(where.accountId).toBe(10);
  });

  it('filters by payment type', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([FULL_PAYMENT_2]);
    mockPrisma.customerPayment.count.mockResolvedValue(1);

    const res = await request(app).get('/api/customer-payments?paymentType=ADVANCE');
    expect(res.status).toBe(200);

    const where = mockPrisma.customerPayment.findMany.mock.calls[0][0].where;
    expect(where.paymentType).toBe('ADVANCE');
  });

  it('ignores paymentType=ALL filter', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([]);
    mockPrisma.customerPayment.count.mockResolvedValue(0);

    await request(app).get('/api/customer-payments?paymentType=ALL');

    const where = mockPrisma.customerPayment.findMany.mock.calls[0][0].where;
    expect(where.paymentType).toBeUndefined();
  });

  it('filters by date range', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([]);
    mockPrisma.customerPayment.count.mockResolvedValue(0);

    await request(app).get('/api/customer-payments?dateFrom=2026-03-01&dateTo=2026-03-31');

    const where = mockPrisma.customerPayment.findMany.mock.calls[0][0].where;
    expect(where.paymentDate.gte).toBeDefined();
    expect(where.paymentDate.lte).toBeDefined();
  });

  it('filters by search across receipt, narration, reference, customer name', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([FULL_PAYMENT_1]);
    mockPrisma.customerPayment.count.mockResolvedValue(1);

    await request(app).get('/api/customer-payments?search=partial');

    const where = mockPrisma.customerPayment.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR).toHaveLength(4);
  });

  it('supports status filter', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([]);
    mockPrisma.customerPayment.count.mockResolvedValue(0);

    await request(app).get('/api/customer-payments?status=CANCELLED');

    const where = mockPrisma.customerPayment.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('CANCELLED');
  });

  it('supports pagination', async () => {
    mockPrisma.customerPayment.findMany.mockResolvedValue([]);
    mockPrisma.customerPayment.count.mockResolvedValue(100);

    const res = await request(app).get('/api/customer-payments?page=3&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(3);
    expect(res.body.limit).toBe(10);

    const opts = mockPrisma.customerPayment.findMany.mock.calls[0][0];
    expect(opts.skip).toBe(20);
    expect(opts.take).toBe(10);
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
    mockPrisma.customerPayment.findUnique.mockResolvedValue(FULL_PAYMENT_1);

    const res = await request(app).get('/api/customer-payments/1');
    expect(res.status).toBe(200);
    expect(res.body.receiptNo).toBe('CPR/1');
    expect(res.body.account.name).toBe('Raj Jewellers');
  });

  it('returns 404 when not found', async () => {
    mockPrisma.customerPayment.findUnique.mockResolvedValue(null);

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
});

// ================================================================
// CANCEL PAYMENT — DELETE /api/customer-payments/:id
// ================================================================
describe('DELETE /api/customer-payments/:id', () => {
  it('cancels a payment and reverses balance', async () => {
    mockPrisma.customerPayment.findUnique.mockResolvedValue(PAYMENT_1);
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.account.findUnique.mockResolvedValue({ closingBalance: 15000 });
    mockPrisma.customerPayment.update.mockResolvedValue({ ...PAYMENT_1, status: 'CANCELLED' });

    const res = await request(app).delete('/api/customer-payments/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Payment cancelled successfully');

    // Verify balance was incremented back
    const accountUpdate = mockPrisma.account.update.mock.calls[0][0].data;
    expect(accountUpdate.closingBalance.increment).toBe(10000);
  });

  it('returns 404 for non-existent payment', async () => {
    mockPrisma.customerPayment.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));

    const res = await request(app).delete('/api/customer-payments/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Payment not found');
  });

  it('returns 400 for already cancelled payment', async () => {
    mockPrisma.customerPayment.findUnique.mockResolvedValue(CANCELLED_PAYMENT);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));

    const res = await request(app).delete('/api/customer-payments/3');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payment is already cancelled');
  });

  it('sets balanceType to DR after cancellation reversal', async () => {
    mockPrisma.customerPayment.findUnique.mockResolvedValue(PAYMENT_1);
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.account.findUnique.mockResolvedValue({ closingBalance: 15000 });
    mockPrisma.customerPayment.update.mockResolvedValue({ ...PAYMENT_1, status: 'CANCELLED' });

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
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER);
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
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER);
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
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER);
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
    mockPrisma.account.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/customer-payments/balance/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Account not found');
  });

  it('supports date range filtering', async () => {
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER);
    mockPrisma.customerPayment.findMany.mockResolvedValue([]);
    mockPrisma.salesVoucher.findMany.mockResolvedValue([]);
    mockPrisma.cashEntryLine.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/customer-payments/balance/10?dateFrom=2026-03-01&dateTo=2026-03-31');
    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });

  it('calculates running balance correctly', async () => {
    mockPrisma.account.findUnique.mockResolvedValue(CUSTOMER);
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
});
