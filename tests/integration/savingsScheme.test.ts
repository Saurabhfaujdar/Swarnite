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
// GET /api/savings-scheme/reminders/due
// ============================================================
describe('GET /api/savings-scheme/reminders/due', () => {
  // Freeze "today" so the date-window math is deterministic.
  const FIXED_NOW = new Date('2026-05-02T10:00:00');
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const SCHEME = {
    id: 7, schemeNo: 'SCH/7', schemeName: 'Gold Plus', monthlyAmount: 1000,
    account: { id: 1, name: 'Asha Kumari', mobile: '9876543210' },
  };
  const inst = (id: number, no: number, dueDate: string) => ({
    id, installmentNo: no, dueDate: new Date(dueDate),
    amount: 0, status: 'PENDING', scheme: SCHEME,
  });

  it('returns PENDING installments inside the default [-2, +2] day window with bucket counts', async () => {
    mockPrisma.schemeInstallment.findMany.mockResolvedValueOnce([
      inst(101, 2, '2026-04-30'), // T-2 → overdue
      inst(102, 3, '2026-05-02'), // T   → today
      inst(103, 4, '2026-05-04'), // T+2 → upcoming
    ]);

    const res = await request(app).get('/api/savings-scheme/reminders/due');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.counts).toEqual({ upcoming: 1, today: 1, overdue: 1 });

    expect(res.body.items[0]).toMatchObject({
      installmentNo: 2,
      bucket: 'overdue',
      daysFromToday: -2,
      schemeNo: 'SCH/7',
      customerName: 'Asha Kumari',
      customerMobile: '9876543210',
    });
    expect(res.body.items[1]).toMatchObject({ bucket: 'today', daysFromToday: 0 });
    expect(res.body.items[2]).toMatchObject({ bucket: 'upcoming', daysFromToday: 2 });

    // Confirms only PENDING + ACTIVE scheme + tenant scope are queried.
    const where = mockPrisma.schemeInstallment.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PENDING');
    expect(where.scheme.status).toBe('ACTIVE');
    expect(where.scheme.companyId).toBe(1);
    expect(where.dueDate.gte).toBeInstanceOf(Date);
    expect(where.dueDate.lte).toBeInstanceOf(Date);
  });

  it('honours custom daysBefore / daysAfter query params', async () => {
    mockPrisma.schemeInstallment.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/savings-scheme/reminders/due')
      .query({ daysBefore: 5, daysAfter: 1 });

    expect(res.status).toBe(200);
    expect(res.body.window).toMatchObject({ daysBefore: 5, daysAfter: 1 });
    const where = mockPrisma.schemeInstallment.findMany.mock.calls[0][0].where;
    // Window math is done in server-local time, so compare the local-date
    // parts (timezone-agnostic) rather than the UTC ISO string.
    const gte: Date = where.dueDate.gte;
    const lte: Date = where.dueDate.lte;
    // gte = 5 days before today (2 May 2026) → 27 Apr
    expect(gte.getDate()).toBe(27);
    expect(gte.getMonth()).toBe(3); // April (0-indexed)
    expect(gte.getFullYear()).toBe(2026);
    // lte = 1 day after today → 3 May, end of day
    expect(lte.getDate()).toBe(3);
    expect(lte.getMonth()).toBe(4); // May
    expect(lte.getFullYear()).toBe(2026);
    expect(lte.getHours()).toBe(23);
  });

  it('clamps absurd window params to a safe range (no negative / >30)', async () => {
    mockPrisma.schemeInstallment.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/savings-scheme/reminders/due')
      .query({ daysBefore: -10, daysAfter: 999 });

    expect(res.status).toBe(200);
    expect(res.body.window).toMatchObject({ daysBefore: 0, daysAfter: 30 });
  });

  it('returns total:0 with empty items when nothing is due', async () => {
    mockPrisma.schemeInstallment.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/savings-scheme/reminders/due');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      window: expect.any(Object),
      total: 0,
      counts: { upcoming: 0, today: 0, overdue: 0 },
      items: [],
    });
  });

  it('is matched as a literal route, not as /:id (regression)', async () => {
    // If `/reminders/due` were registered after `/:id`, Express would route
    // the first segment (`reminders`) to the :id handler, which calls
    // findFirst (not schemeInstallment.findMany).
    mockPrisma.schemeInstallment.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/savings-scheme/reminders/due');
    expect(res.status).toBe(200);
    expect(mockPrisma.schemeInstallment.findMany).toHaveBeenCalled();
    expect(mockPrisma.savingsScheme.findFirst).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma throws', async () => {
    mockPrisma.schemeInstallment.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/api/savings-scheme/reminders/due');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/due reminders/i);
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

  it('should defer the shop bonus until maturity (initial maturityValue is 0)', async () => {
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

    // bonusAmount is still recorded for later (it's the bonus the
    // customer will receive *if* the scheme matures), but
    // maturityValue starts at 0 because no installment has been paid
    // yet — bonus is added only on maturity.
    expect(mockPrisma.savingsScheme.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          maturityValue: 0,
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

  it('does not include the shop bonus in maturityValue until the scheme matures', async () => {
    // After paying installment 4 of 11, maturityValue should equal
    // totalPaidAmount only — bonus stays deferred.
    const partialScheme = {
      ...CREATED_SCHEME,
      paidInstallments: 3,
      totalPaidAmount: 15000,
      bonusAmount: 5000,
    };

    mockPrisma.savingsScheme.findFirst.mockResolvedValue(partialScheme);
    mockPrisma.schemeInstallment.findUnique.mockResolvedValue({ ...CREATED_INSTALLMENT, installmentNo: 4 });
    mockPrisma.schemeInstallment.update.mockResolvedValue({});
    mockPrisma.savingsScheme.update.mockResolvedValue({ ...partialScheme, paidInstallments: 4, totalPaidAmount: 20000 });
    mockPrisma.savingsScheme.findUnique.mockResolvedValue({
      ...partialScheme,
      paidInstallments: 4,
      totalPaidAmount: 20000,
      account: CUSTOMER,
      installments: [],
    });

    const res = await request(app)
      .post('/api/savings-scheme/1/installment')
      .send({ installmentNo: 4, amount: 5000 });

    expect(res.status).toBe(201);
    expect(mockPrisma.savingsScheme.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidInstallments: 4,
          totalPaidAmount: 20000,
          maturityValue: 20000, // bonus NOT included
        }),
      }),
    );
    // Status must NOT flip to MATURED yet.
    expect(mockPrisma.savingsScheme.update.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('credits the shop bonus into maturityValue on the final installment', async () => {
    const almostDoneScheme = {
      ...CREATED_SCHEME,
      paidInstallments: 10,
      totalPaidAmount: 50000,
      bonusAmount: 5000,
    };

    mockPrisma.savingsScheme.findFirst.mockResolvedValue(almostDoneScheme);
    mockPrisma.schemeInstallment.findUnique.mockResolvedValue({ ...CREATED_INSTALLMENT, installmentNo: 11 });
    mockPrisma.schemeInstallment.update.mockResolvedValue({});
    mockPrisma.savingsScheme.update.mockResolvedValue({ ...almostDoneScheme, status: 'MATURED' });
    mockPrisma.savingsScheme.findUnique.mockResolvedValue({
      ...almostDoneScheme,
      status: 'MATURED',
      paidInstallments: 11,
      totalPaidAmount: 55000,
      maturityValue: 60000,
      account: CUSTOMER,
      installments: [],
    });

    const res = await request(app)
      .post('/api/savings-scheme/1/installment')
      .send({ installmentNo: 11, amount: 5000 });

    expect(res.status).toBe(201);
    expect(mockPrisma.savingsScheme.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'MATURED',
          paidInstallments: 11,
          totalPaidAmount: 55000,
          maturityValue: 60000, // 55000 totalPaid + 5000 bonus
        }),
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

  // ────────────────────────────────────────────────────────
  // Bonus forfeiture on cancellation.
  //
  // A non-matured scheme that is cancelled forfeits the shop bonus —
  // the customer only gets their own paid-in money back. Both the
  // persisted scheme record and any read-path response must reflect
  // this so the detail page never shows a stale bonus.
  // ────────────────────────────────────────────────────────
  it('zeroes bonusAmount and resets maturityValue to totalPaidAmount on cancel', async () => {
    const paidScheme = {
      ...CREATED_SCHEME,
      totalPaidAmount: 15000,
      bonusAmount: 5000,
      maturityValue: 60000,
    };
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(paidScheme);
    mockPrisma.savingsScheme.update.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});

    const res = await request(app).delete('/api/savings-scheme/1');
    expect(res.status).toBe(200);

    expect(mockPrisma.savingsScheme.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELLED',
          bonusAmount: 0,
          maturityValue: 15000,
        }),
      }),
    );

    // And only the paid-in amount (no bonus) is credited back.
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          closingBalance: { decrement: 15000 },
        }),
      }),
    );
  });
});

// ============================================================
// Read-path normalization for already-cancelled schemes
// (existing data fix — see GET handlers in savingsScheme.ts)
// ============================================================
describe('cancelled scheme normalization on read', () => {
  const cancelledStale = {
    ...CREATED_SCHEME,
    status: 'CANCELLED',
    totalPaidAmount: 15000,
    bonusAmount: 5000,   // legacy value still sitting in DB
    maturityValue: 60000, // legacy value still sitting in DB
    installments: [],
  };

  it('GET /:id strips bonus and resets maturity for a CANCELLED scheme', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue(cancelledStale);

    const res = await request(app).get('/api/savings-scheme/1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(Number(res.body.bonusAmount)).toBe(0);
    expect(Number(res.body.maturityValue)).toBe(15000);
  });

  it('GET / strips bonus on every CANCELLED row and defers bonus on ACTIVE rows', async () => {
    mockPrisma.savingsScheme.findMany.mockResolvedValue([
      cancelledStale,
      { ...CREATED_SCHEME, id: 2, status: 'ACTIVE', bonusAmount: 5000, maturityValue: 60000, totalPaidAmount: 5000 },
      { ...CREATED_SCHEME, id: 3, status: 'MATURED', bonusAmount: 5000, maturityValue: 60000, totalPaidAmount: 55000 },
    ]);

    const res = await request(app).get('/api/savings-scheme');
    expect(res.status).toBe(200);
    expect(res.body.schemes).toHaveLength(3);

    const cancelled = res.body.schemes.find((s: any) => s.status === 'CANCELLED');
    expect(Number(cancelled.bonusAmount)).toBe(0);
    expect(Number(cancelled.maturityValue)).toBe(15000);

    // ACTIVE schemes keep bonusAmount intact (it's the *projected*
    // bonus the customer will earn) but maturityValue is normalised
    // down to totalPaidAmount until the scheme actually matures.
    const active = res.body.schemes.find((s: any) => s.status === 'ACTIVE');
    expect(Number(active.bonusAmount)).toBe(5000);
    expect(Number(active.maturityValue)).toBe(5000);

    // MATURED schemes are left alone — the bonus is now realised.
    const matured = res.body.schemes.find((s: any) => s.status === 'MATURED');
    expect(Number(matured.bonusAmount)).toBe(5000);
    expect(Number(matured.maturityValue)).toBe(60000);

    // totalMaturityValue sums the normalised values: 15000 + 5000 + 60000.
    expect(res.body.totalMaturityValue).toBe(80000);
  });

  it('GET /:id defers the bonus for an ACTIVE legacy row (maturityValue collapses to totalPaidAmount)', async () => {
    mockPrisma.savingsScheme.findFirst.mockResolvedValue({
      ...CREATED_SCHEME,
      status: 'ACTIVE',
      totalPaidAmount: 21000,
      bonusAmount: 5000,
      maturityValue: 60000, // legacy projected value
      installments: [],
    });

    const res = await request(app).get('/api/savings-scheme/1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
    expect(Number(res.body.bonusAmount)).toBe(5000);
    expect(Number(res.body.maturityValue)).toBe(21000);
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
