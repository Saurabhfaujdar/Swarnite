import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { authenticate, tenantScope, canAccessBranch } from '../middleware/branchAccess';

const router = Router();

router.use(authenticate);

// ============================================================
// GET /api/purchase - List purchase vouchers
// ============================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, type, page = '1', limit = '50' } = req.query;

    const where: Prisma.PurchaseVoucherWhereInput = { status: 'ACTIVE', ...tenantScope(req) };

    if (dateFrom && dateTo) {
      where.voucherDate = {
        gte: new Date(dateFrom + 'T00:00:00'),
        lte: new Date(dateTo + 'T23:59:59.999'),
      };
    }
    if (type) where.purchaseType = type as any;

    const [vouchers, total] = await Promise.all([
      prisma.purchaseVoucher.findMany({
        where,
        include: {
          account: { select: { id: true, name: true, mobile: true } },
          items: true,
        },
        orderBy: { voucherDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.purchaseVoucher.count({ where }),
    ]);

    res.json({ vouchers, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch purchase vouchers' });
  }
});

// ============================================================
// GET /api/purchase/:id
// ============================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const voucher = await prisma.purchaseVoucher.findFirst({
      where: { id: Number(req.params.id), ...tenantScope(req) },
      include: { account: true, items: true, branch: true },
    });
    if (!voucher) return res.status(404).json({ error: 'Not found' });
    res.json(voucher);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch voucher' });
  }
});

// ============================================================
// POST /api/purchase - Create purchase voucher (URD / Old Gold)
// ============================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    // Map OLD_GOLD to URD for the database enum, but keep prefix logic
    const isOldGold = data.purchaseType === 'OLD_GOLD';
    const dbPurchaseType = isOldGold ? 'URD' : (data.purchaseType || 'URD');
    const prefix = (dbPurchaseType === 'URD' || isOldGold) ? 'URD' : 'PUR';

    // Use authenticated user's branch/user if not provided
    const branchId = data.branchId || req.branchId!;
    const userId = data.userId || req.userId!;

    if (!canAccessBranch(req, branchId)) {
      return res.status(403).json({ error: 'Access denied to target branch' });
    }

    const voucher = await prisma.$transaction(async (tx) => {
      // Generate voucher number inside transaction to ensure rollback on failure
      const sequence = await tx.voucherSequence.upsert({
        where: {
          companyId_prefix_entityType_financialYear: {
            companyId: req.companyId!,
            prefix,
            entityType: 'PURCHASE',
            financialYear: data.financialYear || '2025-2026',
          },
        },
        update: { lastNumber: { increment: 1 } },
        create: {
          companyId: req.companyId!,
          prefix,
          entityType: 'PURCHASE',
          financialYear: data.financialYear || '2025-2026',
          lastNumber: 1,
        },
      });

      const voucherNo = `${prefix}/${sequence.lastNumber}`;

      const purchaseVoucher = await tx.purchaseVoucher.create({
        data: {
          voucherNo,
          voucherPrefix: prefix,
          voucherNumber: sequence.lastNumber,
          voucherDate: new Date(data.voucherDate),
          purchaseType: dbPurchaseType as any,
          accountId: data.accountId,
          companyId: req.companyId!,
          branchId,
          userId,
          description: data.description,
          variety: data.variety,
          group: data.group,
          totalGrossWeight: data.totalGrossWeight || 0,
          totalNetWeight: data.totalNetWeight || 0,
          totalFineWeight: data.totalFineWeight || 0,
          totalPcs: data.totalPcs || 0,
          otherWeight: data.otherWeight || 0,
          purity: data.purity || 0,
          metalRate: data.metalRate || 0,
          metalAmount: data.metalAmount || 0,
          otherCharge: data.otherCharge || 0,
          valAddAmount: data.valAddAmount || 0,
          totalAmount: data.totalAmount || 0,
          finalAmount: data.finalAmount || 0,
          salesmanName: data.salesmanName,
          narration: data.narration,
          reference: data.reference,
        },
      });

      // Create purchase items - map frontend fields to schema fields
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          await tx.purchaseItem.create({
            data: {
              purchaseVoucherId: purchaseVoucher.id,
              styleName: item.styleName || item.itemName || '',
              weight: item.weight || item.netWeight || 0,
              pcs: item.pcs || 0,
              amtCalcOn: item.amtCalcOn || 'Weight',
              rate: item.rate || item.metalRate || 0,
              amount: item.amount || item.totalAmount || 0,
            },
          });
        }
      }

      // Update supplier balance
      await tx.account.update({
        where: { id: data.accountId },
        data: {
          closingBalance: { increment: data.finalAmount || 0 },
          balanceType: 'CR',
        },
      });

      return purchaseVoucher;
    });

    const fullVoucher = await prisma.purchaseVoucher.findUnique({
      where: { id: voucher.id },
      include: { account: true, items: true },
    });

    res.status(201).json(fullVoucher);
  } catch (error) {
    console.error('Error creating purchase voucher:', error);
    res.status(500).json({ error: 'Failed to create purchase voucher' });
  }
});

// ============================================================
// DELETE /api/purchase/:id - Cancel purchase
// ============================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const voucher = await prisma.purchaseVoucher.findFirst({
      where: { id, ...tenantScope(req) },
    });
    if (!voucher) return res.status(404).json({ error: 'Not found' });

    await prisma.purchaseVoucher.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    res.json({ message: 'Purchase voucher cancelled' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel' });
  }
});

export default router;
