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
const DUMMY_ACCOUNTS = [
  {
    id: 1, name: 'Rajesh Kumar', type: 'CUSTOMER',
    mobile: '9876543210', gstin: null,
    address: 'Mumbai', closingBalance: 15000, balanceType: 'DR',
    isActive: true,
  },
  {
    id: 2, name: 'Gold Suppliers Inc', type: 'SUPPLIER',
    mobile: '9876543211', gstin: '27AABCG1234H1Z5',
    address: 'Ahmedabad', closingBalance: 250000, balanceType: 'CR',
    isActive: true,
  },
  {
    id: 3, name: 'Priya Jewellers', type: 'CUSTOMER',
    mobile: '9876543212', gstin: '29AABCP1234E1Z3',
    address: 'Bengaluru', closingBalance: 0, balanceType: 'DR',
    isActive: true,
  },
];

const DUMMY_SALES = [
  {
    id: 1, voucherNo: 'SV-2024-001', voucherDate: '2024-12-20',
    voucherAmount: 150000, paymentAmount: 100000, dueAmount: 50000,
  },
];

const DUMMY_PURCHASES = [
  {
    id: 1, voucherNo: 'PV-2024-001', voucherDate: '2024-12-18',
    totalAmount: 500000, finalAmount: 515000,
  },
];

const DUMMY_CASH_ENTRIES = [
  {
    id: 1, amount: 50000, accountId: 1, type: 'RECEIPT',
    cashEntry: { voucherNo: 'CE-2024-001', voucherDate: '2024-12-22' },
  },
];

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// GET /api/accounts – List Accounts
// ════════════════════════════════════════════════════════════
describe('GET /api/accounts', () => {
  it('returns paginated list of accounts', async () => {
    mockPrisma.account.findMany.mockResolvedValueOnce(DUMMY_ACCOUNTS);
    mockPrisma.account.count.mockResolvedValueOnce(3);

    const res = await request(app).get('/api/accounts');
    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(3);
    expect(res.body.total).toBe(3);
  });

  it('filters by account type', async () => {
    mockPrisma.account.findMany.mockResolvedValueOnce(
      DUMMY_ACCOUNTS.filter((a) => a.type === 'CUSTOMER'),
    );
    mockPrisma.account.count.mockResolvedValueOnce(2);

    const res = await request(app).get('/api/accounts?type=CUSTOMER');
    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(2);
    expect(mockPrisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'CUSTOMER' }),
      }),
    );
  });

  it('searches by name', async () => {
    mockPrisma.account.findMany.mockResolvedValueOnce([DUMMY_ACCOUNTS[0]]);
    mockPrisma.account.count.mockResolvedValueOnce(1);

    const res = await request(app).get('/api/accounts?search=Rajesh');
    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.accounts[0]).toMatchObject({ name: 'Rajesh Kumar' });
  });

  it('paginates correctly', async () => {
    mockPrisma.account.findMany.mockResolvedValueOnce([]);
    mockPrisma.account.count.mockResolvedValueOnce(3);

    const res = await request(app).get('/api/accounts?page=2&limit=2');
    expect(res.status).toBe(200);
    expect(mockPrisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 2,  // (page-1) * limit = (2-1)*2
        take: 2,
      }),
    );
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/accounts/:id – Get Account by ID
// ════════════════════════════════════════════════════════════
describe('GET /api/accounts/:id', () => {
  it('returns account by id', async () => {
    mockPrisma.account.findFirst.mockResolvedValueOnce(DUMMY_ACCOUNTS[0]);

    const res = await request(app).get('/api/accounts/1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: 'Rajesh Kumar' });
  });

  it('returns 404 when account not found', async () => {
    mockPrisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/accounts/999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Account not found' });
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/accounts – Create Account
// ════════════════════════════════════════════════════════════
describe('POST /api/accounts', () => {
  it('creates a new account', async () => {
    const newAccount = {
      id: 4, name: 'Sita Devi', type: 'CUSTOMER',
      mobile: '9876543213', address: 'Jaipur', isActive: true,
    };
    mockPrisma.account.create.mockResolvedValueOnce(newAccount);

    const res = await request(app)
      .post('/api/accounts')
      .send({ name: 'Sita Devi', type: 'CUSTOMER', mobile: '9876543213', address: 'Jaipur' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Sita Devi' });
  });
});

// ════════════════════════════════════════════════════════════
// PUT /api/accounts/:id – Update Account
// ════════════════════════════════════════════════════════════
describe('PUT /api/accounts/:id', () => {
  it('updates an account', async () => {
    const updated = { ...DUMMY_ACCOUNTS[0], mobile: '1111111111' };
    mockPrisma.account.findFirst.mockResolvedValueOnce(DUMMY_ACCOUNTS[0]);
    mockPrisma.account.update.mockResolvedValueOnce(updated);

    const res = await request(app)
      .put('/api/accounts/1')
      .send({ mobile: '1111111111' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mobile: '1111111111' });
  });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/accounts/:id – Soft-delete Account
// ════════════════════════════════════════════════════════════
describe('DELETE /api/accounts/:id', () => {
  it('soft-deletes (deactivates) an account', async () => {
    mockPrisma.account.findFirst.mockResolvedValueOnce(DUMMY_ACCOUNTS[2]);
    mockPrisma.account.update.mockResolvedValueOnce({ ...DUMMY_ACCOUNTS[2], isActive: false });

    const res = await request(app).delete('/api/accounts/3');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Account deactivated' });
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 3 },
        data: { isActive: false },
      }),
    );
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/accounts/:id/ledger – Account Ledger
// ════════════════════════════════════════════════════════════
describe('GET /api/accounts/:id/ledger', () => {
  it('returns ledger with sales, purchases, and cash entries', async () => {
    mockPrisma.salesVoucher.findMany.mockResolvedValueOnce(DUMMY_SALES);
    mockPrisma.purchaseVoucher.findMany.mockResolvedValueOnce(DUMMY_PURCHASES);
    mockPrisma.cashEntryLine.findMany.mockResolvedValueOnce(DUMMY_CASH_ENTRIES);

    const res = await request(app).get('/api/accounts/1/ledger');
    expect(res.status).toBe(200);
    expect(res.body.sales).toHaveLength(1);
    expect(res.body.purchases).toHaveLength(1);
    expect(res.body.cashEntries).toHaveLength(1);
  });

  it('returns empty arrays when no transactions', async () => {
    mockPrisma.salesVoucher.findMany.mockResolvedValueOnce([]);
    mockPrisma.purchaseVoucher.findMany.mockResolvedValueOnce([]);
    mockPrisma.cashEntryLine.findMany.mockResolvedValueOnce([]);
    mockPrisma.customerPayment.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/accounts/1/ledger');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sales: [], purchases: [], cashEntries: [], customerPayments: [] });
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/accounts/:id/outstanding – Outstanding Balance
// ════════════════════════════════════════════════════════════
describe('GET /api/accounts/:id/outstanding', () => {
  it('returns outstanding balance info', async () => {
    mockPrisma.account.findFirst.mockResolvedValueOnce({
      name: 'Rajesh Kumar',
      closingBalance: 15000,
      balanceType: 'DR',
    });

    const res = await request(app).get('/api/accounts/1/outstanding');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ closingBalance: 15000, balanceType: 'DR' });
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/accounts/:id/history – Customer Transaction History
// ════════════════════════════════════════════════════════════
const HISTORY_SALES = [
  {
    id: 1, voucherNo: 'JGI/1001', voucherDate: '2025-01-15',
    totalGrossWeight: 25.5, totalNetWeight: 24, totalPcs: 3,
    metalAmount: 150000, labourAmount: 5000, voucherAmount: 165000,
    paymentAmount: 100000, dueAmount: 65000,
    cashAmount: 50000, bankAmount: 50000, cardAmount: 0, upiAmount: 0,
    status: 'ACTIVE',
    salesman: { name: 'Ramesh' },
    items: [
      { id: 1, labelNo: 'LBL001', itemName: 'Gold Necklace', grossWeight: 15, netWeight: 14.5, pcs: 1, metalRate: 6950, metalAmount: 100750, labourAmount: 3000, totalAmount: 103750 },
    ],
  },
];

const HISTORY_OG_PURCHASES = [
  {
    id: 10, voucherNo: 'OG/501', voucherDate: '2025-01-15',
    totalGrossWeight: 8, totalNetWeight: 7.5, totalFineWeight: 6.87,
    totalPcs: 2, metalRate: 6800, metalAmount: 46716,
    totalAmount: 46716, finalAmount: 46716,
    items: [{ id: 20, styleName: 'Old Chain', weight: 5, pcs: 1, rate: 6800, amount: 30940 }],
  },
];

const HISTORY_LAYAWAYS = [
  {
    id: 100, voucherNo: 'LY/201', voucherDate: '2025-03-01',
    totalGrossWeight: 12, totalNetWeight: 11.5, totalPcs: 2,
    metalAmount: 79925, labourAmount: 3000, voucherAmount: 88000,
    paymentAmount: 30000, dueAmount: 58000, status: 'ACTIVE',
  },
];

describe('GET /api/accounts/:id/history', () => {
  it('returns sales, old gold purchases, layaways, and summary', async () => {
    mockPrisma.salesVoucher.findMany.mockResolvedValueOnce(HISTORY_SALES);
    mockPrisma.purchaseVoucher.findMany.mockResolvedValueOnce(HISTORY_OG_PURCHASES);
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce(HISTORY_LAYAWAYS);

    const res = await request(app).get('/api/accounts/1/history');
    expect(res.status).toBe(200);
    expect(res.body.sales).toHaveLength(1);
    expect(res.body.oldGoldPurchases).toHaveLength(1);
    expect(res.body.layaways).toHaveLength(1);
    expect(res.body.summary).toMatchObject({
      totalSalesCount: 1,
      totalSalesAmount: 165000,
      totalOGPurchaseCount: 1,
      totalOGPurchaseAmount: 46716,
      totalLayawayCount: 1,
    });
  });

  it('returns empty arrays and zero summary when no history', async () => {
    mockPrisma.salesVoucher.findMany.mockResolvedValueOnce([]);
    mockPrisma.purchaseVoucher.findMany.mockResolvedValueOnce([]);
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/accounts/1/history');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sales: [],
      oldGoldPurchases: [],
      layaways: [],
      summary: {
        totalSalesCount: 0,
        totalSalesAmount: 0,
        totalOGPurchaseCount: 0,
        totalOGPurchaseAmount: 0,
        totalLayawayCount: 0,
      },
    });
  });

  it('includes salesman and items in sales', async () => {
    mockPrisma.salesVoucher.findMany.mockResolvedValueOnce(HISTORY_SALES);
    mockPrisma.purchaseVoucher.findMany.mockResolvedValueOnce([]);
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/accounts/1/history');
    expect(res.body.sales[0].salesman).toMatchObject({ name: 'Ramesh' });
    expect(res.body.sales[0].items[0]).toMatchObject({ labelNo: 'LBL001', itemName: 'Gold Necklace' });
  });

  it('accepts date filter params', async () => {
    mockPrisma.salesVoucher.findMany.mockResolvedValueOnce([]);
    mockPrisma.purchaseVoucher.findMany.mockResolvedValueOnce([]);
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/accounts/1/history?dateFrom=2025-01-01&dateTo=2025-12-31');
    expect(res.status).toBe(200);

    // Check that findMany was called with date filters
    const salesCall = mockPrisma.salesVoucher.findMany.mock.calls[0][0];
    expect(salesCall.where.voucherDate).toBeDefined();
    expect(salesCall.where.voucherDate.gte).toBeInstanceOf(Date);
    expect(salesCall.where.voucherDate.lte).toBeInstanceOf(Date);
  });

  it('returns 500 when DB fails', async () => {
    mockPrisma.salesVoucher.findMany.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app).get('/api/accounts/1/history');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch customer history');
  });
});
