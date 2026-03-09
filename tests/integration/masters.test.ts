import request from 'supertest';

// ── Mock Prisma before importing app ──────────────────────
import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({
  prisma: mockPrisma,
}));

import app from '../../server/app';

// ── Dummy data ─────────────────────────────────────────────
const DUMMY_METAL_TYPES = [
  { id: 1, name: 'Gold', code: 'GOLD', isActive: true },
  { id: 2, name: 'Silver', code: 'SILVER', isActive: true },
  { id: 3, name: 'Platinum', code: 'PLATINUM', isActive: true },
];

const DUMMY_ITEM_GROUPS = [
  { id: 1, name: 'Rings', code: 'RNG', metalTypeId: 1, isActive: true, metalType: DUMMY_METAL_TYPES[0] },
  { id: 2, name: 'Chains', code: 'CHN', metalTypeId: 1, isActive: true, metalType: DUMMY_METAL_TYPES[0] },
  { id: 3, name: 'Bangles', code: 'BNG', metalTypeId: 1, isActive: true, metalType: DUMMY_METAL_TYPES[0] },
];

const DUMMY_PURITIES = [
  { id: 1, name: '24KT', code: '24KT', percentage: 99.9, isActive: true },
  { id: 2, name: '22KT', code: '22KT', percentage: 91.6, isActive: true },
  { id: 3, name: '18KT', code: '18KT', percentage: 75.0, isActive: true },
];

const DUMMY_METAL_RATES = [
  {
    id: 1, metalTypeId: 1, purityCode: '24KT', rate: 73000,
    date: new Date('2024-12-25'), isActive: true,
    metalType: DUMMY_METAL_TYPES[0],
  },
  {
    id: 2, metalTypeId: 1, purityCode: '22KT', rate: 67300,
    date: new Date('2024-12-25'), isActive: true,
    metalType: DUMMY_METAL_TYPES[0],
  },
];

const DUMMY_SALESMEN = [
  { id: 1, name: 'Rahul Sharma', code: 'SM01', phone: '9876543210', isActive: true },
  { id: 2, name: 'Priya Mehta', code: 'SM02', phone: '9876543211', isActive: true },
];

const DUMMY_COUNTERS = [
  { id: 1, name: 'Counter A', code: 'CA', branchId: 1, isActive: true },
  { id: 2, name: 'Counter B', code: 'CB', branchId: 1, isActive: true },
];

const DUMMY_GST_CONFIGS = [
  { id: 1, hsnCode: '7113', description: 'Gold Jewellery', cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0, isActive: true },
  { id: 2, hsnCode: '7114', description: 'Silver Jewellery', cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0, isActive: true },
];

const DUMMY_COMPANY = {
  id: 1,
  name: 'JaiGuru Jewels Pvt Ltd',
  gstin: '27AABCJ1234F1Z5',
  address: '12 Zaveri Bazaar',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400002',
  phone: '022-22345678',
};

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// METAL TYPES
// ════════════════════════════════════════════════════════════
describe('GET /api/masters/metal-types', () => {
  it('returns all active metal types', async () => {
    mockPrisma.metalType.findMany.mockResolvedValueOnce(DUMMY_METAL_TYPES);

    const res = await request(app).get('/api/masters/metal-types');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toMatchObject({ name: 'Gold', code: 'GOLD' });
  });

  it('returns empty array when no metal types', async () => {
    mockPrisma.metalType.findMany.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/masters/metal-types');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/masters/metal-types', () => {
  it('creates a new metal type', async () => {
    const newType = { id: 4, name: 'Rose Gold', code: 'RGOLD', isActive: true };
    mockPrisma.metalType.create.mockResolvedValueOnce(newType);

    const res = await request(app)
      .post('/api/masters/metal-types')
      .send({ name: 'Rose Gold', code: 'RGOLD' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Rose Gold', code: 'RGOLD' });
  });
});

// ════════════════════════════════════════════════════════════
// ITEM GROUPS
// ════════════════════════════════════════════════════════════
describe('GET /api/masters/item-groups', () => {
  it('returns all active item groups with metal type', async () => {
    mockPrisma.itemGroup.findMany.mockResolvedValueOnce(DUMMY_ITEM_GROUPS);

    const res = await request(app).get('/api/masters/item-groups');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].metalType).toMatchObject({ name: 'Gold' });
  });
});

describe('POST /api/masters/item-groups', () => {
  it('creates a new item group', async () => {
    const newGroup = { id: 4, name: 'Earrings', code: 'EAR', metalTypeId: 1, isActive: true };
    mockPrisma.itemGroup.create.mockResolvedValueOnce(newGroup);

    const res = await request(app)
      .post('/api/masters/item-groups')
      .send({ name: 'Earrings', code: 'EAR', metalTypeId: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Earrings' });
  });
});

// ════════════════════════════════════════════════════════════
// PURITIES
// ════════════════════════════════════════════════════════════
describe('GET /api/masters/purities', () => {
  it('returns all active purities', async () => {
    mockPrisma.purity.findMany.mockResolvedValueOnce(DUMMY_PURITIES);

    const res = await request(app).get('/api/masters/purities');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[1]).toMatchObject({ name: '22KT', percentage: 91.6 });
  });
});

describe('POST /api/masters/purities', () => {
  it('creates a new purity', async () => {
    const newPurity = { id: 4, name: '14KT', code: '14KT', percentage: 58.5, isActive: true };
    mockPrisma.purity.create.mockResolvedValueOnce(newPurity);

    const res = await request(app)
      .post('/api/masters/purities')
      .send({ name: '14KT', code: '14KT', percentage: 58.5 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: '14KT', percentage: 58.5 });
  });
});

// ════════════════════════════════════════════════════════════
// METAL RATES
// ════════════════════════════════════════════════════════════
describe('GET /api/masters/metal-rates', () => {
  it('returns metal rates', async () => {
    mockPrisma.metalRate.findMany.mockResolvedValueOnce(DUMMY_METAL_RATES);

    const res = await request(app).get('/api/masters/metal-rates');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters by date when query param provided', async () => {
    mockPrisma.metalRate.findMany.mockResolvedValueOnce([DUMMY_METAL_RATES[0]]);

    const res = await request(app).get('/api/masters/metal-rates?date=2024-12-25');
    expect(res.status).toBe(200);
    expect(mockPrisma.metalRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          date: expect.any(Object),
        }),
      }),
    );
  });
});

describe('GET /api/masters/metal-rates/latest', () => {
  it('returns latest rates per metal/purity combo', async () => {
    mockPrisma.metalRate.findMany.mockResolvedValueOnce(DUMMY_METAL_RATES);

    const res = await request(app).get('/api/masters/metal-rates/latest');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('POST /api/masters/metal-rates', () => {
  it('creates a new metal rate', async () => {
    const newRate = { id: 3, metalTypeId: 2, purityCode: '999', rate: 95, date: new Date(), isActive: true };
    mockPrisma.metalRate.create.mockResolvedValueOnce(newRate);

    const res = await request(app)
      .post('/api/masters/metal-rates')
      .send({ metalTypeId: 2, purityCode: '999', rate: 95 });

    expect(res.status).toBe(201);
  });
});

// ════════════════════════════════════════════════════════════
// SALESMEN
// ════════════════════════════════════════════════════════════
describe('GET /api/masters/salesmen', () => {
  it('returns all active salesmen', async () => {
    mockPrisma.salesman.findMany.mockResolvedValueOnce(DUMMY_SALESMEN);

    const res = await request(app).get('/api/masters/salesmen');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ name: 'Rahul Sharma' });
  });
});

// ════════════════════════════════════════════════════════════
// COUNTERS
// ════════════════════════════════════════════════════════════
describe('GET /api/masters/counters', () => {
  it('returns all active counters', async () => {
    mockPrisma.counter.findMany.mockResolvedValueOnce(DUMMY_COUNTERS);

    const res = await request(app).get('/api/masters/counters');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters counters by branchId', async () => {
    mockPrisma.counter.findMany.mockResolvedValueOnce([DUMMY_COUNTERS[0]]);

    const res = await request(app).get('/api/masters/counters?branchId=1');
    expect(res.status).toBe(200);
    expect(mockPrisma.counter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          branchId: 1,
        }),
      }),
    );
  });
});

// ════════════════════════════════════════════════════════════
// GST CONFIG
// ════════════════════════════════════════════════════════════
describe('GET /api/masters/gst-config', () => {
  it('returns active GST configurations', async () => {
    mockPrisma.gstConfig.findMany.mockResolvedValueOnce(DUMMY_GST_CONFIGS);

    const res = await request(app).get('/api/masters/gst-config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ hsnCode: '7113', cgstRate: 1.5 });
  });
});

// ════════════════════════════════════════════════════════════
// COMPANY
// ════════════════════════════════════════════════════════════
describe('GET /api/masters/company', () => {
  it('returns the company info', async () => {
    mockPrisma.company.findFirst.mockResolvedValueOnce(DUMMY_COMPANY);

    const res = await request(app).get('/api/masters/company');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'JaiGuru Jewels Pvt Ltd' });
  });

  it('returns null when no company exists', async () => {
    mockPrisma.company.findFirst.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/masters/company');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe('POST /api/masters/company', () => {
  it('creates a new company if none exists', async () => {
    mockPrisma.company.findFirst.mockResolvedValueOnce(null);
    mockPrisma.company.create.mockResolvedValueOnce(DUMMY_COMPANY);

    const res = await request(app)
      .post('/api/masters/company')
      .send({ name: 'JaiGuru Jewels Pvt Ltd', gstin: '27AABCJ1234F1Z5' });

    expect(res.status).toBe(200);
    expect(mockPrisma.company.create).toHaveBeenCalled();
  });

  it('updates existing company', async () => {
    mockPrisma.company.findFirst.mockResolvedValueOnce(DUMMY_COMPANY);
    mockPrisma.company.update.mockResolvedValueOnce({ ...DUMMY_COMPANY, name: 'Updated Name' });

    const res = await request(app)
      .post('/api/masters/company')
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(mockPrisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
  });
});
