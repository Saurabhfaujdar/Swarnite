import request from 'supertest';

// ── Mock Prisma before importing app ──────────────────────
import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({
  prisma: mockPrisma,
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
    mockPrisma.branch.findUnique.mockResolvedValueOnce(null); // no duplicate code
    mockPrisma.branch.count.mockResolvedValueOnce(0);          // no existing branches = auto master
    mockPrisma.branch.create.mockResolvedValueOnce({
      ...MASTER_BRANCH,
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Main Store', code: 'MAIN', companyId: 1 });

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
    mockPrisma.branch.findUnique.mockResolvedValueOnce(null); // no duplicate code
    mockPrisma.branch.count.mockResolvedValueOnce(1);          // existing branches = child
    mockPrisma.branch.findFirst.mockResolvedValueOnce({ id: 1 }); // auto-find master
    mockPrisma.branch.create.mockResolvedValueOnce(CHILD_BRANCH);
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Branch Store 1', code: 'BR01', companyId: 1, city: 'Pune' });

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
    mockPrisma.branch.findUnique.mockResolvedValueOnce(CHILD_BRANCH); // code exists

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'Another Branch', code: 'BR01', companyId: 1 });

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
    mockPrisma.branch.findUnique
      .mockResolvedValueOnce(null)           // no duplicate code
      .mockResolvedValueOnce(CHILD_BRANCH);  // parentId points to a child branch
    mockPrisma.branch.count.mockResolvedValueOnce(2); // existing branches

    const res = await request(app)
      .post('/api/branches')
      .send({ name: 'New Branch', code: 'NEW1', companyId: 1, parentId: 2 });

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
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 1 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => {
      const tx = {
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
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 2 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => {
      const tx = {
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
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ lastNumber: 3 });
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => {
      const tx = {
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
