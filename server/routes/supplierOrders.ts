/**
 * Supplier Order Routes
 * ──────────────────────
 * Full lifecycle for supplier purchase orders: create, send, acknowledge,
 * advance payment, receipt (partial/full), QC, invoice, purchase posting,
 * payment, close/cancel.
 *
 *   GET    /api/supplier-orders                       — list (paginated, filtered)
 *   GET    /api/supplier-orders/dashboard             — dashboard counters
 *   GET    /api/supplier-orders/reports/:type         — operational reports
 *   POST   /api/supplier-orders                       — create draft
 *   GET    /api/supplier-orders/:id                   — full detail
 *   PUT    /api/supplier-orders/:id                   — update draft fields
 *   PATCH  /api/supplier-orders/:id/status            — generic status transition
 *   POST   /api/supplier-orders/:id/send              — DRAFT → SENT_TO_SUPPLIER
 *   POST   /api/supplier-orders/:id/acknowledge       — record supplier ack
 *   POST   /api/supplier-orders/:id/advance-payment   — record advance + ledger
 *   POST   /api/supplier-orders/:id/receipt           — goods receipt (partial/full)
 *   POST   /api/supplier-orders/:id/receipt/:receiptId/qc — QC recording
 *   POST   /api/supplier-orders/:id/invoice           — supplier invoice
 *   POST   /api/supplier-orders/:id/post-purchase     — post to inventory
 *   POST   /api/supplier-orders/:id/payment           — payment against invoice
 *   POST   /api/supplier-orders/:id/close             — close order
 *   POST   /api/supplier-orders/:id/cancel            — cancel order
 */

import { Router, Request, Response } from 'express';
import { Prisma, SupplierOrderStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/branchAccess';
import { logger } from '../logger';
import { auditLog } from '../middleware/audit';
import {
  canTransition,
  nextStates,
  transitionSupplierOrder,
  InvalidSupplierOrderTransitionError,
  SupplierOrderTransitionValidationError,
} from '../services/supplierOrderWorkflow';
import {
  postAdvancePaymentLedger,
  postSupplierInvoicePayable,
  postSupplierPayment,
  postGoodsReceiptMetalLedger,
  postQcAcceptedMetalLedger,
  postWeightAdjustmentLedger,
  reverseLedgerForCancellation,
  getSupplierBalance,
} from '../services/supplierOrderLedger';
import { postSupplierOrderPurchase } from '../services/supplierOrderInventory';

const router = Router();
router.use(authenticate);

// ── Scope helper ──────────────────────────────────────────────────

function orderScope(req: Request, id: number): Prisma.SupplierOrderWhereInput {
  const where: Prisma.SupplierOrderWhereInput = { id, companyId: req.companyId };
  if (req.branchScope && req.branchScope.length > 0) {
    where.branchId = { in: req.branchScope };
  }
  return where;
}

// ── Voucher allocation (mirrors repair pattern) ───────────────────

function fyOf(date: Date): string {
  const y = date.getFullYear();
  return date.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

async function allocateOrderNumber(
  tx: Prisma.TransactionClient,
  companyId: number,
  prefix: string,
  entityType: string,
  financialYear: string,
): Promise<number> {
  const maxRow = await tx.$queryRawUnsafe<{ max: number | null }[]>(
    `SELECT MAX("orderNumber")::int as max FROM "supplier_orders" WHERE "companyId" = $1 AND "orderPrefix" = $2`,
    companyId, prefix,
  );
  const maxNum = maxRow?.[0]?.max ?? 0;

  let seq = await tx.voucherSequence.upsert({
    where: {
      companyId_prefix_entityType_financialYear: {
        companyId, prefix, entityType, financialYear,
      },
    },
    update: { lastNumber: { increment: 1 } },
    create: { companyId, prefix, entityType, financialYear, lastNumber: Math.max(1, maxNum + 1) },
  });
  if (seq.lastNumber <= maxNum) {
    seq = await tx.voucherSequence.update({
      where: {
        companyId_prefix_entityType_financialYear: {
          companyId, prefix, entityType, financialYear,
        },
      },
      data: { lastNumber: maxNum + 1 },
    });
  }
  return seq.lastNumber;
}

async function allocatePaymentNumber(
  tx: Prisma.TransactionClient,
  companyId: number,
): Promise<number> {
  const maxRow = await tx.$queryRawUnsafe<{ max: number | null }[]>(
    `SELECT MAX("paymentNumber")::int as max FROM "supplier_order_payments" WHERE "supplierOrderId" IN (SELECT "id" FROM "supplier_orders" WHERE "companyId" = $1)`,
    companyId,
  );
  return (maxRow?.[0]?.max ?? 0) + 1;
}

async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  companyId: number,
): Promise<number> {
  const maxRow = await tx.$queryRawUnsafe<{ max: number | null }[]>(
    `SELECT MAX("invoiceNumber")::int as max FROM "supplier_order_invoices" WHERE "supplierOrderId" IN (SELECT "id" FROM "supplier_orders" WHERE "companyId" = $1)`,
    companyId,
  );
  return (maxRow?.[0]?.max ?? 0) + 1;
}

// ─────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const baseWhere: Prisma.SupplierOrderWhereInput = { companyId: req.companyId };
    if (req.branchScope && req.branchScope.length > 0) {
      baseWhere.branchId = { in: req.branchScope };
    }

    const terminalStatuses: SupplierOrderStatus[] = ['CLOSED', 'CANCELLED'];

    const [
      openOrders,
      delayedOrders,
      expectedToday,
      pendingQC,
      pendingInvoice,
      pendingPaymentCount,
      pendingPaymentAgg,
      monthlyOrderAgg,
      supplierPayableAgg,
      pendingApprovals,
      recentReceipts,
      topSuppliers,
    ] = await Promise.all([
      prisma.supplierOrder.count({
        where: { ...baseWhere, status: { notIn: terminalStatuses } },
      }),
      prisma.supplierOrder.count({
        where: {
          ...baseWhere,
          status: { notIn: terminalStatuses },
          expectedDeliveryDate: { lt: today },
        },
      }),
      prisma.supplierOrder.count({
        where: {
          ...baseWhere,
          status: { notIn: terminalStatuses },
          expectedDeliveryDate: { gte: today, lt: tomorrow },
        },
      }),
      prisma.supplierOrder.count({
        where: { ...baseWhere, status: 'RECEIVED_PENDING_QC' },
      }),
      prisma.supplierOrder.count({
        where: { ...baseWhere, status: { in: ['QC_COMPLETED', 'PURCHASE_POSTED'] } },
      }),
      prisma.supplierOrder.count({
        where: { ...baseWhere, status: 'PAYMENT_PENDING' },
      }),
      prisma.supplierOrderInvoice.aggregate({
        _sum: { dueAmount: true },
        where: {
          supplierOrder: baseWhere,
          status: { not: 'CANCELLED' },
          dueAmount: { gt: 0 },
        },
      }),
      prisma.supplierOrder.aggregate({
        _sum: { estimatedAmount: true },
        where: {
          ...baseWhere,
          orderDate: { gte: thirtyDaysAgo },
        },
      }),
      prisma.supplierMoneyLedger.findMany({
        where: { companyId: req.companyId! },
        distinct: ['supplierId'],
        orderBy: { createdAt: 'desc' },
        select: { supplierId: true, balanceAfterTransaction: true },
      }),
      prisma.supplierOrder.count({
        where: { ...baseWhere, approvalRequired: true, approvedById: null, status: { notIn: terminalStatuses } },
      }),
      prisma.supplierOrderReceipt.findMany({
        where: { supplierOrder: baseWhere },
        orderBy: { receivedDate: 'desc' },
        take: 10,
        select: {
          id: true, receiptNo: true, receivedDate: true, status: true,
          supplierOrder: { select: { id: true, orderNo: true, supplier: { select: { name: true } } } },
        },
      }),
      prisma.supplierOrder.groupBy({
        by: ['supplierId'],
        where: { ...baseWhere, status: { notIn: terminalStatuses } },
        _count: { _all: true },
        _sum: { estimatedAmount: true },
        orderBy: { _sum: { estimatedAmount: 'desc' } },
        take: 10,
      }),
    ]);

    // Total pending payment amount
    const pendingPaymentAmount = Number(pendingPaymentAgg._sum.dueAmount ?? 0);
    // Monthly order value
    const monthlyOrderValue = Number(monthlyOrderAgg._sum.estimatedAmount ?? 0);
    // Total supplier payable
    const supplierPayable = supplierPayableAgg.reduce(
      (acc, row) => acc + Number(row.balanceAfterTransaction ?? 0), 0,
    );

    // Resolve supplier names for top suppliers
    const supplierIds = topSuppliers.map(s => s.supplierId);
    const suppliers = supplierIds.length
      ? await prisma.account.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true },
        })
      : [];
    const supplierById = new Map(suppliers.map(s => [s.id, s]));

    // Top delayed suppliers
    const topDelayedSuppliers = await prisma.supplierOrder.groupBy({
      by: ['supplierId'],
      where: {
        ...baseWhere,
        status: { notIn: terminalStatuses },
        expectedDeliveryDate: { lt: today },
      },
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });
    const delayedSupplierIds = topDelayedSuppliers.map(s => s.supplierId);
    const delayedSuppliers = delayedSupplierIds.length
      ? await prisma.account.findMany({
          where: { id: { in: delayedSupplierIds } },
          select: { id: true, name: true },
        })
      : [];
    const delayedById = new Map(delayedSuppliers.map(s => [s.id, s]));

    res.json({
      counters: {
        openOrders,
        delayedOrders,
        expectedToday,
        pendingQC,
        pendingInvoice,
        pendingPayment: pendingPaymentCount,
        pendingPaymentAmount,
        monthlyOrderValue,
        supplierPayable,
        pendingApprovals,
      },
      topDelayedSuppliers: topDelayedSuppliers.map(s => ({
        supplier: delayedById.get(s.supplierId),
        delayedCount: s._count._all,
      })),
      topSuppliers: topSuppliers.map(s => ({
        supplier: supplierById.get(s.supplierId),
        orderCount: s._count._all,
        totalValue: Number(s._sum.estimatedAmount ?? 0),
      })),
      recentReceipts,
    });
  } catch (err) {
    logger.error('supplierOrders.dashboard failed', { err: (err as Error)?.message, stack: (err as Error)?.stack });
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ─────────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────────
router.get('/reports/:type', async (req: Request, res: Response) => {
  try {
    const type = req.params.type;
    const baseWhere: Prisma.SupplierOrderWhereInput = { companyId: req.companyId };
    if (req.branchScope && req.branchScope.length > 0) {
      baseWhere.branchId = { in: req.branchScope };
    }

    if (type === 'pending-orders') {
      const rows = await prisma.supplierOrder.findMany({
        where: { ...baseWhere, status: { notIn: ['CLOSED', 'CANCELLED'] } },
        orderBy: { orderDate: 'asc' },
        include: { supplier: { select: { name: true } }, branch: { select: { name: true } } },
      });
      return res.json({ rows });
    }

    if (type === 'delayed-orders') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const rows = await prisma.supplierOrder.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ['CLOSED', 'CANCELLED'] },
          expectedDeliveryDate: { lt: today },
        },
        orderBy: { expectedDeliveryDate: 'asc' },
        include: { supplier: { select: { name: true } }, branch: { select: { name: true } } },
      });
      return res.json({ rows });
    }

    if (type === 'pending-qc') {
      const rows = await prisma.supplierOrder.findMany({
        where: { ...baseWhere, status: 'RECEIVED_PENDING_QC' },
        orderBy: { updatedAt: 'desc' },
        include: {
          supplier: { select: { name: true } },
          receipts: { select: { id: true, receiptNo: true, receivedDate: true } },
        },
      });
      return res.json({ rows });
    }

    if (type === 'pending-invoice') {
      const rows = await prisma.supplierOrder.findMany({
        where: { ...baseWhere, status: { in: ['QC_COMPLETED', 'PURCHASE_POSTED'] } },
        orderBy: { updatedAt: 'desc' },
        include: { supplier: { select: { name: true } } },
      });
      return res.json({ rows });
    }

    if (type === 'pending-payment') {
      const rows = await prisma.supplierOrder.findMany({
        where: { ...baseWhere, status: 'PAYMENT_PENDING' },
        orderBy: { updatedAt: 'desc' },
        include: {
          supplier: { select: { name: true } },
          invoices: { select: { id: true, totalAmount: true, dueAmount: true } },
        },
      });
      return res.json({ rows });
    }

    if (type === 'supplier-performance') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      // All closed orders grouped by supplier
      const closedOrders = await prisma.supplierOrder.findMany({
        where: { ...baseWhere, status: 'CLOSED' },
        select: {
          id: true, supplierId: true, estimatedAmount: true,
          expectedDeliveryDate: true, closedAt: true, updatedAt: true,
          items: { select: { id: true, orderedQty: true } },
        },
      });

      // Weight adjustments
      const adjustments = await prisma.supplierOrderWeightAdjustment.findMany({
        where: { supplierOrder: baseWhere },
        select: { supplierOrderId: true, adjustmentType: true },
      });

      // Rejected receipt items
      const rejections = await prisma.supplierOrderReceiptItem.findMany({
        where: {
          receipt: { supplierOrder: baseWhere },
          qcStatus: 'FAILED',
        },
        select: { receipt: { select: { supplierOrderId: true } } },
      });

      // Group by supplier
      const supplierMap = new Map<number, {
        totalOrders: number;
        onTimeDeliveries: number;
        delayedDeliveries: number;
        totalDelayDays: number;
        shortCount: number;
        excessCount: number;
        rejectionCount: number;
        totalOrderValue: number;
      }>();

      for (const order of closedOrders) {
        let entry = supplierMap.get(order.supplierId);
        if (!entry) {
          entry = { totalOrders: 0, onTimeDeliveries: 0, delayedDeliveries: 0, totalDelayDays: 0, shortCount: 0, excessCount: 0, rejectionCount: 0, totalOrderValue: 0 };
          supplierMap.set(order.supplierId, entry);
        }
        entry.totalOrders++;
        entry.totalOrderValue += Number(order.estimatedAmount ?? 0);

        // On-time vs delayed
        if (order.expectedDeliveryDate) {
          const deliveredDate = order.closedAt || order.updatedAt;
          if (deliveredDate <= order.expectedDeliveryDate) {
            entry.onTimeDeliveries++;
          } else {
            entry.delayedDeliveries++;
            const diffMs = deliveredDate.getTime() - order.expectedDeliveryDate.getTime();
            entry.totalDelayDays += Math.ceil(diffMs / (24 * 60 * 60 * 1000));
          }
        }
      }

      // Adjustments
      for (const adj of adjustments) {
        const orderId = adj.supplierOrderId;
        const order = closedOrders.find(o => o.id === orderId);
        if (!order) continue;
        const entry = supplierMap.get(order.supplierId);
        if (!entry) continue;
        if (adj.adjustmentType === 'SHORT_RECEIVED') entry.shortCount++;
        if (adj.adjustmentType === 'EXCESS_RECEIVED') entry.excessCount++;
      }

      // Rejections
      for (const rej of rejections) {
        const orderId = rej.receipt.supplierOrderId;
        const order = closedOrders.find(o => o.id === orderId);
        if (!order) continue;
        const entry = supplierMap.get(order.supplierId);
        if (entry) entry.rejectionCount++;
      }

      const ids = [...supplierMap.keys()];
      const accts = ids.length ? await prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
      const byId = new Map(accts.map(a => [a.id, a]));

      const rows = [...supplierMap.entries()].map(([supplierId, stats]) => ({
        supplier: byId.get(supplierId),
        ...stats,
        averageDelayDays: stats.delayedDeliveries > 0 ? Math.round(stats.totalDelayDays / stats.delayedDeliveries) : 0,
      }));
      rows.sort((a, b) => b.totalOrders - a.totalOrders);

      return res.json({ rows });
    }

    if (type === 'short-excess-report') {
      const rows = await prisma.supplierOrderWeightAdjustment.findMany({
        where: {
          supplierOrder: baseWhere,
          adjustmentType: { in: ['SHORT_RECEIVED', 'EXCESS_RECEIVED', 'PURITY_DIFFERENCE', 'STONE_WEIGHT_DIFFERENCE'] },
        },
        include: {
          supplierOrder: { select: { orderNo: true, supplier: { select: { name: true } } } },
          metalType: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return res.json({ rows });
    }

    if (type === 'rate-difference-report') {
      const rows = await prisma.supplierOrderWeightAdjustment.findMany({
        where: { supplierOrder: baseWhere, adjustmentType: 'PURITY_DIFFERENCE' },
        include: {
          supplierOrder: { select: { orderNo: true, supplier: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return res.json({ rows });
    }

    if (type === 'supplier-metal-balance') {
      const rows = await prisma.supplierMetalLedger.findMany({
        where: { companyId: req.companyId! },
        distinct: ['supplierId', 'metalTypeId'],
        orderBy: { createdAt: 'desc' },
        select: {
          supplierId: true, metalTypeId: true, purity: true,
          balanceAfterTransaction: true, fineWeight: true,
          supplier: { select: { name: true } },
          metalType: { select: { name: true, code: true } },
        },
      });
      return res.json({ rows });
    }

    if (type === 'supplier-money-balance') {
      const rows = await prisma.supplierMoneyLedger.findMany({
        where: { companyId: req.companyId! },
        distinct: ['supplierId'],
        orderBy: { createdAt: 'desc' },
        select: {
          supplierId: true, balanceAfterTransaction: true, debit: true, credit: true,
          supplier: { select: { name: true } },
        },
      });
      return res.json({ rows });
    }

    return res.status(400).json({ error: `Unknown report type: ${type}` });
  } catch (err) {
    logger.error('supplierOrders.reports failed', { err: (err as Error)?.message, stack: (err as Error)?.stack });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ─────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, supplierId, fromDate, toDate, q, page = '1', limit = '50' } = req.query;
    const where: Prisma.SupplierOrderWhereInput = { companyId: req.companyId };
    if (req.branchScope && req.branchScope.length > 0) {
      where.branchId = { in: req.branchScope };
    }
    if (status) where.status = status as SupplierOrderStatus;
    if (supplierId) where.supplierId = Number(supplierId);
    if (fromDate || toDate) {
      where.orderDate = {};
      if (fromDate) (where.orderDate as any).gte = new Date(String(fromDate));
      if (toDate) (where.orderDate as any).lte = new Date(String(toDate));
    }
    if (q) {
      where.OR = [
        { orderNo: { contains: String(q), mode: 'insensitive' } },
        { supplier: { name: { contains: String(q), mode: 'insensitive' } } },
        { notes: { contains: String(q), mode: 'insensitive' } },
      ];
    }

    const pageNum = Math.max(1, Number(page));
    const pageSize = Math.min(200, Math.max(1, Number(limit)));

    const [rows, total] = await Promise.all([
      prisma.supplierOrder.findMany({
        where,
        orderBy: [{ orderDate: 'desc' }],
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        include: {
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true, receipts: true } },
        },
      }),
      prisma.supplierOrder.count({ where }),
    ]);

    res.json({ rows, total, page: pageNum, limit: pageSize });
  } catch (err) {
    logger.error('supplierOrders.list failed', { err: (err as Error)?.message, stack: (err as Error)?.stack });
    res.status(500).json({ error: 'Failed to list supplier orders' });
  }
});

// ─────────────────────────────────────────────────────────────────
// CREATE DRAFT
// ─────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      supplierId, expectedDeliveryDate, priority, notes,
      items, branchId, estimatedAmount,
    } = req.body;

    if (!supplierId) return res.status(400).json({ error: 'supplierId is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    for (const it of items) {
      if (!it.category || !it.metalTypeId) {
        return res.status(400).json({ error: 'Each item needs category and metalTypeId' });
      }
    }

    const targetBranchId = branchId || req.branchId;
    if (!targetBranchId) return res.status(400).json({ error: 'branchId required' });

    // Verify supplier exists and belongs to company
    const supplier = await prisma.account.findFirst({
      where: { id: Number(supplierId), companyId: req.companyId, type: 'SUPPLIER', isActive: true },
    });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found or inactive' });

    const fy = fyOf(new Date());
    const result = await prisma.$transaction(async (tx) => {
      const num = await allocateOrderNumber(tx, req.companyId!, 'SO', 'SUPPLIER_ORDER', fy);
      const orderNo = `SO/${num}`;

      const order = await tx.supplierOrder.create({
        data: {
          orderNo,
          orderPrefix: 'SO',
          orderNumber: num,
          supplierId: Number(supplierId),
          companyId: req.companyId!,
          branchId: targetBranchId,
          status: 'DRAFT',
          priority: priority || 'NORMAL',
          orderDate: new Date(),
          expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
          estimatedAmount: Number(estimatedAmount) || 0,
          notes: notes || null,
          createdById: req.userId!,
          updatedById: req.userId!,
          items: {
            create: items.map((it: any) => ({
              category: it.category,
              ornamentType: it.ornamentType || null,
              metalType: { connect: { id: Number(it.metalTypeId) } },
              purity: it.purity || null,
              orderedQty: Number(it.orderedQty) || 1,
              orderedGrossWeight: Number(it.orderedGrossWeight) || 0,
              orderedNetWeight: Number(it.orderedNetWeight) || 0,
              expectedWastagePercent: Number(it.expectedWastagePercent) || 0,
              makingChargeType: it.makingChargeType || null,
              makingChargeValue: Number(it.makingChargeValue) || 0,
              stoneDetails: it.stoneDetails || null,
              designReference: it.designReference || null,
              size: it.size || null,
              remarks: it.remarks || null,
            })),
          },
        },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      });

      // Write initial state history
      await tx.supplierOrderStateHistory.create({
        data: {
          supplierOrderId: order.id,
          fromStatus: null,
          toStatus: 'DRAFT',
          changedById: req.userId!,
          reason: 'Order created',
        },
      });

      return order;
    });

    auditLog(req, 'SUPPLIER_ORDER_CREATED', { orderId: result.id, orderNo: result.orderNo });
    res.status(201).json({ order: result });
  } catch (err: any) {
    logger.error('supplierOrders.create failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to create supplier order' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET ONE (full detail)
// ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const order = await prisma.supplierOrder.findFirst({
      where: orderScope(req, id),
      include: {
        supplier: { select: { id: true, name: true, mobile: true, email: true, gstin: true } },
        items: { include: { metalType: { select: { name: true, code: true } } } },
        receipts: {
          include: {
            items: { include: { supplierOrderItem: { select: { category: true, ornamentType: true } } } },
          },
          orderBy: { receivedDate: 'desc' },
        },
        weightAdjustments: { orderBy: { createdAt: 'desc' } },
        invoices: true,
        payments: { orderBy: { paymentDate: 'desc' } },
        stateHistory: { orderBy: { changedAt: 'asc' } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Supplier order not found' });

    // Fetch ledger summaries
    const balance = await getSupplierBalance(prisma, order.supplierId, req.companyId!);

    res.json({
      order,
      balance,
      allowedNextStates: nextStates(order.status),
    });
  } catch (err) {
    logger.error('supplierOrders.get failed', { err: (err as Error)?.message, stack: (err as Error)?.stack });
    res.status(500).json({ error: 'Failed to fetch supplier order' });
  }
});

// ─────────────────────────────────────────────────────────────────
// UPDATE (DRAFT/basic fields)
// ─────────────────────────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.supplierOrder.findFirst({ where: orderScope(req, id) });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });

    // Terminal orders cannot be edited
    if (['CLOSED', 'CANCELLED'].includes(existing.status)) {
      // Allow only notes update
      if (req.body.notes !== undefined) {
        const order = await prisma.supplierOrder.update({
          where: { id },
          data: { notes: req.body.notes, updatedById: req.userId! },
        });
        return res.json({ order });
      }
      return res.status(400).json({ error: 'Cannot edit a closed or cancelled order' });
    }

    // After SENT_TO_SUPPLIER, restrict item/rate changes to admin/manager
    const restrictedAfterSent = existing.status !== 'DRAFT';
    const hasItemChanges = req.body.items !== undefined;
    if (restrictedAfterSent && hasItemChanges && !req.isMasterBranch) {
      return res.status(403).json({ error: 'Item/rate changes after sending require manager/admin access' });
    }

    const { priority, expectedDeliveryDate, notes, estimatedAmount, items } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.supplierOrder.update({
        where: { id },
        data: {
          ...(priority !== undefined ? { priority } : {}),
          ...(expectedDeliveryDate !== undefined ? { expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null } : {}),
          ...(notes !== undefined ? { notes: notes || null } : {}),
          ...(estimatedAmount !== undefined ? { estimatedAmount: Number(estimatedAmount) || 0 } : {}),
          updatedById: req.userId!,
        },
      });

      // If items provided and allowed, replace items (DRAFT only for full replace)
      if (items && existing.status === 'DRAFT') {
        await tx.supplierOrderItem.deleteMany({ where: { supplierOrderId: id } });
        await tx.supplierOrderItem.createMany({
          data: items.map((it: any) => ({
            supplierOrderId: id,
            category: it.category,
            ornamentType: it.ornamentType || null,
            metalTypeId: Number(it.metalTypeId),
            purity: it.purity || null,
            orderedQty: Number(it.orderedQty) || 1,
            orderedGrossWeight: Number(it.orderedGrossWeight) || 0,
            orderedNetWeight: Number(it.orderedNetWeight) || 0,
            expectedWastagePercent: Number(it.expectedWastagePercent) || 0,
            makingChargeType: it.makingChargeType || null,
            makingChargeValue: Number(it.makingChargeValue) || 0,
            stoneDetails: it.stoneDetails || null,
            designReference: it.designReference || null,
            size: it.size || null,
            remarks: it.remarks || null,
          })),
        });
      }

      return order;
    });

    auditLog(req, 'SUPPLIER_ORDER_UPDATED', { orderId: id });
    res.json({ order: result });
  } catch (err: any) {
    logger.error('supplierOrders.update failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to update supplier order' });
  }
});

// ─────────────────────────────────────────────────────────────────
// STATUS TRANSITION (generic)
// ─────────────────────────────────────────────────────────────────
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { toStatus, reason, managerOverride } = req.body;
    if (!toStatus) return res.status(400).json({ error: 'toStatus is required' });

    const existing = await prisma.supplierOrder.findFirst({
      where: orderScope(req, id),
      select: { id: true, status: true, orderNo: true },
    });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });

    await prisma.$transaction(async (tx) => {
      await transitionSupplierOrder(tx, id, existing.status, toStatus as SupplierOrderStatus, {
        userId: req.userId!,
        reason,
        managerOverride: managerOverride === true,
      });
    });

    auditLog(req, 'SUPPLIER_ORDER_STATUS_CHANGED', { orderId: id, from: existing.status, to: toStatus });
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.status failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to change status' });
  }
});

// ─────────────────────────────────────────────────────────────────
// SEND (DRAFT → SENT_TO_SUPPLIER)
// ─────────────────────────────────────────────────────────────────
router.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.supplierOrder.findFirst({
      where: orderScope(req, id),
      include: { items: true, supplier: { select: { name: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: `Cannot send from status ${existing.status}` });
    }

    await prisma.$transaction(async (tx) => {
      await transitionSupplierOrder(tx, id, 'DRAFT', 'SENT_TO_SUPPLIER', {
        userId: req.userId!,
        reason: req.body.reason || 'Order sent to supplier',
      });
    });

    auditLog(req, 'SUPPLIER_ORDER_SENT', { orderId: id, orderNo: existing.orderNo });
    res.json({ ok: true, orderNo: existing.orderNo });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.send failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to send order' });
  }
});

// ─────────────────────────────────────────────────────────────────
// ACKNOWLEDGE (supplier confirms)
// ─────────────────────────────────────────────────────────────────
router.post('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { supplierReferenceNo, confirmedDeliveryDate, confirmedRates, remarks } = req.body;

    const existing = await prisma.supplierOrder.findFirst({ where: orderScope(req, id) });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });
    if (existing.status !== 'SENT_TO_SUPPLIER') {
      return res.status(400).json({ error: `Cannot acknowledge from status ${existing.status}` });
    }

    await prisma.$transaction(async (tx) => {
      const updateData: any = { updatedById: req.userId! };
      if (supplierReferenceNo) updateData.supplierReferenceNo = supplierReferenceNo;
      if (confirmedDeliveryDate) updateData.expectedDeliveryDate = new Date(confirmedDeliveryDate);

      await tx.supplierOrder.update({
        where: { id },
        data: updateData,
      });

      // Update item fields if supplier confirmed different values
      if (Array.isArray(confirmedRates)) {
        for (const cr of confirmedRates) {
          if (cr.itemId) {
            const itemUpdate: any = {};
            if (cr.makingChargeValue !== undefined) itemUpdate.makingChargeValue = Number(cr.makingChargeValue);
            if (cr.expectedWastagePercent !== undefined) itemUpdate.expectedWastagePercent = Number(cr.expectedWastagePercent);
            if (Object.keys(itemUpdate).length > 0) {
              await tx.supplierOrderItem.update({
                where: { id: Number(cr.itemId) },
                data: itemUpdate,
              });
            }
          }
        }
      }

      await transitionSupplierOrder(tx, id, 'SENT_TO_SUPPLIER', 'SUPPLIER_ACKNOWLEDGED', {
        userId: req.userId!,
        reason: remarks || 'Supplier acknowledged',
        metadata: { supplierReferenceNo, confirmedDeliveryDate },
      });
    });

    auditLog(req, 'SUPPLIER_ORDER_ACKNOWLEDGED', { orderId: id });
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.acknowledge failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to acknowledge order' });
  }
});

// ─────────────────────────────────────────────────────────────────
// ADVANCE PAYMENT
// ─────────────────────────────────────────────────────────────────
router.post('/:id/advance-payment', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { amount, paymentMode, reference, remarks } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be > 0' });
    }

    const existing = await prisma.supplierOrder.findFirst({ where: orderScope(req, id) });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });

    // Advance can be paid after acknowledgement or even before production
    if (!canTransition(existing.status, 'ADVANCE_PAID') && existing.status !== 'ADVANCE_PAID') {
      return res.status(400).json({ error: `Cannot pay advance from status ${existing.status}` });
    }

    const result = await prisma.$transaction(async (tx) => {
      const payNum = await allocatePaymentNumber(tx, existing.companyId);
      const payment = await tx.supplierOrderPayment.create({
        data: {
          supplierOrderId: id,
          paymentNo: `SPP/${payNum}`,
          paymentPrefix: 'SPP',
          paymentNumber: payNum,
          amount: Number(amount),
          paymentMode: paymentMode || 'CASH',
          referenceNo: reference || null,
          notes: remarks || null,
          paymentDate: new Date(),
          createdById: req.userId!,
        },
      });

      await postAdvancePaymentLedger({
        tx,
        supplierId: existing.supplierId,
        companyId: existing.companyId,
        branchId: existing.branchId,
        supplierOrderId: id,
        paymentId: payment.id,
        amount: Number(amount),
        reference,
        remarks,
        userId: req.userId!,
      });

      // Update advance tracking on order
      await tx.supplierOrder.update({
        where: { id },
        data: { advancePaid: { increment: Number(amount) }, updatedById: req.userId! },
      });

      // Transition to ADVANCE_PAID if currently at SUPPLIER_ACKNOWLEDGED
      if (canTransition(existing.status, 'ADVANCE_PAID')) {
        await transitionSupplierOrder(tx, id, existing.status, 'ADVANCE_PAID', {
          userId: req.userId!,
          reason: `Advance of ₹${amount} paid`,
        });
      }

      return payment;
    });

    auditLog(req, 'SUPPLIER_ADVANCE_PAID', { orderId: id, amount });
    res.status(201).json({ payment: result });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.advancePayment failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to record advance payment' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GOODS RECEIPT
// ─────────────────────────────────────────────────────────────────
router.post('/:id/receipt', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { receivedDate, packageReference, remarks, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one receipt item is required' });
    }

    const existing = await prisma.supplierOrder.findFirst({
      where: orderScope(req, id),
      include: { items: true },
    });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });

    // Receipt allowed from DISPATCHED or PARTIALLY_RECEIVED
    const allowedForReceipt: SupplierOrderStatus[] = ['DISPATCHED', 'PARTIALLY_RECEIVED', 'IN_PRODUCTION', 'SUPPLIER_ACKNOWLEDGED', 'ADVANCE_PAID'];
    if (!allowedForReceipt.includes(existing.status)) {
      return res.status(400).json({ error: `Cannot receive from status ${existing.status}` });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Allocate receipt number
      const receiptMaxRow = await tx.$queryRawUnsafe<{ max: number | null }[]>(
        `SELECT MAX("receiptNumber")::int as max FROM "supplier_order_receipts" WHERE "companyId" = $1`,
        existing.companyId,
      );
      const receiptMax = receiptMaxRow?.[0]?.max ?? 0;
      const receiptNum = receiptMax + 1;
      const receiptNo = `SR/${receiptNum}`;

      const receipt = await tx.supplierOrderReceipt.create({
        data: {
          supplierOrderId: id,
          companyId: existing.companyId,
          branchId: existing.branchId,
          receiptNo,
          receiptNumber: receiptNum,
          status: 'PENDING_QC',
          receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
          receivedById: req.userId!,
          packageReference: packageReference || null,
          remarks: remarks || null,
          items: {
            create: items.map((it: any) => ({
              supplierOrderItem: { connect: { id: Number(it.supplierOrderItemId) } },
              receivedQty: Number(it.receivedQty) || 1,
              receivedGrossWeight: Number(it.receivedGrossWeight) || 0,
              receivedNetWeight: Number(it.receivedNetWeight) || 0,
              receivedPurity: it.receivedPurity !== undefined ? Number(it.receivedPurity) : null,
            })),
          },
        },
        include: { items: true },
      });

      // Post metal ledger for each item
      for (const item of receipt.items) {
        if (Number(item.receivedNetWeight) > 0) {
          const orderItem = existing.items.find(oi => oi.id === item.supplierOrderItemId);
          const metalTypeId = orderItem?.metalTypeId || existing.items[0]?.metalTypeId;
          if (metalTypeId) {
            await postGoodsReceiptMetalLedger({
              tx,
              supplierId: existing.supplierId,
              companyId: existing.companyId,
              branchId: existing.branchId,
              supplierOrderId: id,
              receiptId: receipt.id,
              metalTypeId,
              purity: Number(item.receivedPurity) || 0,
              grossWeight: Number(item.receivedGrossWeight),
              netWeight: Number(item.receivedNetWeight),
              userId: req.userId!,
            });
          }
        }
      }

      // Determine if partial or full receipt
      const totalOrderedWeight = existing.items.reduce((s, i) => s + Number(i.orderedNetWeight), 0);
      const allReceipts = await tx.supplierOrderReceiptItem.findMany({
        where: { receipt: { supplierOrderId: id } },
        select: { receivedNetWeight: true },
      });
      const totalReceivedWeight = allReceipts.reduce((s, r) => s + Number(r.receivedNetWeight), 0);

      const isFullyReceived = totalOrderedWeight > 0 && totalReceivedWeight >= totalOrderedWeight * 0.95; // 95% threshold
      const targetStatus: SupplierOrderStatus = isFullyReceived ? 'RECEIVED_PENDING_QC' : 'PARTIALLY_RECEIVED';

      if (canTransition(existing.status, targetStatus)) {
        await transitionSupplierOrder(tx, id, existing.status, targetStatus, {
          userId: req.userId!,
          reason: `Receipt ${receiptNo}: ${isFullyReceived ? 'fully' : 'partially'} received`,
        });
      }

      // Update aggregate weights on order
      await tx.supplierOrder.update({
        where: { id },
        data: {
          totalReceivedGrossWeight: { increment: receipt.items.reduce((s, i) => s + Number(i.receivedGrossWeight), 0) },
          totalReceivedNetWeight: { increment: receipt.items.reduce((s, i) => s + Number(i.receivedNetWeight), 0) },
          updatedById: req.userId!,
        },
      });

      return receipt;
    });

    auditLog(req, 'SUPPLIER_GOODS_RECEIVED', { orderId: id, receiptId: result.id });
    res.status(201).json({ receipt: result });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.receipt failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to record receipt' });
  }
});

// ─────────────────────────────────────────────────────────────────
// QC RECORDING
// ─────────────────────────────────────────────────────────────────
router.post('/:id/receipt/:receiptId/qc', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const receiptId = Number(req.params.receiptId);
    const { items: qcItems } = req.body;

    if (!Array.isArray(qcItems) || qcItems.length === 0) {
      return res.status(400).json({ error: 'QC items are required' });
    }

    const existing = await prisma.supplierOrder.findFirst({
      where: orderScope(req, id),
      include: { items: true },
    });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });

    const receipt = await prisma.supplierOrderReceipt.findFirst({
      where: { id: receiptId, supplierOrderId: id },
      include: { items: true },
    });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    await prisma.$transaction(async (tx) => {
      for (const qcItem of qcItems) {
        const receiptItemId = Number(qcItem.receiptItemId);
        const receiptItem = receipt.items.find(ri => ri.id === receiptItemId);
        if (!receiptItem) continue;

        // Update receipt item QC fields
        await tx.supplierOrderReceiptItem.update({
          where: { id: receiptItemId },
          data: {
            qcStatus: qcItem.qcStatus || 'PASSED',
            acceptedQty: qcItem.acceptedQty !== undefined ? Number(qcItem.acceptedQty) : Number(receiptItem.receivedQty),
            rejectedQty: qcItem.rejectedQty !== undefined ? Number(qcItem.rejectedQty) : 0,
            acceptedGrossWeight: qcItem.acceptedGrossWeight !== undefined ? Number(qcItem.acceptedGrossWeight) : Number(receiptItem.receivedGrossWeight),
            acceptedNetWeight: qcItem.acceptedNetWeight !== undefined ? Number(qcItem.acceptedNetWeight) : Number(receiptItem.receivedNetWeight),
            qcRemarks: qcItem.remarks || null,
          },
        });

        // Create weight adjustment if there's a difference
        const receivedNet = Number(receiptItem.receivedNetWeight);
        const acceptedNet = qcItem.acceptedNetWeight !== undefined ? Number(qcItem.acceptedNetWeight) : receivedNet;
        const weightDiff = acceptedNet - receivedNet;

        if (Math.abs(weightDiff) > 0.01) {
          const adjustmentType = weightDiff < 0 ? 'SHORT_RECEIVED' as const : 'EXCESS_RECEIVED' as const;
          const orderItem = existing.items.find(oi => oi.id === receiptItem.supplierOrderItemId);

          await tx.supplierOrderWeightAdjustment.create({
            data: {
              supplierOrderId: id,
              receiptItemId: receiptItemId,
              supplierOrderItemId: receiptItem.supplierOrderItemId,
              receiptId: receiptId,
              adjustmentType,
              metalTypeId: orderItem?.metalTypeId || existing.items[0]?.metalTypeId || 1,
              purity: Number(receiptItem.receivedPurity) || 0,
              grossDelta: weightDiff,
              netDelta: weightDiff,
              fineWeightDelta: weightDiff * (Number(receiptItem.receivedPurity) || 0) / 100,
              approvalRequired: Math.abs(weightDiff) > 1.0, // > 1g needs approval
              reason: qcItem.adjustmentRemarks || null,
              createdById: req.userId!,
            },
          });

          // Post weight adjustment to metal ledger
          const metalTypeId = orderItem?.metalTypeId || existing.items[0]?.metalTypeId;
          if (metalTypeId) {
            await postWeightAdjustmentLedger({
              tx,
              supplierId: existing.supplierId,
              companyId: existing.companyId,
              branchId: existing.branchId,
              supplierOrderId: id,
              receiptId,
              metalTypeId,
              purity: Number(receiptItem.receivedPurity) || 0,
              adjustmentType: weightDiff < 0 ? 'SHORT_RECEIVED' : 'EXCESS_RECEIVED',
              netWeightDelta: weightDiff,
              grossWeightDelta: weightDiff,
              remarks: qcItem.adjustmentRemarks || `QC ${adjustmentType}: ${Math.abs(weightDiff)}g`,
              userId: req.userId!,
            });
          }
        }

        // Purity difference
        if (qcItem.actualPurity !== undefined && Number(receiptItem.receivedPurity) > 0) {
          const purityDiff = Number(qcItem.actualPurity) - Number(receiptItem.receivedPurity);
          if (Math.abs(purityDiff) > 0.1) {
            const orderItem = existing.items.find(oi => oi.id === receiptItem.supplierOrderItemId);
            await tx.supplierOrderWeightAdjustment.create({
              data: {
                supplierOrderId: id,
                receiptItemId: receiptItemId,
                supplierOrderItemId: receiptItem.supplierOrderItemId,
                receiptId: receiptId,
                adjustmentType: 'PURITY_DIFFERENCE',
                metalTypeId: orderItem?.metalTypeId || existing.items[0]?.metalTypeId || 1,
                purity: Number(qcItem.actualPurity),
                grossDelta: 0,
                netDelta: 0,
                fineWeightDelta: 0,
                approvalRequired: Math.abs(purityDiff) > 1.0,
                reason: `Purity difference: expected ${receiptItem.receivedPurity}%, actual ${qcItem.actualPurity}%`,
                createdById: req.userId!,
              },
            });
          }
        }
      }

      // Update receipt status
      const updatedReceiptItems = await tx.supplierOrderReceiptItem.findMany({
        where: { receiptId },
        select: { qcStatus: true },
      });
      const allQcDone = updatedReceiptItems.every(ri => ri.qcStatus !== 'PENDING');
      if (allQcDone) {
        const allPassed = updatedReceiptItems.every(ri => ri.qcStatus === 'PASSED');
        const anyFailed = updatedReceiptItems.some(ri => ri.qcStatus === 'FAILED');
        const newStatus = anyFailed ? 'PARTIAL_PASS' as const : allPassed ? 'QC_PASSED' as const : 'QC_PASSED' as const;
        await tx.supplierOrderReceipt.update({
          where: { id: receiptId },
          data: { status: newStatus },
        });
      }

      // Check if all receipts for the order are QC-completed → transition order
      const allOrderReceipts = await tx.supplierOrderReceipt.findMany({
        where: { supplierOrderId: id },
        select: { status: true },
      });
      const allReceiptsQcDone = allOrderReceipts.every(r => r.status === 'QC_PASSED' || r.status === 'PARTIAL_PASS');
      if (allReceiptsQcDone && canTransition(existing.status, 'QC_COMPLETED')) {
        await transitionSupplierOrder(tx, id, existing.status, 'QC_COMPLETED', {
          userId: req.userId!,
          reason: 'All receipt items QC completed',
        });
      }
    });

    auditLog(req, 'SUPPLIER_ORDER_QC', { orderId: id, receiptId });
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.qc failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to record QC' });
  }
});

// ─────────────────────────────────────────────────────────────────
// INVOICE
// ─────────────────────────────────────────────────────────────────
router.post('/:id/invoice', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const {
      supplierInvoiceNo, invoiceDate, taxableAmount,
      cgstAmount, sgstAmount, igstAmount, otherCharges, discountAmount,
      advanceAdjusted, totalAmount, dueAmount, remarks,
    } = req.body;

    if (!supplierInvoiceNo) return res.status(400).json({ error: 'supplierInvoiceNo is required' });
    if (!taxableAmount || Number(taxableAmount) <= 0) {
      return res.status(400).json({ error: 'taxableAmount must be > 0' });
    }

    const existing = await prisma.supplierOrder.findFirst({ where: orderScope(req, id) });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });

    // Invoice typically comes after QC or during receipt
    const allowedForInvoice: SupplierOrderStatus[] = [
      'QC_COMPLETED', 'RECEIVED_PENDING_QC', 'PURCHASE_POSTED',
      'SHORT_DELIVERED', 'EXCESS_DELIVERED',
    ];
    if (!allowedForInvoice.includes(existing.status)) {
      return res.status(400).json({ error: `Cannot record invoice from status ${existing.status}` });
    }

    const computedGst = Number(cgstAmount || 0) + Number(sgstAmount || 0) + Number(igstAmount || 0);
    const computedTotal = Number(totalAmount) || (Number(taxableAmount) + computedGst + Number(otherCharges || 0) - Number(discountAmount || 0));
    const computedDue = dueAmount !== undefined ? Number(dueAmount) : (computedTotal - Number(advanceAdjusted || 0));

    const result = await prisma.$transaction(async (tx) => {
      const invNum = await allocateInvoiceNumber(tx, existing.companyId);
      const invoice = await tx.supplierOrderInvoice.create({
        data: {
          supplierOrderId: id,
          invoiceNo: `SPI/${invNum}`,
          invoicePrefix: 'SPI',
          invoiceNumber: invNum,
          supplierInvoiceNo,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          taxableAmount: Number(taxableAmount),
          cgstAmount: Number(cgstAmount) || 0,
          sgstAmount: Number(sgstAmount) || 0,
          igstAmount: Number(igstAmount) || 0,
          gstAmount: computedGst,
          otherCharges: Number(otherCharges) || 0,
          discountAmount: Number(discountAmount) || 0,
          advanceAdjusted: Number(advanceAdjusted) || 0,
          totalAmount: computedTotal,
          paidAmount: 0,
          dueAmount: computedDue,
          status: 'CONFIRMED',
          createdById: req.userId!,
        },
      });

      // Post money ledger — invoice creates payable
      await postSupplierInvoicePayable({
        tx,
        supplierId: existing.supplierId,
        companyId: existing.companyId,
        branchId: existing.branchId,
        supplierOrderId: id,
        invoiceId: invoice.id,
        amount: computedTotal,
        reference: supplierInvoiceNo,
        remarks: `Supplier invoice ${supplierInvoiceNo}`,
        userId: req.userId!,
      });

      // Transition to INVOICE_RECEIVED
      if (canTransition(existing.status, 'INVOICE_RECEIVED')) {
        await transitionSupplierOrder(tx, id, existing.status, 'INVOICE_RECEIVED', {
          userId: req.userId!,
          reason: `Invoice ${supplierInvoiceNo} received`,
        });
      }

      return invoice;
    });

    auditLog(req, 'SUPPLIER_INVOICE_RECEIVED', { orderId: id, invoiceId: result.id });
    res.status(201).json({ invoice: result });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.invoice failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to record invoice' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST PURCHASE (QC accepted → inventory)
// ─────────────────────────────────────────────────────────────────
router.post('/:id/post-purchase', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.supplierOrder.findFirst({
      where: orderScope(req, id),
      include: {
        receipts: { include: { items: true } },
      },
    });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });

    // Must be QC_COMPLETED or INVOICE_RECEIVED to post purchase
    const allowedForPost: SupplierOrderStatus[] = ['QC_COMPLETED', 'INVOICE_RECEIVED'];
    if (!allowedForPost.includes(existing.status)) {
      return res.status(400).json({ error: `Cannot post purchase from status ${existing.status}` });
    }

    // Idempotency: if ALL receipt items already posted, return success
    const allItems = existing.receipts.flatMap(r => r.items);
    const eligibleItems = allItems.filter(ri => ri.qcStatus === 'PASSED' || ri.qcStatus === 'CONDITIONAL');
    const alreadyPosted = eligibleItems.length > 0 && eligibleItems.every(ri => ri.inventoryPosted);
    if (alreadyPosted) {
      return res.json({ ok: true, message: 'Purchase already posted' });
    }

    const result = await postSupplierOrderPurchase({
      supplierOrderId: id,
      companyId: req.companyId!,
      branchId: existing.branchId,
      userId: req.userId!,
      financialYear: req.body.financialYear,
    });

    auditLog(req, 'SUPPLIER_PURCHASE_POSTED', {
      orderId: id,
      purchaseVoucherId: result.purchaseVoucherId,
      voucherNo: result.voucherNo,
      labelsCreated: result.labelsCreated,
      itemsPosted: result.itemsPosted,
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.postPurchase failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to post purchase' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PAYMENT
// ─────────────────────────────────────────────────────────────────
router.post('/:id/payment', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { amount, paymentMode, reference, remarks } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be > 0' });
    }

    const existing = await prisma.supplierOrder.findFirst({
      where: orderScope(req, id),
      include: { invoices: true },
    });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });

    const allowedForPayment: SupplierOrderStatus[] = ['INVOICE_RECEIVED', 'PURCHASE_POSTED', 'PAYMENT_PENDING'];
    if (!allowedForPayment.includes(existing.status)) {
      return res.status(400).json({ error: `Cannot make payment from status ${existing.status}` });
    }

    const result = await prisma.$transaction(async (tx) => {
      const payNum = await allocatePaymentNumber(tx, existing.companyId);
      const payment = await tx.supplierOrderPayment.create({
        data: {
          supplierOrderId: id,
          paymentNo: `SPP/${payNum}`,
          paymentPrefix: 'SPP',
          paymentNumber: payNum,
          invoiceId: existing.invoices[0]?.id || null,
          amount: Number(amount),
          paymentMode: paymentMode || 'CASH',
          referenceNo: reference || null,
          notes: remarks || null,
          paymentDate: new Date(),
          createdById: req.userId!,
        },
      });

      await postSupplierPayment({
        tx,
        supplierId: existing.supplierId,
        companyId: existing.companyId,
        branchId: existing.branchId,
        supplierOrderId: id,
        paymentId: payment.id,
        amount: Number(amount),
        paymentType: 'DELIVERY_PAYMENT',
        reference,
        remarks,
        userId: req.userId!,
      });

      // Check remaining due
      const totalInvoiced = existing.invoices.reduce((s, inv) => s + Number(inv.totalAmount), 0);
      const allPayments = await tx.supplierOrderPayment.findMany({
        where: { supplierOrderId: id },
        select: { amount: true },
      });
      const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
      const remaining = totalInvoiced - totalPaid;

      // Update invoice paid/due amounts
      for (const inv of existing.invoices) {
        await tx.supplierOrderInvoice.update({
          where: { id: inv.id },
          data: {
            paidAmount: Math.min(totalPaid, Number(inv.totalAmount)),
            dueAmount: Math.max(0, Number(inv.totalAmount) - totalPaid),
          },
        });
      }

      // Transition based on remaining balance
      if (remaining > 0 && existing.status !== 'PAYMENT_PENDING' && canTransition(existing.status, 'PAYMENT_PENDING')) {
        await transitionSupplierOrder(tx, id, existing.status, 'PAYMENT_PENDING', {
          userId: req.userId!,
          reason: `Payment of ₹${amount}. Remaining: ₹${Math.max(0, remaining)}`,
        });
      }

      return payment;
    });

    auditLog(req, 'SUPPLIER_PAYMENT_MADE', { orderId: id, amount, paymentId: result.id });
    res.status(201).json({ payment: result });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.payment failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to record payment' });
  }
});

// ─────────────────────────────────────────────────────────────────
// CLOSE ORDER
// ─────────────────────────────────────────────────────────────────
router.post('/:id/close', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { reason, managerOverride } = req.body;

    const existing = await prisma.supplierOrder.findFirst({
      where: orderScope(req, id),
      include: { invoices: true, payments: true },
    });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });

    if (!canTransition(existing.status, 'CLOSED')) {
      return res.status(400).json({ error: `Cannot close from status ${existing.status}` });
    }

    // Check for unresolved disputes
    const unresolvedDisputes = await prisma.supplierOrderWeightAdjustment.count({
      where: { supplierOrderId: id, approvalRequired: true, approvedById: null },
    });
    if (unresolvedDisputes > 0) {
      return res.status(400).json({ error: `Cannot close — ${unresolvedDisputes} unresolved weight adjustment(s) pending approval` });
    }

    await prisma.$transaction(async (tx) => {
      await transitionSupplierOrder(tx, id, existing.status, 'CLOSED', {
        userId: req.userId!,
        reason: reason || 'Order closed',
        managerOverride: managerOverride === true,
      });
    });

    auditLog(req, 'SUPPLIER_ORDER_CLOSED', { orderId: id });
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.close failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to close order' });
  }
});

// ─────────────────────────────────────────────────────────────────
// CANCEL ORDER
// ─────────────────────────────────────────────────────────────────
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { reason, managerOverride } = req.body;

    if (!reason?.trim()) return res.status(400).json({ error: 'Cancellation reason is required' });

    const existing = await prisma.supplierOrder.findFirst({
      where: orderScope(req, id),
      include: { payments: true, receipts: true },
    });
    if (!existing) return res.status(404).json({ error: 'Supplier order not found' });

    if (!canTransition(existing.status, 'CANCELLED')) {
      return res.status(400).json({ error: `Cannot cancel from status ${existing.status}` });
    }

    // After advance/payment/receipt — require manager
    const hasPayments = existing.payments.length > 0;
    const hasReceipts = existing.receipts.length > 0;
    if ((hasPayments || hasReceipts) && !managerOverride && !req.isMasterBranch) {
      return res.status(403).json({ error: 'Cancellation after advance/receipt requires manager/admin approval' });
    }

    await prisma.$transaction(async (tx) => {
      // Reverse ledger entries
      await reverseLedgerForCancellation({
        tx,
        supplierId: existing.supplierId,
        companyId: existing.companyId,
        branchId: existing.branchId,
        supplierOrderId: id,
        userId: req.userId!,
      });

      await transitionSupplierOrder(tx, id, existing.status, 'CANCELLED', {
        userId: req.userId!,
        reason,
        managerOverride: managerOverride === true,
      });
    });

    auditLog(req, 'SUPPLIER_ORDER_CANCELLED', { orderId: id, reason });
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof InvalidSupplierOrderTransitionError || err instanceof SupplierOrderTransitionValidationError) {
      return res.status(400).json({ error: err.message, code: (err as any).code });
    }
    logger.error('supplierOrders.cancel failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to cancel order' });
  }
});

export default router;
