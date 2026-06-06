/**
 * Supplier Order Inventory Posting — unit tests
 *
 * Validates:
 *  - Label creation (correct weights, status, auto-sequence)
 *  - PurchaseVoucher + PurchaseItem creation
 *  - Receipt item marked as posted with inventoryItemId
 *  - Ledger entries posted per item
 *  - Idempotency (skips already-posted items)
 *  - Error when no Item master found
 *  - Error when no LabelPrefix found
 *  - Rejected items excluded
 *  - State transition called
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Prisma ──────────────────────────────────────────────────────

vi.mock('../../server/prisma', () => ({
  prisma: {
    supplierOrder: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../server/prisma';
const mockPrisma = vi.mocked(prisma);

// ─── Mock Workflow ────────────────────────────────────────────────────

const mockCanTransition = vi.fn().mockReturnValue(true);
const mockTransitionSupplierOrder = vi.fn().mockResolvedValue(undefined);
vi.mock('../../server/services/supplierOrderWorkflow', () => ({
  canTransition: (...args: any[]) => mockCanTransition(...args),
  transitionSupplierOrder: (...args: any[]) => mockTransitionSupplierOrder(...args),
}));

// ─── Mock Ledger ─────────────────────────────────────────────────────

const mockPostQcAcceptedMetalLedger = vi.fn().mockResolvedValue(undefined);
vi.mock('../../server/services/supplierOrderLedger', () => ({
  postQcAcceptedMetalLedger: (...args: any[]) => mockPostQcAcceptedMetalLedger(...args),
}));

// ─── Mock Logger ─────────────────────────────────────────────────────

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ─── Import after mocks ──────────────────────────────────────────────

import { postSupplierOrderPurchase } from '../../server/services/supplierOrderInventory';

// ─── Fixtures ────────────────────────────────────────────────────────

const ORDER_FIXTURE = {
  id: 100,
  orderNo: 'SO/1',
  supplierId: 10,
  companyId: 1,
  branchId: 1,
  status: 'QC_COMPLETED',
  goldRate: 65000,
  silverRate: 0,
  items: [
    {
      id: 200,
      category: 'JEWELRY',
      ornamentType: 'Ring',
      metalTypeId: 1,
      purity: '22KT',
      makingChargeType: 'per_gram',
      makingChargeValue: 800,
    },
  ],
  receipts: [
    {
      id: 300,
      items: [
        {
          id: 400,
          supplierOrderItemId: 200,
          receivedQty: 2,
          receivedGrossWeight: 50,
          receivedNetWeight: 47.5,
          receivedPurity: 91.6,
          acceptedQty: 2,
          acceptedGrossWeight: 50,
          acceptedNetWeight: 47.5,
          qcStatus: 'PASSED',
          inventoryPosted: false,
        },
      ],
    },
  ],
};

// ─── Transaction mock helper ─────────────────────────────────────────

function createMockTx() {
  const createdLabels: any[] = [];
  const createdPurchaseItems: any[] = [];
  let labelIdSeq = 1000;

  const tx: any = {
    voucherSequence: {
      upsert: vi.fn().mockResolvedValue({ lastNumber: 42 }),
    },
    purchaseVoucher: {
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 1, ...data,
      })),
    },
    purchaseItem: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        createdPurchaseItems.push(data);
        return { id: createdPurchaseItems.length, ...data };
      }),
    },
    itemGroup: {
      findFirst: vi.fn().mockResolvedValue({ id: 5, name: 'RING', metalTypeId: 1 }),
    },
    item: {
      findFirst: vi.fn().mockResolvedValue({ id: 15, name: 'RING 22KT', itemGroupId: 5, metalTypeId: 1 }),
    },
    labelPrefix: {
      findFirst: vi.fn().mockResolvedValue({ id: 3, prefix: 'RN22', itemGroupId: 5, companyId: 1, lastNumber: 100 }),
      update: vi.fn().mockImplementation(async () => ({ id: 3, prefix: 'RN22', lastNumber: 101 })),
    },
    label: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const label = { id: labelIdSeq++, ...data };
        createdLabels.push(label);
        return label;
      }),
    },
    supplierOrderReceiptItem: {
      update: vi.fn().mockResolvedValue({}),
    },
    account: {
      update: vi.fn().mockResolvedValue({}),
    },
  };

  return { tx, createdLabels, createdPurchaseItems };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('postSupplierOrderPurchase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when order not found', async () => {
    mockPrisma.supplierOrder.findUnique.mockResolvedValue(null);

    await expect(
      postSupplierOrderPurchase({ supplierOrderId: 999, companyId: 1, branchId: 1, userId: 1 })
    ).rejects.toThrow('Supplier order not found');
  });

  it('throws when status not allowed', async () => {
    mockPrisma.supplierOrder.findUnique.mockResolvedValue({
      ...ORDER_FIXTURE, status: 'DRAFT',
    });

    await expect(
      postSupplierOrderPurchase({ supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1 })
    ).rejects.toThrow(/Cannot post purchase from status DRAFT/);
  });

  it('throws when no accepted items exist', async () => {
    const orderNoAccepted = {
      ...ORDER_FIXTURE,
      receipts: [{
        id: 300,
        items: [{
          ...ORDER_FIXTURE.receipts[0].items[0],
          qcStatus: 'FAILED',
        }],
      }],
    };
    mockPrisma.supplierOrder.findUnique.mockResolvedValue(orderNoAccepted);

    await expect(
      postSupplierOrderPurchase({ supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1 })
    ).rejects.toThrow('No accepted QC items to post');
  });

  it('skips already-posted items (partial idempotency)', async () => {
    const { tx } = createMockTx();
    const order = {
      ...ORDER_FIXTURE,
      receipts: [{
        id: 300,
        items: [
          { ...ORDER_FIXTURE.receipts[0].items[0], inventoryPosted: true }, // already posted
          { // new unposted item
            id: 401, supplierOrderItemId: 200,
            receivedQty: 1, receivedGrossWeight: 25, receivedNetWeight: 23,
            receivedPurity: 91.6, acceptedQty: 1, acceptedGrossWeight: 25, acceptedNetWeight: 23,
            qcStatus: 'PASSED', inventoryPosted: false,
          },
        ],
      }],
    };
    mockPrisma.supplierOrder.findUnique.mockResolvedValue(order);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(tx));

    const result = await postSupplierOrderPurchase({
      supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1,
    });

    // Only 1 item posted (the unposted one)
    expect(result.itemsPosted).toBe(1);
    expect(tx.label.create).toHaveBeenCalledTimes(1);
    expect(tx.supplierOrderReceiptItem.update).toHaveBeenCalledTimes(1);
  });

  it('creates label with correct weights from QC-accepted values', async () => {
    const { tx, createdLabels } = createMockTx();
    mockPrisma.supplierOrder.findUnique.mockResolvedValue(ORDER_FIXTURE);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(tx));

    await postSupplierOrderPurchase({
      supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1,
    });

    expect(tx.label.create).toHaveBeenCalledTimes(1);
    const labelData = tx.label.create.mock.calls[0][0].data;
    expect(labelData.grossWeight).toBe(50);
    expect(labelData.netWeight).toBe(47.5);
    expect(labelData.pcsCount).toBe(2);
    expect(labelData.status).toBe('IN_STOCK');
    expect(labelData.branchId).toBe(1);
    expect(labelData.labelNo).toBe('RN22/101');
  });

  it('creates PurchaseVoucher + PurchaseItem linked to label', async () => {
    const { tx, createdPurchaseItems } = createMockTx();
    mockPrisma.supplierOrder.findUnique.mockResolvedValue(ORDER_FIXTURE);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(tx));

    const result = await postSupplierOrderPurchase({
      supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1,
    });

    // Purchase voucher created
    expect(tx.purchaseVoucher.create).toHaveBeenCalledTimes(1);
    const voucherData = tx.purchaseVoucher.create.mock.calls[0][0].data;
    expect(voucherData.voucherNo).toBe('PUR/42');
    expect(voucherData.purchaseType).toBe('REGULAR');
    expect(voucherData.accountId).toBe(10); // supplierId
    expect(voucherData.totalNetWeight).toBe(47.5);
    expect(voucherData.metalRate).toBe(65000);

    // Purchase item linked to label
    expect(tx.purchaseItem.create).toHaveBeenCalledTimes(1);
    const itemData = tx.purchaseItem.create.mock.calls[0][0].data;
    expect(itemData.labelId).toBe(1000); // first created label id
    expect(itemData.weight).toBe(47.5);
    expect(itemData.rate).toBe(65000);

    expect(result.voucherNo).toBe('PUR/42');
    expect(result.purchaseVoucherId).toBe(1);
  });

  it('marks receipt items as inventoryPosted with inventoryItemId', async () => {
    const { tx } = createMockTx();
    mockPrisma.supplierOrder.findUnique.mockResolvedValue(ORDER_FIXTURE);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(tx));

    await postSupplierOrderPurchase({
      supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1,
    });

    expect(tx.supplierOrderReceiptItem.update).toHaveBeenCalledWith({
      where: { id: 400 },
      data: { inventoryPosted: true, inventoryItemId: 1000 },
    });
  });

  it('posts metal ledger entry per item', async () => {
    const { tx } = createMockTx();
    mockPrisma.supplierOrder.findUnique.mockResolvedValue(ORDER_FIXTURE);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(tx));

    await postSupplierOrderPurchase({
      supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1,
    });

    expect(mockPostQcAcceptedMetalLedger).toHaveBeenCalledTimes(1);
    expect(mockPostQcAcceptedMetalLedger).toHaveBeenCalledWith(expect.objectContaining({
      tx,
      supplierId: 10,
      companyId: 1,
      branchId: 1,
      supplierOrderId: 100,
      receiptId: 300,
      metalTypeId: 1,
      purity: 91.6,
      acceptedGrossWeight: 50,
      acceptedNetWeight: 47.5,
    }));
  });

  it('updates supplier account balance', async () => {
    const { tx } = createMockTx();
    mockPrisma.supplierOrder.findUnique.mockResolvedValue(ORDER_FIXTURE);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(tx));

    await postSupplierOrderPurchase({
      supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1,
    });

    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        closingBalance: { increment: 47.5 * 65000 },
        balanceType: 'CR',
      },
    });
  });

  it('transitions order to PURCHASE_POSTED', async () => {
    const { tx } = createMockTx();
    mockPrisma.supplierOrder.findUnique.mockResolvedValue(ORDER_FIXTURE);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(tx));

    await postSupplierOrderPurchase({
      supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1,
    });

    expect(mockCanTransition).toHaveBeenCalledWith('QC_COMPLETED', 'PURCHASE_POSTED');
    expect(mockTransitionSupplierOrder).toHaveBeenCalledWith(
      tx, 100, 'QC_COMPLETED', 'PURCHASE_POSTED',
      expect.objectContaining({ userId: 1 }),
    );
  });

  it('throws when no Item master matches', async () => {
    const { tx } = createMockTx();
    tx.itemGroup.findFirst.mockResolvedValue(null);
    tx.item.findFirst.mockResolvedValue(null);

    mockPrisma.supplierOrder.findUnique.mockResolvedValue(ORDER_FIXTURE);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(tx));

    await expect(
      postSupplierOrderPurchase({ supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1 })
    ).rejects.toThrow(/No matching Item master/);
  });

  it('throws when no LabelPrefix exists', async () => {
    const { tx } = createMockTx();
    tx.labelPrefix.findFirst.mockResolvedValue(null);

    mockPrisma.supplierOrder.findUnique.mockResolvedValue(ORDER_FIXTURE);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(tx));

    await expect(
      postSupplierOrderPurchase({ supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1 })
    ).rejects.toThrow(/No active LabelPrefix/);
  });

  it('handles multiple receipt items from different receipts', async () => {
    const { tx } = createMockTx();
    const multiOrder = {
      ...ORDER_FIXTURE,
      items: [
        ORDER_FIXTURE.items[0],
        { id: 201, category: 'JEWELRY', ornamentType: 'Chain', metalTypeId: 1, purity: '22KT', makingChargeType: null, makingChargeValue: 0 },
      ],
      receipts: [
        {
          id: 300,
          items: [ORDER_FIXTURE.receipts[0].items[0]],
        },
        {
          id: 301,
          items: [{
            id: 401, supplierOrderItemId: 201,
            receivedQty: 1, receivedGrossWeight: 30, receivedNetWeight: 28,
            receivedPurity: 91.6, acceptedQty: 1, acceptedGrossWeight: 30, acceptedNetWeight: 28,
            qcStatus: 'CONDITIONAL', inventoryPosted: false,
          }],
        },
      ],
    };

    mockPrisma.supplierOrder.findUnique.mockResolvedValue(multiOrder);
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(tx));

    // Second prefix update returns incremented number
    tx.labelPrefix.update
      .mockResolvedValueOnce({ id: 3, prefix: 'RN22', lastNumber: 101 })
      .mockResolvedValueOnce({ id: 3, prefix: 'RN22', lastNumber: 102 });

    const result = await postSupplierOrderPurchase({
      supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1,
    });

    expect(result.labelsCreated).toBe(2);
    expect(result.itemsPosted).toBe(2);
    expect(tx.label.create).toHaveBeenCalledTimes(2);
    expect(tx.purchaseItem.create).toHaveBeenCalledTimes(2);
    expect(mockPostQcAcceptedMetalLedger).toHaveBeenCalledTimes(2);
  });

  it('excludes rejected items', async () => {
    const { tx } = createMockTx();
    const order = {
      ...ORDER_FIXTURE,
      receipts: [{
        id: 300,
        items: [
          { ...ORDER_FIXTURE.receipts[0].items[0], qcStatus: 'FAILED', inventoryPosted: false },
        ],
      }],
    };
    mockPrisma.supplierOrder.findUnique.mockResolvedValue(order);

    await expect(
      postSupplierOrderPurchase({ supplierOrderId: 100, companyId: 1, branchId: 1, userId: 1 })
    ).rejects.toThrow('No accepted QC items to post');
  });
});
