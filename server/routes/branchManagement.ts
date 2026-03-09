/**
 * Branch Management Routes
 * ────────────────────────────
 * Full branch CRUD, hierarchy management, and inventory transfers.
 *
 * Endpoints:
 *   GET    /api/branches                  — List branches (scoped)
 *   GET    /api/branches/:id              — Get branch details
 *   GET    /api/branches/:id/children     — List child branches (master only)
 *   GET    /api/branches/:id/stats        — Branch statistics
 *   POST   /api/branches                  — Create a new branch (master only)
 *   PUT    /api/branches/:id              — Update branch details
 *   PUT    /api/branches/:id/disable      — Disable a branch (master only)
 *   PUT    /api/branches/:id/enable       — Enable a branch (master only)
 *   DELETE /api/branches/:id              — Soft-delete a branch (master only, with validation)
 *   DELETE /api/branches/:id/permanent    — Permanently delete (master only, empty branch only)
 *
 *   POST   /api/branches/transfer         — Atomic inventory transfer B1→B2
 *   GET    /api/branches/transfer/history  — Transfer history
 *
 *   GET    /api/branches/audit-log        — Audit log for branch operations
 */

import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

const router = Router();

// ================================================================
// GET /api/branches — List branches (respects scope)
// ================================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { companyId, includeDeleted, search } = req.query;

    const where: any = {};
    if (!includeDeleted) where.isDeleted = false;
    if (companyId) where.companyId = Number(companyId);
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
        { city: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    // If branchScope is provided via middleware, filter branches
    if (req.branchScope && req.branchScope.length > 0) {
      where.id = { in: req.branchScope };
    }

    const branches = await prisma.branch.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            children: true,
            users: true,
            labels: true,
            salesVouchers: true,
          },
        },
      },
      orderBy: [{ isMaster: 'desc' }, { name: 'asc' }],
    });

    res.json({ branches, total: branches.length });
  } catch (error) {
    console.error('Error listing branches:', error);
    res.status(500).json({ error: 'Failed to list branches' });
  }
});

// ================================================================
// GET /api/branches/audit-log — Audit log for branch operations
// (Must be defined BEFORE /:id to avoid route parameter capture)
// ================================================================
router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const { branchId, entityType, action, dateFrom, dateTo, limit: limitParam, page } = req.query;

    const where: any = {};
    if (branchId) where.branchId = Number(branchId);
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) {
        const end = new Date(dateTo as string);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const limit = Number(limitParam) || 50;
    const skip = ((Number(page) || 1) - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ logs, total, page: Number(page) || 1, limit });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ================================================================
// GET /api/branches/:id — Get branch details
// ================================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        company: true,
        parent: { select: { id: true, name: true, code: true } },
        children: {
          where: { isDeleted: false },
          select: { id: true, name: true, code: true, isActive: true, city: true, branchType: true },
        },
        _count: {
          select: {
            users: true,
            labels: true,
            salesVouchers: true,
            purchaseVouchers: true,
            cashEntries: true,
            counters: true,
            staff: true,
          },
        },
      },
    });

    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    // Check scope access
    if (req.branchScope && req.branchScope.length > 0 && !req.branchScope.includes(id)) {
      return res.status(403).json({ error: 'Access denied to this branch' });
    }

    res.json(branch);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch branch' });
  }
});

// ================================================================
// GET /api/branches/:id/children — List child branches (master only)
// ================================================================
router.get('/:id/children', async (req: Request, res: Response) => {
  try {
    const parentId = Number(req.params.id);
    const { includeDisabled } = req.query;

    const where: any = { parentId, isDeleted: false };
    if (!includeDisabled) where.isActive = true;

    const children = await prisma.branch.findMany({
      where,
      include: {
        _count: { select: { users: true, labels: true, salesVouchers: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ children, total: children.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch child branches' });
  }
});

// ================================================================
// GET /api/branches/:id/stats — Branch statistics
// ================================================================
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const branchId = Number(req.params.id);

    const [
      labelsCount,
      inStockCount,
      soldCount,
      salesCount,
      purchaseCount,
      usersCount,
      transfersOut,
      transfersIn,
    ] = await Promise.all([
      prisma.label.count({ where: { branchId } }),
      prisma.label.count({ where: { branchId, status: 'IN_STOCK' } }),
      prisma.label.count({ where: { branchId, status: 'SOLD' } }),
      prisma.salesVoucher.count({ where: { branchId, status: 'ACTIVE' } }),
      prisma.purchaseVoucher.count({ where: { branchId, status: 'ACTIVE' } }),
      prisma.user.count({ where: { branchId, isActive: true } }),
      prisma.branchTransfer.count({ where: { issuingBranchId: branchId, status: 'ACTIVE' } }),
      prisma.branchTransfer.count({ where: { receivingBranchId: branchId, status: 'ACTIVE' } }),
    ]);

    res.json({
      branchId,
      inventory: { total: labelsCount, inStock: inStockCount, sold: soldCount },
      sales: salesCount,
      purchases: purchaseCount,
      users: usersCount,
      transfers: { outgoing: transfersOut, incoming: transfersIn },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch branch stats' });
  }
});

// ================================================================
// POST /api/branches — Create a new branch (master only)
// ================================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    // Validate required fields
    if (!data.name || !data.code || !data.companyId) {
      return res.status(400).json({ error: 'name, code, and companyId are required' });
    }

    // Check for duplicate code
    const existing = await prisma.branch.findUnique({ where: { code: data.code } });
    if (existing) {
      return res.status(409).json({ error: `Branch code '${data.code}' already exists` });
    }

    // Determine if this is a master branch (first branch for company, or explicitly set)
    const companyBranches = await prisma.branch.count({
      where: { companyId: data.companyId, isDeleted: false },
    });

    const isMaster = companyBranches === 0 || data.isMaster === true;

    // If creating a child branch, parentId must be a valid master branch
    let parentId = data.parentId || null;
    if (!isMaster) {
      if (!parentId) {
        // Auto-assign to the master branch of the company
        const masterBranch = await prisma.branch.findFirst({
          where: { companyId: data.companyId, isMaster: true, isDeleted: false },
        });
        if (masterBranch) parentId = masterBranch.id;
      } else {
        const parent = await prisma.branch.findUnique({ where: { id: parentId } });
        if (!parent || !parent.isMaster) {
          return res.status(400).json({ error: 'parentId must refer to a master branch' });
        }
      }
    }

    const branch = await prisma.branch.create({
      data: {
        name: data.name,
        code: data.code,
        companyId: data.companyId,
        branchType: isMaster ? 'MASTER' : 'BRANCH',
        isMaster,
        parentId: isMaster ? null : parentId,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        phone: data.phone,
        email: data.email,
        gstin: data.gstin,
      },
      include: {
        company: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, code: true } },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.userId || 0,
        branchId: branch.id,
        action: 'CREATE',
        entityType: 'Branch',
        entityId: branch.id,
        newData: branch as any,
      },
    });

    res.status(201).json(branch);
  } catch (error: any) {
    console.error('Error creating branch:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Branch code already exists' });
    }
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

// ================================================================
// PUT /api/branches/:id — Update branch details
// ================================================================
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const data = req.body;

    const existing = await prisma.branch.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Branch not found' });

    // Block editing master-critical fields if not from master/admin
    if (req.branchScope && req.branchScope.length > 0 && !req.branchScope.includes(id)) {
      return res.status(403).json({ error: 'Access denied to this branch' });
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        name: data.name,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        phone: data.phone,
        email: data.email,
        gstin: data.gstin,
      },
      include: {
        company: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, code: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.userId || 0,
        branchId: id,
        action: 'UPDATE',
        entityType: 'Branch',
        entityId: id,
        oldData: existing as any,
        newData: branch as any,
      },
    });

    res.json(branch);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update branch' });
  }
});

// ================================================================
// PUT /api/branches/:id/disable — Disable a branch (master only)
// ================================================================
router.put('/:id/disable', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    if (branch.isMaster) {
      return res.status(400).json({ error: 'Cannot disable the master branch' });
    }

    if (!branch.isActive) {
      return res.status(400).json({ error: 'Branch is already disabled' });
    }

    const updated = await prisma.branch.update({
      where: { id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.userId || 0,
        branchId: id,
        action: 'DISABLE',
        entityType: 'Branch',
        entityId: id,
        oldData: { isActive: true } as any,
        newData: { isActive: false } as any,
      },
    });

    res.json({ message: 'Branch disabled', branch: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disable branch' });
  }
});

// ================================================================
// PUT /api/branches/:id/enable — Enable a branch (master only)
// ================================================================
router.put('/:id/enable', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    if (branch.isActive) {
      return res.status(400).json({ error: 'Branch is already active' });
    }

    const updated = await prisma.branch.update({
      where: { id },
      data: { isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.userId || 0,
        branchId: id,
        action: 'UPDATE',
        entityType: 'Branch',
        entityId: id,
        oldData: { isActive: false } as any,
        newData: { isActive: true } as any,
      },
    });

    res.json({ message: 'Branch enabled', branch: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to enable branch' });
  }
});

// ================================================================
// DELETE /api/branches/:id — Soft-delete a branch (master only)
// ================================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            labels: { where: { status: 'IN_STOCK' } },
            salesVouchers: { where: { status: 'ACTIVE' } },
            users: { where: { isActive: true } },
          },
        },
      },
    });

    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    if (branch.isMaster) {
      return res.status(400).json({ error: 'Cannot delete the master branch' });
    }
    if (branch.isDeleted) {
      return res.status(400).json({ error: 'Branch is already deleted' });
    }

    // Data integrity checks
    const issues: string[] = [];
    if (branch._count.labels > 0) {
      issues.push(`${branch._count.labels} in-stock inventory items must be transferred first`);
    }
    if (branch._count.salesVouchers > 0) {
      issues.push(`${branch._count.salesVouchers} active sales vouchers exist`);
    }
    if (branch._count.users > 0) {
      issues.push(`${branch._count.users} active users are assigned to this branch`);
    }

    if (issues.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete branch with active data',
        issues,
        suggestion: 'Transfer inventory and reassign users before deleting',
      });
    }

    // Safe to soft-delete
    const updated = await prisma.branch.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
        deletedBy: req.userId || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.userId || 0,
        branchId: id,
        action: 'DELETE',
        entityType: 'Branch',
        entityId: id,
        oldData: branch as any,
        newData: { isDeleted: true, deletedAt: updated.deletedAt } as any,
      },
    });

    res.json({ message: 'Branch soft-deleted', branch: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete branch' });
  }
});

// ================================================================
// DELETE /api/branches/:id/permanent — Permanently remove branch
// ================================================================
router.delete('/:id/permanent', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            labels: true,
            salesVouchers: true,
            purchaseVouchers: true,
            cashEntries: true,
            users: true,
            counters: true,
          },
        },
      },
    });

    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    if (branch.isMaster) {
      return res.status(400).json({ error: 'Cannot permanently delete the master branch' });
    }

    // Only allow permanent delete if branch has ZERO data
    const totalData = Object.values(branch._count).reduce((sum: number, c: number) => sum + c, 0);
    if (totalData > 0) {
      return res.status(400).json({
        error: 'Cannot permanently delete branch with existing data',
        dataCounts: branch._count,
        suggestion: 'Use soft-delete instead, or migrate all data first',
      });
    }

    await prisma.branch.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: req.userId || 0,
        action: 'DELETE',
        entityType: 'Branch',
        entityId: id,
        oldData: branch as any,
        newData: { permanentlyDeleted: true } as any,
      },
    });

    res.json({ message: 'Branch permanently deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to permanently delete branch' });
  }
});

// ================================================================
// POST /api/branches/transfer — Atomic inventory transfer B1→B2
// ================================================================
router.post('/transfer', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    // Validate required fields
    if (!data.fromBranchId || !data.toBranchId) {
      return res.status(400).json({ error: 'fromBranchId and toBranchId are required' });
    }
    if (data.fromBranchId === data.toBranchId) {
      return res.status(400).json({ error: 'Cannot transfer to the same branch' });
    }
    if (!data.items || data.items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required for transfer' });
    }

    // Validate both branches exist and are active
    const [fromBranch, toBranch] = await Promise.all([
      prisma.branch.findUnique({ where: { id: data.fromBranchId }, select: { id: true, name: true, isActive: true, isDeleted: true } }),
      prisma.branch.findUnique({ where: { id: data.toBranchId }, select: { id: true, name: true, isActive: true, isDeleted: true } }),
    ]);

    if (!fromBranch || fromBranch.isDeleted) {
      return res.status(404).json({ error: 'Source branch not found' });
    }
    if (!toBranch || toBranch.isDeleted) {
      return res.status(404).json({ error: 'Destination branch not found' });
    }
    if (!fromBranch.isActive) {
      return res.status(400).json({ error: 'Source branch is disabled' });
    }
    if (!toBranch.isActive) {
      return res.status(400).json({ error: 'Destination branch is disabled' });
    }

    // Generate voucher number
    const sequence = await prisma.voucherSequence.upsert({
      where: {
        prefix_entityType_financialYear: {
          prefix: 'BT',
          entityType: 'BRANCH_TRANSFER',
          financialYear: data.financialYear || '2025-2026',
        },
      },
      update: { lastNumber: { increment: 1 } },
      create: { prefix: 'BT', entityType: 'BRANCH_TRANSFER', financialYear: data.financialYear || '2025-2026', lastNumber: 1 },
    });
    const voucherNo = `BT/${sequence.lastNumber}`;

    // === ATOMIC TRANSACTION ===
    const result = await prisma.$transaction(async (tx) => {
      // Validate all labels exist and belong to source branch
      const labelIds = data.items.map((i: any) => i.labelId).filter(Boolean);

      if (labelIds.length > 0) {
        const labels = await tx.label.findMany({
          where: { id: { in: labelIds } },
          select: { id: true, branchId: true, status: true, labelNo: true },
        });

        // Validate each label
        for (const labelId of labelIds) {
          const label = labels.find(l => l.id === labelId);
          if (!label) {
            throw new Error(`Label ID ${labelId} not found`);
          }
          if (label.branchId !== data.fromBranchId) {
            throw new Error(`Label ${label.labelNo} does not belong to source branch`);
          }
          if (label.status !== 'IN_STOCK') {
            throw new Error(`Label ${label.labelNo} is not in-stock (status: ${label.status})`);
          }
        }
      }

      // Create the BranchTransfer (ISSUE) record
      const transfer = await tx.branchTransfer.create({
        data: {
          voucherNo,
          voucherPrefix: 'BT',
          voucherNumber: sequence.lastNumber,
          voucherDate: new Date(data.voucherDate || new Date()),
          transferType: 'ISSUE',
          issuingBranchId: data.fromBranchId,
          receivingBranchId: data.toBranchId,
          totalGrossWeight: data.totalGrossWeight || 0,
          totalNetWeight: data.totalNetWeight || 0,
          totalPcs: data.items.length,
          totalAmount: data.totalAmount || 0,
          narration: data.narration || `Transfer from ${fromBranch.name} to ${toBranch.name}`,
        },
      });

      // Create transfer items and atomically update label branches
      for (const item of data.items) {
        await tx.branchTransferItem.create({
          data: {
            branchTransferId: transfer.id,
            labelId: item.labelId || null,
            itemName: item.itemName,
            grossWeight: item.grossWeight || 0,
            netWeight: item.netWeight || 0,
            pcs: item.pcs || 1,
            purityName: item.purityName,
            otherCharge: item.otherCharge || 0,
            labourRate: item.labourRate || 0,
            labourAmount: item.labourAmount || 0,
            metalAmount: item.metalAmount || 0,
            totalAmount: item.totalAmount || 0,
          },
        });

        // Atomically move label from B1 → B2
        if (item.labelId) {
          await tx.label.update({
            where: { id: item.labelId },
            data: {
              branchId: data.toBranchId,
              status: 'TRANSFERRED',
            },
          });
        }
      }

      return transfer;
    });

    // Audit log (outside transaction)
    await prisma.auditLog.create({
      data: {
        userId: req.userId || 0,
        branchId: data.fromBranchId,
        action: 'TRANSFER',
        entityType: 'BranchTransfer',
        entityId: result.id,
        newData: {
          voucherNo,
          from: fromBranch.name,
          to: toBranch.name,
          itemCount: data.items.length,
        } as any,
      },
    });

    // Fetch complete record
    const fullTransfer = await prisma.branchTransfer.findUnique({
      where: { id: result.id },
      include: {
        issuingBranch: { select: { id: true, name: true, code: true } },
        receivingBranch: { select: { id: true, name: true, code: true } },
        items: true,
      },
    });

    res.status(201).json(fullTransfer);
  } catch (error: any) {
    console.error('Error in branch transfer:', error);
    if (error.message?.includes('not found') || error.message?.includes('not in-stock') || error.message?.includes('does not belong')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create branch transfer' });
  }
});

// ================================================================
// GET /api/branches/transfer/history — Transfer history
// ================================================================
router.get('/transfer/history', async (req: Request, res: Response) => {
  try {
    const { branchId, dateFrom, dateTo, page, limit: limitParam } = req.query;

    const where: any = { status: 'ACTIVE' };

    if (branchId) {
      where.OR = [
        { issuingBranchId: Number(branchId) },
        { receivingBranchId: Number(branchId) },
      ];
    }

    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom as string);
      if (dateTo) {
        const end = new Date(dateTo as string);
        end.setHours(23, 59, 59, 999);
        where.voucherDate.lte = end;
      }
    }

    const limit = Number(limitParam) || 50;
    const skip = ((Number(page) || 1) - 1) * limit;

    const [transfers, total] = await Promise.all([
      prisma.branchTransfer.findMany({
        where,
        include: {
          issuingBranch: { select: { id: true, name: true, code: true } },
          receivingBranch: { select: { id: true, name: true, code: true } },
          items: { select: { itemName: true, grossWeight: true, pcs: true, totalAmount: true } },
        },
        orderBy: { voucherDate: 'desc' },
        take: limit,
        skip,
      }),
      prisma.branchTransfer.count({ where }),
    ]);

    res.json({ transfers, total, page: Number(page) || 1, limit });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transfer history' });
  }
});

export default router;
