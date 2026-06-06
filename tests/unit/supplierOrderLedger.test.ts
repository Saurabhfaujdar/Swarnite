/**
 * Supplier Order Ledger — unit tests
 *
 * Validates balance correctness, entry creation, denormalized balance
 * updates, and cancellation reversal logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  postAdvancePaymentLedger,
  postSupplierInvoicePayable,
  postSupplierPayment,
  postGoodsReceiptMetalLedger,
  postQcAcceptedMetalLedger,
  postWeightAdjustmentLedger,
  reverseLedgerForCancellation,
  getSupplierBalance,
  postDebitNote,
  postCreditNote,
  postMetalIssuance,
} from '../../server/services/supplierOrderLedger';

// ─── Mock Prisma Transaction ─────────────────────────────────────────

function createMockTx() {
  const moneyLedgerRows: any[] = [];
  const metalLedgerRows: any[] = [];
  let accountData = { closingBalance: 0, balanceType: 'NONE' };
  let moneyIdSeq = 1;
  let metalIdSeq = 1;

  const tx = {
    supplierMoneyLedger: {
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        // Return last entry for supplierId + companyId
        const matching = moneyLedgerRows.filter(
          (r) => r.supplierId === where.supplierId && r.companyId === where.companyId,
        );
        if (matching.length === 0) return null;
        return matching[matching.length - 1];
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return moneyLedgerRows.filter((r) => r.supplierOrderId === where.supplierOrderId);
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: moneyIdSeq++, ...data, createdAt: new Date() };
        moneyLedgerRows.push(row);
        return row;
      }),
    },
    supplierMetalLedger: {
      findFirst: vi.fn(async ({ where }: any) => {
        const matching = metalLedgerRows.filter(
          (r) =>
            r.supplierId === where.supplierId &&
            r.companyId === where.companyId &&
            r.metalTypeId === where.metalTypeId,
        );
        if (matching.length === 0) return null;
        return matching[matching.length - 1];
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return metalLedgerRows.filter((r) => r.supplierOrderId === where.supplierOrderId);
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: metalIdSeq++, ...data, createdAt: new Date() };
        metalLedgerRows.push(row);
        return row;
      }),
    },
    account: {
      update: vi.fn(async ({ data }: any) => {
        accountData = { ...accountData, ...data };
        return accountData;
      }),
    },
    // expose internals for assertions
    _moneyLedgerRows: moneyLedgerRows,
    _metalLedgerRows: metalLedgerRows,
    _getAccountData: () => accountData,
  };

  return tx;
}

const BASE_ARGS = {
  supplierId: 100,
  companyId: 1,
  branchId: 10,
  supplierOrderId: 500,
  userId: 42,
};

// ─── Money Ledger Tests ──────────────────────────────────────────────

describe('supplierOrderLedger.money', () => {
  let tx: ReturnType<typeof createMockTx>;

  beforeEach(() => {
    tx = createMockTx();
  });

  describe('postAdvancePaymentLedger', () => {
    it('creates credit entry and updates account balance to negative (advance reduces payable)', async () => {
      const entry = await postAdvancePaymentLedger({
        tx: tx as any,
        ...BASE_ARGS,
        paymentId: 1,
        amount: 5000,
      });

      expect(entry.transactionType).toBe('ADVANCE_PAID');
      expect(entry.credit).toBe(5000);
      expect(entry.debit).toBe(0);
      expect(entry.balanceAfterTransaction).toBe(-5000); // nothing owed yet, advance is overpayment
      expect(tx.account.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { closingBalance: 5000, balanceType: 'DR' },
      });
    });
  });

  describe('postSupplierInvoicePayable', () => {
    it('creates debit entry — increases payable', async () => {
      const entry = await postSupplierInvoicePayable({
        tx: tx as any,
        ...BASE_ARGS,
        invoiceId: 10,
        amount: 20000,
      });

      expect(entry.transactionType).toBe('ORDER_PAYABLE');
      expect(entry.debit).toBe(20000);
      expect(entry.credit).toBe(0);
      expect(entry.balanceAfterTransaction).toBe(20000);
      expect(tx.account.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { closingBalance: 20000, balanceType: 'CR' },
      });
    });
  });

  describe('postSupplierPayment', () => {
    it('creates credit entry — reduces payable', async () => {
      // First create a payable
      await postSupplierInvoicePayable({
        tx: tx as any,
        ...BASE_ARGS,
        invoiceId: 10,
        amount: 20000,
      });

      const entry = await postSupplierPayment({
        tx: tx as any,
        ...BASE_ARGS,
        paymentId: 2,
        amount: 15000,
        paymentType: 'DELIVERY_PAYMENT',
      });

      expect(entry.transactionType).toBe('DELIVERY_PAYMENT');
      expect(entry.credit).toBe(15000);
      expect(entry.balanceAfterTransaction).toBe(5000); // 20000 - 15000
    });

    it('handles SETTLEMENT payment type', async () => {
      const entry = await postSupplierPayment({
        tx: tx as any,
        ...BASE_ARGS,
        paymentId: 3,
        amount: 1000,
        paymentType: 'SETTLEMENT',
      });

      expect(entry.transactionType).toBe('SETTLEMENT');
    });
  });

  describe('postDebitNote', () => {
    it('reduces payable (credit entry)', async () => {
      await postSupplierInvoicePayable({ tx: tx as any, ...BASE_ARGS, invoiceId: 10, amount: 10000 });
      const entry = await postDebitNote({ tx: tx as any, ...BASE_ARGS, amount: 2000 });

      expect(entry.transactionType).toBe('DEBIT_NOTE');
      expect(entry.credit).toBe(2000);
      expect(entry.balanceAfterTransaction).toBe(8000);
    });
  });

  describe('postCreditNote', () => {
    it('increases payable (debit entry)', async () => {
      const entry = await postCreditNote({ tx: tx as any, ...BASE_ARGS, amount: 3000 });

      expect(entry.transactionType).toBe('CREDIT_NOTE');
      expect(entry.debit).toBe(3000);
      expect(entry.balanceAfterTransaction).toBe(3000);
    });
  });

  describe('balance correctness — full lifecycle', () => {
    it('invoice → advance → payment → debit note produces correct running balance', async () => {
      // 1. Invoice payable: +20000
      const e1 = await postSupplierInvoicePayable({ tx: tx as any, ...BASE_ARGS, invoiceId: 1, amount: 20000 });
      expect(e1.balanceAfterTransaction).toBe(20000);

      // 2. Advance paid: -5000
      const e2 = await postAdvancePaymentLedger({ tx: tx as any, ...BASE_ARGS, paymentId: 1, amount: 5000 });
      expect(e2.balanceAfterTransaction).toBe(15000);

      // 3. Payment: -10000
      const e3 = await postSupplierPayment({ tx: tx as any, ...BASE_ARGS, paymentId: 2, amount: 10000, paymentType: 'DELIVERY_PAYMENT' });
      expect(e3.balanceAfterTransaction).toBe(5000);

      // 4. Debit note: -2000
      const e4 = await postDebitNote({ tx: tx as any, ...BASE_ARGS, amount: 2000 });
      expect(e4.balanceAfterTransaction).toBe(3000);

      // Final account state
      expect(tx._getAccountData()).toEqual({ closingBalance: 3000, balanceType: 'CR' });
    });

    it('advance before invoice shows negative balance (DR)', async () => {
      await postAdvancePaymentLedger({ tx: tx as any, ...BASE_ARGS, paymentId: 1, amount: 10000 });
      expect(tx._getAccountData()).toEqual({ closingBalance: 10000, balanceType: 'DR' });
    });

    it('zero balance sets balanceType to NONE', async () => {
      await postSupplierInvoicePayable({ tx: tx as any, ...BASE_ARGS, invoiceId: 1, amount: 5000 });
      await postSupplierPayment({ tx: tx as any, ...BASE_ARGS, paymentId: 1, amount: 5000, paymentType: 'DELIVERY_PAYMENT' });
      expect(tx._getAccountData()).toEqual({ closingBalance: 0, balanceType: 'NONE' });
    });
  });
});

// ─── Metal Ledger Tests ──────────────────────────────────────────────

describe('supplierOrderLedger.metal', () => {
  let tx: ReturnType<typeof createMockTx>;

  beforeEach(() => {
    tx = createMockTx();
  });

  describe('postMetalIssuance', () => {
    it('creates ISSUED entry — balance increases (supplier holds more)', async () => {
      const entry = await postMetalIssuance({
        tx: tx as any,
        ...BASE_ARGS,
        metalTypeId: 1,
        purity: 91.67,
        grossWeight: 10,
        netWeight: 9.5,
      });

      expect(entry.transactionType).toBe('METAL_ISSUED');
      expect(entry.direction).toBe('ISSUED');
      expect(entry.grossWeight).toBe(10);
      expect(entry.netWeight).toBe(9.5);
      // fineWeight = 9.5 * 91.67/100 = 8.70865
      const expectedFine = 9.5 * (91.67 / 100);
      expect(entry.fineWeight).toBeCloseTo(expectedFine, 4);
      expect(entry.balanceAfterTransaction).toBeCloseTo(expectedFine, 4);
    });
  });

  describe('postGoodsReceiptMetalLedger', () => {
    it('creates RECEIVED entry — balance decreases (supplier holds less)', async () => {
      // First issue metal
      await postMetalIssuance({
        tx: tx as any,
        ...BASE_ARGS,
        metalTypeId: 1,
        purity: 91.67,
        grossWeight: 10,
        netWeight: 10,
      });

      // Then receive back
      const entry = await postGoodsReceiptMetalLedger({
        tx: tx as any,
        ...BASE_ARGS,
        receiptId: 1,
        metalTypeId: 1,
        purity: 91.67,
        grossWeight: 9,
        netWeight: 9,
      });

      expect(entry.transactionType).toBe('METAL_RECEIVED');
      expect(entry.direction).toBe('RECEIVED');
      // Balance = issued_fine - received_fine
      const issuedFine = 10 * (91.67 / 100);
      const receivedFine = 9 * (91.67 / 100);
      expect(entry.balanceAfterTransaction).toBeCloseTo(issuedFine - receivedFine, 4);
    });

    it('starts from zero balance if no prior issuance', async () => {
      const entry = await postGoodsReceiptMetalLedger({
        tx: tx as any,
        ...BASE_ARGS,
        receiptId: 1,
        metalTypeId: 1,
        purity: 75.0,
        grossWeight: 5,
        netWeight: 4.8,
      });

      const expectedFine = -(4.8 * (75 / 100)); // negative because RECEIVED
      expect(entry.balanceAfterTransaction).toBeCloseTo(expectedFine, 4);
    });
  });

  describe('postWeightAdjustmentLedger', () => {
    it('records shortage (negative delta)', async () => {
      const entry = await postWeightAdjustmentLedger({
        tx: tx as any,
        ...BASE_ARGS,
        metalTypeId: 1,
        purity: 91.67,
        adjustmentType: 'SHORT_RECEIVED',
        netWeightDelta: -0.5,
        grossWeightDelta: -0.5,
        remarks: 'Short by 0.5g',
      });

      expect(entry.transactionType).toBe('SHORTAGE');
      // Fine weight for shortage: -0.5 * 91.67/100 applied as RECEIVED direction
      const expectedFine = -Math.abs(-0.5 * (91.67 / 100));
      expect(entry.fineWeight).toBeCloseTo(expectedFine, 4);
    });

    it('records excess (positive delta)', async () => {
      const entry = await postWeightAdjustmentLedger({
        tx: tx as any,
        ...BASE_ARGS,
        metalTypeId: 1,
        purity: 91.67,
        adjustmentType: 'EXCESS_RECEIVED',
        netWeightDelta: 1.2,
        grossWeightDelta: 1.3,
      });

      expect(entry.transactionType).toBe('EXCESS_RECEIVED');
      const expectedFine = -(1.2 * (91.67 / 100)); // RECEIVED direction = negative
      expect(entry.fineWeight).toBeCloseTo(expectedFine, 4);
    });

    it('records wastage approved', async () => {
      const entry = await postWeightAdjustmentLedger({
        tx: tx as any,
        ...BASE_ARGS,
        metalTypeId: 1,
        purity: 91.67,
        adjustmentType: 'WASTAGE_APPROVED',
        netWeightDelta: -0.3,
        grossWeightDelta: -0.3,
      });

      expect(entry.transactionType).toBe('WASTAGE_APPROVED');
    });
  });

  describe('postQcAcceptedMetalLedger', () => {
    it('creates zero-balance-change entry (audit trail only)', async () => {
      const entry = await postQcAcceptedMetalLedger({
        tx: tx as any,
        ...BASE_ARGS,
        receiptId: 1,
        metalTypeId: 1,
        purity: 91.67,
        acceptedGrossWeight: 9,
        acceptedNetWeight: 8.5,
      });

      // No balance change — net/gross weight are 0
      expect(entry.grossWeight).toBe(0);
      expect(entry.netWeight).toBe(0);
      expect(entry.balanceAfterTransaction).toBe(0);
    });
  });

  describe('fine weight calculation', () => {
    it('correctly computes fine weight = netWeight × purity/100', async () => {
      const entry = await postMetalIssuance({
        tx: tx as any,
        ...BASE_ARGS,
        metalTypeId: 1,
        purity: 75.0, // 18KT
        grossWeight: 20,
        netWeight: 18,
      });

      // fineWeight = 18 * 75/100 = 13.5
      expect(entry.fineWeight).toBeCloseTo(13.5, 4);
    });

    it('groups balance by metalType independently', async () => {
      // Issue gold (metalTypeId=1)
      await postMetalIssuance({
        tx: tx as any,
        ...BASE_ARGS,
        metalTypeId: 1,
        purity: 91.67,
        grossWeight: 10,
        netWeight: 10,
      });

      // Issue silver (metalTypeId=2)
      const silverEntry = await postMetalIssuance({
        tx: tx as any,
        ...BASE_ARGS,
        metalTypeId: 2,
        purity: 92.5,
        grossWeight: 50,
        netWeight: 50,
      });

      // Silver balance should be independent
      const expectedSilverFine = 50 * (92.5 / 100);
      expect(silverEntry.balanceAfterTransaction).toBeCloseTo(expectedSilverFine, 4);
    });
  });
});

// ─── Cancellation Reversal Tests ─────────────────────────────────────

describe('supplierOrderLedger.reverseLedgerForCancellation', () => {
  let tx: ReturnType<typeof createMockTx>;

  beforeEach(() => {
    tx = createMockTx();
  });

  it('reverses net payable to zero', async () => {
    // Create payable then partial payment
    await postSupplierInvoicePayable({ tx: tx as any, ...BASE_ARGS, invoiceId: 1, amount: 20000 });
    await postSupplierPayment({ tx: tx as any, ...BASE_ARGS, paymentId: 1, amount: 5000, paymentType: 'DELIVERY_PAYMENT' });

    // Net payable = 15000, cancellation should write it off
    await reverseLedgerForCancellation({ tx: tx as any, ...BASE_ARGS });

    const rows = tx._moneyLedgerRows;
    const lastRow = rows[rows.length - 1];
    expect(lastRow.transactionType).toBe('MONEY_ADJUSTMENT');
    expect(lastRow.credit).toBe(15000);
    expect(lastRow.balanceAfterTransaction).toBe(0);
  });

  it('records refund due when advance exceeds payable', async () => {
    // Advance only, no invoice
    await postAdvancePaymentLedger({ tx: tx as any, ...BASE_ARGS, paymentId: 1, amount: 10000 });

    await reverseLedgerForCancellation({ tx: tx as any, ...BASE_ARGS });

    const rows = tx._moneyLedgerRows;
    const lastRow = rows[rows.length - 1];
    expect(lastRow.transactionType).toBe('REFUND_RECEIVED');
    expect(lastRow.debit).toBe(10000); // refund due
  });

  it('does nothing when balance is already zero', async () => {
    await postSupplierInvoicePayable({ tx: tx as any, ...BASE_ARGS, invoiceId: 1, amount: 5000 });
    await postSupplierPayment({ tx: tx as any, ...BASE_ARGS, paymentId: 1, amount: 5000, paymentType: 'DELIVERY_PAYMENT' });

    const rowsBefore = tx._moneyLedgerRows.length;
    await reverseLedgerForCancellation({ tx: tx as any, ...BASE_ARGS });
    // No additional money rows needed
    expect(tx._moneyLedgerRows.length).toBe(rowsBefore);
  });

  it('reverses metal balance per metalType', async () => {
    await postMetalIssuance({ tx: tx as any, ...BASE_ARGS, metalTypeId: 1, purity: 91.67, grossWeight: 10, netWeight: 10 });
    await postGoodsReceiptMetalLedger({ tx: tx as any, ...BASE_ARGS, receiptId: 1, metalTypeId: 1, purity: 91.67, grossWeight: 6, netWeight: 6 });

    await reverseLedgerForCancellation({ tx: tx as any, ...BASE_ARGS });

    const metalRows = tx._metalLedgerRows;
    const lastMetal = metalRows[metalRows.length - 1];
    expect(lastMetal.transactionType).toBe('METAL_ADJUSTMENT');
    // Net fine for metalType 1: issued 10*91.67/100 - received 6*91.67/100 = 4*91.67/100 ≈ 3.6668
    // Reversal should bring balance to 0
    expect(lastMetal.balanceAfterTransaction).toBeCloseTo(0, 3);
  });

  it('handles multiple metal types independently', async () => {
    await postMetalIssuance({ tx: tx as any, ...BASE_ARGS, metalTypeId: 1, purity: 91.67, grossWeight: 10, netWeight: 10 });
    await postMetalIssuance({ tx: tx as any, ...BASE_ARGS, metalTypeId: 2, purity: 92.5, grossWeight: 50, netWeight: 50 });

    await reverseLedgerForCancellation({ tx: tx as any, ...BASE_ARGS });

    // Should have 2 reversal entries (one per metal type)
    const adjustments = tx._metalLedgerRows.filter((r: any) => r.transactionType === 'METAL_ADJUSTMENT');
    expect(adjustments.length).toBe(2);
  });
});

// ─── getSupplierBalance ──────────────────────────────────────────────

describe('supplierOrderLedger.getSupplierBalance', () => {
  it('returns zero when no entries exist', async () => {
    const mockClient = {
      supplierMoneyLedger: {
        findFirst: vi.fn(async () => null),
      },
      supplierMetalLedger: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await getSupplierBalance(mockClient as any, 100, 1);
    expect(result.moneyBalance).toBe(0);
    expect(result.metalBalances).toEqual([]);
  });

  it('returns correct money and metal balances', async () => {
    const mockClient = {
      supplierMoneyLedger: {
        findFirst: vi.fn(async () => ({ balanceAfterTransaction: 15000 })),
      },
      supplierMetalLedger: {
        findMany: vi.fn(async () => [
          { metalTypeId: 1, balanceAfterTransaction: 5.5 },
          { metalTypeId: 2, balanceAfterTransaction: -2.3 },
        ]),
      },
    };

    const result = await getSupplierBalance(mockClient as any, 100, 1);
    expect(result.moneyBalance).toBe(15000);
    expect(result.metalBalances).toEqual([
      { metalTypeId: 1, fineWeightBalance: 5.5 },
      { metalTypeId: 2, fineWeightBalance: -2.3 },
    ]);
  });
});
