/**
 * Repair Ledger services — unit tests
 *
 * The ledger is the single source of truth for kariger metal & money
 * balances. Bugs here can hide gold theft or pay a kariger twice.
 * Goals of these tests:
 *   - Sign convention is preserved (positive = shop gave / shop owes)
 *   - balanceAfterTransaction is the running sum
 *   - The denormalised `kariger.metalBalance / moneyBalance` snapshot
 *     stays in sync with the new entry
 *   - Missing kariger throws
 */
import { describe, it, expect, vi } from 'vitest';
import { postMetalLedger, postMoneyLedger } from '../../server/services/repairLedger';

function buildTx(currentBalance: number) {
  const ledgerCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));
  const karigerUpdate = vi.fn().mockResolvedValue({});
  const tx: any = {
    kariger: {
      findUnique: vi.fn().mockResolvedValue({ metalBalance: currentBalance, moneyBalance: currentBalance }),
      update: karigerUpdate,
    },
    karigerMetalLedger: { create: ledgerCreate },
    karigerMoneyLedger: { create: ledgerCreate },
  };
  return { tx, ledgerCreate, karigerUpdate };
}

describe('postMetalLedger', () => {
  it('records a positive weight (gold issued to kariger) and bumps the balance', async () => {
    const { tx, ledgerCreate, karigerUpdate } = buildTx(0);
    const entry = await postMetalLedger({
      tx, karigerId: 5, repairJobId: 100, metalTypeId: 1,
      transactionType: 'GOLD_RECEIVABLE',
      weight: 10.5, ratePerGram: 6000, remarks: 'issue', userId: 1,
    });
    expect(entry).toMatchObject({
      karigerId: 5, repairJobId: 100, weight: 10.5,
      amount: 10.5 * 6000,
      balanceAfterTransaction: 10.5,
    });
    expect(ledgerCreate).toHaveBeenCalledTimes(1);
    expect(karigerUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { metalBalance: 10.5 },
    });
  });

  it('records a negative weight (kariger returned gold) and reduces balance', async () => {
    const { tx, karigerUpdate } = buildTx(20);
    const entry = await postMetalLedger({
      tx, karigerId: 5, metalTypeId: 1,
      transactionType: 'GOLD_RETURN',
      weight: -8, ratePerGram: 6000, userId: 1,
    });
    // amount uses absolute value of weight
    expect(entry.amount).toBe(8 * 6000);
    expect(entry.balanceAfterTransaction).toBe(12);
    expect(karigerUpdate).toHaveBeenCalledWith({ where: { id: 5 }, data: { metalBalance: 12 } });
  });

  it('writes amount=0 when ratePerGram is omitted (intake before rate is set)', async () => {
    const { tx } = buildTx(0);
    const entry = await postMetalLedger({
      tx, karigerId: 5, metalTypeId: 1,
      transactionType: 'GOLD_RECEIVABLE', weight: 5, userId: 1,
    });
    expect(entry.amount).toBe(0);
    expect(entry.balanceAfterTransaction).toBe(5);
  });

  it('throws when kariger does not exist', async () => {
    const tx: any = {
      kariger: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      karigerMetalLedger: { create: vi.fn() },
    };
    await expect(postMetalLedger({
      tx, karigerId: 999, metalTypeId: 1,
      transactionType: 'GOLD_RECEIVABLE', weight: 1, userId: 1,
    })).rejects.toThrow(/Kariger 999 not found/);
    expect(tx.karigerMetalLedger.create).not.toHaveBeenCalled();
  });

  it('handles fractional grams without precision loss for typical 3-decimal weights', async () => {
    const { tx } = buildTx(2.345);
    const entry = await postMetalLedger({
      tx, karigerId: 5, metalTypeId: 1,
      transactionType: 'WASTAGE', weight: -0.123, ratePerGram: 6500, userId: 1,
    });
    expect(entry.balanceAfterTransaction).toBeCloseTo(2.222, 6);
  });
});

describe('postMoneyLedger', () => {
  it('debit increases balance (shop owes more)', async () => {
    const { tx, karigerUpdate } = buildTx(0);
    const entry = await postMoneyLedger({
      tx, karigerId: 5, repairJobId: 100,
      entryType: 'LABOR_PAYABLE', debit: 1500, userId: 1,
    });
    expect(entry.balanceAfterTransaction).toBe(1500);
    expect(karigerUpdate).toHaveBeenCalledWith({ where: { id: 5 }, data: { moneyBalance: 1500 } });
  });

  it('credit decreases balance (payment made)', async () => {
    const { tx, karigerUpdate } = buildTx(2000);
    const entry = await postMoneyLedger({
      tx, karigerId: 5,
      entryType: 'PAYMENT_MADE', credit: 800, userId: 1,
    });
    expect(entry.balanceAfterTransaction).toBe(1200);
    expect(karigerUpdate).toHaveBeenCalledWith({ where: { id: 5 }, data: { moneyBalance: 1200 } });
  });

  it('handles a zero entry as a no-op delta', async () => {
    const { tx } = buildTx(500);
    const entry = await postMoneyLedger({
      tx, karigerId: 5,
      entryType: 'ADJUSTMENT', userId: 1,
    });
    expect(entry.balanceAfterTransaction).toBe(500);
  });

  it('throws when kariger does not exist', async () => {
    const tx: any = {
      kariger: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      karigerMoneyLedger: { create: vi.fn() },
    };
    await expect(postMoneyLedger({
      tx, karigerId: 999, entryType: 'LABOR_PAYABLE', debit: 1, userId: 1,
    })).rejects.toThrow(/Kariger 999 not found/);
  });
});
