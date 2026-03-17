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
  name: 'Ramesh Kumar',
  mobile: '9876543210',
  type: 'CUSTOMER',
  closingBalance: 0,
  balanceType: 'NONE',
};

const VOUCHER_SEQUENCE = {
  prefix: 'SS',
  entityType: 'SAVINGS_SCHEME',
  financialYear: '2025-2026',
  lastNumber: 1,
};

const makeSchemePayload = (overrides: any = {}) => ({
  accountId: CUSTOMER.id,
  branchId: 1,
  schemeName: 'Gold Savings Scheme',
  startDate: '2025-04-01',
  durationMonths: 11,
  monthlyAmount: 5000,
  bonusMonths: 1,
  financialYear: '2025-2026',
  narration: 'Monthly gold savings',
  reference: null,
  ...overrides,
});

const CREATED_SCHEME = {
  id: 1,
  schemeNo: 'SS/1',
  schemePrefix: 'SS',
  schemeNumber: 1,
  schemeName: 'Gold Savings Scheme',
  startDate: new Date('2025-04-01'),
  maturityDate: new Date('2026-03-01'),
  accountId: CUSTOMER.id,
  companyId: 1,
  branchId: 1,
  durationMonths: 11,
  monthlyAmount: 5000,
  bonusMonths: 1,
  bonusAmount: 5000,
  paidInstallments: 0,
  missedInstallments: 0,
  totalPaidAmount: 0,
  maturityValue: 60000,
  narration: 'Monthly gold savings',
  reference: null,
  status: 'ACTIVE',
};

const CREATED_INSTALLMENT = {
  id: 1,
  schemeId: 1,
  installmentNo: 1,
  dueDate: new Date('2025-05-01'),
  paidDate: null,
  amount: 0,
  paymentMode: null,
  reference: null,
  narration: null,
  status: 'PENDING',
};

// ── Reset mocks before each test ───────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// GET /api/savings-scheme
// ============================================================
describe('GET /api/savings-scheme', () => {
  it('should return an empty list when no schemes exist', async () => {
    mockPrisma.savingsScheme.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/savings-scheme');
    expect(res.status).toBe(200);
    expect(res.body.schemes).toEqual([]);
    expect(res.body.totalMaturityValue).toBe(0);
  });

  it('should return list of savings schemes', async () => {
    mockPrisma.savingsScheme.findMany.mockResolvedValue([
      { ...CREATED_SCHEME, account: CUSTOMER, branch: { name: 'Main Branch' }, installments: [] },
    ]);

    const res = await request(app).get('/api/savings-scheme');
    expect(res.status).toBe(200);
    expect(res.body.schemes).toHaveLength(1);
    expect(res.body.schemes[0].schemeNo).toBe('SS/1');
  });

  it('should filter by status', async () => {
    mockPrisma.savingsScheme.findMany.mockResolvedValue([]);

    await request(app).get('/api/savings-scheme?status=ACTIVE');
    expect(mockPrisma.savingsScheme.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });
});

// ============================================================
// GET /api/savings-scheme/:id
// ============================================================
describe('GET /api/savings-scheme/:id', () => {
  it('should return 404 for non-existent scheme', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/savings-scheme/999');
    expect(res.status).toBe(404);
  });

  it('should return scheme details', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue({
      ...CREATED_SCHEME,
      account: CUSTOMER,
      branch: { name: 'Main Branch' },
      installments: [CREATED_INSTALLMENT],
    });

    const res = await request(app).get('/api/savings-scheme/1');
    expect(res.status).toBe(200);
    expect(res.body.schemeNo).toBe('SS/1');
    expect(res.body.installments).toHaveLength(1);
  });
});

// ============================================================
// POST /api/savings-scheme
// ============================================================
describe('POST /api/savings-scheme', () => {
  it('should require customer', async () => {
    const res = await request(app)
      .post('/api/savings-scheme')
      .send(makeSchemePayload({ accountId: null }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Customer/i);
  });

  it('should require monthly amount', async () => {
    const res = await request(app)
      .post('/api/savings-scheme')
      .send(makeSchemePayload({ monthlyAmount: 0 }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Monthly amount/i);
  });

  it('should require duration', async () => {
    const res = await request(app)
      .post('/api/savings-scheme')
      .send(makeSchemePayload({ durationMonths: 0 }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Duration/i);
  });

  it('should create a new savings scheme with installments', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValue(VOUCHER_SEQUENCE);
    mockPrisma.savingsScheme.create.mockResolvedValue(CREATED_SCHEME);
    mockPrisma.schemeInstallment.create.mockResolvedValue(CREATED_INSTALLMENT);
    mockPrisma.savingsScheme.findUnique.mockResolvedValue({
      ...CREATED_SCHEME,
      account: CUSTOMER,
      installments: Array.from({ length: 11 }, (_, i) => ({
        ...CREATED_INSTALLMENT,
        id: i + 1,
        installmentNo: i + 1,
      })),
    });

    const res = await request(app)
      .post('/api/savings-scheme')
      .send(makeSchemePayload());

    expect(res.status).toBe(201);
    expect(res.body.schemeNo).toBe('SS/1');
    expect(res.body.installments).toHaveLength(11);
    // Verify installments were created
    expect(mockPrisma.schemeInstallment.create).toHaveBeenCalledTimes(11);
  });

  it('should calculate maturity value correctly (duration × monthly + bonus)', async () => {
    mockPrisma.voucherSequence.upsert.mockResolvedValue(VOUCHER_SEQUENCE);
    mockPrisma.savingsScheme.create.mockResolvedValue(CREATED_SCHEME);
    mockPrisma.schemeInstallment.create.mockResolvedValue(CREATED_INSTALLMENT);
    mockPrisma.savingsScheme.findUnique.mockResolvedValue({
      ...CREATED_SCHEME,
      account: CUSTOMER,
      installments: [],
    });

    await request(app)
      .post('/api/savings-scheme')
      .send(makeSchemePayload());

    // Verify create was called with correct maturity value
    expect(mockPrisma.savingsScheme.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          maturityValue: 60000, // (11 × 5000) + (1 × 5000)
          bonusAmount: 5000,
        }),
      }),
    );
  });
});

// ============================================================
// POST /api/savings-scheme/:id/installment
// ============================================================
describe('POST /api/savings-scheme/:id/installment', () => {
  it('should require installment number', async () => {
    const res = await request(app)
      .post('/api/savings-scheme/1/installment')
      .send({ amount: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Installment number/i);
  });

  it('should require payment amount', async () => {
    const res = await request(app)
      .post('/api/savings-scheme/1/installment')
      .send({ installmentNo: 1, amount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Payment amount/i);
  });

  it('should pay an installment and update scheme totals', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(CREATED_SCHEME);
    mockPrisma.schemeInstallment.findUnique.mockResolvedValue(CREATED_INSTALLMENT);
    mockPrisma.schemeInstallment.update.mockResolvedValue({ ...CREATED_INSTALLMENT, status: 'PAID', amount: 5000 });
    mockPrisma.savingsScheme.update.mockResolvedValue({
      ...CREATED_SCHEME,
      paidInstallments: 1,
      totalPaidAmount: 5000,
      maturityValue: 10000,
    });
    mockPrisma.savingsScheme.findUnique.mockResolvedValue({
      ...CREATED_SCHEME,
      paidInstallments: 1,
      totalPaidAmount: 5000,
      account: CUSTOMER,
      installments: [{ ...CREATED_INSTALLMENT, status: 'PAID', amount: 5000 }],
    });

    const res = await request(app)
      .post('/api/savings-scheme/1/installment')
      .send({ installmentNo: 1, amount: 5000, paymentMode: 'Cash' });

    expect(res.status).toBe(201);
    expect(mockPrisma.schemeInstallment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID', amount: 5000 }),
      }),
    );
  });

  it('should reject paying already paid installment', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(CREATED_SCHEME);
    mockPrisma.schemeInstallment.findUnique.mockResolvedValue({
      ...CREATED_INSTALLMENT,
      status: 'PAID',
    });

    const res = await request(app)
      .post('/api/savings-scheme/1/installment')
      .send({ installmentNo: 1, amount: 5000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already paid/i);
  });

  it('should mark scheme as MATURED when all installments are paid', async () => {
    const almostDoneScheme = {
      ...CREATED_SCHEME,
      paidInstallments: 10, // 10 of 11 paid
      totalPaidAmount: 50000,
    };

    mockPrisma.savingsScheme.findFirst.mockResolvedValue(almostDoneScheme);
    mockPrisma.schemeInstallment.findUnique.mockResolvedValue({ ...CREATED_INSTALLMENT, installmentNo: 11 });
    mockPrisma.schemeInstallment.update.mockResolvedValue({});
    mockPrisma.savingsScheme.update.mockResolvedValue({ ...almostDoneScheme, status: 'MATURED' });
    mockPrisma.savingsScheme.findUnique.mockResolvedValue({
      ...almostDoneScheme,
      status: 'MATURED',
      account: CUSTOMER,
      installments: [],
    });

    const res = await request(app)
      .post('/api/savings-scheme/1/installment')
      .send({ installmentNo: 11, amount: 5000 });

    expect(res.status).toBe(201);
    expect(mockPrisma.savingsScheme.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'MATURED' }),
      }),
    );
  });

  it('should reject payment on cancelled scheme', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue({
      ...CREATED_SCHEME,
      status: 'CANCELLED',
    });

    const res = await request(app)
      .post('/api/savings-scheme/1/installment')
      .send({ installmentNo: 1, amount: 5000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cancelled/i);
  });
});

// ============================================================
// PUT /api/savings-scheme/:id/redeem
// ============================================================
describe('PUT /api/savings-scheme/:id/redeem', () => {
  it('should redeem a matured scheme', async () => {
    const maturedScheme = { ...CREATED_SCHEME, status: 'MATURED', maturityValue: 60000 };
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(maturedScheme);
    mockPrisma.savingsScheme.update.mockResolvedValue({ ...maturedScheme, status: 'REDEEMED' });
    mockPrisma.account.update.mockResolvedValue({});

    const res = await request(app).put('/api/savings-scheme/1/redeem');

    expect(res.status).toBe(200);
    expect(mockPrisma.savingsScheme.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REDEEMED' }),
      }),
    );
    // Verify customer account was credited
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CUSTOMER.id },
        data: expect.objectContaining({
          closingBalance: { decrement: 60000 },
        }),
      }),
    );
  });

  it('should reject redeem on non-matured scheme', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(CREATED_SCHEME); // status: ACTIVE

    const res = await request(app).put('/api/savings-scheme/1/redeem');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/matured/i);
  });

  it('should return 404 for non-existent scheme', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(null);

    const res = await request(app).put('/api/savings-scheme/999/redeem');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// DELETE /api/savings-scheme/:id
// ============================================================
describe('DELETE /api/savings-scheme/:id', () => {
  it('should cancel an active scheme', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(CREATED_SCHEME);
    mockPrisma.savingsScheme.update.mockResolvedValue({ ...CREATED_SCHEME, status: 'CANCELLED' });

    const res = await request(app).delete('/api/savings-scheme/1');
    expect(res.status).toBe(200);
    expect(mockPrisma.savingsScheme.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });

  it('should credit paid amount back to customer on cancellation', async () => {
    const paidScheme = { ...CREATED_SCHEME, totalPaidAmount: 25000 };
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(paidScheme);
    mockPrisma.savingsScheme.update.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});

    const res = await request(app).delete('/api/savings-scheme/1');
    expect(res.status).toBe(200);
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CUSTOMER.id },
        data: expect.objectContaining({
          closingBalance: { decrement: 25000 },
        }),
      }),
    );
  });

  it('should reject cancelling already cancelled scheme', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue({ ...CREATED_SCHEME, status: 'CANCELLED' });

    const res = await request(app).delete('/api/savings-scheme/1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already cancelled/i);
  });

  it('should reject cancelling redeemed scheme', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue({ ...CREATED_SCHEME, status: 'REDEEMED' });

    const res = await request(app).delete('/api/savings-scheme/1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/redeemed/i);
  });

  it('should return 404 for non-existent scheme', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(null);

    const res = await request(app).delete('/api/savings-scheme/999');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// PUT /api/savings-scheme/:id/mark-missed
// ============================================================
describe('PUT /api/savings-scheme/:id/mark-missed', () => {
  it('should mark overdue pending installments as missed', async () => {
    const pastDue = new Date('2025-04-01');
    const futureDate = new Date('2026-06-01');
    mockPrisma.savingsScheme.findFirst.mockResolvedValue({
      ...CREATED_SCHEME,
      installments: [
        { ...CREATED_INSTALLMENT, id: 1, installmentNo: 1, dueDate: pastDue, status: 'PENDING' },
        { ...CREATED_INSTALLMENT, id: 2, installmentNo: 2, dueDate: futureDate, status: 'PENDING' },
      ],
    });
    mockPrisma.schemeInstallment.update.mockResolvedValue({});
    mockPrisma.savingsScheme.update.mockResolvedValue({});

    const res = await request(app).put('/api/savings-scheme/1/mark-missed');

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/1 installments marked as missed/);
    expect(mockPrisma.schemeInstallment.update).toHaveBeenCalledTimes(1);
  });

  it('should return 404 for non-existent scheme', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(null);

    const res = await request(app).put('/api/savings-scheme/999/mark-missed');
    expect(res.status).toBe(404);
  });
});
