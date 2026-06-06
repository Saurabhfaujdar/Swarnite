/**
 * Karigers — integration tests
 *
 * Covers the master + ledger surface:
 *  - List + filtering
 *  - Auto-generated K001 code
 *  - Duplicate-code conflict
 *  - Ledger queries scoped to caller's company
 *  - Payment posts a CREDIT (decreasing balance owed)
 */
import request from 'supertest';

import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({ prisma: mockPrisma }));

const authState = {
  userId: 1, userRole: 'ADMIN', companyId: 1,
  branchId: 1, branchScope: [] as number[], isMasterBranch: true,
};
jest.mock('../../server/middleware/branchAccess', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    Object.assign(req, authState);
    next();
  },
  requireBranch: (_r: any, _s: any, n: any) => n(),
  requireMaster: (_r: any, _s: any, n: any) => n(),
  requireAdmin: (_r: any, _s: any, n: any) => n(),
  branchWhere: () => ({}),
  tenantScope: () => ({ companyId: 1 }),
  canAccessBranch: () => true,
  canOverrideBranch: async () => true,
}));

import app from '../../server/app';

const KARIGER = {
  id: 50, code: 'K001', name: 'Ramesh', companyId: 1,
  isActive: true, metalBalance: 0, moneyBalance: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/karigers', () => {
  it('returns list', async () => {
    mockPrisma.kariger.findMany.mockResolvedValueOnce([KARIGER]);
    const res = await request(app).get('/api/karigers');
    expect(res.status).toBe(200);
    expect(res.body.karigers).toHaveLength(1);
    const where = mockPrisma.kariger.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(1);
  });

  it('applies active=true filter', async () => {
    mockPrisma.kariger.findMany.mockResolvedValueOnce([]);
    await request(app).get('/api/karigers?active=true');
    const where = mockPrisma.kariger.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
  });

  it('applies search filter', async () => {
    mockPrisma.kariger.findMany.mockResolvedValueOnce([]);
    await request(app).get('/api/karigers?search=Ram');
    const where = mockPrisma.kariger.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.objectContaining({ contains: 'Ram' }) }),
    ]));
  });
});

describe('POST /api/karigers', () => {
  it('400 when name missing', async () => {
    const res = await request(app).post('/api/karigers').send({});
    expect(res.status).toBe(400);
  });

  it('auto-generates K00N code when not supplied', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({ isMaster: true });
    mockPrisma.kariger.count.mockResolvedValueOnce(4);
    mockPrisma.kariger.create.mockImplementationOnce(({ data }: any) =>
      Promise.resolve({ id: 1, ...data }),
    );
    const res = await request(app).post('/api/karigers').send({ name: 'Naya' });
    expect(res.status).toBe(201);
    expect(res.body.kariger.code).toBe('K005');
  });

  it('translates P2002 to a 400 with friendly error', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({ isMaster: true });
    mockPrisma.kariger.count.mockResolvedValueOnce(0);
    mockPrisma.kariger.create.mockRejectedValueOnce({ code: 'P2002' });
    const res = await request(app).post('/api/karigers').send({ name: 'X', code: 'K001' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('saves address fields (city, state, pincode, landmark)', async () => {
    mockPrisma.kariger.count.mockResolvedValueOnce(5);
    mockPrisma.branch.findUnique.mockResolvedValueOnce({ isMaster: true });
    mockPrisma.kariger.create.mockImplementationOnce(({ data }: any) =>
      Promise.resolve({ id: 10, ...data }),
    );
    const payload = {
      name: 'Address Karigar',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302001',
      landmark: 'Near Temple',
    };
    const res = await request(app).post('/api/karigers').send(payload);
    expect(res.status).toBe(201);
    const createData = mockPrisma.kariger.create.mock.calls[0][0].data;
    expect(createData.city).toBe('Jaipur');
    expect(createData.state).toBe('Rajasthan');
    expect(createData.pincode).toBe('302001');
    expect(createData.landmark).toBe('Near Temple');
  });
});

describe('GET /api/karigers/:id', () => {
  it('404 when not found in caller company', async () => {
    mockPrisma.kariger.findFirst.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/karigers/99');
    expect(res.status).toBe(404);
    const where = mockPrisma.kariger.findFirst.mock.calls[0][0].where;
    expect(where.companyId).toBe(1);
  });
});

describe('GET /api/karigers/:id/metal-ledger', () => {
  it('returns balance + entries', async () => {
    mockPrisma.kariger.findFirst.mockResolvedValueOnce({ ...KARIGER, metalBalance: 12.5 });
    mockPrisma.karigerMetalLedger.findMany.mockResolvedValueOnce([
      { id: 1, weight: 5, balanceAfterTransaction: 5 },
      { id: 2, weight: 7.5, balanceAfterTransaction: 12.5 },
    ]);
    const res = await request(app).get('/api/karigers/50/metal-ledger');
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(12.5);
    expect(res.body.entries).toHaveLength(2);
  });
});

describe('POST /api/karigers/:id/payment', () => {
  it('400 when amount <= 0', async () => {
    const res = await request(app).post('/api/karigers/50/payment').send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  it('404 when kariger not in caller company', async () => {
    mockPrisma.kariger.findFirst.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/karigers/50/payment').send({ amount: 100 });
    expect(res.status).toBe(404);
  });

  it('posts a CREDIT (PAYMENT_MADE) reducing the balance owed', async () => {
    mockPrisma.kariger.findFirst.mockResolvedValueOnce({ ...KARIGER, moneyBalance: 1000 });
    mockPrisma.kariger.findUnique.mockResolvedValue({ moneyBalance: 1000, metalBalance: 0 });
    mockPrisma.karigerMoneyLedger.create.mockImplementationOnce(({ data }: any) =>
      Promise.resolve({ id: 1, ...data }),
    );
    const res = await request(app).post('/api/karigers/50/payment')
      .send({ amount: 600, remarks: 'Weekly settlement' });
    expect(res.status).toBe(201);
    expect(mockPrisma.karigerMoneyLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          karigerId: 50, entryType: 'PAYMENT_MADE',
          credit: 600, debit: 0,
          balanceAfterTransaction: 400,
        }),
      }),
    );
    expect(mockPrisma.kariger.update).toHaveBeenCalledWith({
      where: { id: 50 }, data: { moneyBalance: 400 },
    });
  });
});

describe('PUT /api/karigers/:id (address fields)', () => {
  it('updates address fields (city, state, pincode, landmark)', async () => {
    mockPrisma.kariger.findFirst.mockResolvedValueOnce({ ...KARIGER });
    // Mock branch check (isMaster = true)
    mockPrisma.branch.findUnique.mockResolvedValueOnce({ isMaster: true });
    mockPrisma.kariger.update.mockImplementationOnce(({ data }: any) =>
      Promise.resolve({ ...KARIGER, ...data }),
    );

    const res = await request(app).put('/api/karigers/50').send({
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      landmark: 'Near Metro',
    });

    expect(res.status).toBe(200);
    const updateData = mockPrisma.kariger.update.mock.calls[0][0].data;
    expect(updateData.city).toBe('Delhi');
    expect(updateData.state).toBe('Delhi');
    expect(updateData.pincode).toBe('110001');
    expect(updateData.landmark).toBe('Near Metro');
  });
});
