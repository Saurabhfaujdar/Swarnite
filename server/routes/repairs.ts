/**
 * Repair Management Routes
 * ─────────────────────────
 * Customer repair workflow with separate metal + money ledgers.
 *
 *   GET    /api/repairs                        — list repairs (filter: status, kariger, branch, q)
 *   GET    /api/repairs/dashboard              — dashboard counters
 *   GET    /api/repairs/reports/:type          — operational/financial/metal reports
 *   POST   /api/repairs                        — intake (create job + items)
 *   GET    /api/repairs/:id                    — detail with items, photos, timeline, charges, invoice
 *   PUT    /api/repairs/:id                    — patch top-level fields (notes, priority, etc.)
 *   PATCH  /api/repairs/:id/status             — workflow transition
 *   POST   /api/repairs/:id/items              — add another repair item
 *   POST   /api/repairs/:id/photos             — register a photo (after upload via /api/files)
 *   POST   /api/repairs/:id/assign-kariger     — assign + post metal ledger (GOLD_RECEIVABLE)
 *   POST   /api/repairs/:id/return-from-kariger — record returned weights
 *   POST   /api/repairs/:id/weight-adjustment  — classified weight diff (with ledger posting)
 *   POST   /api/repairs/:id/charges            — add a labour/polish/etc. charge
 *   POST   /api/repairs/:id/invoice            — generate invoice from charges
 *   POST   /api/repairs/:id/invoice/payment    — record customer payment
 *   POST   /api/repairs/:id/approve            — manager approval (extra-gold threshold)
 *   POST   /api/repairs/:id/deliver            — final delivery (gates on payment)
 */

import { Router, Request, Response } from 'express';
import { Prisma, RepairStatus, WeightAdjustmentType } from '@prisma/client';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/branchAccess';
import { logger } from '../logger';
import { auditLog } from '../middleware/audit';
import { transition, nextStates, InvalidRepairTransitionError } from '../services/repairWorkflow';
import { postMetalLedger, postMoneyLedger } from '../services/repairLedger';
import { notifier } from '../services/notification';

const router = Router();
router.use(authenticate);

// Threshold (₹) above which extra-gold charges require manager approval.
// Centralised so we can later move it to GstConfig / SystemConfig.
const EXTRA_GOLD_APPROVAL_THRESHOLD = 5000;

/**
 * Build the WHERE filter for a single repair lookup that respects
 * tenant + branch scope. Branch users can only touch repairs in their
 * branch hierarchy; master-branch / unscoped users see the whole company.
 *
 * Use this for every single-resource read/write (`findFirst`, `update`)
 * — without it a branch user could mutate another branch's repair just
 * by guessing an id.
 */
function repairScope(req: Request, id: number): Prisma.RepairJobWhereInput {
  const where: Prisma.RepairJobWhereInput = { id, companyId: req.companyId };
  if (req.branchScope && req.branchScope.length > 0) {
    where.branchId = { in: req.branchScope };
  }
  return where;
}

// Default GST split (CGST/SGST intra-state) for repair labour.
const DEFAULT_CGST = 1.5;
const DEFAULT_SGST = 1.5;

// ── Utility: allocate REP/N voucher number safely ────────────────
async function allocateRepairNumber(
  tx: Prisma.TransactionClient,
  companyId: number,
  prefix: string,
  entityType: string,
  financialYear: string,
): Promise<number> {
  // Mirror layaway/sales pattern: bump VoucherSequence past MAX(existing)
  // to survive legacy data that bypassed the sequence.
  const table = entityType === 'REPAIR_INVOICE' ? 'repair_invoices' : 'repair_jobs';
  const numColumn = entityType === 'REPAIR_INVOICE' ? 'invoiceNumber' : 'repairNumber';
  const prefixColumn = entityType === 'REPAIR_INVOICE' ? 'invoicePrefix' : 'repairPrefix';

  // RepairInvoice has no companyId column — scope through the parent
  // RepairJob.companyId via a join. RepairJob has companyId directly.
  const maxRow = entityType === 'REPAIR_INVOICE'
    ? await tx.$queryRawUnsafe<{ max: number | null }[]>(
        `SELECT MAX(i."${numColumn}")::int as max FROM "${table}" i ` +
          `JOIN "repair_jobs" j ON j."id" = i."repairJobId" ` +
          `WHERE j."companyId" = $1 AND i."${prefixColumn}" = $2`,
        companyId, prefix,
      )
    : await tx.$queryRawUnsafe<{ max: number | null }[]>(
        `SELECT MAX("${numColumn}")::int as max FROM "${table}" WHERE "companyId" = $1 AND "${prefixColumn}" = $2`,
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

function fyOf(date: Date): string {
  // Indian FY: Apr–Mar
  const y = date.getFullYear();
  return date.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
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

    const baseWhere: Prisma.RepairJobWhereInput = { companyId: req.companyId };
    // Branch users see only their branch; masters see all
    if (req.branchScope && req.branchScope.length > 0) {
      baseWhere.branchId = { in: req.branchScope };
    }

    const [
      totalActive,
      readyForDelivery,
      delayed,
      dueToday,
      goldDiscrepancyCount,
      revenueAgg,
      karigerLoad,
      branchStats,
      recent,
    ] = await Promise.all([
      prisma.repairJob.count({
        where: { ...baseWhere, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      }),
      prisma.repairJob.count({
        where: { ...baseWhere, status: 'READY_FOR_DELIVERY' },
      }),
      prisma.repairJob.count({
        where: {
          ...baseWhere,
          status: { notIn: ['DELIVERED', 'CANCELLED'] },
          expectedDeliveryDate: { lt: today },
        },
      }),
      prisma.repairJob.count({
        where: {
          ...baseWhere,
          status: { notIn: ['DELIVERED', 'CANCELLED'] },
          expectedDeliveryDate: { gte: today, lt: tomorrow },
        },
      }),
      prisma.repairWeightAdjustment.count({
        where: {
          repairJob: baseWhere,
          adjustmentType: { in: ['EXTRA_GOLD_ADDED', 'APPROVED_REDUCTION'] },
          createdAt: { gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.repairInvoice.aggregate({
        _sum: { paidAmount: true, dueAmount: true, totalAmount: true },
        where: {
          repairJob: baseWhere,
          createdAt: { gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.repairJob.groupBy({
        by: ['assignedKarigerId'],
        where: {
          ...baseWhere,
          status: { in: ['ASSIGNED_TO_KARIGER', 'IN_PROGRESS', 'REWORK_REQUIRED'] },
          assignedKarigerId: { not: null },
        },
        _count: { _all: true },
      }),
      prisma.repairJob.groupBy({
        by: ['branchId', 'status'],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.repairJob.findMany({
        where: baseWhere,
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true, repairNo: true, customerName: true, status: true,
          intakeDate: true, expectedDeliveryDate: true,
          assignedKariger: { select: { name: true } },
        },
      }),
    ]);

    // Resolve kariger ids → names for the workload widget
    const karigerIds = karigerLoad.map(k => k.assignedKarigerId).filter((x): x is number => x !== null);
    const karigers = karigerIds.length
      ? await prisma.kariger.findMany({
          where: { id: { in: karigerIds } },
          select: { id: true, name: true, code: true, metalBalance: true, moneyBalance: true },
        })
      : [];
    const karigerById = new Map(karigers.map(k => [k.id, k]));
    const workload = karigerLoad.map(k => ({
      kariger: karigerById.get(k.assignedKarigerId!),
      jobCount: k._count._all,
    }));

    res.json({
      counters: {
        totalActive,
        readyForDelivery,
        delayed,
        dueToday,
        goldDiscrepancyAlerts: goldDiscrepancyCount,
      },
      revenue30d: {
        invoiced: Number(revenueAgg._sum.totalAmount ?? 0),
        collected: Number(revenueAgg._sum.paidAmount ?? 0),
        outstanding: Number(revenueAgg._sum.dueAmount ?? 0),
      },
      karigerWorkload: workload,
      branchStats,
      recent,
    });
  } catch (err) {
    logger.error('repairs.dashboard failed', { err: (err as Error)?.message, stack: (err as Error)?.stack });
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ─────────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────────
router.get('/reports/:type', async (req: Request, res: Response) => {
  try {
    const type = req.params.type;
    const baseWhere: Prisma.RepairJobWhereInput = { companyId: req.companyId };
    if (req.branchScope && req.branchScope.length > 0) {
      baseWhere.branchId = { in: req.branchScope };
    }

    if (type === 'pending') {
      const rows = await prisma.repairJob.findMany({
        where: { ...baseWhere, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        orderBy: { intakeDate: 'asc' },
        include: {
          assignedKariger: { select: { name: true } },
          branch: { select: { name: true } },
        },
      });
      return res.json({ rows });
    }

    if (type === 'delayed') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const rows = await prisma.repairJob.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ['DELIVERED', 'CANCELLED'] },
          expectedDeliveryDate: { lt: today },
        },
        orderBy: { expectedDeliveryDate: 'asc' },
        include: {
          assignedKariger: { select: { name: true } },
          branch: { select: { name: true } },
        },
      });
      return res.json({ rows });
    }

    if (type === 'unpaid-invoices') {
      const rows = await prisma.repairInvoice.findMany({
        where: {
          paymentStatus: { in: ['PENDING', 'PARTIAL'] },
          repairJob: baseWhere,
        },
        include: {
          repairJob: {
            select: {
              id: true, repairNo: true, customerName: true, customerMobile: true,
              branch: { select: { name: true } },
            },
          },
        },
        orderBy: { invoiceDate: 'asc' },
      });
      return res.json({ rows });
    }

    if (type === 'kariger-payable') {
      const rows = await prisma.kariger.findMany({
        where: { companyId: req.companyId, isActive: true, moneyBalance: { gt: 0 } },
        orderBy: { moneyBalance: 'desc' },
        select: {
          id: true, code: true, name: true, mobile: true,
          metalBalance: true, moneyBalance: true,
        },
      });
      return res.json({ rows });
    }

    if (type === 'kariger-gold-balance') {
      const rows = await prisma.kariger.findMany({
        where: { companyId: req.companyId, isActive: true },
        orderBy: { metalBalance: 'desc' },
        select: {
          id: true, code: true, name: true,
          metalBalance: true, moneyBalance: true,
        },
      });
      return res.json({ rows });
    }

    if (type === 'wastage') {
      const rows = await prisma.repairWeightAdjustment.findMany({
        where: {
          repairJob: baseWhere,
          adjustmentType: { in: ['NORMAL_WASTAGE', 'APPROVED_REDUCTION'] },
        },
        include: {
          repairJob: { select: { repairNo: true, customerName: true, assignedKariger: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return res.json({ rows });
    }

    return res.status(400).json({ error: `Unknown report type: ${type}` });
  } catch (err) {
    logger.error('repairs.reports failed', { err: (err as Error)?.message, stack: (err as Error)?.stack });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ─────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, karigerId, q, page = '1', limit = '50' } = req.query;
    const where: Prisma.RepairJobWhereInput = { companyId: req.companyId };
    if (req.branchScope && req.branchScope.length > 0) {
      where.branchId = { in: req.branchScope };
    }
    if (status) where.status = status as RepairStatus;
    if (karigerId) where.assignedKarigerId = Number(karigerId);
    if (q) {
      where.OR = [
        { repairNo: { contains: String(q), mode: 'insensitive' } },
        { customerName: { contains: String(q), mode: 'insensitive' } },
        { customerMobile: { contains: String(q), mode: 'insensitive' } },
      ];
    }
    const pageNum = Math.max(1, Number(page));
    const pageSize = Math.min(200, Math.max(1, Number(limit)));

    const [rows, total] = await Promise.all([
      prisma.repairJob.findMany({
        where,
        orderBy: [{ status: 'asc' }, { intakeDate: 'desc' }],
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        include: {
          assignedKariger: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true, photos: true } },
        },
      }),
      prisma.repairJob.count({ where }),
    ]);
    res.json({ rows, total, page: pageNum, limit: pageSize });
  } catch (err) {
    logger.error('repairs.list failed', { err: (err as Error)?.message, stack: (err as Error)?.stack });
    res.status(500).json({ error: 'Failed to list repairs' });
  }
});

// ─────────────────────────────────────────────────────────────────
// CREATE (INTAKE)
// ─────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      customerAccountId, customerName, customerMobile,
      priority, expectedDeliveryDate,
      estimatedAmount, advanceReceived,
      customerNotes, internalNotes,
      items,         // [{ ornamentType, metalTypeId, purity, grossWeight, netWeight, stoneWeight, quantity, ... }]
      branchId,      // optional override; defaults to user's branch
    } = req.body;

    if (!customerName?.trim()) return res.status(400).json({ error: 'customerName is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one repair item is required' });
    }
    for (const it of items) {
      if (!it.ornamentType || !it.metalTypeId || Number(it.grossWeight) <= 0) {
        return res.status(400).json({ error: 'Each item needs ornamentType, metalTypeId and grossWeight > 0' });
      }
    }

    const targetBranchId = branchId || req.branchId;
    if (!targetBranchId) return res.status(400).json({ error: 'branchId required' });

    const fy = fyOf(new Date());
    const result = await prisma.$transaction(async (tx) => {
      const num = await allocateRepairNumber(tx, req.companyId!, 'REP', 'REPAIR', fy);
      const repairNo = `REP/${num}`;
      const job = await tx.repairJob.create({
        data: {
          repairNo,
          repairPrefix: 'REP',
          repairNumber: num,
          customerAccountId: customerAccountId ? Number(customerAccountId) : null,
          customerName: customerName.trim(),
          customerMobile: customerMobile || null,
          branchId: targetBranchId,
          companyId: req.companyId!,
          status: 'RECEIVED',
          priority: priority || 'NORMAL',
          intakeDate: new Date(),
          expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
          estimatedAmount: Number(estimatedAmount) || 0,
          advanceReceived: Number(advanceReceived) || 0,
          customerNotes: customerNotes || null,
          internalNotes: internalNotes || null,
          createdBy: req.userId!,
          updatedBy: req.userId!,
          items: {
            create: items.map((it: any) => ({
              ornamentType: it.ornamentType,
              metalTypeId: Number(it.metalTypeId),
              purity: it.purity || '',
              grossWeight: Number(it.grossWeight) || 0,
              netWeight: Number(it.netWeight) || Number(it.grossWeight) || 0,
              stoneWeight: Number(it.stoneWeight) || 0,
              quantity: Number(it.quantity) || 1,
              description: it.description || null,
              conditionNotes: it.conditionNotes || null,
              hallmarkDetails: it.hallmarkDetails || null,
              issueDescription: it.issueDescription || null,
            })),
          },
        },
        include: { items: true },
      });

      await tx.repairStateHistory.create({
        data: {
          repairJobId: job.id,
          fromState: null,
          toState: 'RECEIVED',
          remarks: 'Repair intake',
          changedBy: req.userId!,
        },
      });

      return job;
    });

    auditLog(req, 'REPAIR_CREATED', { repairId: result.id, repairNo: result.repairNo });
    notifier.send({
      event: 'REPAIR_RECEIVED',
      repairNo: result.repairNo,
      customerName: result.customerName,
      customerMobile: result.customerMobile,
      amount: Number(result.estimatedAmount),
    }).catch(() => undefined);

    res.status(201).json({ repair: result });
  } catch (err: any) {
    logger.error('repairs.create failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to create repair' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET ONE
// ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const repair = await prisma.repairJob.findFirst({
      where: repairScope(req, id),
      include: {
        items: { include: { metalType: { select: { name: true, code: true } } } },
        photos: true,
        stateHistory: { orderBy: { changedAt: 'asc' } },
        assignments: {
          include: { kariger: { select: { id: true, name: true, code: true } } },
          orderBy: { assignedAt: 'desc' },
        },
        weightAdjustments: { orderBy: { createdAt: 'desc' } },
        charges: { orderBy: { createdAt: 'asc' } },
        invoice: true,
        branch: { select: { id: true, name: true, code: true } },
        assignedKariger: { select: { id: true, name: true, code: true } },
      },
    });
    if (!repair) return res.status(404).json({ error: 'Repair not found' });

    res.json({
      repair,
      allowedNextStates: nextStates(repair.status),
    });
  } catch (err) {
    logger.error('repairs.get failed', { err: (err as Error)?.message, stack: (err as Error)?.stack });
    res.status(500).json({ error: 'Failed to fetch repair' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH top-level (notes, priority, expectedDeliveryDate)
// ─────────────────────────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.repairJob.findFirst({ where: repairScope(req, id) });
    if (!existing) return res.status(404).json({ error: 'Repair not found' });

    const { priority, expectedDeliveryDate, customerNotes, internalNotes, estimatedAmount } = req.body;
    const repair = await prisma.repairJob.update({
      where: { id },
      data: {
        ...(priority !== undefined ? { priority } : {}),
        ...(expectedDeliveryDate !== undefined ? { expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null } : {}),
        ...(customerNotes !== undefined ? { customerNotes: customerNotes || null } : {}),
        ...(internalNotes !== undefined ? { internalNotes: internalNotes || null } : {}),
        ...(estimatedAmount !== undefined ? { estimatedAmount: Number(estimatedAmount) || 0 } : {}),
        updatedBy: req.userId!,
      },
    });
    auditLog(req, 'REPAIR_UPDATED', { repairId: id });
    res.json({ repair });
  } catch (err: any) {
    logger.error('repairs.update failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to update repair' });
  }
});

// ─────────────────────────────────────────────────────────────────
// STATUS TRANSITION
// ─────────────────────────────────────────────────────────────────
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { toState, remarks } = req.body;
    if (!toState) return res.status(400).json({ error: 'toState is required' });

    const existing = await prisma.repairJob.findFirst({
      where: repairScope(req, id),
      select: { id: true, status: true, repairNo: true, customerName: true, customerMobile: true },
    });
    if (!existing) return res.status(404).json({ error: 'Repair not found' });

    await prisma.$transaction(async (tx) => {
      await transition(tx, id, existing.status, toState as RepairStatus, req.userId!, remarks);
    });

    auditLog(req, 'REPAIR_STATUS_CHANGED', { repairId: id, from: existing.status, to: toState });

    // Fire notification on key milestones
    if (toState === 'WAITING_CUSTOMER_APPROVAL') {
      notifier.send({
        event: 'APPROVAL_REQUIRED', repairNo: existing.repairNo,
        customerName: existing.customerName, customerMobile: existing.customerMobile,
      }).catch(() => undefined);
    } else if (toState === 'ESTIMATE_PENDING') {
      notifier.send({
        event: 'ESTIMATE_READY', repairNo: existing.repairNo,
        customerName: existing.customerName, customerMobile: existing.customerMobile,
      }).catch(() => undefined);
    } else if (toState === 'READY_FOR_DELIVERY') {
      notifier.send({
        event: 'READY_FOR_DELIVERY', repairNo: existing.repairNo,
        customerName: existing.customerName, customerMobile: existing.customerMobile,
      }).catch(() => undefined);
    }

    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof InvalidRepairTransitionError) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('repairs.status failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to change status' });
  }
});

// ─────────────────────────────────────────────────────────────────
// ADD ITEM TO EXISTING JOB (allowed pre-IN_PROGRESS)
// ─────────────────────────────────────────────────────────────────
router.post('/:id/items', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const job = await prisma.repairJob.findFirst({ where: repairScope(req, id) });
    if (!job) return res.status(404).json({ error: 'Repair not found' });

    if (['DELIVERED', 'CANCELLED'].includes(job.status)) {
      return res.status(400).json({ error: 'Cannot add items to a closed repair' });
    }
    const body = req.body;
    if (!body.ornamentType || !body.metalTypeId || Number(body.grossWeight) <= 0) {
      return res.status(400).json({ error: 'ornamentType, metalTypeId, grossWeight > 0 required' });
    }
    const item = await prisma.repairItem.create({
      data: {
        repairJobId: id,
        ornamentType: body.ornamentType,
        metalTypeId: Number(body.metalTypeId),
        purity: body.purity || '',
        grossWeight: Number(body.grossWeight) || 0,
        netWeight: Number(body.netWeight) || Number(body.grossWeight) || 0,
        stoneWeight: Number(body.stoneWeight) || 0,
        quantity: Number(body.quantity) || 1,
        description: body.description || null,
        conditionNotes: body.conditionNotes || null,
        hallmarkDetails: body.hallmarkDetails || null,
        issueDescription: body.issueDescription || null,
      },
    });
    res.status(201).json({ item });
  } catch (err: any) {
    logger.error('repairs.addItem failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to add item' });
  }
});

// ─────────────────────────────────────────────────────────────────
// REGISTER A PHOTO (uploaded via /api/files; we just record metadata)
// ─────────────────────────────────────────────────────────────────
router.post('/:id/photos', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const job = await prisma.repairJob.findFirst({ where: repairScope(req, id) });
    if (!job) return res.status(404).json({ error: 'Repair not found' });

    const { type, storagePath, mimeType, repairItemId } = req.body;
    if (!type || !storagePath) {
      return res.status(400).json({ error: 'type and storagePath required' });
    }
    const photo = await prisma.repairPhoto.create({
      data: {
        repairJobId: id,
        repairItemId: repairItemId ? Number(repairItemId) : null,
        type,
        storagePath,
        mimeType: mimeType || 'image/jpeg',
        uploadedBy: req.userId!,
      },
    });
    res.status(201).json({ photo });
  } catch (err: any) {
    logger.error('repairs.addPhoto failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to register photo' });
  }
});

// ─────────────────────────────────────────────────────────────────
// ASSIGN KARIGER (also posts metal ledger as GOLD_RECEIVABLE)
// ─────────────────────────────────────────────────────────────────
router.post('/:id/assign-kariger', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { karigerId, expectedReturnDate, assignmentNotes, ratePerGram } = req.body;
    if (!karigerId) return res.status(400).json({ error: 'karigerId required' });

    const job = await prisma.repairJob.findFirst({
      where: repairScope(req, id),
      include: { items: true },
    });
    if (!job) return res.status(404).json({ error: 'Repair not found' });

    const kariger = await prisma.kariger.findFirst({
      where: { id: Number(karigerId), companyId: req.companyId, isActive: true },
    });
    if (!kariger) return res.status(404).json({ error: 'Kariger not found or inactive' });

    if (!['UNDER_INSPECTION', 'WAITING_CUSTOMER_APPROVAL', 'REWORK_REQUIRED'].includes(job.status)) {
      return res.status(400).json({
        error: `Cannot assign kariger from status ${job.status}`,
      });
    }

    const issuedWeight = job.items.reduce((s, it) => s + Number(it.grossWeight), 0);
    // Pick a metal type (use the first item's). Mixed-metal jobs are
    // rare; we record the dominant metal here and finer detail lives
    // in RepairItem.
    const primaryMetalTypeId = job.items[0]?.metalTypeId;
    if (!primaryMetalTypeId) return res.status(400).json({ error: 'Repair has no items' });

    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.repairKarigerAssignment.create({
        data: {
          repairJobId: id,
          karigerId: Number(karigerId),
          expectedReturnDate: expectedReturnDate ? new Date(expectedReturnDate) : null,
          issuedWeight,
          assignmentNotes: assignmentNotes || null,
          assignedBy: req.userId!,
        },
      });
      await tx.repairJob.update({
        where: { id },
        data: { assignedKarigerId: Number(karigerId), updatedBy: req.userId! },
      });
      await transition(tx, id, job.status, 'ASSIGNED_TO_KARIGER', req.userId!, 'Kariger assigned');
      await postMetalLedger({
        tx,
        karigerId: Number(karigerId),
        repairJobId: id,
        metalTypeId: primaryMetalTypeId,
        transactionType: 'GOLD_RECEIVABLE',
        weight: +issuedWeight, // shop GAVE gold to kariger
        ratePerGram: Number(ratePerGram) || 0,
        remarks: `Issued for repair ${job.repairNo}`,
        userId: req.userId!,
      });
      return assignment;
    });

    auditLog(req, 'REPAIR_KARIGER_ASSIGNED', { repairId: id, karigerId });
    res.status(201).json({ assignment: result });
  } catch (err: any) {
    if (err instanceof InvalidRepairTransitionError) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('repairs.assignKariger failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to assign kariger' });
  }
});

// ─────────────────────────────────────────────────────────────────
// RECORD KARIGER RETURN (sets returnedWeight per item + closes assignment)
// Note: weight DIFFERENCES are NOT auto-posted — they must go through
// /weight-adjustment with explicit classification.
// ─────────────────────────────────────────────────────────────────
router.post('/:id/return-from-kariger', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { itemReturns, remarks } = req.body; // [{ repairItemId, returnedWeight }]
    if (!Array.isArray(itemReturns) || itemReturns.length === 0) {
      return res.status(400).json({ error: 'itemReturns array required' });
    }

    const job = await prisma.repairJob.findFirst({
      where: repairScope(req, id),
      include: { items: true, assignments: { orderBy: { assignedAt: 'desc' }, take: 1 } },
    });
    if (!job) return res.status(404).json({ error: 'Repair not found' });

    if (job.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: `Repair must be IN_PROGRESS to record kariger return; current=${job.status}`,
      });
    }

    await prisma.$transaction(async (tx) => {
      let totalReturned = 0;
      for (const r of itemReturns) {
        const item = job.items.find(i => i.id === Number(r.repairItemId));
        if (!item) throw new Error(`repairItemId ${r.repairItemId} not in this job`);
        const w = Number(r.returnedWeight);
        if (!isFinite(w) || w < 0) throw new Error('returnedWeight must be >= 0');
        await tx.repairItem.update({
          where: { id: item.id },
          data: { returnedWeight: w },
        });
        totalReturned += w;
      }
      const assignment = job.assignments[0];
      if (assignment) {
        await tx.repairKarigerAssignment.update({
          where: { id: assignment.id },
          data: { returnedAt: new Date(), returnedWeight: totalReturned },
        });
      }
      await transition(tx, id, job.status, 'RETURNED_BY_KARIGER', req.userId!, remarks || 'Returned from kariger');
    });

    auditLog(req, 'REPAIR_KARIGER_RETURN', { repairId: id });
    res.json({ ok: true });
  } catch (err: any) {
    logger.error('repairs.returnFromKariger failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to record return' });
  }
});

// ─────────────────────────────────────────────────────────────────
// WEIGHT ADJUSTMENT (classified)
// Posts a corresponding metal-ledger row when the kariger is involved.
// ─────────────────────────────────────────────────────────────────
router.post('/:id/weight-adjustment', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const {
      repairItemId, adjustmentType, originalWeight, finalWeight,
      ratePerGram, remarks,
    } = req.body as {
      repairItemId?: number;
      adjustmentType: WeightAdjustmentType;
      originalWeight: number; finalWeight: number;
      ratePerGram?: number; remarks?: string;
    };

    if (!adjustmentType) return res.status(400).json({ error: 'adjustmentType required' });
    const orig = Number(originalWeight);
    const fin = Number(finalWeight);
    if (!isFinite(orig) || !isFinite(fin) || orig < 0 || fin < 0) {
      return res.status(400).json({ error: 'originalWeight/finalWeight must be valid numbers ≥ 0' });
    }

    const job = await prisma.repairJob.findFirst({
      where: repairScope(req, id),
      include: { items: true },
    });
    if (!job) return res.status(404).json({ error: 'Repair not found' });

    const diff = fin - orig;                // signed
    const rate = Number(ratePerGram) || 0;
    const amount = Math.abs(diff) * rate;

    const result = await prisma.$transaction(async (tx) => {
      const adj = await tx.repairWeightAdjustment.create({
        data: {
          repairJobId: id,
          repairItemId: repairItemId ? Number(repairItemId) : null,
          adjustmentType,
          originalWeight: orig,
          finalWeight: fin,
          differenceWeight: diff,
          ratePerGram: rate,
          amount,
          remarks: remarks || null,
          createdBy: req.userId!,
        },
      });

      // Optional auto-add EXTRA_GOLD charge so it shows up in the
      // invoice without a separate manual step. Threshold gates the
      // approval flag.
      if (adjustmentType === 'EXTRA_GOLD_ADDED' && amount > 0) {
        await tx.repairCharge.create({
          data: {
            repairJobId: id,
            chargeType: 'EXTRA_GOLD',
            description: `${Math.abs(diff).toFixed(3)}g extra gold @ ₹${rate}/g`,
            quantity: Math.abs(diff),
            rate,
            amount,
            gstApplicable: true,
            gstPercent: 3,
          },
        });
        if (amount >= EXTRA_GOLD_APPROVAL_THRESHOLD) {
          await tx.repairJob.update({
            where: { id },
            data: { approvalRequired: true, updatedBy: req.userId! },
          });
        }
      }

      // Post to kariger metal ledger when applicable
      const primaryMetalTypeId = job.items[0]?.metalTypeId;
      if (job.assignedKarigerId && primaryMetalTypeId) {
        if (adjustmentType === 'NORMAL_WASTAGE' || adjustmentType === 'APPROVED_REDUCTION') {
          // Wastage: write off from kariger receivable
          await postMetalLedger({
            tx,
            karigerId: job.assignedKarigerId,
            repairJobId: id,
            metalTypeId: primaryMetalTypeId,
            transactionType: 'WASTAGE',
            weight: -Math.abs(diff),
            ratePerGram: rate,
            remarks: `${adjustmentType} on ${job.repairNo}`,
            userId: req.userId!,
          });
        } else if (adjustmentType === 'RECOVERABLE_GOLD') {
          // Kariger took extra metal not accounted for — debt to shop
          await postMetalLedger({
            tx,
            karigerId: job.assignedKarigerId,
            repairJobId: id,
            metalTypeId: primaryMetalTypeId,
            transactionType: 'ADJUSTMENT',
            weight: +Math.abs(diff),
            ratePerGram: rate,
            remarks: `Recoverable gold on ${job.repairNo}`,
            userId: req.userId!,
          });
        } else if (adjustmentType === 'EXTRA_GOLD_ADDED') {
          // Shop added gold for the customer; not the kariger's debt
          // (no metal-ledger impact on the kariger). Recorded via
          // RepairCharge above for billing.
        }
      }

      return adj;
    });

    auditLog(req, 'REPAIR_WEIGHT_ADJUSTED', { repairId: id, adjustmentType, diff });
    res.status(201).json({ adjustment: result });
  } catch (err: any) {
    logger.error('repairs.weightAdjustment failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to record adjustment' });
  }
});

// ─────────────────────────────────────────────────────────────────
// CHARGES
// ─────────────────────────────────────────────────────────────────
router.post('/:id/charges', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { chargeType, description, quantity, rate, gstApplicable, gstPercent } = req.body;
    if (!chargeType) return res.status(400).json({ error: 'chargeType required' });

    const job = await prisma.repairJob.findFirst({ where: repairScope(req, id) });
    if (!job) return res.status(404).json({ error: 'Repair not found' });
    if (job.status === 'DELIVERED' || job.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Cannot add charges to a closed repair' });
    }

    const qty = Number(quantity) || 1;
    const r = Number(rate) || 0;
    const charge = await prisma.repairCharge.create({
      data: {
        repairJobId: id,
        chargeType,
        description: description || null,
        quantity: qty,
        rate: r,
        amount: qty * r,
        gstApplicable: gstApplicable !== false,
        gstPercent: gstPercent != null ? Number(gstPercent) : 3,
      },
    });
    res.status(201).json({ charge });
  } catch (err: any) {
    logger.error('repairs.addCharge failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to add charge' });
  }
});

// ─────────────────────────────────────────────────────────────────
// INVOICE — generate from current charges
// ─────────────────────────────────────────────────────────────────
router.post('/:id/invoice', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const job = await prisma.repairJob.findFirst({
      where: repairScope(req, id),
      include: { charges: true, invoice: true },
    });
    if (!job) return res.status(404).json({ error: 'Repair not found' });
    if (job.invoice) return res.status(400).json({ error: 'Invoice already exists' });
    if (job.charges.length === 0) {
      return res.status(400).json({ error: 'Add at least one charge before generating invoice' });
    }

    let subtotal = 0, cgst = 0, sgst = 0;
    for (const c of job.charges) {
      const amt = Number(c.amount);
      subtotal += amt;
      if (c.gstApplicable) {
        const gst = amt * Number(c.gstPercent) / 100;
        cgst += gst / 2;
        sgst += gst / 2;
      }
    }
    const gstAmount = cgst + sgst;
    // Subtract any advance the customer paid at intake.
    const advance = Number(job.advanceReceived) || 0;
    const totalAmount = subtotal + gstAmount;
    const dueAmount = Math.max(0, totalAmount - advance);
    const paidAmount = Math.min(totalAmount, advance);
    const paymentStatus = dueAmount === 0 ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'PENDING');

    const fy = fyOf(new Date());
    const invoice = await prisma.$transaction(async (tx) => {
      const num = await allocateRepairNumber(tx, req.companyId!, 'REPI', 'REPAIR_INVOICE', fy);
      return tx.repairInvoice.create({
        data: {
          repairJobId: id,
          invoiceNo: `REPI/${num}`,
          invoicePrefix: 'REPI',
          invoiceNumber: num,
          subtotal,
          cgstAmount: Number(cgst.toFixed(2)),
          sgstAmount: Number(sgst.toFixed(2)),
          igstAmount: 0,
          gstAmount: Number(gstAmount.toFixed(2)),
          totalAmount: Number(totalAmount.toFixed(2)),
          paidAmount: Number(paidAmount.toFixed(2)),
          dueAmount: Number(dueAmount.toFixed(2)),
          paymentStatus,
        },
      });
    });

    auditLog(req, 'REPAIR_INVOICE_GENERATED', { repairId: id, invoiceNo: invoice.invoiceNo });
    res.status(201).json({ invoice });
  } catch (err: any) {
    logger.error('repairs.invoice failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to generate invoice' });
  }
});

// ─────────────────────────────────────────────────────────────────
// INVOICE PAYMENT
// ─────────────────────────────────────────────────────────────────
router.post('/:id/invoice/payment', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { cash = 0, bank = 0, card = 0, upi = 0 } = req.body;
    const total = Number(cash) + Number(bank) + Number(card) + Number(upi);
    if (total <= 0) return res.status(400).json({ error: 'amount must be > 0' });

    const invoice = await prisma.repairInvoice.findFirst({
      where: { repairJob: repairScope(req, id) },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const newPaid = Number(invoice.paidAmount) + total;
    const newDue = Math.max(0, Number(invoice.totalAmount) - newPaid);
    if (newPaid > Number(invoice.totalAmount) + 0.01) {
      return res.status(400).json({ error: 'Payment exceeds invoice total' });
    }
    const updated = await prisma.repairInvoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount: newPaid,
        dueAmount: newDue,
        cashAmount: { increment: Number(cash) },
        bankAmount: { increment: Number(bank) },
        cardAmount: { increment: Number(card) },
        upiAmount: { increment: Number(upi) },
        paymentStatus: newDue === 0 ? 'PAID' : 'PARTIAL',
      },
    });
    auditLog(req, 'REPAIR_PAYMENT_RECEIVED', { repairId: id, amount: total });
    res.json({ invoice: updated });
  } catch (err: any) {
    logger.error('repairs.payment failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to record payment' });
  }
});

// ─────────────────────────────────────────────────────────────────
// MANAGER APPROVAL OVERRIDE (extra-gold threshold or delivery override)
// ─────────────────────────────────────────────────────────────────
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (req.userRole !== 'ADMIN' && req.userRole !== 'MANAGER') {
      return res.status(403).json({ error: 'Only manager/admin can approve' });
    }
    // Tenant guard: confirm the repair belongs to the caller's company/branch
    // BEFORE doing the update — `prisma.update` by raw id has no scope.
    const existing = await prisma.repairJob.findFirst({ where: repairScope(req, id), select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'Repair not found' });
    const { remarks } = req.body;
    const job = await prisma.repairJob.update({
      where: { id },
      data: {
        approvedAt: new Date(),
        approvedBy: req.userId!,
        approvalRemarks: remarks || null,
        updatedBy: req.userId!,
      },
    });
    auditLog(req, 'REPAIR_APPROVED', { repairId: id });
    res.json({ repair: job });
  } catch (err: any) {
    logger.error('repairs.approve failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to approve' });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELIVER (final). Gates on invoice settlement unless manager overrides.
// ─────────────────────────────────────────────────────────────────
router.post('/:id/deliver', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { receivedBy, signature, override } = req.body;

    const job = await prisma.repairJob.findFirst({
      where: repairScope(req, id),
      include: { invoice: true },
    });
    if (!job) return res.status(404).json({ error: 'Repair not found' });

    if (job.status !== 'READY_FOR_DELIVERY') {
      return res.status(400).json({ error: `Repair must be READY_FOR_DELIVERY; current=${job.status}` });
    }

    const dueAmount = Number(job.invoice?.dueAmount ?? 0);
    if (dueAmount > 0) {
      if (!override) {
        return res.status(400).json({ error: `Invoice has dueAmount ₹${dueAmount}. Settle or pass override=true` });
      }
      if (req.userRole !== 'ADMIN' && req.userRole !== 'MANAGER') {
        return res.status(403).json({ error: 'Only manager/admin can override unpaid delivery' });
      }
    }

    if (!receivedBy?.trim()) {
      return res.status(400).json({ error: 'receivedBy (collector name) required' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.repairJob.update({
        where: { id },
        data: {
          deliveredDate: new Date(),
          receivedBy: receivedBy.trim(),
          deliverySignature: signature || null,
          deliveredBy: req.userId!,
          updatedBy: req.userId!,
        },
      });
      await transition(tx, id, job.status, 'DELIVERED', req.userId!, override ? 'Delivered with override' : 'Delivered');
    });

    auditLog(req, 'REPAIR_DELIVERED', { repairId: id, receivedBy, override: !!override });
    notifier.send({
      event: 'DELIVERED',
      repairNo: job.repairNo,
      customerName: job.customerName,
      customerMobile: job.customerMobile,
    }).catch(() => undefined);

    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof InvalidRepairTransitionError) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('repairs.deliver failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to deliver' });
  }
});

// Suppress unused-import diagnostic when DEFAULT_CGST/SGST aren't yet
// referenced (kept for upcoming inter-state IGST split).
void DEFAULT_CGST; void DEFAULT_SGST;

export default router;
