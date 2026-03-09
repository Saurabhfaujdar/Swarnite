import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

// ============================================================
// BRANCH TRANSFERS (Issue & Receipt)
// ============================================================

// GET /api/branch/transfers - List branch transfers
router.get('/transfers', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, type, branchId } = req.query;
    const where: any = { status: 'ACTIVE' };

    if (dateFrom && dateTo) {
      where.voucherDate = {
        gte: new Date(dateFrom as string),
        lte: new Date(dateTo as string),
      };
    }
    if (type) where.transferType = type;
    if (branchId) {
      where.OR = [
        { issuingBranchId: Number(branchId) },
        { receivingBranchId: Number(branchId) },
      ];
    }

    const transfers = await prisma.branchTransfer.findMany({
      where,
      include: {
        issuingBranch: { select: { name: true, code: true } },
        receivingBranch: { select: { name: true, code: true } },
        items: true,
      },
      orderBy: { voucherDate: 'desc' },
    });

    const totalAmount = transfers.reduce((sum, t) => sum + Number(t.totalAmount), 0);

    res.json({ transfers, totalAmount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

// GET /api/branch/transfers/:id
router.get('/transfers/:id', async (req: Request, res: Response) => {
  try {
    const transfer = await prisma.branchTransfer.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        issuingBranch: true,
        receivingBranch: true,
        items: { include: { label: true } },
      },
    });
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    res.json(transfer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transfer' });
  }
});

// POST /api/branch/issue - Branch Issue
router.post('/issue', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    const sequence = await prisma.voucherSequence.upsert({
      where: {
        prefix_entityType_financialYear: {
          prefix: 'GBI',
          entityType: 'BRANCH_ISSUE',
          financialYear: data.financialYear || '2025-2026',
        },
      },
      update: { lastNumber: { increment: 1 } },
      create: { prefix: 'GBI', entityType: 'BRANCH_ISSUE', financialYear: data.financialYear || '2025-2026', lastNumber: 1 },
    });

    const voucherNo = `GBI/${sequence.lastNumber}`;

    const transfer = await prisma.$transaction(async (tx) => {
      const branchTransfer = await tx.branchTransfer.create({
        data: {
          voucherNo,
          voucherPrefix: 'GBI',
          voucherNumber: sequence.lastNumber,
          voucherDate: new Date(data.voucherDate),
          transferType: 'ISSUE',
          issuingBranchId: data.issuingBranchId,
          receivingBranchId: data.receivingBranchId,
          totalGrossWeight: data.totalGrossWeight || 0,
          totalNetWeight: data.totalNetWeight || 0,
          totalPcs: data.totalPcs || 0,
          totalAmount: data.totalAmount || 0,
          billNo: data.billNo,
          narration: data.narration,
        },
      });

      // Create transfer items and update label locations
      for (const item of data.items || []) {
        await tx.branchTransferItem.create({
          data: {
            branchTransferId: branchTransfer.id,
            labelId: item.labelId,
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

        // Update label branch
        if (item.labelId) {
          await tx.label.update({
            where: { id: item.labelId },
            data: {
              branchId: data.receivingBranchId,
              status: 'TRANSFERRED',
            },
          });
        }
      }

      return branchTransfer;
    });

    res.status(201).json(transfer);
  } catch (error) {
    console.error('Error creating branch issue:', error);
    res.status(500).json({ error: 'Failed to create branch issue' });
  }
});

// POST /api/branch/receipt - Branch Receipt
router.post('/receipt', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    const sequence = await prisma.voucherSequence.upsert({
      where: {
        prefix_entityType_financialYear: {
          prefix: 'GBR',
          entityType: 'BRANCH_RECEIPT',
          financialYear: data.financialYear || '2025-2026',
        },
      },
      update: { lastNumber: { increment: 1 } },
      create: { prefix: 'GBR', entityType: 'BRANCH_RECEIPT', financialYear: data.financialYear || '2025-2026', lastNumber: 1 },
    });

    const voucherNo = `GBR/${sequence.lastNumber}`;

    const transfer = await prisma.$transaction(async (tx) => {
      const branchTransfer = await tx.branchTransfer.create({
        data: {
          voucherNo,
          voucherPrefix: 'GBR',
          voucherNumber: sequence.lastNumber,
          voucherDate: new Date(data.voucherDate),
          transferType: 'RECEIPT',
          issuingBranchId: data.issuingBranchId,
          receivingBranchId: data.receivingBranchId,
          totalGrossWeight: data.totalGrossWeight || 0,
          totalNetWeight: data.totalNetWeight || 0,
          totalPcs: data.totalPcs || 0,
          totalAmount: data.totalAmount || 0,
          billNo: data.billNo,
          narration: data.narration,
        },
      });

      for (const item of data.items || []) {
        await tx.branchTransferItem.create({
          data: {
            branchTransferId: branchTransfer.id,
            labelId: item.labelId,
            itemName: item.itemName,
            grossWeight: item.grossWeight || 0,
            netWeight: item.netWeight || 0,
            pcs: item.pcs || 1,
            purityName: item.purityName,
            metalAmount: item.metalAmount || 0,
            totalAmount: item.totalAmount || 0,
          },
        });

        // Mark label as in-stock at new branch
        if (item.labelId) {
          await tx.label.update({
            where: { id: item.labelId },
            data: { status: 'IN_STOCK' },
          });
        }
      }

      return branchTransfer;
    });

    res.status(201).json(transfer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create branch receipt' });
  }
});

// GET /api/branch/list - List all branches
router.get('/list', async (_req: Request, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(branches);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

export default router;
