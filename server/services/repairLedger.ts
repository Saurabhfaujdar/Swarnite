/**
 * Kariger Ledger Posting
 * ───────────────────────
 * Two separate ledgers per kariger:
 *
 *   1. METAL ledger (grams) — tracks gold/silver flowing in/out of
 *      the kariger's hands. +ve balance ⇒ kariger is holding shop gold.
 *   2. MONEY ledger (INR)   — tracks labour payable / payments made.
 *      +ve balance ⇒ shop owes kariger money.
 *
 * Both ledgers maintain a denormalised running balance
 * (`balanceAfterTransaction`) and a snapshot on the parent Kariger
 * row so list views don't have to sum the entire ledger.
 *
 * MUST be called inside a Prisma transaction so the ledger row +
 * Kariger snapshot stay consistent.
 */

import { Prisma, KarigerMetalTxnType, KarigerMoneyEntryType } from '@prisma/client';

interface PostMetalArgs {
  tx: Prisma.TransactionClient;
  karigerId: number;
  repairJobId?: number | null;
  metalTypeId: number;
  transactionType: KarigerMetalTxnType;
  /** Signed grams: +ve = shop GAVE gold to kariger, -ve = kariger RETURNED. */
  weight: number;
  ratePerGram?: number;
  remarks?: string;
  userId: number;
}

export async function postMetalLedger(args: PostMetalArgs) {
  const {
    tx, karigerId, repairJobId, metalTypeId, transactionType,
    weight, ratePerGram = 0, remarks, userId,
  } = args;

  const kariger = await tx.kariger.findUnique({
    where: { id: karigerId },
    select: { metalBalance: true },
  });
  if (!kariger) throw new Error(`Kariger ${karigerId} not found`);

  const newBalance = Number(kariger.metalBalance) + weight;
  const amount = Math.abs(weight) * ratePerGram;

  const entry = await tx.karigerMetalLedger.create({
    data: {
      karigerId,
      repairJobId: repairJobId ?? null,
      metalTypeId,
      transactionType,
      weight,
      ratePerGram,
      amount,
      balanceAfterTransaction: newBalance,
      remarks,
      createdBy: userId,
    },
  });
  await tx.kariger.update({
    where: { id: karigerId },
    data: { metalBalance: newBalance },
  });
  return entry;
}

interface PostMoneyArgs {
  tx: Prisma.TransactionClient;
  karigerId: number;
  repairJobId?: number | null;
  entryType: KarigerMoneyEntryType;
  /** Use one of debit OR credit. debit = shop owes kariger more; credit = shop paid kariger. */
  debit?: number;
  credit?: number;
  remarks?: string;
  userId: number;
}

export async function postMoneyLedger(args: PostMoneyArgs) {
  const {
    tx, karigerId, repairJobId, entryType,
    debit = 0, credit = 0, remarks, userId,
  } = args;

  const kariger = await tx.kariger.findUnique({
    where: { id: karigerId },
    select: { moneyBalance: true },
  });
  if (!kariger) throw new Error(`Kariger ${karigerId} not found`);

  // Convention: +ve balance ⇒ shop owes kariger.
  // LABOR_PAYABLE → debit increases what we owe (+).
  // PAYMENT_MADE  → credit decreases what we owe (-).
  const newBalance = Number(kariger.moneyBalance) + debit - credit;

  const entry = await tx.karigerMoneyLedger.create({
    data: {
      karigerId,
      repairJobId: repairJobId ?? null,
      entryType,
      debit,
      credit,
      balanceAfterTransaction: newBalance,
      remarks,
      createdBy: userId,
    },
  });
  await tx.kariger.update({
    where: { id: karigerId },
    data: { moneyBalance: newBalance },
  });
  return entry;
}
