/**
 * Stock Request Routes
 * ─────────────────────
 * Allows branches to browse other branches' stock (read-only)
 * and request items. Source branch approves/rejects.
 * On approval, stock is atomically transferred.
 *
 *   GET    /api/stock-requests/browse       — View another branch's IN_STOCK labels
 *   GET    /api/stock-requests              — List requests (incoming + outgoing)
 *   GET    /api/stock-requests/:id          — Single request detail
 *   POST   /api/stock-requests              — Create a stock request
 *   PUT    /api/stock-requests/:id/approve  — Approve & transfer stock
 *   PUT    /api/stock-requests/:id/reject   — Reject request
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/branchAccess';

const router = Router();
router.use(authenticate);

// ── GET /branches — List all same-company branches (no scope filter) ─────────
router.get('/branches', async (req: Request, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { companyId: req.companyId, isActive: true, isDeleted: false },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    res.json({ branches });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list branches' });
  }
});

// ── GET /browse?branchId=X — View another branch's IN_STOCK labels ───────────
router.get('/browse', async (req: Request, res: Response) => {
  try {
    const targetBranchId = Number(req.query.branchId);
    if (!targetBranchId) {
      return res.status(400).json({ error: 'branchId query parameter is required' });
    }

    // Verify the target branch belongs to the same company
    const branch = await prisma.branch.findFirst({
      where: { id: targetBranchId, companyId: req.companyId, isActive: true, isDeleted: false },
    });
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const { groupName, search, page = '1', limit = '50' } = req.query;

    const where: any = {
      branchId: targetBranchId,
      status: 'IN_STOCK',
      branch: { companyId: req.companyId },
    };

    if (groupName && groupName !== 'ALL') {
      where.item = { itemGroup: { name: groupName as string } };
    }
    if (search) {
      where.OR = [
        { labelNo: { contains: search as string, mode: 'insensitive' } },
        { item: { name: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    const [labels, total] = await Promise.all([
      prisma.label.findMany({
        where,
        include: {
          item: { include: { itemGroup: true, purity: true, metalType: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
        orderBy: { labelNo: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.label.count({ where }),
    ]);

    // Mark labels that already have a PENDING request from this branch
    const labelIdsInPage = labels.map((l: any) => l.id);
    const pendingItems = labelIdsInPage.length > 0
      ? await prisma.stockRequestItem.findMany({
          where: {
            labelId: { in: labelIdsInPage },
            stockRequest: {
              requestingBranchId: req.branchId!,
              sourceBranchId: targetBranchId,
              status: 'PENDING',
            },
          },
          select: { labelId: true },
        })
      : [];
    const pendingLabelIds = new Set(pendingItems.map(i => i.labelId));

    const labelsWithPending = labels.map((l: any) => ({
      ...l,
      hasPendingRequest: pendingLabelIds.has(l.id),
    }));

    res.json({ labels: labelsWithPending, total, branch: { id: branch.id, name: branch.name, code: branch.code } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to browse stock' });
  }
});

// ── GET / — List stock requests (incoming + outgoing for user's branch) ──────
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, direction, page = '1', limit = '50' } = req.query;

    const where: any = { companyId: req.companyId };

    if (direction === 'outgoing') {
      where.requestingBranchId = req.branchId;
    } else if (direction === 'incoming') {
      where.sourceBranchId = req.branchId;
    } else {
      // Show both
      where.OR = [
        { requestingBranchId: req.branchId },
        { sourceBranchId: req.branchId },
      ];
    }

    if (status) where.status = status;

    const [requests, total] = await Promise.all([
      prisma.stockRequest.findMany({
        where,
        include: {
          requestingBranch: { select: { id: true, name: true, code: true } },
          sourceBranch: { select: { id: true, name: true, code: true } },
          items: { include: { label: { select: { status: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.stockRequest.count({ where }),
    ]);

    res.json({ requests, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stock requests' });
  }
});

// ── GET /pending-count — Quick badge count for the sidebar ───────────────────
// Returns the number of PENDING requests addressed to the caller's branch
// (i.e. requests this branch needs to approve / reject), plus their own
// outstanding outgoing requests. Cheap by design: two count() calls only.
// MUST be declared before `/:id` so it isn't swallowed by the dynamic route.
router.get('/pending-count', async (req: Request, res: Response) => {
  try {
    const baseWhere: any = { companyId: req.companyId, status: 'PENDING' };
    const [incoming, outgoing] = await Promise.all([
      prisma.stockRequest.count({
        where: { ...baseWhere, sourceBranchId: req.branchId },
      }),
      prisma.stockRequest.count({
        where: { ...baseWhere, requestingBranchId: req.branchId },
      }),
    ]);
    res.json({ incoming, outgoing });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending count' });
  }
});

// ── GET /:id — Single request detail ─────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const request = await prisma.stockRequest.findUnique({
      where: { id },
      include: {
        requestingBranch: { select: { id: true, name: true, code: true } },
        sourceBranch: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            label: {
              include: {
                item: { include: { itemGroup: true, purity: true, metalType: true } },
              },
            },
          },
        },
      },
    });

    if (!request || request.companyId !== req.companyId) {
      return res.status(404).json({ error: 'Stock request not found' });
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stock request' });
  }
});

// ── POST / — Create a stock request ──────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sourceBranchId, items, narration } = req.body;

    if (!sourceBranchId || !items || items.length === 0) {
      return res.status(400).json({ error: 'sourceBranchId and items are required' });
    }
    if (sourceBranchId === req.branchId) {
      return res.status(400).json({ error: 'Cannot request stock from your own branch' });
    }

    // Verify source branch
    const sourceBranch = await prisma.branch.findFirst({
      where: { id: sourceBranchId, companyId: req.companyId, isActive: true, isDeleted: false },
    });
    if (!sourceBranch) {
      return res.status(404).json({ error: 'Source branch not found' });
    }

    // Validate all labels exist and are IN_STOCK at the source branch
    const labelIds = items.map((i: any) => i.labelId);
    const labels = await prisma.label.findMany({
      where: { id: { in: labelIds } },
      include: { item: { include: { itemGroup: true, purity: true } } },
    });

    for (const item of items) {
      const label = labels.find((l: any) => l.id === item.labelId);
      if (!label) {
        return res.status(400).json({ error: `Label ID ${item.labelId} not found` });
      }
      if (label.branchId !== sourceBranchId) {
        return res.status(400).json({ error: `Label ${label.labelNo} does not belong to the source branch` });
      }
      if (label.status !== 'IN_STOCK') {
        return res.status(400).json({ error: `Label ${label.labelNo} is not available (status: ${label.status})` });
      }
    }

    // Check for duplicate PENDING requests for the same labels
    const existingItems = await prisma.stockRequestItem.findMany({
      where: {
        labelId: { in: labelIds },
        stockRequest: {
          requestingBranchId: req.branchId!,
          sourceBranchId,
          status: 'PENDING',
        },
      },
      select: { labelId: true, labelNo: true },
    });
    if (existingItems.length > 0) {
      const dupeLabels = existingItems.map(i => i.labelNo).join(', ');
      return res.status(409).json({
        error: `Pending request already exists for: ${dupeLabels}`,
      });
    }

    // Generate request number
    const count = await prisma.stockRequest.count({ where: { companyId: req.companyId } });
    const requestNo = `SR/${count + 1}`;

    const totalPcs = labels.length;
    const totalGrossWeight = labels.reduce((sum: number, l: any) => sum + Number(l.grossWeight), 0);

    const request = await prisma.stockRequest.create({
      data: {
        requestNo,
        requestingBranchId: req.branchId!,
        sourceBranchId,
        companyId: req.companyId!,
        requestedById: req.userId!,
        narration: narration || null,
        totalPcs,
        totalGrossWeight,
        items: {
          create: labels.map((label: any) => ({
            labelId: label.id,
            labelNo: label.labelNo,
            itemName: label.item?.name || 'Unknown',
            grossWeight: label.grossWeight,
            netWeight: label.netWeight,
            pcs: label.pcsCount || 1,
            purityName: label.item?.purity?.name || null,
          })),
        },
      },
      include: {
        requestingBranch: { select: { id: true, name: true, code: true } },
        sourceBranch: { select: { id: true, name: true, code: true } },
        items: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.userId!,
        branchId: req.branchId!,
        companyId: req.companyId!,
        action: 'CREATE',
        entityType: 'StockRequest',
        entityId: request.id,
        newData: { requestNo, from: sourceBranch.name, items: totalPcs } as any,
      },
    });

    res.status(201).json(request);
  } catch (error) {
    console.error('Error creating stock request:', error);
    res.status(500).json({ error: 'Failed to create stock request' });
  }
});

// ── PUT /:id/approve — Approve & atomically transfer stock ───────────────────
router.put('/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const request = await prisma.stockRequest.findUnique({
      where: { id },
      include: { items: true, sourceBranch: true, requestingBranch: true },
    });

    if (!request || request.companyId !== req.companyId) {
      return res.status(404).json({ error: 'Stock request not found' });
    }
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }
    // Only the source branch can approve
    if (request.sourceBranchId !== req.branchId && !req.isMasterBranch) {
      return res.status(403).json({ error: 'Only the source branch can approve this request' });
    }

    // Atomic: approve request + transfer labels
    await prisma.$transaction(async (tx) => {
      // Re-validate all labels are still IN_STOCK at source
      for (const item of request.items) {
        const label = await tx.label.findUnique({ where: { id: item.labelId } });
        if (!label || label.status !== 'IN_STOCK' || label.branchId !== request.sourceBranchId) {
          throw new Error(`Label ${item.labelNo} is no longer available for transfer`);
        }
      }

      // Move each label to the requesting branch
      for (const item of request.items) {
        await tx.label.update({
          where: { id: item.labelId },
          data: { branchId: request.requestingBranchId, status: 'IN_STOCK' },
        });
      }

      // Mark request as approved
      await tx.stockRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: req.userId,
          approvedAt: new Date(),
        },
      });
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.userId!,
        branchId: req.branchId!,
        companyId: req.companyId!,
        action: 'APPROVE',
        entityType: 'StockRequest',
        entityId: id,
        newData: {
          requestNo: request.requestNo,
          itemCount: request.items.length,
          from: request.sourceBranch.name,
          to: request.requestingBranch.name,
        } as any,
      },
    });

    const updated = await prisma.stockRequest.findUnique({
      where: { id },
      include: {
        requestingBranch: { select: { id: true, name: true, code: true } },
        sourceBranch: { select: { id: true, name: true, code: true } },
        items: true,
      },
    });

    res.json(updated);
  } catch (error: any) {
    if (error.message?.includes('no longer available')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error approving stock request:', error);
    res.status(500).json({ error: 'Failed to approve stock request' });
  }
});

// ── PUT /:id/reject — Reject a stock request ────────────────────────────────
router.put('/:id/reject', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body;

    const request = await prisma.stockRequest.findUnique({ where: { id } });
    if (!request || request.companyId !== req.companyId) {
      return res.status(404).json({ error: 'Stock request not found' });
    }
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }
    if (request.sourceBranchId !== req.branchId && !req.isMasterBranch) {
      return res.status(403).json({ error: 'Only the source branch can reject this request' });
    }

    const updated = await prisma.stockRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedById: req.userId,
        rejectedAt: new Date(),
        rejectionReason: reason || null,
      },
      include: {
        requestingBranch: { select: { id: true, name: true, code: true } },
        sourceBranch: { select: { id: true, name: true, code: true } },
        items: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.userId!,
        branchId: req.branchId!,
        companyId: req.companyId!,
        action: 'REJECT',
        entityType: 'StockRequest',
        entityId: id,
        newData: { requestNo: request.requestNo, reason } as any,
      },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject stock request' });
  }
});

export default router;
