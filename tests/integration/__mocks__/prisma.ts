/**
 * Mock Prisma client for integration tests.
 * Every model method returns a jest.fn() that can be configured per-test.
 */

// Build a proxy that creates jest.fn() for any accessed property chain.
// e.g. prisma.user.findUnique → jest.fn()
function createMockModel(): Record<string, jest.Mock> {
  return {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    upsert: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    aggregate: jest.fn().mockResolvedValue({ _max: {}, _min: {}, _sum: {}, _avg: {}, _count: {} }),
    groupBy: jest.fn().mockResolvedValue([]),
  };
}

const mockPrisma: Record<string, any> = {};

const modelNames = [
  'user', 'branch', 'company',
  'metalType', 'itemGroup', 'purity', 'metalRate',
  'salesman', 'counter', 'gstConfig',
  'account', 'salesVoucher', 'salesItem',
  'purchaseVoucher', 'purchaseItem',
  'cashEntry', 'cashEntryLine',
  'inventoryItem', 'labelEntry', 'labelItem',
  'branchTransfer', 'branchTransferItem',
  'layaway', 'layawayEntry', 'layawayItem', 'layawayPayment', 'layawayStatusHistory',
  'label', 'item', 'labelPrefix',
  'voucherSequence',
  'customerPayment',
  'savingsScheme',
  'schemeInstallment',
  'refreshToken',
  'branchStaff',
  'auditLog',
  'stockRequest',
  'stockRequestItem',
  // Repair module
  'repairJob',
  'repairItem',
  'repairPhoto',
  'repairStateHistory',
  'repairKarigerAssignment',
  'repairWeightAdjustment',
  'repairCharge',
  'repairInvoice',
  'kariger',
  'karigerMetalLedger',
  'karigerMoneyLedger',
  'attachment',
  // Supplier Order module
  'supplierOrder',
  'supplierOrderItem',
  'supplierOrderReceipt',
  'supplierOrderReceiptItem',
  'supplierOrderWeightAdjustment',
  'supplierOrderInvoice',
  'supplierOrderPayment',
  'supplierOrderStateHistory',
  'supplierMetalLedger',
  'supplierMoneyLedger',
  // Courier module
  'courierShipment',
];

for (const name of modelNames) {
  mockPrisma[name] = createMockModel();
}

// Transaction mock
mockPrisma.$transaction = jest.fn(async (fn: Function) => {
  return fn(mockPrisma);
});

// Raw SQL helpers used by voucher allocators
mockPrisma.$queryRawUnsafe = jest.fn().mockResolvedValue([{ max: 0 }]);
mockPrisma.$executeRawUnsafe = jest.fn().mockResolvedValue(0);
mockPrisma.$queryRaw = jest.fn().mockResolvedValue([]);

export default mockPrisma;
