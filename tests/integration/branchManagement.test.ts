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
const COMPANY = { id: 1, name: 'Swarnite Jewellers' };
const MASTER_BRANCH = {
  id: 1, name: 'Main Store', code: 'MAIN', branchType: 'MASTER',
  isMaster: true, parentId: null, isActive: true, isDeleted: false,
  companyId: 1, company: COMPANY, city: 'Mumbai', state: 'MH',
  address: '123 Gold Lane', phone: '9876543210', email: 'main@swarnite.com',
  gstin: '27AAPCS1234A1Z1', pincode: '400001',
};
const CHILD_BRANCH = {
  id: 2, name: 'Branch Store 1', code: 'BR01', branchType: 'BRANCH',
  isMaster: false, parentId: 1, isActive: true, isDeleted: false,
  companyId: 1, company: COMPANY, city: 'Pune', state: 'MH',
  address: '456 Silver Road', phone: '9876543211', email: 'pune@swarnite.com',
  gstin: '27AAPCS5678B2Z2', pincode: '411001',
  parent: { id: 1, name: 'Main Store', code: 'MAIN' },
};
const CHILD_BRANCH_2 = {
  id: 3, name: 'Branch Store 2', code: 'BR02', branchType: 'BRANCH',
  isMaster: false, parentId: 1, isActive: true, isDeleted: false,
  companyId: 1, company: COMPANY, city: 'Nashik', state: 'MH',
  parent: { id: 1, name: 'Main Store', code: 'MAIN' },
};
const DISABLED_BRANCH = {
  id: 4, name: 'Closed Branch', code: 'BR03', branchType: 'BRANCH',
  isMaster: false, parentId: 1, isActive: false, isDeleted: false,
  companyId: 1,
};
const DELETED_BRANCH = {
  id: 5, name: 'Deleted Branch', code: 'BRDEL', branchType: 'BRANCH',
  isMaster: false, parentId: 1, isActive: false, isDeleted: true,
  deletedAt: new Date(), deletedBy: 1, companyId: 1,
};

const LABEL_1 = { id: 1, labelNo: 'GN/001', branchId: 1, status: 'IN_STOCK', itemName: 'Gold Necklace' };
const LABEL_2 = { id: 2, labelNo: 'GN/002', branchId: 1, status: 'IN_STOCK', itemName: 'Gold Ring' };
const LABEL_SOLD = { id: 3, labelNo: 'GN/003', branchId: 1, status: 'SOLD', itemName: 'Gold Bangle' };

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// LIST BRANCHES — GET /api/branches
// ════════════════════════════════════════════════════════════
describe('GET /api/branches', () => {
  it('returns all branches ordered master-first', async () => {
    mockPrisma.branch.findMany.mockResolvedValueOnce([
      { ...MASTER_BRANCH, _count: { children: 2, users: 3, labels: 50, salesVouchers: 10 } },
      { ...CHILD_BRANCH, _count: { children: 0, users: 1, labels: 20, salesVouchers: 5 } },
    ]);

    const res = await request(app).get('/api/branches');

    expect(res.status).toBe(200);
    expect(res.body.branches).toHaveLength(2);
    expect(res.body.branches[0].isMaster).toBe(true);
    expect(res.body.branches[1].code).toBe('BR01');
    expect(res.body.total).toBe(2);
  });

  it('filters by search query', async () => {
    mockPrisma.branch.findMany.mockResolvedValueOnce([CHILD_BRANCH]);

    const res = await request(app).get('/api/branches?search=Pune');

    expect(res.status).toBe(200);
    expect(mockPrisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ city: expect.objectContaining({ contains: 'Pune' }) }),
          ]),
        }),
      })
    );
  });

  it('includes deleted branches when requested', async () => {
    mockPrisma.branch.findMany.mockResolvedValueOnce([MASTER_BRANCH, DELETED_BRANCH]);

    const res = await request(app).get('/api/branches?includeDeleted=true');

    expect(res.status).toBe(200);
    // Should NOT set isDeleted: false in where clause
    const callArgs = mockPrisma.branch.findMany.mock.calls[0][0];
    expect(callArgs.where.isDeleted).toBeUndefined();
  });

  it('uses req.companyId for branch creation instead of client-sent companyId', async () => {
    mockPrisma.branch.findFirst.mockResolvedValueOnce(null); // no duplicate
    mockPrisma.branch.count.mockResolvedValueOnce(0); // first branch
    mockPrisma.branch.create.mockResolvedValueOnce(MASTER_BRANCH);
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Main Store', code: 'MAIN' }); // no companyId in body

    expect(res.status).toBe(201);
    // Should use req.companyId (=1 from mock middleware), not body
    expect(mockPrisma.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 1,
        }),
      })
    );
  });

  it('does NOT apply branchId scope filter for master branch users', async () => {
    // Master user should see ALL company branches (regression test for hierarchy bug)
    mockPrisma.branch.findMany.mockResolvedValueOnce([MASTER_BRANCH, CHILD_BRANCH]);

    const res = await request(app).get('/api/branches');

    expect(res.status).toBe(200);
    const callArgs = mockPrisma.branch.findMany.mock.calls[0][0];
    // Where clause should NOT restrict by branchId for master users
    expect(callArgs.where.branchId).toBeUndefined();
    expect(callArgs.where.id).toBeUndefined();
    // But MUST be scoped by companyId for tenant isolation
    expect(callArgs.where.companyId).toBe(1);
  });

  // ── Legacy data: no row has isMaster=true (prod regression) ──
  // The 20260423 branch-fix migration back-fills isMaster + parentId.
  // If it hasn't run, every row comes back with isMaster=false. The
  // API must still return the rows (the frontend has a parentId
  // fallback) and the response must include parentId so the client
  // can identify the natural root.
  it('returns legacy rows missing isMaster=true verbatim with parentId preserved', async () => {
    const LEGACY_HQ = {
      ...MASTER_BRANCH,
      isMaster: false,
      branchType: 'BRANCH',
      parentId: null,
      _count: { children: 0, users: 2, labels: 11, salesVouchers: 8 },
    };
    mockPrisma.branch.findMany.mockResolvedValueOnce([LEGACY_HQ]);

    const res = await request(app).get('/api/branches');

    expect(res.status).toBe(200);
    expect(res.body.branches).toHaveLength(1);
    const row = res.body.branches[0];
    // Mirror the production payload shape so the UI fallback can fire:
    expect(row.isMaster).toBe(false);
    expect(row.parentId).toBeNull();
    // The API must keep returning a deterministic ordering so the
    // client-side `branches[0]` last-resort fallback is stable.
    const callArgs = mockPrisma.branch.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual(
      expect.arrayContaining([{ isMaster: 'desc' }, { name: 'asc' }]),
    );
  });
});

// ════════════════════════════════════════════════════════════
// GET BRANCH DETAILS — GET /api/branches/:id
// ════════════════════════════════════════════════════════════
describe('GET /api/branches/:id', () => {
  it('returns branch with children and counts', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({
      ...MASTER_BRANCH,
      children: [
        { id: 2, name: 'Branch Store 1', code: 'BR01', isActive: true, city: 'Pune', branchType: 'BRANCH' },
      ],
      _count: { users: 3, labels: 50, salesVouchers: 10, purchaseVouchers: 5, cashEntries: 8, counters: 2, staff: 4 },
    });

    const res = await request(app).get('/api/branches/1');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Main Store');
    expect(res.body.children).toHaveLength(1);
  });

  it('returns 404 for non-existent branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/branches/999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Branch not found');
  });
});

// ════════════════════════════════════════════════════════════
// GET CHILD BRANCHES — GET /api/branches/:id/children
// ════════════════════════════════════════════════════════════
describe('GET /api/branches/:id/children', () => {
  it('returns child branches of a parent', async () => {
    mockPrisma.branch.findMany.mockResolvedValueOnce([
      { ...CHILD_BRANCH, _count: { users: 1, labels: 20, salesVouchers: 5 } },
      { ...CHILD_BRANCH_2, _count: { users: 0, labels: 10, salesVouchers: 2 } },
    ]);

    const res = await request(app).get('/api/branches/1/children');

    expect(res.status).toBe(200);
    expect(res.body.children).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════
// BRANCH STATS — GET /api/branches/:id/stats
// ════════════════════════════════════════════════════════════
describe('GET /api/branches/:id/stats', () => {
  it('returns inventory, sales, users, and transfer counts', async () => {
    mockPrisma.label.count
      .mockResolvedValueOnce(50)   // total labels
      .mockResolvedValueOnce(30)   // in-stock
      .mockResolvedValueOnce(15);  // sold
    mockPrisma.salesVoucher.count.mockResolvedValueOnce(10);
    mockPrisma.purchaseVoucher.count.mockResolvedValueOnce(3);
    mockPrisma.user.count.mockResolvedValueOnce(4);
    mockPrisma.branchTransfer.count
      .mockResolvedValueOnce(2)    // outgoing
      .mockResolvedValueOnce(1);   // incoming

    const res = await request(app).get('/api/branches/1/stats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      branchId: 1,
      inventory: { total: 50, inStock: 30, sold: 15 },
      sales: 10,
      purchases: 3,
      users: 4,
      transfers: { outgoing: 2, incoming: 1 },
    });
  });
});

// ════════════════════════════════════════════════════════════
// CREATE BRANCH — POST /api/branches
// ════════════════════════════════════════════════════════════
describe('POST /api/branches', () => {
  it('creates the first branch as master automatically', async () => {
    mockPrisma.branch.findFirst.mockResolvedValueOnce(null);  // no duplicate code (findFirst)
    mockPrisma.branch.count.mockResolvedValueOnce(0);          // no existing branches = auto master
    mockPrisma.branch.create.mockResolvedValueOnce({
      ...MASTER_BRANCH,
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Main Store', code: 'MAIN' });

    expect(res.status).toBe(201);
    expect(mockPrisma.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isMaster: true,
          branchType: 'MASTER',
          parentId: null,
        }),
      })
    );
  });

  it('creates a child branch under the master', async () => {
    mockPrisma.branch.findFirst
      .mockResolvedValueOnce(null)     // no duplicate code (findFirst)
      .mockResolvedValueOnce({ id: 1, isMaster: true }); // auto-find master
    mockPrisma.branch.count.mockResolvedValueOnce(1);          // existing branches = child
    mockPrisma.branch.create.mockResolvedValueOnce(CHILD_BRANCH);
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Branch Store 1', code: 'BR01', city: 'Pune' });

    expect(res.status).toBe(201);
    expect(mockPrisma.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isMaster: false,
          branchType: 'BRANCH',
        }),
      })
    );
  });

  it('rejects duplicate branch code', async () => {
    mockPrisma.branch.findFirst.mockResolvedValueOnce(CHILD_BRANCH); // code exists (findFirst)

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Another Branch', code: 'BR01' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Incomplete' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('validates parentId must be a master branch', async () => {
    mockPrisma.branch.findFirst.mockResolvedValueOnce(null); // no duplicate code (findFirst)
    mockPrisma.branch.count.mockResolvedValueOnce(2); // existing branches
    mockPrisma.branch.findUnique.mockResolvedValueOnce(CHILD_BRANCH); // parentId points to a child branch

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'New Branch', code: 'NEW1', parentId: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('master branch');
  });
});

// ════════════════════════════════════════════════════════════
// UPDATE BRANCH — PUT /api/branches/:id
// ════════════════════════════════════════════════════════════
describe('PUT /api/branches/:id', () => {
  it('updates branch details and creates audit log', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(CHILD_BRANCH);
    mockPrisma.branch.update.mockResolvedValueOnce({
      ...CHILD_BRANCH,
      name: 'Updated Branch',
      city: 'Nagpur',
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .put('/api/branches/2')
      .send({ name: 'Updated Branch', city: 'Nagpur' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Branch');
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('returns 404 for non-existent branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .put('/api/branches/999')
      .send({ name: 'No Such Branch' });

    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════
// DISABLE BRANCH — PUT /api/branches/:id/disable
// ════════════════════════════════════════════════════════════
describe('PUT /api/branches/:id/disable', () => {
  it('disables an active child branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(CHILD_BRANCH);
    mockPrisma.branch.update.mockResolvedValueOnce({ ...CHILD_BRANCH, isActive: false });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app).put('/api/branches/2/disable');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Branch disabled');
    expect(mockPrisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false },
      })
    );
  });

  it('blocks disabling the master branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(MASTER_BRANCH);

    const res = await request(app).put('/api/branches/1/disable');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('master branch');
  });

  it('returns error if already disabled', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(DISABLED_BRANCH);

    const res = await request(app).put('/api/branches/4/disable');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already disabled');
  });
});

// ════════════════════════════════════════════════════════════
// ENABLE BRANCH — PUT /api/branches/:id/enable
// ════════════════════════════════════════════════════════════
describe('PUT /api/branches/:id/enable', () => {
  it('enables a disabled branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(DISABLED_BRANCH);
    mockPrisma.branch.update.mockResolvedValueOnce({ ...DISABLED_BRANCH, isActive: true });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app).put('/api/branches/4/enable');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Branch enabled');
  });

  it('returns error if already active', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(CHILD_BRANCH);

    const res = await request(app).put('/api/branches/2/enable');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already active');
  });
});

// ════════════════════════════════════════════════════════════
// SOFT-DELETE BRANCH — DELETE /api/branches/:id
// ════════════════════════════════════════════════════════════
describe('DELETE /api/branches/:id (soft-delete)', () => {
  it('soft-deletes a branch with no active data', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({
      ...CHILD_BRANCH,
      _count: { labels: 0, salesVouchers: 0, users: 0 },
    });
    mockPrisma.branch.update.mockResolvedValueOnce({
      ...CHILD_BRANCH,
      isDeleted: true,
      isActive: false,
      deletedAt: new Date(),
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app).delete('/api/branches/2');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Branch soft-deleted');
  });

  it('blocks deletion of master branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({
      ...MASTER_BRANCH,
      _count: { labels: 0, salesVouchers: 0, users: 0 },
    });

    const res = await request(app).delete('/api/branches/1');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('master branch');
  });

  it('blocks deletion when branch has in-stock labels', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({
      ...CHILD_BRANCH,
      _count: { labels: 15, salesVouchers: 0, users: 0 },
    });

    const res = await request(app).delete('/api/branches/2');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('active data');
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0]).toContain('in-stock');
  });

  it('blocks deletion when branch has active sales & users', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({
      ...CHILD_BRANCH,
      _count: { labels: 0, salesVouchers: 3, users: 2 },
    });

    const res = await request(app).delete('/api/branches/2');

    expect(res.status).toBe(400);
    expect(res.body.issues).toHaveLength(2);
  });

  it('blocks deletion of already-deleted branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({
      ...DELETED_BRANCH,
      _count: { labels: 0, salesVouchers: 0, users: 0 },
    });

    const res = await request(app).delete('/api/branches/5');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already deleted');
  });
});

// ════════════════════════════════════════════════════════════
// PERMANENT DELETE — DELETE /api/branches/:id/permanent
// ════════════════════════════════════════════════════════════
describe('DELETE /api/branches/:id/permanent', () => {
  it('permanently deletes a branch with zero data', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({
      ...CHILD_BRANCH,
      _count: { labels: 0, salesVouchers: 0, purchaseVouchers: 0, cashEntries: 0, users: 0, counters: 0 },
    });
    mockPrisma.branch.delete.mockResolvedValueOnce({});
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app).delete('/api/branches/2/permanent');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Branch permanently deleted');
  });

  it('blocks permanent delete when branch has data', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({
      ...CHILD_BRANCH,
      _count: { labels: 5, salesVouchers: 2, purchaseVouchers: 1, cashEntries: 0, users: 1, counters: 0 },
    });

    const res = await request(app).delete('/api/branches/2/permanent');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('existing data');
  });

  it('blocks permanent delete of master branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce({
      ...MASTER_BRANCH,
      _count: { labels: 0, salesVouchers: 0, purchaseVouchers: 0, cashEntries: 0, users: 0, counters: 0 },
    });

    const res = await request(app).delete('/api/branches/1/permanent');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('master branch');
  });
});

// ════════════════════════════════════════════════════════════
// INVENTORY TRANSFER — POST /api/branches/transfer
// ════════════════════════════════════════════════════════════
describe('POST /api/branches/transfer', () => {
  const transferPayload = {
    fromBranchId: 1,
    toBranchId: 2,
    voucherDate: '2025-07-14',
    items: [
      { labelId: 1, itemName: 'Gold Necklace', grossWeight: 25.5, pcs: 1, totalAmount: 125000 },
      { labelId: 2, itemName: 'Gold Ring', grossWeight: 8.0, pcs: 1, totalAmount: 35000 },
    ],
    totalAmount: 160000,
    totalGrossWeight: 33.5,
  };

  it('creates an atomic inventory transfer', async () => {
    mockPrisma.branch.findUnique
      .mockResolvedValueOnce({ id: 1, name: 'Main Store', isActive: true, isDeleted: false })
      .mockResolvedValueOnce({ id: 2, name: 'Branch Store 1', isActive: true, isDeleted: false });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => {
      const tx = {
        voucherSequence: { upsert: jest.fn().mockResolvedValue({ lastNumber: 1 }) },
        label: {
          findMany: jest.fn().mockResolvedValue([LABEL_1, LABEL_2]),
          update: jest.fn().mockResolvedValue({}),
        },
        branchTransfer: { create: jest.fn().mockResolvedValue({ id: 100 }) },
        branchTransferItem: { create: jest.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});
    mockPrisma.branchTransfer.findUnique.mockResolvedValueOnce({
      id: 100,
      voucherNo: 'BT/1',
      issuingBranch: { id: 1, name: 'Main Store', code: 'MAIN' },
      receivingBranch: { id: 2, name: 'Branch Store 1', code: 'BR01' },
      items: [],
    });

    const res = await request(app)
      .post('/api/branches/transfer')
      .send(transferPayload);

    expect(res.status).toBe(201);
    expect(res.body.voucherNo).toBe('BT/1');
  });

  it('rejects transfer to the same branch', async () => {
    const res = await request(app)
      .post('/api/branches/transfer')
      .send({ ...transferPayload, fromBranchId: 1, toBranchId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('same branch');
  });

  it('rejects transfer without items', async () => {
    const res = await request(app)
      .post('/api/branches/transfer')
      .send({ fromBranchId: 1, toBranchId: 2, items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('item');
  });

  it('rejects transfer when source branch not found', async () => {
    mockPrisma.branch.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 2, name: 'BR', isActive: true, isDeleted: false });

    const res = await request(app)
      .post('/api/branches/transfer')
      .send(transferPayload);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Source branch');
  });

  it('rejects transfer when destination branch is disabled', async () => {
    mockPrisma.branch.findUnique
      .mockResolvedValueOnce({ id: 1, name: 'Main', isActive: true, isDeleted: false })
      .mockResolvedValueOnce({ id: 4, name: 'Closed', isActive: false, isDeleted: false });

    const res = await request(app)
      .post('/api/branches/transfer')
      .send({ ...transferPayload, toBranchId: 4 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('disabled');
  });

  it('rejects transfer with missing required fields', async () => {
    const res = await request(app)
      .post('/api/branches/transfer')
      .send({ items: [{ labelId: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('validates labels belong to source branch within transaction', async () => {
    mockPrisma.branch.findUnique
      .mockResolvedValueOnce({ id: 1, name: 'Main', isActive: true, isDeleted: false })
      .mockResolvedValueOnce({ id: 2, name: 'Branch', isActive: true, isDeleted: false });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => {
      const tx = {
        voucherSequence: { upsert: jest.fn().mockResolvedValue({ lastNumber: 2 }) },
        label: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, labelNo: 'GN/001', branchId: 2, status: 'IN_STOCK' }, // wrong branch!
          ]),
          update: jest.fn(),
        },
        branchTransfer: { create: jest.fn() },
        branchTransferItem: { create: jest.fn() },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/branches/transfer')
      .send({ fromBranchId: 1, toBranchId: 2, items: [{ labelId: 1, itemName: 'Ring' }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('does not belong');
  });

  it('validates labels are IN_STOCK within transaction', async () => {
    mockPrisma.branch.findUnique
      .mockResolvedValueOnce({ id: 1, name: 'Main', isActive: true, isDeleted: false })
      .mockResolvedValueOnce({ id: 2, name: 'Branch', isActive: true, isDeleted: false });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => {
      const tx = {
        voucherSequence: { upsert: jest.fn().mockResolvedValue({ lastNumber: 3 }) },
        label: {
          findMany: jest.fn().mockResolvedValue([
            { id: 3, labelNo: 'GN/003', branchId: 1, status: 'SOLD' },
          ]),
          update: jest.fn(),
        },
        branchTransfer: { create: jest.fn() },
        branchTransferItem: { create: jest.fn() },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/branches/transfer')
      .send({ fromBranchId: 1, toBranchId: 2, items: [{ labelId: 3, itemName: 'Bangle' }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not in-stock');
  });
});

// ════════════════════════════════════════════════════════════
// TRANSFER HISTORY — GET /api/branches/transfer/history
// ════════════════════════════════════════════════════════════
describe('GET /api/branches/transfer/history', () => {
  it('returns transfer history with pagination', async () => {
    const mockTransfers = [
      {
        id: 1, voucherNo: 'BT/1', voucherDate: '2025-07-14',
        issuingBranch: { id: 1, name: 'Main Store', code: 'MAIN' },
        receivingBranch: { id: 2, name: 'Branch Store 1', code: 'BR01' },
        totalPcs: 2, totalAmount: 160000,
        items: [{ itemName: 'Necklace', grossWeight: 25.5, pcs: 1, totalAmount: 125000 }],
      },
    ];
    mockPrisma.branchTransfer.findMany.mockResolvedValueOnce(mockTransfers);
    mockPrisma.branchTransfer.count.mockResolvedValueOnce(1);

    const res = await request(app).get('/api/branches/transfer/history');

    expect(res.status).toBe(200);
    expect(res.body.transfers).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('filters by branchId', async () => {
    mockPrisma.branchTransfer.findMany.mockResolvedValueOnce([]);
    mockPrisma.branchTransfer.count.mockResolvedValueOnce(0);

    const res = await request(app).get('/api/branches/transfer/history?branchId=1');

    expect(res.status).toBe(200);
    expect(mockPrisma.branchTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { issuingBranchId: 1 },
            { receivingBranchId: 1 },
          ],
        }),
      })
    );
  });

  it('filters by date range', async () => {
    mockPrisma.branchTransfer.findMany.mockResolvedValueOnce([]);
    mockPrisma.branchTransfer.count.mockResolvedValueOnce(0);

    const res = await request(app).get('/api/branches/transfer/history?dateFrom=2025-07-01&dateTo=2025-07-31');

    expect(res.status).toBe(200);
    const callArgs = mockPrisma.branchTransfer.findMany.mock.calls[0][0];
    expect(callArgs.where.voucherDate).toBeDefined();
    expect(callArgs.where.voucherDate.gte).toBeInstanceOf(Date);
    expect(callArgs.where.voucherDate.lte).toBeInstanceOf(Date);
  });
});

// ════════════════════════════════════════════════════════════
// AUDIT LOG — GET /api/branches/audit-log
// ════════════════════════════════════════════════════════════
describe('GET /api/branches/audit-log', () => {
  it('returns audit logs with filters', async () => {
    const mockLogs = [
      {
        id: 1, userId: 1, branchId: 1, action: 'CREATE', entityType: 'Branch', entityId: 2,
        createdAt: new Date(), branch: { id: 1, name: 'Main', code: 'MAIN' },
      },
    ];
    mockPrisma.auditLog.findMany.mockResolvedValueOnce(mockLogs);
    mockPrisma.auditLog.count.mockResolvedValueOnce(1);

    const res = await request(app).get('/api/branches/audit-log?entityType=Branch');

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('filters by action type', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
    mockPrisma.auditLog.count.mockResolvedValueOnce(0);

    const res = await request(app).get('/api/branches/audit-log?action=TRANSFER');

    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: 'TRANSFER' }),
      })
    );
  });

  it('filters by date range', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
    mockPrisma.auditLog.count.mockResolvedValueOnce(0);

    const res = await request(app).get('/api/branches/audit-log?dateFrom=2025-07-01&dateTo=2025-07-31');

    expect(res.status).toBe(200);
    const callArgs = mockPrisma.auditLog.findMany.mock.calls[0][0];
    expect(callArgs.where.createdAt).toBeDefined();
  });

  it('supports pagination', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
    mockPrisma.auditLog.count.mockResolvedValueOnce(100);

    const res = await request(app).get('/api/branches/audit-log?page=2&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(10);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 10,
      })
    );
  });
});

// ════════════════════════════════════════════════════════════
// BRANCH CODE COMPOUND UNIQUENESS (companyId + code)
// ════════════════════════════════════════════════════════════
describe('POST /api/branches — compound unique constraint', () => {
  it('checks duplicate code within the authenticated user company', async () => {
    // No duplicate for req.companyId (=1 from mock middleware)
    mockPrisma.branch.findFirst.mockResolvedValueOnce(null);
    mockPrisma.branch.count.mockResolvedValueOnce(1);
    mockPrisma.branch.findFirst.mockResolvedValueOnce({ id: 1, isMaster: true }); // master of company 1
    mockPrisma.branch.create.mockResolvedValueOnce({
      id: 20, name: 'Branch Store', code: 'BR01', companyId: 1,
      branchType: 'BRANCH', isMaster: false, parentId: 1,
      company: { id: 1, name: 'Swarnite Jewellers' },
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    // Even if client sends companyId: 2, server uses req.companyId (=1)
    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Branch Store', code: 'BR01', companyId: 2 });

    expect(res.status).toBe(201);
    // findFirst should check code + req.companyId (1), ignoring client-sent companyId
    expect(mockPrisma.branch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: 'BR01',
          companyId: 1, // req.companyId from middleware, not body
        }),
      })
    );
  });

  it('rejects duplicate branch code within the same company', async () => {
    // Duplicate exists in same company
    mockPrisma.branch.findFirst.mockResolvedValueOnce({ id: 2, code: 'BR01', companyId: 1 });

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Duplicate', code: 'BR01' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("'BR01'");
    expect(res.body.error).toContain('already exists');
  });

  it('handles P2002 unique constraint error from database', async () => {
    mockPrisma.branch.findFirst.mockResolvedValueOnce(null); // passes app-level check
    mockPrisma.branch.count.mockResolvedValueOnce(1);
    mockPrisma.branch.findFirst.mockResolvedValueOnce({ id: 1, isMaster: true });
    // Simulate DB-level unique constraint violation (race condition)
    mockPrisma.branch.create.mockRejectedValueOnce({ code: 'P2002' });

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Race Condition', code: 'BR01' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });
});

// ════════════════════════════════════════════════════════════
// BRANCH USERS — GET /api/branches/:id/users
// ════════════════════════════════════════════════════════════
describe('GET /api/branches/:id/users', () => {
  it('returns users of a branch', async () => {
    const mockUsers = [
      { id: 10, username: 'cashier1', fullName: 'Cashier One', role: 'CASHIER', isActive: true, createdAt: new Date() },
      { id: 11, username: 'sales1', fullName: 'Sales One', role: 'USER', isActive: true, createdAt: new Date() },
    ];
    mockPrisma.user.findMany.mockResolvedValueOnce(mockUsers);

    const res = await request(app).get('/api/branches/2/users');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].username).toBe('cashier1');
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: 2, companyId: 1 },
      })
    );
  });

  it('returns empty array when branch has no users', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/branches/3/users');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════
// CREATE BRANCH USER — POST /api/branches/:id/user
// ════════════════════════════════════════════════════════════
describe('POST /api/branches/:id/user', () => {
  it('creates a user for a branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(CHILD_BRANCH);
    mockPrisma.user.create.mockResolvedValueOnce({
      id: 20, username: 'newuser', fullName: 'New User', role: 'USER', isActive: true, createdAt: new Date(),
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/branches/2/user')
      .send({ username: 'newuser', password: 'pass123', fullName: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.username).toBe('newuser');
    expect(res.body.role).toBe('USER');
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('uses username as fullName when not provided', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(CHILD_BRANCH);
    mockPrisma.user.create.mockResolvedValueOnce({
      id: 21, username: 'branchuser', fullName: 'branchuser', role: 'USER', isActive: true, createdAt: new Date(),
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/branches/2/user')
      .send({ username: 'branchuser', password: 'pass123' });

    expect(res.status).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: 'branchuser',
        }),
      })
    );
  });

  it('rejects missing username', async () => {
    const res = await request(app)
      .post('/api/branches/2/user')
      .send({ password: 'pass123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Username and password');
  });

  it('rejects missing password', async () => {
    const res = await request(app)
      .post('/api/branches/2/user')
      .send({ username: 'testuser' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Username and password');
  });

  it('rejects short password', async () => {
    const res = await request(app)
      .post('/api/branches/2/user')
      .send({ username: 'testuser', password: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('6 characters');
  });

  it('returns 404 for non-existent branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/branches/999/user')
      .send({ username: 'testuser', password: 'pass123' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Branch not found');
  });

  it('returns 404 for deleted branch', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(DELETED_BRANCH);

    const res = await request(app)
      .post('/api/branches/5/user')
      .send({ username: 'testuser', password: 'pass123' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Branch not found');
  });

  it('rejects duplicate username with P2002', async () => {
    mockPrisma.branch.findUnique.mockResolvedValueOnce(CHILD_BRANCH);
    mockPrisma.user.create.mockRejectedValueOnce({ code: 'P2002' });

    const res = await request(app)
      .post('/api/branches/2/user')
      .send({ username: 'admin', password: 'pass123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Username already exists');
  });
});

// ════════════════════════════════════════════════════════════
// UPDATE BRANCH USER — PUT /api/branches/:id/user/:userId
// ════════════════════════════════════════════════════════════
describe('PUT /api/branches/:id/user/:userId', () => {
  const BRANCH_USER = {
    id: 10, username: 'cashier1', fullName: 'Cashier One', role: 'CASHIER',
    branchId: 2, companyId: 1, isActive: true, password: '$2a$12$hash',
  };

  it('updates user details', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(BRANCH_USER);
    mockPrisma.user.update.mockResolvedValueOnce({
      id: 10, username: 'cashier1_new', fullName: 'Updated Cashier', role: 'CASHIER', isActive: true, createdAt: new Date(),
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .put('/api/branches/2/user/10')
      .send({ username: 'cashier1_new', fullName: 'Updated Cashier' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('cashier1_new');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'UPDATE',
          entityType: 'User',
          entityId: 10,
        }),
      })
    );
  });

  it('updates password with hashing', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(BRANCH_USER);
    mockPrisma.user.update.mockResolvedValueOnce({
      id: 10, username: 'cashier1', fullName: 'Cashier One', role: 'CASHIER', isActive: true, createdAt: new Date(),
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .put('/api/branches/2/user/10')
      .send({ password: 'newpass123' });

    expect(res.status).toBe(200);
    // Verify password was hashed (not sent as plaintext)
    const updateCall = mockPrisma.user.update.mock.calls[0][0];
    expect(updateCall.data.password).toBeDefined();
    expect(updateCall.data.password).not.toBe('newpass123');
    // Audit log should record passwordChanged flag
    const auditCall = mockPrisma.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.newData.passwordChanged).toBe(true);
  });

  it('rejects short password', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(BRANCH_USER);

    const res = await request(app)
      .put('/api/branches/2/user/10')
      .send({ password: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('6 characters');
  });

  it('returns 404 when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .put('/api/branches/2/user/999')
      .send({ fullName: 'Ghost User' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('User not found');
  });

  it('returns 404 when user belongs to different branch', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...BRANCH_USER, branchId: 3 });

    const res = await request(app)
      .put('/api/branches/2/user/10')
      .send({ fullName: 'Wrong Branch' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('User not found');
  });

  it('returns 404 when user belongs to different company', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...BRANCH_USER, companyId: 99 });

    const res = await request(app)
      .put('/api/branches/2/user/10')
      .send({ fullName: 'Wrong Company' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('User not found');
  });

  it('can disable a user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(BRANCH_USER);
    mockPrisma.user.update.mockResolvedValueOnce({
      id: 10, username: 'cashier1', fullName: 'Cashier One', role: 'CASHIER', isActive: false, createdAt: new Date(),
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .put('/api/branches/2/user/10')
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('can change user role', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(BRANCH_USER);
    mockPrisma.user.update.mockResolvedValueOnce({
      id: 10, username: 'cashier1', fullName: 'Cashier One', role: 'MANAGER', isActive: true, createdAt: new Date(),
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .put('/api/branches/2/user/10')
      .send({ role: 'MANAGER' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('MANAGER');
  });

  it('rejects duplicate username on update', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(BRANCH_USER);
    mockPrisma.user.update.mockRejectedValueOnce({ code: 'P2002' });

    const res = await request(app)
      .put('/api/branches/2/user/10')
      .send({ username: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Username already exists');
  });

  it('returns 400 for invalid IDs', async () => {
    const res = await request(app)
      .put('/api/branches/abc/user/xyz')
      .send({ fullName: 'Invalid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid');
  });
});
