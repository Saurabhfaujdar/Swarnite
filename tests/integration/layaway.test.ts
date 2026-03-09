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
  name: 'Saurabh Faudar',
  mobile: '7042341450',
  type: 'CUSTOMER',
  closingBalance: 0,
  balanceType: 'NONE',
};

const CUSTOMER_WITH_BALANCE = {
  ...CUSTOMER,
  id: 11,
  closingBalance: 50000,
  balanceType: 'DR',
};

const BRANCH = { id: 1, name: 'Main Branch' };

const LABEL_1 = {
  id: 100,
  labelNo: 'BCD/2',
  status: 'IN_STOCK',
  itemId: 1,
  grossWeight: 3.08,
  netWeight: 2.342,
  item: {
    id: 1,
    name: 'Bracelet Diamond',
    purity: { id: 1, code: '22KT', percentage: 91.6 },
    metalType: { id: 1, name: 'Gold' },
    itemGroup: { id: 4, name: 'Bracelet' },
    labourRate: 650,
  },
};

const LABEL_2 = {
  id: 101,
  labelNo: 'GN/51',
  status: 'IN_STOCK',
  itemId: 2,
  grossWeight: 10.5,
  netWeight: 9.8,
  item: {
    id: 2,
    name: 'Gold Necklace 22KT',
    purity: { id: 1, code: '22KT', percentage: 91.6 },
    metalType: { id: 1, name: 'Gold' },
    itemGroup: { id: 1, name: 'Necklace' },
    labourRate: 750,
  },
};

const VOUCHER_SEQUENCE = {
  prefix: 'LY',
  entityType: 'LAYAWAY',
  financialYear: '2025-2026',
  lastNumber: 1,
};

const makeLayawayPayload = (overrides: any = {}) => ({
  accountId: CUSTOMER.id,
  branchId: 1,
  voucherDate: '2025-03-05',
  financialYear: '2025-2026',
  salesmanName: 'Amit',
  totalGrossWeight: 3.08,
  totalNetWeight: 2.342,
  totalFineWeight: 1.366,
  totalPcs: 1,
  metalAmount: 9450,
  labourAmount: 2082,
  otherCharge: 0,
  discountAmount: 0,
  taxableAmount: 11532,
  cgstAmount: 172,
  sgstAmount: 172,
  totalAmount: 11876,
  roundingDiscount: 0,
  voucherAmount: 11796,
  cashAmount: 0,
  bankAmount: 0,
  cardAmount: 0,
  oldGoldAmount: 0,
  paymentAmount: 0,
  dueAmount: 11796,
  previousOs: 0,
  finalDue: 11796,
  narration: '1 DAY',
  reference: null,
  bookName: null,
  items: [
    {
      labelId: LABEL_1.id,
      itemId: 1,
      labelNo: 'BCD/2',
      itemName: 'Bracelet Diamond',
      grossWeight: 3.08,
      netWeight: 2.342,
      fineWeight: 1.366,
      pcs: 1,
      metalRate: 0,
      metalAmount: 0,
      diamondWeight: 0.27,
      labourRate: 650,
      labourAmount: 2082,
      otherCharge: 0,
      discountAmt: 0,
      taxableAmount: 11532,
      totalAmount: 11796,
    },
  ],
  ...overrides,
});

const CREATED_ENTRY = {
  id: 1,
  voucherNo: 'LY/1',
  voucherPrefix: 'LY',
  voucherNumber: 1,
  voucherDate: new Date('2025-03-05'),
  accountId: CUSTOMER.id,
  branchId: 1,
  salesmanName: 'Amit',
  status: 'ACTIVE',
  totalGrossWeight: 3.08,
  totalNetWeight: 2.342,
  totalFineWeight: 1.366,
  totalPcs: 1,
  metalAmount: 9450,
  labourAmount: 2082,
  otherCharge: 0,
  discountAmount: 0,
  taxableAmount: 11532,
  cgstAmount: 172,
  sgstAmount: 172,
  totalAmount: 11876,
  roundingDiscount: 0,
  voucherAmount: 11796,
  cashAmount: 0,
  bankAmount: 0,
  cardAmount: 0,
  oldGoldAmount: 0,
  paymentAmount: 0,
  dueAmount: 11796,
  previousOs: 0,
  finalDue: 11796,
  narration: '1 DAY',
  reference: null,
  bookName: null,
};

const CREATED_ITEM = {
  id: 1,
  layawayEntryId: 1,
  labelId: LABEL_1.id,
  itemId: 1,
  labelNo: 'BCD/2',
  itemName: 'Bracelet Diamond',
  grossWeight: 3.08,
  netWeight: 2.342,
  fineWeight: 1.366,
  pcs: 1,
  metalRate: 0,
  metalAmount: 0,
  diamondWeight: 0.27,
  labourRate: 650,
  labourAmount: 2082,
  otherCharge: 0,
  discountAmt: 0,
  taxableAmount: 11532,
  totalAmount: 11796,
};

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// GET /api/layaway – List entries
// ════════════════════════════════════════════════════════════
describe('GET /api/layaway', () => {
  it('returns all layaway entries', async () => {
    const entries = [
      { ...CREATED_ENTRY, account: CUSTOMER, branch: BRANCH, items: [CREATED_ITEM], payments: [] },
    ];
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce(entries);

    const res = await request(app).get('/api/layaway');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].voucherNo).toBe('LY/1');
    expect(res.body.totalAmount).toBe(11796);
  });

  it('returns empty array when no entries exist', async () => {
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/layaway');
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
    expect(res.body.totalAmount).toBe(0);
  });

  it('filters by status', async () => {
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/layaway?status=ACTIVE');
    expect(res.status).toBe(200);
    expect(mockPrisma.layawayEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('filters by customerId', async () => {
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/layaway?customerId=10');
    expect(res.status).toBe(200);
    expect(mockPrisma.layawayEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: 10 }),
      }),
    );
  });

  it('filters by salesmanName', async () => {
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/layaway?salesmanName=Amit');
    expect(res.status).toBe(200);
    expect(mockPrisma.layawayEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ salesmanName: 'Amit' }),
      }),
    );
  });

  it('filters by date range', async () => {
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/layaway?dateFrom=2025-03-01&dateTo=2025-03-31');
    expect(res.status).toBe(200);
    expect(mockPrisma.layawayEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          voucherDate: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });

  it('filters by search string', async () => {
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/layaway?search=LY/1');
    expect(res.status).toBe(200);
    expect(mockPrisma.layawayEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('status=ALL does not add status filter', async () => {
    mockPrisma.layawayEntry.findMany.mockResolvedValueOnce([]);

    await request(app).get('/api/layaway?status=ALL');
    const call = mockPrisma.layawayEntry.findMany.mock.calls[0][0];
    expect(call.where.status).toBeUndefined();
  });

  it('handles server error gracefully', async () => {
    mockPrisma.layawayEntry.findMany.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/layaway');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch layaway entries');
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/layaway/:id – Get single entry
// ════════════════════════════════════════════════════════════
describe('GET /api/layaway/:id', () => {
  it('returns a single layaway entry with items and payments', async () => {
    const entry = {
      ...CREATED_ENTRY,
      account: CUSTOMER,
      branch: BRANCH,
      items: [{ ...CREATED_ITEM, label: LABEL_1 }],
      payments: [],
    };
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce(entry);

    const res = await request(app).get('/api/layaway/1');
    expect(res.status).toBe(200);
    expect(res.body.voucherNo).toBe('LY/1');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].labelNo).toBe('BCD/2');
    expect(res.body.narration).toBe('1 DAY');
  });

  it('returns 404 for non-existent entry', async () => {
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/layaway/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Layaway entry not found');
  });

  it('handles server error', async () => {
    mockPrisma.layawayEntry.findUnique.mockRejectedValueOnce(new Error('DB'));

    const res = await request(app).get('/api/layaway/1');
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/layaway – Create layaway entry
// ════════════════════════════════════════════════════════════
describe('POST /api/layaway', () => {
  it('creates a layaway entry, sets labels to LAYAWAY, updates customer balance', async () => {
    // Transaction mock returns entry
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce(VOUCHER_SEQUENCE);
    mockPrisma.layawayEntry.create.mockResolvedValueOnce(CREATED_ENTRY);
    mockPrisma.layawayItem.create.mockResolvedValueOnce(CREATED_ITEM);
    mockPrisma.label.update.mockResolvedValueOnce({ ...LABEL_1, status: 'LAYAWAY' });
    mockPrisma.account.update.mockResolvedValueOnce({ ...CUSTOMER, closingBalance: 11796 });
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      ...CREATED_ENTRY,
      account: CUSTOMER,
      items: [CREATED_ITEM],
      payments: [],
    });

    const res = await request(app)
      .post('/api/layaway')
      .send(makeLayawayPayload());

    expect(res.status).toBe(201);
    expect(res.body.voucherNo).toBe('LY/1');
    expect(res.body.narration).toBe('1 DAY');

    // Verify label was updated to LAYAWAY
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LABEL_1.id },
        data: { status: 'LAYAWAY' },
      }),
    );

    // Verify customer balance was updated
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CUSTOMER.id },
        data: expect.objectContaining({
          closingBalance: { increment: 11796 },
        }),
      }),
    );
  });

  it('creates entry with multiple items setting all label statuses to LAYAWAY', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ ...VOUCHER_SEQUENCE, lastNumber: 2 });
    mockPrisma.layawayEntry.create.mockResolvedValueOnce({ ...CREATED_ENTRY, id: 2, voucherNo: 'LY/2' });
    mockPrisma.layawayItem.create.mockResolvedValue({});
    mockPrisma.label.update.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValueOnce({});
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      ...CREATED_ENTRY, id: 2, voucherNo: 'LY/2',
      account: CUSTOMER, items: [], payments: [],
    });

    const payload = makeLayawayPayload({
      items: [
        { labelId: 100, itemId: 1, labelNo: 'BCD/2', itemName: 'Bracelet', grossWeight: 3.08, netWeight: 2.34 },
        { labelId: 101, itemId: 2, labelNo: 'GN/51', itemName: 'Necklace', grossWeight: 10.5, netWeight: 9.8 },
      ],
    });

    const res = await request(app).post('/api/layaway').send(payload);
    expect(res.status).toBe(201);

    // Both labels should be set to LAYAWAY
    expect(mockPrisma.label.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 100 }, data: { status: 'LAYAWAY' } }),
    );
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 101 }, data: { status: 'LAYAWAY' } }),
    );
  });

  it('rejects when accountId is missing', async () => {
    const res = await request(app)
      .post('/api/layaway')
      .send(makeLayawayPayload({ accountId: undefined }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Customer is required');
  });

  it('rejects when items array is empty', async () => {
    const res = await request(app)
      .post('/api/layaway')
      .send(makeLayawayPayload({ items: [] }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('At least one item is required');
  });

  it('rejects when items is missing', async () => {
    const res = await request(app)
      .post('/api/layaway')
      .send(makeLayawayPayload({ items: undefined }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('At least one item is required');
  });

  it('creates entry with narration support', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce(VOUCHER_SEQUENCE);
    mockPrisma.layawayEntry.create.mockResolvedValueOnce({ ...CREATED_ENTRY, narration: 'Test narration' });
    mockPrisma.layawayItem.create.mockResolvedValue({});
    mockPrisma.label.update.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      ...CREATED_ENTRY, narration: 'Test narration',
      account: CUSTOMER, items: [CREATED_ITEM], payments: [],
    });

    const res = await request(app)
      .post('/api/layaway')
      .send(makeLayawayPayload({ narration: 'Test narration' }));

    expect(res.status).toBe(201);
    expect(mockPrisma.layawayEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ narration: 'Test narration' }),
      }),
    );
  });

  it('skips customer balance update when dueAmount is 0', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce(VOUCHER_SEQUENCE);
    mockPrisma.layawayEntry.create.mockResolvedValueOnce({ ...CREATED_ENTRY, dueAmount: 0 });
    mockPrisma.layawayItem.create.mockResolvedValue({});
    mockPrisma.label.update.mockResolvedValue({});
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      ...CREATED_ENTRY, dueAmount: 0, account: CUSTOMER, items: [CREATED_ITEM], payments: [],
    });

    const res = await request(app)
      .post('/api/layaway')
      .send(makeLayawayPayload({ dueAmount: 0, paymentAmount: 11796 }));

    expect(res.status).toBe(201);
    // account.update should NOT be called for balance (since dueAmount=0)
    expect(mockPrisma.account.update).not.toHaveBeenCalled();
  });

  it('handles items without labelId (virtual items)', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce(VOUCHER_SEQUENCE);
    mockPrisma.layawayEntry.create.mockResolvedValueOnce(CREATED_ENTRY);
    mockPrisma.layawayItem.create.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      ...CREATED_ENTRY, account: CUSTOMER, items: [], payments: [],
    });

    const payload = makeLayawayPayload({
      items: [{ itemId: 1, labelNo: 'CUSTOM/1', itemName: 'Custom Item', grossWeight: 5 }],
    });

    const res = await request(app).post('/api/layaway').send(payload);
    expect(res.status).toBe(201);
    // label.update should NOT be called since there's no labelId
    expect(mockPrisma.label.update).not.toHaveBeenCalled();
  });

  it('uses correct voucher number prefix LY', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.voucherSequence.upsert.mockResolvedValueOnce({ ...VOUCHER_SEQUENCE, lastNumber: 317 });
    mockPrisma.layawayEntry.create.mockResolvedValueOnce({ ...CREATED_ENTRY, voucherNo: 'LY/317' });
    mockPrisma.layawayItem.create.mockResolvedValue({});
    mockPrisma.label.update.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      ...CREATED_ENTRY, voucherNo: 'LY/317',
      account: CUSTOMER, items: [CREATED_ITEM], payments: [],
    });

    const res = await request(app).post('/api/layaway').send(makeLayawayPayload());
    expect(res.status).toBe(201);

    expect(mockPrisma.voucherSequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          prefix_entityType_financialYear: {
            prefix: 'LY',
            entityType: 'LAYAWAY',
            financialYear: '2025-2026',
          },
        },
      }),
    );
  });

  it('handles server error during creation', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async () => { throw new Error('Transaction failed'); });

    const res = await request(app).post('/api/layaway').send(makeLayawayPayload());
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create layaway entry');
  });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/layaway/:id – Cancel layaway (restore stock)
// ════════════════════════════════════════════════════════════
describe('DELETE /api/layaway/:id', () => {
  it('cancels layaway and restores all labels to IN_STOCK', async () => {
    const entry = {
      ...CREATED_ENTRY,
      items: [
        { ...CREATED_ITEM, labelId: 100 },
        { id: 2, layawayEntryId: 1, labelId: 101, itemId: 2, labelNo: 'GN/51' },
      ],
    };
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce(entry);
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.label.update.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.layawayEntry.update.mockResolvedValue({});

    const res = await request(app).delete('/api/layaway/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Layaway cancelled and items restored to stock');

    // Both labels restored to IN_STOCK
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 100 }, data: { status: 'IN_STOCK' } }),
    );
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 101 }, data: { status: 'IN_STOCK' } }),
    );

    // Entry marked as CANCELLED
    expect(mockPrisma.layawayEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { status: 'CANCELLED' },
      }),
    );
  });

  it('reverses customer balance on cancellation', async () => {
    const entry = { ...CREATED_ENTRY, dueAmount: 11796, items: [CREATED_ITEM] };
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce(entry);
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.label.update.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.layawayEntry.update.mockResolvedValue({});

    const res = await request(app).delete('/api/layaway/1');
    expect(res.status).toBe(200);

    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CUSTOMER.id },
        data: expect.objectContaining({ closingBalance: { decrement: 11796 } }),
      }),
    );
  });

  it('does not reverse balance when dueAmount is 0', async () => {
    const entry = { ...CREATED_ENTRY, dueAmount: 0, items: [CREATED_ITEM] };
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce(entry);
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.label.update.mockResolvedValue({});
    mockPrisma.layawayEntry.update.mockResolvedValue({});

    const res = await request(app).delete('/api/layaway/1');
    expect(res.status).toBe(200);
    expect(mockPrisma.account.update).not.toHaveBeenCalled();
  });

  it('returns 404 for non-existent layaway', async () => {
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).delete('/api/layaway/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Layaway entry not found');
  });

  it('returns 400 when layaway is already cancelled', async () => {
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      ...CREATED_ENTRY,
      status: 'CANCELLED',
      items: [],
    });

    const res = await request(app).delete('/api/layaway/1');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Layaway is already cancelled');
  });

  it('handles items without labelId (no label restore needed)', async () => {
    const entry = {
      ...CREATED_ENTRY,
      items: [{ ...CREATED_ITEM, labelId: null }],
    };
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce(entry);
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.layawayEntry.update.mockResolvedValue({});

    const res = await request(app).delete('/api/layaway/1');
    expect(res.status).toBe(200);
    expect(mockPrisma.label.update).not.toHaveBeenCalled();
  });

  it('handles server error during cancellation', async () => {
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      ...CREATED_ENTRY, items: [CREATED_ITEM],
    });
    mockPrisma.$transaction.mockImplementationOnce(async () => { throw new Error('TX error'); });

    const res = await request(app).delete('/api/layaway/1');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to cancel layaway');
  });
});

// ════════════════════════════════════════════════════════════
// PUT /api/layaway/:id – Update layaway entry
// ════════════════════════════════════════════════════════════
describe('PUT /api/layaway/:id', () => {
  it('updates layaway entry and re-creates items', async () => {
    const existingEntry = { ...CREATED_ENTRY, items: [{ ...CREATED_ITEM, labelId: 100 }] };
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce(existingEntry);
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.label.update.mockResolvedValue({});
    mockPrisma.layawayItem.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.layawayEntry.update.mockResolvedValueOnce({ ...CREATED_ENTRY, narration: 'Updated' });
    mockPrisma.layawayItem.create.mockResolvedValue({});

    const res = await request(app)
      .put('/api/layaway/1')
      .send({ ...makeLayawayPayload(), narration: 'Updated' });

    expect(res.status).toBe(200);

    // Old labels restored first
    expect(mockPrisma.label.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 100 }, data: { status: 'IN_STOCK' } }),
    );

    // Old items deleted
    expect(mockPrisma.layawayItem.deleteMany).toHaveBeenCalledWith({ where: { layawayEntryId: 1 } });
  });

  it('returns 404 for non-existent entry', async () => {
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).put('/api/layaway/999').send(makeLayawayPayload());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Layaway entry not found');
  });

  it('returns 400 when modifying cancelled layaway', async () => {
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({
      ...CREATED_ENTRY, status: 'CANCELLED', items: [],
    });

    const res = await request(app).put('/api/layaway/1').send(makeLayawayPayload());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot modify a cancelled layaway');
  });

  it('handles server error', async () => {
    mockPrisma.layawayEntry.findUnique.mockResolvedValueOnce({ ...CREATED_ENTRY, items: [] });
    mockPrisma.$transaction.mockImplementationOnce(async () => { throw new Error('TX error'); });

    const res = await request(app).put('/api/layaway/1').send(makeLayawayPayload());
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/layaway/:id/payment – Add payment
// ════════════════════════════════════════════════════════════
describe('POST /api/layaway/:id/payment', () => {
  it('adds payment and updates layaway balances', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    const payment = { id: 1, layawayId: 1, amount: 5000, paymentMode: 'Cash' };
    mockPrisma.layawayPayment.create.mockResolvedValueOnce(payment);
    mockPrisma.layawayEntry.update.mockResolvedValueOnce({
      ...CREATED_ENTRY,
      paymentAmount: 5000,
      dueAmount: 6796,
      finalDue: 6796,
      accountId: CUSTOMER.id,
    });
    mockPrisma.account.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/layaway/1/payment')
      .send({ amount: 5000, paymentMode: 'Cash' });

    expect(res.status).toBe(201);
    expect(mockPrisma.layawayPayment.create).toHaveBeenCalled();
    expect(mockPrisma.layawayEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          paymentAmount: { increment: 5000 },
          dueAmount: { decrement: 5000 },
          finalDue: { decrement: 5000 },
        }),
      }),
    );
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ closingBalance: { decrement: 5000 } }),
      }),
    );
  });

  it('marks layaway as COMPLETED when fully paid', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => fn(mockPrisma));
    mockPrisma.layawayPayment.create.mockResolvedValueOnce({});
    // dueAmount becomes 0 after update
    mockPrisma.layawayEntry.update
      .mockResolvedValueOnce({
        ...CREATED_ENTRY,
        paymentAmount: 11796,
        dueAmount: 0,
        accountId: CUSTOMER.id,
      })
      .mockResolvedValueOnce({ ...CREATED_ENTRY, status: 'COMPLETED' });
    mockPrisma.account.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/layaway/1/payment')
      .send({ amount: 11796, paymentMode: 'Cash' });

    expect(res.status).toBe(201);
    // Second update should set status to COMPLETED
    expect(mockPrisma.layawayEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { status: 'COMPLETED' },
      }),
    );
  });

  it('rejects payment with invalid amount', async () => {
    const res = await request(app)
      .post('/api/layaway/1/payment')
      .send({ amount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payment amount is required');
  });

  it('rejects payment with negative amount', async () => {
    const res = await request(app)
      .post('/api/layaway/1/payment')
      .send({ amount: -100 });

    expect(res.status).toBe(400);
  });

  it('rejects payment without amount', async () => {
    const res = await request(app)
      .post('/api/layaway/1/payment')
      .send({ paymentMode: 'Cash' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payment amount is required');
  });

  it('handles server error during payment', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async () => { throw new Error('Payment error'); });

    const res = await request(app)
      .post('/api/layaway/1/payment')
      .send({ amount: 5000 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to add payment');
  });
});
