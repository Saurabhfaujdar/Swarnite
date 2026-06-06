/**
 * Supplier Order Inventory Posting Service
 * ─────────────────────────────────────────
 * Converts QC-accepted supplier order receipt items into:
 *   1. Labels (inventory items) with IN_STOCK status
 *   2. A PurchaseVoucher with PurchaseItems linked to those labels
 *   3. Ledger entries (metal + money) via supplierOrderLedger
 *   4. State transition to PURCHASE_POSTED
 *
 * Rules:
 *   - Only QC_PASSED or CONDITIONAL items are eligible
 *   - Already-posted items (inventoryPosted=true) are skipped (idempotent)
 *   - Uses accepted weights/qty (NOT ordered values)
 *   - All operations in a single $transaction
 *   - Label numbers auto-sequenced from LabelPrefix
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { postQcAcceptedMetalLedger } from './supplierOrderLedger';
import { canTransition, transitionSupplierOrder } from './supplierOrderWorkflow';
import { logger } from '../logger';

// ─── Types ──────────────────────────────────────────────────────────

export interface PostPurchaseInput {
  supplierOrderId: number;
  companyId: number;
  branchId: number;
  userId: number;
  financialYear?: string;
}

export interface PostPurchaseResult {
  purchaseVoucherId: number;
  voucherNo: string;
  labelsCreated: number;
  itemsPosted: number;
}

interface AcceptedItem {
  receiptItem: {
    id: number;
    acceptedQty: number;
    acceptedGrossWeight: number | Prisma.Decimal;
    acceptedNetWeight: number | Prisma.Decimal;
    receivedPurity: number | Prisma.Decimal | null;
    qcStatus: string;
    inventoryPosted: boolean;
    supplierOrderItemId: number;
  };
  orderItem: {
    id: number;
    category: string;
    ornamentType: string | null;
    metalTypeId: number;
    purity: string | null;
    makingChargeType: string | null;
    makingChargeValue: number | Prisma.Decimal;
  };
  receiptId: number;
}

// ─── Main Service ───────────────────────────────────────────────────

export async function postSupplierOrderPurchase(
  input: PostPurchaseInput
): Promise<PostPurchaseResult> {
  const { supplierOrderId, companyId, branchId, userId, financialYear = '2025-2026' } = input;

  // Load order with all receipts + items
  const order = await prisma.supplierOrder.findUnique({
    where: { id: supplierOrderId },
    include: {
      receipts: { include: { items: true } },
      items: true,
    },
  });

  if (!order) {
    throw new Error('Supplier order not found');
  }

  // Status gate
  const allowedStatuses = ['QC_COMPLETED', 'INVOICE_RECEIVED'];
  if (!allowedStatuses.includes(order.status)) {
    throw new Error(`Cannot post purchase from status ${order.status}`);
  }

  // Collect eligible items (QC passed/conditional, NOT already posted)
  const acceptedItems: AcceptedItem[] = [];
  for (const receipt of order.receipts) {
    for (const ri of receipt.items) {
      if (ri.inventoryPosted) continue; // skip already posted (idempotent)
      if (ri.qcStatus !== 'PASSED' && ri.qcStatus !== 'CONDITIONAL') continue;
      if (Number(ri.acceptedNetWeight) <= 0 && ri.acceptedQty <= 0) continue;

      const orderItem = order.items.find((oi: any) => oi.id === ri.supplierOrderItemId);
      if (!orderItem) continue;

      acceptedItems.push({
        receiptItem: ri as any,
        orderItem: orderItem as any,
        receiptId: receipt.id,
      });
    }
  }

  if (acceptedItems.length === 0) {
    throw new Error('No accepted QC items to post');
  }

  // Execute everything in a single transaction
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Generate purchase voucher number
    const prefix = 'PUR';
    const sequence = await tx.voucherSequence.upsert({
      where: {
        companyId_prefix_entityType_financialYear: {
          companyId,
          prefix,
          entityType: 'PURCHASE',
          financialYear,
        },
      },
      update: { lastNumber: { increment: 1 } },
      create: {
        companyId,
        prefix,
        entityType: 'PURCHASE',
        financialYear,
        lastNumber: 1,
      },
    });
    const voucherNo = `${prefix}/${sequence.lastNumber}`;

    // 2. Aggregate totals for voucher header
    let totalGrossWeight = 0;
    let totalNetWeight = 0;
    let totalPcs = 0;

    for (const { receiptItem } of acceptedItems) {
      totalGrossWeight += Number(receiptItem.acceptedGrossWeight) || 0;
      totalNetWeight += Number(receiptItem.acceptedNetWeight) || 0;
      totalPcs += receiptItem.acceptedQty || 1;
    }

    // Use order's gold/silver rate for amount calculation
    const metalRate = Number(order.goldRate) || Number(order.silverRate) || 0;
    const metalAmount = totalNetWeight * metalRate;

    // 3. Create PurchaseVoucher
    const purchaseVoucher = await tx.purchaseVoucher.create({
      data: {
        voucherNo,
        voucherPrefix: prefix,
        voucherNumber: sequence.lastNumber,
        voucherDate: new Date(),
        purchaseType: 'REGULAR',
        accountId: order.supplierId,
        companyId,
        branchId,
        userId,
        description: `Supplier Order ${order.orderNo}`,
        totalGrossWeight,
        totalNetWeight,
        totalPcs,
        metalRate,
        metalAmount,
        totalAmount: metalAmount,
        finalAmount: metalAmount,
      },
    });

    // 4. For each accepted item: resolve Item master → create Label → create PurchaseItem
    const createdLabels: number[] = [];

    for (const { receiptItem, orderItem, receiptId } of acceptedItems) {
      // 4a. Resolve Item master by metalType + purity + ornamentType
      const item = await resolveItemMaster(tx, orderItem);

      // 4b. Resolve LabelPrefix for this item's group
      const labelPrefix = await resolveLabelPrefix(tx, item.itemGroupId, companyId);

      // 4c. Create Label (auto-sequence)
      const updatedPrefix = await tx.labelPrefix.update({
        where: { id: labelPrefix.id },
        data: { lastNumber: { increment: 1 } },
      });
      const labelNo = `${updatedPrefix.prefix}/${updatedPrefix.lastNumber}`;

      const acceptedGross = Number(receiptItem.acceptedGrossWeight) || 0;
      const acceptedNet = Number(receiptItem.acceptedNetWeight) || 0;
      const pcs = receiptItem.acceptedQty || 1;

      const label = await tx.label.create({
        data: {
          labelNo,
          prefixId: labelPrefix.id,
          itemId: item.id,
          grossWeight: acceptedGross,
          netWeight: acceptedNet,
          pcsCount: pcs,
          branchId,
          status: 'IN_STOCK',
        },
      });

      createdLabels.push(label.id);

      // 4d. Create PurchaseItem linked to label
      const itemRate = metalRate;
      const itemAmount = acceptedNet * itemRate;

      await tx.purchaseItem.create({
        data: {
          purchaseVoucherId: purchaseVoucher.id,
          labelId: label.id,
          itemId: item.id,
          styleName: `${orderItem.ornamentType || orderItem.category} - ${order.orderNo}`,
          weight: acceptedNet,
          pcs,
          amtCalcOn: 'Weight',
          rate: itemRate,
          amount: itemAmount,
        },
      });

      // 4e. Mark receipt item as posted + link label
      await tx.supplierOrderReceiptItem.update({
        where: { id: receiptItem.id },
        data: {
          inventoryPosted: true,
          inventoryItemId: label.id,
        },
      });

      // 4f. Post metal ledger entry
      const metalTypeId = orderItem.metalTypeId;
      if (metalTypeId && acceptedNet > 0) {
        await postQcAcceptedMetalLedger({
          tx,
          supplierId: order.supplierId,
          companyId,
          branchId,
          supplierOrderId,
          receiptId,
          metalTypeId,
          purity: Number(receiptItem.receivedPurity) || 0,
          acceptedGrossWeight: acceptedGross,
          acceptedNetWeight: acceptedNet,
          remarks: `Purchase posted: ${orderItem.category} ${orderItem.ornamentType || ''} → ${labelNo}`.trim(),
          userId,
        });
      }
    }

    // 5. Update supplier account balance
    await tx.account.update({
      where: { id: order.supplierId },
      data: {
        closingBalance: { increment: metalAmount },
        balanceType: 'CR',
      },
    });

    // 6. Transition order status
    if (canTransition(order.status, 'PURCHASE_POSTED')) {
      await transitionSupplierOrder(tx, supplierOrderId, order.status, 'PURCHASE_POSTED', {
        userId,
        reason: `${acceptedItems.length} items posted to purchase (${voucherNo})`,
      });
    }

    return {
      purchaseVoucherId: purchaseVoucher.id,
      voucherNo,
      labelsCreated: createdLabels.length,
      itemsPosted: acceptedItems.length,
    };
  });

  logger.info('supplierOrderInventory.postPurchase completed', {
    supplierOrderId,
    ...result,
  });

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Resolve the best-match Item master record for a supplier order item.
 * Matches by metalTypeId + purity code. Falls back to first matching item in group.
 */
async function resolveItemMaster(
  tx: Prisma.TransactionClient,
  orderItem: AcceptedItem['orderItem']
) {
  // Try matching by metalType + purity + item group (via ornamentType name)
  const purityCode = orderItem.purity; // "22KT", "18KT", etc.

  // First: try to find item matching ornamentType → ItemGroup.name + metalType + purity
  if (orderItem.ornamentType) {
    const itemGroup = await tx.itemGroup.findFirst({
      where: {
        name: { equals: orderItem.ornamentType.toUpperCase(), mode: 'insensitive' },
        metalTypeId: orderItem.metalTypeId,
        isActive: true,
      },
    });

    if (itemGroup) {
      const where: Prisma.ItemWhereInput = {
        itemGroupId: itemGroup.id,
        metalTypeId: orderItem.metalTypeId,
        isActive: true,
      };
      if (purityCode) {
        where.purity = { code: purityCode };
      }

      const item = await tx.item.findFirst({ where });
      if (item) return item;
    }
  }

  // Fallback: any active item matching metalType + purity
  const fallbackWhere: Prisma.ItemWhereInput = {
    metalTypeId: orderItem.metalTypeId,
    isActive: true,
  };
  if (purityCode) {
    fallbackWhere.purity = { code: purityCode };
  }

  const item = await tx.item.findFirst({ where: fallbackWhere });
  if (!item) {
    throw new Error(
      `No matching Item master found for metalType=${orderItem.metalTypeId}, purity=${purityCode || 'any'}`
    );
  }
  return item;
}

/**
 * Find an active LabelPrefix for the given item group + company.
 * Throws if none exists.
 */
async function resolveLabelPrefix(
  tx: Prisma.TransactionClient,
  itemGroupId: number,
  companyId: number
) {
  const prefix = await tx.labelPrefix.findFirst({
    where: { itemGroupId, companyId, isActive: true },
  });
  if (!prefix) {
    throw new Error(`No active LabelPrefix found for itemGroup=${itemGroupId}, company=${companyId}`);
  }
  return prefix;
}
