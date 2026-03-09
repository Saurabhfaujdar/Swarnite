import request from 'supertest';

// ── Mock Prisma before importing app ──────────────────────
import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({
  prisma: mockPrisma,
}));

import app from '../../server/app';

// ── Dummy master data ──────────────────────────────────────
const METAL_GOLD = { id: 1, name: 'Gold', code: 'GOLD', isActive: true };
const METAL_SILVER = { id: 2, name: 'Silver', code: 'SILVER', isActive: true };

const GROUP_NECKLACE = { id: 1, name: 'Necklace', code: 'NEC', metalTypeId: 1, isActive: true, metalType: METAL_GOLD };
const GROUP_PENDANT = { id: 7, name: 'Pendant', code: 'PND', metalTypeId: 1, isActive: true, metalType: METAL_GOLD };
const GROUP_MANGALSUTRA = { id: 8, name: 'Mangalsutra', code: 'MNG', metalTypeId: 1, isActive: true, metalType: METAL_GOLD };
const GROUP_COIN = { id: 10, name: 'Coin', code: 'CON', metalTypeId: 1, isActive: true, metalType: METAL_GOLD };
const GROUP_BRACELET = { id: 4, name: 'Bracelet', code: 'BRC', metalTypeId: 1, isActive: true, metalType: METAL_GOLD };
const GROUP_NOSEPIN = { id: 9, name: 'Nose Pin', code: 'NOS', metalTypeId: 1, isActive: true, metalType: METAL_GOLD };
const GROUP_SILVER_COIN = { id: 12, name: 'Silver Coin', code: 'SCN', metalTypeId: 2, isActive: true, metalType: METAL_SILVER };
const GROUP_RING = { id: 5, name: 'Ring', code: 'RNG', metalTypeId: 1, isActive: true, metalType: METAL_GOLD };

const PURITY_22KT = { id: 1, name: '22 KT', code: '22KT', percentage: 91.6, isActive: true };
const PURITY_24KT = { id: 2, name: '24 KT', code: '24KT', percentage: 99.9, isActive: true };

const ALL_ITEM_GROUPS = [
  GROUP_NECKLACE,
  { id: 2, name: 'Chain', code: 'CHN', metalTypeId: 1, isActive: true, metalType: METAL_GOLD },
  { id: 3, name: 'Bangle', code: 'BNG', metalTypeId: 1, isActive: true, metalType: METAL_GOLD },
  GROUP_BRACELET,
  GROUP_RING,
  { id: 6, name: 'Earring', code: 'EAR', metalTypeId: 1, isActive: true, metalType: METAL_GOLD },
  GROUP_PENDANT,
  GROUP_MANGALSUTRA,
  GROUP_NOSEPIN,
  GROUP_COIN,
  { id: 11, name: 'Silver Bangle', code: 'SBG', metalTypeId: 2, isActive: true, metalType: METAL_SILVER },
  GROUP_SILVER_COIN,
];

// Prefixes that previously existed (only 6 of 12 groups had prefixes)
const PREFIX_GN = { id: 1, prefix: 'GN', itemGroupId: 1, lastNumber: 50, isActive: true, itemGroup: GROUP_NECKLACE };
const PREFIX_GC = { id: 2, prefix: 'GC', itemGroupId: 2, lastNumber: 30, isActive: true };
const PREFIX_GB = { id: 3, prefix: 'GB', itemGroupId: 3, lastNumber: 20, isActive: true };
const PREFIX_GR = { id: 5, prefix: 'GR', itemGroupId: 5, lastNumber: 25, isActive: true };
const PREFIX_GE = { id: 6, prefix: 'GE', itemGroupId: 6, lastNumber: 15, isActive: true };
const PREFIX_SB = { id: 11, prefix: 'SB', itemGroupId: 11, lastNumber: 10, isActive: true };
// Prefixes that were MISSING (caused the Gold Pendant bug)
const PREFIX_GP = { id: 7, prefix: 'GP', itemGroupId: 7, lastNumber: 0, isActive: true, itemGroup: GROUP_PENDANT };
const PREFIX_GM = { id: 8, prefix: 'GM', itemGroupId: 8, lastNumber: 0, isActive: true, itemGroup: GROUP_MANGALSUTRA };
const PREFIX_GT = { id: 4, prefix: 'GT', itemGroupId: 4, lastNumber: 0, isActive: true, itemGroup: GROUP_BRACELET };
const PREFIX_GN2 = { id: 9, prefix: 'GN2', itemGroupId: 9, lastNumber: 0, isActive: true, itemGroup: GROUP_NOSEPIN };
const PREFIX_GK = { id: 10, prefix: 'GK', itemGroupId: 10, lastNumber: 0, isActive: true, itemGroup: GROUP_COIN };
const PREFIX_SC = { id: 12, prefix: 'SC', itemGroupId: 12, lastNumber: 0, isActive: true, itemGroup: GROUP_SILVER_COIN };

// Items
const ITEM_GOLD_NECKLACE = { id: 1, name: 'Gold Necklace 22KT', code: 'GNEC22', itemGroupId: 1, metalTypeId: 1, purityId: 1, isActive: true, itemGroup: GROUP_NECKLACE, purity: PURITY_22KT, metalType: METAL_GOLD };
const ITEM_GOLD_PENDANT = { id: 7, name: 'Gold Pendant 22KT', code: 'GPND22', itemGroupId: 7, metalTypeId: 1, purityId: 1, isActive: true, itemGroup: GROUP_PENDANT, purity: PURITY_22KT, metalType: METAL_GOLD };
const ITEM_GOLD_MANGALSUTRA = { id: 8, name: 'Gold Mangalsutra 22KT', code: 'GMNG22', itemGroupId: 8, metalTypeId: 1, purityId: 1, isActive: true, itemGroup: GROUP_MANGALSUTRA, purity: PURITY_22KT, metalType: METAL_GOLD };
const ITEM_GOLD_COIN = { id: 9, name: 'Gold Coin 24KT', code: 'GCON24', itemGroupId: 10, metalTypeId: 1, purityId: 2, isActive: true, itemGroup: GROUP_COIN, purity: PURITY_24KT, metalType: METAL_GOLD };
const ITEM_GOLD_BRACELET = { id: 4, name: 'Gold Bracelet 22KT', code: 'GBRC22', itemGroupId: 4, metalTypeId: 1, purityId: 1, isActive: true, itemGroup: GROUP_BRACELET, purity: PURITY_22KT, metalType: METAL_GOLD };
const ITEM_GOLD_NOSEPIN = { id: 10, name: 'Gold Nose Pin 22KT', code: 'GNOS22', itemGroupId: 9, metalTypeId: 1, purityId: 1, isActive: true, itemGroup: GROUP_NOSEPIN, purity: PURITY_22KT, metalType: METAL_GOLD };
const ITEM_SILVER_COIN = { id: 11, name: 'Silver Coin', code: 'SCON99', itemGroupId: 12, metalTypeId: 2, purityId: 3, isActive: true, itemGroup: GROUP_SILVER_COIN, metalType: METAL_SILVER };

const DUMMY_BRANCH = { id: 1, name: 'Main Branch', code: 'MB', isActive: true };
const DUMMY_COUNTER = { id: 1, name: 'Counter A', code: 'CA', branchId: 1, isActive: true };

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// ITEMS CRUD
// ════════════════════════════════════════════════════════════
describe('GET /api/inventory/items', () => {
  it('returns all active items with relations', async () => {
    mockPrisma.item.findMany.mockResolvedValueOnce([ITEM_GOLD_NECKLACE, ITEM_GOLD_PENDANT]);

    const res = await request(app).get('/api/inventory/items');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ name: 'Gold Necklace 22KT', code: 'GNEC22' });
    expect(res.body[1]).toMatchObject({ name: 'Gold Pendant 22KT' });
  });

  it('returns empty array when no items', async () => {
    mockPrisma.item.findMany.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/inventory/items');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/inventory/items', () => {
  it('creates a new item', async () => {
    const newItem = { id: 20, name: 'Gold Anklet 22KT', code: 'GANK22', itemGroupId: 13, metalTypeId: 1, purityId: 1, isActive: true };
    mockPrisma.item.create.mockResolvedValueOnce(newItem);

    const res = await request(app)
      .post('/api/inventory/items')
      .send({ name: 'Gold Anklet 22KT', code: 'GANK22', itemGroupId: 13, metalTypeId: 1, purityId: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Gold Anklet 22KT', code: 'GANK22' });
  });
});

// ════════════════════════════════════════════════════════════
// PREFIXES CRUD
// ════════════════════════════════════════════════════════════
describe('GET /api/inventory/prefixes', () => {
  it('returns all active prefixes with item group', async () => {
    mockPrisma.labelPrefix.findMany.mockResolvedValueOnce([PREFIX_GN, PREFIX_GP]);

    const res = await request(app).get('/api/inventory/prefixes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ prefix: 'GN' });
    expect(res.body[1]).toMatchObject({ prefix: 'GP' });
  });
});

describe('POST /api/inventory/prefixes', () => {
  it('creates a new prefix', async () => {
    const newPrefix = { id: 13, prefix: 'GA', itemGroupId: 13, lastNumber: 0, isActive: true };
    mockPrisma.labelPrefix.create.mockResolvedValueOnce(newPrefix);

    const res = await request(app)
      .post('/api/inventory/prefixes')
      .send({ prefix: 'GA', itemGroupId: 13 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ prefix: 'GA', lastNumber: 0 });
  });
});

// ════════════════════════════════════════════════════════════
// LABELS - Basic CRUD
// ════════════════════════════════════════════════════════════
describe('GET /api/inventory/labels', () => {
  it('returns labels with total count', async () => {
    const label1 = { id: 1, labelNo: 'GN/1', itemId: 1, grossWeight: 10.5, netWeight: 9.8, status: 'IN_STOCK', item: ITEM_GOLD_NECKLACE, prefix: PREFIX_GN, branch: DUMMY_BRANCH, counter: DUMMY_COUNTER };
    mockPrisma.label.findMany.mockResolvedValueOnce([label1]);
    mockPrisma.label.count.mockResolvedValueOnce(1);

    const res = await request(app).get('/api/inventory/labels');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.labels).toHaveLength(1);
    expect(res.body.labels[0].labelNo).toBe('GN/1');
  });

  it('supports date range filtering', async () => {
    mockPrisma.label.findMany.mockResolvedValueOnce([]);
    mockPrisma.label.count.mockResolvedValueOnce(0);

    const res = await request(app).get('/api/inventory/labels?dateFrom=2026-03-01&dateTo=2026-03-06');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    // Verify endOfDay is set to 23:59:59 (the bug that was fixed before)
    const callArgs = mockPrisma.label.findMany.mock.calls[0][0];
    expect(callArgs.where.createdAt.lte.getHours()).toBe(23);
    expect(callArgs.where.createdAt.lte.getMinutes()).toBe(59);
  });

  it('filters by group name', async () => {
    mockPrisma.label.findMany.mockResolvedValueOnce([]);
    mockPrisma.label.count.mockResolvedValueOnce(0);

    const res = await request(app).get('/api/inventory/labels?dateFrom=2026-03-01&dateTo=2026-03-06&groupName=Pendant');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.label.findMany.mock.calls[0][0];
    expect(callArgs.where.item).toEqual({ itemGroup: { name: 'Pendant' } });
  });

  it('filters by dateTo only (no dateFrom)', async () => {
    mockPrisma.label.findMany.mockResolvedValueOnce([]);
    mockPrisma.label.count.mockResolvedValueOnce(0);

    const res = await request(app).get('/api/inventory/labels?dateTo=2026-03-08');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.label.findMany.mock.calls[0][0];
    expect(callArgs.where.createdAt.lte).toBeDefined();
    expect(callArgs.where.createdAt.gte).toBeUndefined();
  });

  it('filters by dateFrom only (no dateTo)', async () => {
    mockPrisma.label.findMany.mockResolvedValueOnce([]);
    mockPrisma.label.count.mockResolvedValueOnce(0);

    const res = await request(app).get('/api/inventory/labels?dateFrom=2026-03-01');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.label.findMany.mock.calls[0][0];
    expect(callArgs.where.createdAt.gte).toEqual(new Date('2026-03-01'));
    expect(callArgs.where.createdAt.lte).toBeUndefined();
  });

  it('returns all labels when no date filter provided', async () => {
    mockPrisma.label.findMany.mockResolvedValueOnce([]);
    mockPrisma.label.count.mockResolvedValueOnce(0);

    const res = await request(app).get('/api/inventory/labels');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.label.findMany.mock.calls[0][0];
    expect(callArgs.where.createdAt).toBeUndefined();
  });
});

describe('GET /api/inventory/labels/search', () => {
  it('finds a label by labelNo query param', async () => {
    const label = { id: 1, labelNo: 'GP/1', item: ITEM_GOLD_PENDANT, branch: DUMMY_BRANCH, counter: DUMMY_COUNTER };
    mockPrisma.label.findUnique.mockResolvedValueOnce(label);

    const res = await request(app).get('/api/inventory/labels/search?labelNo=GP/1');
    expect(res.status).toBe(200);
    expect(res.body.labelNo).toBe('GP/1');
  });

  it('returns 400 if labelNo not provided', async () => {
    const res = await request(app).get('/api/inventory/labels/search');
    expect(res.status).toBe(400);
  });

  it('returns 404 if label not found', async () => {
    mockPrisma.label.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/inventory/labels/search?labelNo=XX/999');
    expect(res.status).toBe(404);
  });

  it('handles label numbers with slashes (e.g. GB/13)', async () => {
    const label = { id: 13, labelNo: 'GB/13', item: ITEM_GOLD_NECKLACE, branch: DUMMY_BRANCH, counter: DUMMY_COUNTER };
    mockPrisma.label.findUnique.mockResolvedValueOnce(label);

    const res = await request(app).get('/api/inventory/labels/search?labelNo=GB/13');
    expect(res.status).toBe(200);
    expect(res.body.labelNo).toBe('GB/13');
  });
});

describe('GET /api/inventory/labels/:id', () => {
  it('returns a label by ID', async () => {
    const label = { id: 5, labelNo: 'GR/5', item: ITEM_GOLD_NECKLACE, branch: DUMMY_BRANCH, counter: DUMMY_COUNTER };
    mockPrisma.label.findUnique.mockResolvedValueOnce(label);

    const res = await request(app).get('/api/inventory/labels/5');
    expect(res.status).toBe(200);
    expect(res.body.labelNo).toBe('GR/5');
  });

  it('returns 404 when label not found', async () => {
    mockPrisma.label.findUnique.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/inventory/labels/999');
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════
// SINGLE LABEL CREATION (POST /api/inventory/labels)
// ════════════════════════════════════════════════════════════
describe('POST /api/inventory/labels', () => {
  it('creates a label and increments prefix lastNumber', async () => {
    mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GN, lastNumber: 51 });
    const createdLabel = { id: 100, labelNo: 'GN/51', prefixId: 1, itemId: 1, grossWeight: 12.5, netWeight: 11.8, status: 'IN_STOCK', item: ITEM_GOLD_NECKLACE, branch: DUMMY_BRANCH };
    mockPrisma.label.create.mockResolvedValueOnce(createdLabel);

    const res = await request(app)
      .post('/api/inventory/labels')
      .send({ prefixId: 1, itemId: 1, grossWeight: 12.5, netWeight: 11.8, branchId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.labelNo).toBe('GN/51');
    expect(mockPrisma.labelPrefix.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: { lastNumber: { increment: 1 } },
    }));
  });
});

// ════════════════════════════════════════════════════════════
// BATCH LABEL CREATION - THE GOLD PENDANT BUG SCENARIO
// ════════════════════════════════════════════════════════════
describe('POST /api/inventory/labels/batch', () => {
  // ──────────────────────────────────────────────────────────
  // ORIGINAL BUG: These item groups had NO label prefix, so
  // batch creation failed with "Could not resolve label prefix"
  // ──────────────────────────────────────────────────────────

  describe('label creation for Gold Pendant (previously failing)', () => {
    it('creates labels when prefix is auto-detected from item group', async () => {
      // Simulate: no top-level prefixId, no per-item prefixId/prefix string
      // The code falls back to looking up prefix by item.itemGroupId
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 7 }); // Pendant group
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_GP); // GP prefix exists
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GP, lastNumber: 1 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 200, labelNo: 'GP/1', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 7, grossWeight: 5.2, netWeight: 4.8, huid: 'AB12CD' }],
        });

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(1);
      expect(res.body.labels[0].labelNo).toBe('GP/1');
    });

    it('FAILS when item group has no prefix mapping (the original bug)', async () => {
      // This simulates the exact scenario that caused the Gold Pendant failure:
      // 1. No top-level prefixId
      // 2. No per-item prefixId or prefix string
      // 3. Item lookup succeeds (itemGroupId = 7 for Pendant)
      // 4. BUT labelPrefix.findFirst returns null — no prefix for this group!
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 7 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(null); // No prefix mapping!

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 7, grossWeight: 5.2, netWeight: 4.8 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Could not resolve label prefix/);
    });
  });

  describe('label creation for Gold Mangalsutra (previously failing)', () => {
    it('creates labels when prefix GM exists for Mangalsutra group', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 8 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_GM);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GM, lastNumber: 1 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 201, labelNo: 'GM/1', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 8, grossWeight: 15.0, netWeight: 14.2 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(1);
      expect(res.body.labels[0].labelNo).toBe('GM/1');
    });

    it('FAILS when Mangalsutra group has no prefix mapping', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 8 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 8, grossWeight: 15.0, netWeight: 14.2 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Could not resolve label prefix/);
    });
  });

  describe('label creation for Gold Coin (previously failing)', () => {
    it('creates labels when prefix GK exists for Coin group', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 10 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_GK);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GK, lastNumber: 1 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 202, labelNo: 'GK/1', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 9, grossWeight: 8.0, netWeight: 8.0 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.labels[0].labelNo).toBe('GK/1');
    });
  });

  describe('label creation for Gold Bracelet (previously failing)', () => {
    it('creates labels when prefix GT exists for Bracelet group', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 4 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_GT);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GT, lastNumber: 1 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 203, labelNo: 'GT/1', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 4, grossWeight: 12.0, netWeight: 11.5 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.labels[0].labelNo).toBe('GT/1');
    });
  });

  describe('label creation for Gold Nose Pin (previously failing)', () => {
    it('creates labels when prefix GN2 exists for Nose Pin group', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 9 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_GN2);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GN2, lastNumber: 1 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 204, labelNo: 'GN2/1', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 10, grossWeight: 1.2, netWeight: 1.0 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.labels[0].labelNo).toBe('GN2/1');
    });
  });

  describe('label creation for Silver Coin (previously failing)', () => {
    it('creates labels when prefix SC exists for Silver Coin group', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 12 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_SC);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_SC, lastNumber: 1 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 205, labelNo: 'SC/1', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 11, grossWeight: 50.0, netWeight: 50.0 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.labels[0].labelNo).toBe('SC/1');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Groups that ALWAYS worked (had prefixes from the start)
  // ──────────────────────────────────────────────────────────
  describe('label creation for Necklace (always worked)', () => {
    it('creates a batch label for Gold Necklace', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 1 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_GN);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GN, lastNumber: 51 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 300, labelNo: 'GN/51', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 1, grossWeight: 25.0, netWeight: 23.5, huid: 'XY56AB' }],
        });

      expect(res.status).toBe(201);
      expect(res.body.labels[0].labelNo).toBe('GN/51');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Prefix resolution strategies
  // ──────────────────────────────────────────────────────────
  describe('prefix resolution strategies', () => {
    it('uses top-level prefixId when provided', async () => {
      // When prefixId is given at the top level, skip all auto-detection
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GN, lastNumber: 52 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 301, labelNo: 'GN/52', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          prefixId: 1,  // top-level
          labels: [{ itemId: 1, grossWeight: 10.0, netWeight: 9.5 }],
        });

      expect(res.status).toBe(201);
      // Should NOT call item.findUnique or labelPrefix.findFirst (auto-detection bypassed)
      expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.labelPrefix.findFirst).not.toHaveBeenCalled();
    });

    it('uses per-item prefixId when provided', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GP, lastNumber: 2 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 302, labelNo: 'GP/2', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 7, prefixId: 7, grossWeight: 3.0, netWeight: 2.8 }],
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
    });

    it('resolves prefix by prefix string', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.labelPrefix.findUnique.mockResolvedValueOnce(PREFIX_GP); // looked up by string
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GP, lastNumber: 3 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 303, labelNo: 'GP/3', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 7, prefix: 'GP', grossWeight: 3.0, netWeight: 2.8 }],
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.labelPrefix.findUnique).toHaveBeenCalledWith({ where: { prefix: 'GP' } });
    });

    it('auto-detects prefix from item → itemGroup → labelPrefix', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      // No prefixId or prefix string → must auto-detect
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 7 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_GP);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GP, lastNumber: 4 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 304, labelNo: 'GP/4', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [{ itemId: 7, grossWeight: 3.0, netWeight: 2.8 }],
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.item.findUnique).toHaveBeenCalledWith({ where: { id: 7 }, select: { itemGroupId: true } });
      expect(mockPrisma.labelPrefix.findFirst).toHaveBeenCalledWith({ where: { itemGroupId: 7 } });
    });
  });

  // ──────────────────────────────────────────────────────────
  // Counter resolution
  // ──────────────────────────────────────────────────────────
  describe('counter resolution', () => {
    it('resolves counter by counterCode', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GN, lastNumber: 53 });
      mockPrisma.counter.findUnique.mockResolvedValueOnce(DUMMY_COUNTER);
      mockPrisma.label.create.mockResolvedValueOnce({ id: 305, labelNo: 'GN/53', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          prefixId: 1,
          labels: [{ itemId: 1, grossWeight: 10.0, netWeight: 9.5, counterCode: 'CA' }],
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.counter.findUnique).toHaveBeenCalledWith({ where: { code: 'CA' } });
    });

    it('uses top-level counterId', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GN, lastNumber: 54 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 306, labelNo: 'GN/54', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          prefixId: 1,
          counterId: 1,
          labels: [{ itemId: 1, grossWeight: 10.0, netWeight: 9.5 }],
        });

      expect(res.status).toBe(201);
      // counterId=1 should be passed to label.create
      const createCall = mockPrisma.label.create.mock.calls[0][0];
      expect(createCall.data.counterId).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Branch resolution
  // ──────────────────────────────────────────────────────────
  describe('branch resolution', () => {
    it('uses provided branchId', async () => {
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GN, lastNumber: 55 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 307, labelNo: 'GN/55', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          prefixId: 1,
          branchId: 1,
          labels: [{ itemId: 1, grossWeight: 10.0, netWeight: 9.5 }],
        });

      expect(res.status).toBe(201);
      // Should NOT call branch.findFirst since branchId was provided
      expect(mockPrisma.branch.findFirst).not.toHaveBeenCalled();
    });

    it('auto-resolves branch when not provided', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GN, lastNumber: 56 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 308, labelNo: 'GN/56', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          prefixId: 1,
          // no branchId
          labels: [{ itemId: 1, grossWeight: 10.0, netWeight: 9.5 }],
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.branch.findFirst).toHaveBeenCalledWith({ where: { isActive: true } });
    });

    it('returns 400 when no active branch exists', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          prefixId: 1,
          labels: [{ itemId: 1, grossWeight: 10.0, netWeight: 9.5 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/No active branch/);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Multiple labels in one batch
  // ──────────────────────────────────────────────────────────
  describe('multi-label batch creation', () => {
    it('creates multiple labels across different item groups in one batch', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);

      // Label 1: Gold Pendant (auto-detect prefix)
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 7 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_GP);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GP, lastNumber: 5 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 400, labelNo: 'GP/5', status: 'IN_STOCK' });

      // Label 2: Gold Necklace (auto-detect prefix)
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 1 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_GN);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GN, lastNumber: 57 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 401, labelNo: 'GN/57', status: 'IN_STOCK' });

      // Label 3: Gold Mangalsutra (auto-detect prefix)
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 8 });
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(PREFIX_GM);
      mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...PREFIX_GM, lastNumber: 1 });
      mockPrisma.label.create.mockResolvedValueOnce({ id: 402, labelNo: 'GM/1', status: 'IN_STOCK' });

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [
            { itemId: 7, grossWeight: 5.2, netWeight: 4.8 },
            { itemId: 1, grossWeight: 25.0, netWeight: 23.5 },
            { itemId: 8, grossWeight: 15.0, netWeight: 14.2 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(3);
      expect(res.body.labels).toHaveLength(3);
      expect(res.body.labels[0].labelNo).toBe('GP/5');
      expect(res.body.labels[1].labelNo).toBe('GN/57');
      expect(res.body.labels[2].labelNo).toBe('GM/1');
    });

    it('fails entire batch if any item has no prefix mapping', async () => {
      mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);

      // First label works fine
      // But we return null for item lookup (simulating no prefix) on the FIRST item
      mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: 99 }); // unknown group
      mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(null); // no prefix for group 99

      const res = await request(app)
        .post('/api/inventory/labels/batch')
        .send({
          labels: [
            { itemId: 99, grossWeight: 5.0, netWeight: 4.5 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Could not resolve label prefix/);
    });
  });

  // ──────────────────────────────────────────────────────────
  // COMPREHENSIVE: Every item group has a working prefix
  // This is the test that would have caught the Gold Pendant bug
  // ──────────────────────────────────────────────────────────
  describe('every item group should have a resolvable prefix', () => {
    const groupPrefixPairs = [
      { groupId: 1, prefix: PREFIX_GN, groupName: 'Necklace' },
      { groupId: 2, prefix: PREFIX_GC, groupName: 'Chain' },
      { groupId: 3, prefix: PREFIX_GB, groupName: 'Bangle' },
      { groupId: 4, prefix: PREFIX_GT, groupName: 'Bracelet' },
      { groupId: 5, prefix: PREFIX_GR, groupName: 'Ring' },
      { groupId: 6, prefix: PREFIX_GE, groupName: 'Earring' },
      { groupId: 7, prefix: PREFIX_GP, groupName: 'Pendant' },
      { groupId: 8, prefix: PREFIX_GM, groupName: 'Mangalsutra' },
      { groupId: 9, prefix: PREFIX_GN2, groupName: 'Nose Pin' },
      { groupId: 10, prefix: PREFIX_GK, groupName: 'Coin' },
      { groupId: 11, prefix: PREFIX_SB, groupName: 'Silver Bangle' },
      { groupId: 12, prefix: PREFIX_SC, groupName: 'Silver Coin' },
    ];

    test.each(groupPrefixPairs)(
      'creates label for $groupName (groupId=$groupId, prefix=$prefix.prefix)',
      async ({ groupId, prefix }) => {
        mockPrisma.branch.findFirst.mockResolvedValueOnce(DUMMY_BRANCH);
        mockPrisma.item.findUnique.mockResolvedValueOnce({ itemGroupId: groupId });
        mockPrisma.labelPrefix.findFirst.mockResolvedValueOnce(prefix);
        mockPrisma.labelPrefix.update.mockResolvedValueOnce({ ...prefix, lastNumber: prefix.lastNumber + 1 });
        const expectedLabelNo = `${prefix.prefix}/${prefix.lastNumber + 1}`;
        mockPrisma.label.create.mockResolvedValueOnce({ id: 500 + groupId, labelNo: expectedLabelNo, status: 'IN_STOCK' });

        const res = await request(app)
          .post('/api/inventory/labels/batch')
          .send({
            labels: [{ itemId: groupId, grossWeight: 10.0, netWeight: 9.5 }],
          });

        expect(res.status).toBe(201);
        expect(res.body.labels[0].labelNo).toBe(expectedLabelNo);
      },
    );
  });
});

// ════════════════════════════════════════════════════════════
// LABEL UPDATE & DELETE
// ════════════════════════════════════════════════════════════
describe('PUT /api/inventory/labels/:id', () => {
  it('updates a label', async () => {
    mockPrisma.label.update.mockResolvedValueOnce({ id: 1, labelNo: 'GN/1', status: 'SOLD' });

    const res = await request(app)
      .put('/api/inventory/labels/1')
      .send({ status: 'SOLD' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SOLD');
  });
});

describe('DELETE /api/inventory/labels/:id', () => {
  it('deletes a label', async () => {
    mockPrisma.label.delete.mockResolvedValueOnce({ id: 1 });

    const res = await request(app).delete('/api/inventory/labels/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Label deleted');
  });
});

// ════════════════════════════════════════════════════════════
// STOCK SUMMARY
// ════════════════════════════════════════════════════════════
describe('GET /api/inventory/stock-summary', () => {
  it('returns stock summary grouped by status', async () => {
    mockPrisma.label.groupBy.mockResolvedValueOnce([
      { status: 'IN_STOCK', _count: { id: 50 }, _sum: { grossWeight: 500.0, netWeight: 475.0 } },
      { status: 'SOLD', _count: { id: 20 }, _sum: { grossWeight: 200.0, netWeight: 190.0 } },
    ]);
    mockPrisma.label.count
      .mockResolvedValueOnce(50)  // IN_STOCK
      .mockResolvedValueOnce(20); // SOLD

    const res = await request(app).get('/api/inventory/stock-summary');
    expect(res.status).toBe(200);
    expect(res.body.totalInStock).toBe(50);
    expect(res.body.totalSold).toBe(20);
  });
});
