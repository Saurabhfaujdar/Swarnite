/**
 * Supplier Order Ledger Service
 * ──────────────────────────────
 * Two separate ledgers per supplier:
 *
 *   1. MONEY ledger (INR) — tracks payable/payment between shop and supplier.
 *      +ve balance ⇒ shop owes supplier.
 *   2. METAL ledger (grams) — tracks metal custody/obligation.
 *      +ve balance ⇒ supplier holds shop's metal (issued for making).
 *      -ve balance ⇒ shop has received more than issued (net receipts).
 *
 * Convention mirrors the repair module's `repairLedger.ts`:
 *  - All functions accept `tx: Prisma.TransactionClient`
 *  - Must be called inside a Prisma `$transaction` block
 *  - Each entry writes a row + updates denormalized balance on Account
 *
 * Denormalized balance: `Account.closingBalance` (+ve = CR = shop owes supplier)
 */

import { Prisma, SupplierLedgerTransactionType } from '@prisma/client';

// ─── Money Ledger Types ──────────────────────────────────────────────

// Subset of SupplierLedgerTransactionType for money operations
type MoneyTxnType = Extract<SupplierLedgerTransactionType,
  | 'ORDER_PAYABLE'
  | 'ADVANCE_PAID'
  | 'DELIVERY_PAYMENT'
  | 'INVOICE_ADJUSTMENT'
  | 'SETTLEMENT'
  | 'REFUND_RECEIVED'
  | 'DEBIT_NOTE'
  | 'CREDIT_NOTE'
  | 'MONEY_ADJUSTMENT'
>;

// Subset of SupplierLedgerTransactionType for metal operations
type MetalTxnType = Extract<SupplierLedgerTransactionType,
  | 'METAL_ISSUED'
  | 'METAL_RECEIVED'
  | 'WASTAGE_APPROVED'
  | 'EXCESS_RECEIVED'
  | 'SHORTAGE'
  | 'METAL_RETURN'
  | 'METAL_ADJUSTMENT'
>;

// ─── Interfaces ──────────────────────────────────────────────────────

interface BaseArgs {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  userId: number;
  remarks?: string;
}

interface PostMoneyArgs extends BaseArgs {
  transactionType: MoneyTxnType;
  /** Amount that increases payable (shop owes more). */
  debit?: number;
  /** Amount that decreases payable (shop owes less). */
  credit?: number;
  invoiceId?: number | null;
  paymentId?: number | null;
  reference?: string;
}

interface PostMetalArgs extends BaseArgs {
  transactionType: MetalTxnType;
  metalTypeId: number;
  /** Purity percentage (e.g. 91.67 for 22KT). */
  purity: number;
  /** Signed grams: +ve = shop issued to supplier, -ve = received from supplier. */
  grossWeight: number;
  /** Signed grams: net of stones/deductions. */
  netWeight: number;
  /** Direction label for reporting. */
  direction: 'ISSUED' | 'RECEIVED';
  receiptId?: number | null;
}

// ─── Money Ledger Posting ────────────────────────────────────────────

/**
 * Core money ledger posting. All money functions delegate to this.
 * Convention: +ve balance = shop owes supplier.
 */
async function postMoneyEntry(args: PostMoneyArgs) {
  const {
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType, debit = 0, credit = 0,
    invoiceId, paymentId, reference, remarks, userId,
  } = args;

  // Fetch current running balance from last ledger entry for this supplier
  const lastEntry = await tx.supplierMoneyLedger.findFirst({
    where: { supplierId, companyId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfterTransaction: true },
  });

  const currentBalance = lastEntry ? Number(lastEntry.balanceAfterTransaction) : 0;
  const newBalance = currentBalance + debit - credit;

  const entry = await tx.supplierMoneyLedger.create({
    data: {
      supplierId,
      companyId,
      branchId,
      supplierOrderId,
      invoiceId: invoiceId ?? null,
      paymentId: paymentId ?? null,
      transactionType,
      debit,
      credit,
      balanceAfterTransaction: newBalance,
      remarks,
      reference,
      createdById: userId,
    },
  });

  // Update denormalized balance on Account
  await tx.account.update({
    where: { id: supplierId },
    data: {
      closingBalance: Math.abs(newBalance),
      balanceType: newBalance > 0 ? 'CR' : newBalance < 0 ? 'DR' : 'NONE',
    },
  });

  return entry;
}

// ─── Metal Ledger Posting ────────────────────────────────────────────

/**
 * Core metal ledger posting. All metal functions delegate to this.
 * Convention: +ve balance = supplier holds shop's metal.
 */
async function postMetalEntry(args: PostMetalArgs) {
  const {
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType, metalTypeId, purity, grossWeight, netWeight,
    direction, receiptId, remarks, userId,
  } = args;

  // Calculate fine weight: netWeight × (purity / 100)
  const fineWeight = netWeight * (purity / 100);

  // Fetch current running balance (fine grams) for this supplier + metal type
  const lastEntry = await tx.supplierMetalLedger.findFirst({
    where: { supplierId, companyId, metalTypeId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfterTransaction: true },
  });

  const currentBalance = lastEntry ? Number(lastEntry.balanceAfterTransaction) : 0;
  // +ve weight (ISSUED) increases balance, -ve weight (RECEIVED) decreases
  const signedFineWeight = direction === 'ISSUED' ? Math.abs(fineWeight) : -Math.abs(fineWeight);
  const newBalance = currentBalance + signedFineWeight;

  const entry = await tx.supplierMetalLedger.create({
    data: {
      supplierId,
      companyId,
      branchId,
      supplierOrderId,
      receiptId: receiptId ?? null,
      metalTypeId,
      purity,
      transactionType,
      grossWeight,
      netWeight,
      fineWeight: signedFineWeight,
      direction,
      balanceAfterTransaction: newBalance,
      remarks,
      createdById: userId,
    },
  });

  return entry;
}

// ─── Public Money Functions ──────────────────────────────────────────

/**
 * Record advance payment to supplier.
 * Advance REDUCES future payable → credit entry.
 */
export async function postAdvancePaymentLedger(args: {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  paymentId: number;
  amount: number;
  reference?: string;
  remarks?: string;
  userId: number;
}) {
  const { tx, supplierId, companyId, branchId, supplierOrderId, paymentId, amount, reference, remarks, userId } = args;

  return postMoneyEntry({
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType: 'ADVANCE_PAID',
    credit: amount,
    paymentId,
    reference,
    remarks: remarks || `Advance payment of ₹${amount}`,
    userId,
  });
}

/**
 * Record supplier invoice — creates payable.
 * Invoice total INCREASES payable → debit entry.
 */
export async function postSupplierInvoicePayable(args: {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  invoiceId: number;
  amount: number;
  reference?: string;
  remarks?: string;
  userId: number;
}) {
  const { tx, supplierId, companyId, branchId, supplierOrderId, invoiceId, amount, reference, remarks, userId } = args;

  return postMoneyEntry({
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType: 'ORDER_PAYABLE',
    debit: amount,
    invoiceId,
    reference,
    remarks: remarks || `Invoice payable ₹${amount}`,
    userId,
  });
}

/**
 * Record payment to supplier (against invoice or settlement).
 * Payment REDUCES payable → credit entry.
 */
export async function postSupplierPayment(args: {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  paymentId: number;
  amount: number;
  paymentType: 'DELIVERY_PAYMENT' | 'SETTLEMENT';
  reference?: string;
  remarks?: string;
  userId: number;
}) {
  const { tx, supplierId, companyId, branchId, supplierOrderId, paymentId, amount, paymentType, reference, remarks, userId } = args;

  const txnType: MoneyTxnType = paymentType === 'SETTLEMENT' ? 'SETTLEMENT' : 'DELIVERY_PAYMENT';

  return postMoneyEntry({
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType: txnType,
    credit: amount,
    paymentId,
    reference,
    remarks: remarks || `Payment of ₹${amount}`,
    userId,
  });
}

/**
 * Reverse ledger entries on order cancellation.
 * Creates offsetting entries (not deletes — ledger is append-only).
 */
export async function reverseLedgerForCancellation(args: {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  userId: number;
}) {
  const { tx, supplierId, companyId, branchId, supplierOrderId, userId } = args;

  // Sum all money ledger entries for this order
  const moneyEntries = await tx.supplierMoneyLedger.findMany({
    where: { supplierOrderId },
    select: { debit: true, credit: true },
  });

  const totalDebit = moneyEntries.reduce((sum, e) => sum + Number(e.debit), 0);
  const totalCredit = moneyEntries.reduce((sum, e) => sum + Number(e.credit), 0);
  const netPayable = totalDebit - totalCredit;

  // If there's net payable remaining, create a reversal
  if (netPayable > 0) {
    await postMoneyEntry({
      tx, supplierId, companyId, branchId, supplierOrderId,
      transactionType: 'MONEY_ADJUSTMENT',
      credit: netPayable,
      remarks: `Cancellation reversal — payable written off`,
      userId,
    });
  } else if (netPayable < 0) {
    // Advance was more than payable — record refund due
    await postMoneyEntry({
      tx, supplierId, companyId, branchId, supplierOrderId,
      transactionType: 'REFUND_RECEIVED',
      debit: Math.abs(netPayable),
      remarks: `Cancellation — refund due from advance overpayment`,
      userId,
    });
  }

  // Sum all metal ledger entries for this order
  const metalEntries = await tx.supplierMetalLedger.findMany({
    where: { supplierOrderId },
    select: { fineWeight: true, metalTypeId: true },
  });

  // Group by metalType and create reversal for each
  const metalByType = new Map<number, number>();
  for (const e of metalEntries) {
    const current = metalByType.get(e.metalTypeId) || 0;
    metalByType.set(e.metalTypeId, current + Number(e.fineWeight));
  }

  for (const [metalTypeId, netFine] of metalByType) {
    if (Math.abs(netFine) < 0.001) continue; // negligible
    await postMetalEntry({
      tx, supplierId, companyId, branchId, supplierOrderId,
      transactionType: 'METAL_ADJUSTMENT',
      metalTypeId,
      purity: 100, // fine weight already calculated; purity=100 makes fineWeight = netWeight
      grossWeight: -netFine,
      netWeight: -netFine,
      direction: netFine > 0 ? 'RECEIVED' : 'ISSUED',
      remarks: `Cancellation reversal`,
      userId,
    });
  }
}

// ─── Public Metal Functions ──────────────────────────────────────────

/**
 * Record physical goods receipt from supplier.
 * Receiving metal → balance decreases (supplier holds less).
 */
export async function postGoodsReceiptMetalLedger(args: {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  receiptId: number;
  metalTypeId: number;
  purity: number;
  grossWeight: number;
  netWeight: number;
  remarks?: string;
  userId: number;
}) {
  const { tx, supplierId, companyId, branchId, supplierOrderId, receiptId, metalTypeId, purity, grossWeight, netWeight, remarks, userId } = args;

  return postMetalEntry({
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType: 'METAL_RECEIVED',
    metalTypeId,
    purity,
    grossWeight,
    netWeight,
    direction: 'RECEIVED',
    receiptId,
    remarks: remarks || `Goods received: ${grossWeight}g gross`,
    userId,
  });
}

/**
 * Record QC-accepted items moving to inventory.
 * This is informational — the physical receipt was already booked.
 * Posted for audit trail when labels are created.
 */
export async function postQcAcceptedMetalLedger(args: {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  receiptId: number;
  metalTypeId: number;
  purity: number;
  acceptedGrossWeight: number;
  acceptedNetWeight: number;
  remarks?: string;
  userId: number;
}) {
  const { tx, supplierId, companyId, branchId, supplierOrderId, receiptId, metalTypeId, purity, acceptedGrossWeight, acceptedNetWeight, remarks, userId } = args;

  // This is a reclassification entry: received → accepted in inventory.
  // No balance change because we already booked receipt.
  // But we record it as METAL_ADJUSTMENT for the audit trail.
  return postMetalEntry({
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType: 'METAL_ADJUSTMENT',
    metalTypeId,
    purity,
    grossWeight: 0, // no net balance change (already received)
    netWeight: 0,
    direction: 'RECEIVED',
    receiptId,
    remarks: remarks || `QC accepted: ${acceptedGrossWeight}g gross, ${acceptedNetWeight}g net → inventory`,
    userId,
  });
}

/**
 * Record weight adjustment (shortage/excess/wastage/purity difference).
 * Adjusts the metal balance to reflect the actual vs expected.
 */
export async function postWeightAdjustmentLedger(args: {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  receiptId?: number;
  metalTypeId: number;
  purity: number;
  adjustmentType: 'SHORT_RECEIVED' | 'EXCESS_RECEIVED' | 'WASTAGE_APPROVED' | 'METAL_ADJUSTMENT';
  /** Signed: -ve for shortage/wastage, +ve for excess. */
  netWeightDelta: number;
  grossWeightDelta: number;
  remarks?: string;
  userId: number;
}) {
  const {
    tx, supplierId, companyId, branchId, supplierOrderId, receiptId,
    metalTypeId, purity, adjustmentType, netWeightDelta, grossWeightDelta,
    remarks, userId,
  } = args;

  // Map adjustment type to ledger transaction type
  const txnTypeMap: Record<string, MetalTxnType> = {
    SHORT_RECEIVED: 'SHORTAGE',
    EXCESS_RECEIVED: 'EXCESS_RECEIVED',
    WASTAGE_APPROVED: 'WASTAGE_APPROVED',
    METAL_ADJUSTMENT: 'METAL_ADJUSTMENT',
  };
  const transactionType = txnTypeMap[adjustmentType] || 'METAL_ADJUSTMENT';

  // Direction: shortage/wastage are effectively "received" (reduces supplier obligation)
  // Excess is also "received" (we got more)
  const direction: 'ISSUED' | 'RECEIVED' = netWeightDelta > 0 ? 'RECEIVED' : 'RECEIVED';

  return postMetalEntry({
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType,
    metalTypeId,
    purity,
    grossWeight: grossWeightDelta,
    netWeight: netWeightDelta,
    direction: 'RECEIVED', // adjustments affect what we "received" or should have received
    receiptId: receiptId ?? undefined,
    remarks,
    userId,
  });
}

// ─── Query Functions ─────────────────────────────────────────────────

/**
 * Get current supplier balance (money + metal).
 * Does NOT require transaction — read-only.
 */
export async function getSupplierBalance(
  prismaClient: Prisma.TransactionClient | { supplierMoneyLedger: any; supplierMetalLedger: any },
  supplierId: number,
  companyId: number,
) {
  // Money balance: last entry's running balance
  const lastMoneyEntry = await (prismaClient as any).supplierMoneyLedger.findFirst({
    where: { supplierId, companyId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfterTransaction: true },
  });

  // Metal balance: grouped by metalType
  const metalEntries = await (prismaClient as any).supplierMetalLedger.findMany({
    where: { supplierId, companyId },
    orderBy: { createdAt: 'desc' },
    distinct: ['metalTypeId'],
    select: { metalTypeId: true, balanceAfterTransaction: true },
  });

  return {
    moneyBalance: lastMoneyEntry ? Number(lastMoneyEntry.balanceAfterTransaction) : 0,
    metalBalances: metalEntries.map((e: any) => ({
      metalTypeId: e.metalTypeId,
      fineWeightBalance: Number(e.balanceAfterTransaction),
    })),
  };
}

/**
 * Post a debit note (reduces payable — e.g., goods returned, shortage accepted).
 */
export async function postDebitNote(args: {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  amount: number;
  reference?: string;
  remarks?: string;
  userId: number;
}) {
  const { tx, supplierId, companyId, branchId, supplierOrderId, amount, reference, remarks, userId } = args;

  return postMoneyEntry({
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType: 'DEBIT_NOTE',
    credit: amount,
    reference,
    remarks: remarks || `Debit note ₹${amount}`,
    userId,
  });
}

/**
 * Post a credit note (increases payable — e.g., rate revision upward).
 */
export async function postCreditNote(args: {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  amount: number;
  reference?: string;
  remarks?: string;
  userId: number;
}) {
  const { tx, supplierId, companyId, branchId, supplierOrderId, amount, reference, remarks, userId } = args;

  return postMoneyEntry({
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType: 'CREDIT_NOTE',
    debit: amount,
    reference,
    remarks: remarks || `Credit note ₹${amount}`,
    userId,
  });
}

/**
 * Post metal issuance — shop sends gold to supplier for making.
 * Balance increases (supplier holds more of shop's metal).
 */
export async function postMetalIssuance(args: {
  tx: Prisma.TransactionClient;
  supplierId: number;
  companyId: number;
  branchId: number;
  supplierOrderId: number;
  metalTypeId: number;
  purity: number;
  grossWeight: number;
  netWeight: number;
  remarks?: string;
  userId: number;
}) {
  const { tx, supplierId, companyId, branchId, supplierOrderId, metalTypeId, purity, grossWeight, netWeight, remarks, userId } = args;

  return postMetalEntry({
    tx, supplierId, companyId, branchId, supplierOrderId,
    transactionType: 'METAL_ISSUED',
    metalTypeId,
    purity,
    grossWeight,
    netWeight,
    direction: 'ISSUED',
    remarks: remarks || `Metal issued: ${grossWeight}g gross`,
    userId,
  });
}
