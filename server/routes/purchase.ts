import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';

const router = Router();

// ============================================================
// GET /api/purchase - List purchase vouchers
// ============================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, type, page = '1', limit = '50' } = req.query;

    const where: Prisma.PurchaseVoucherWhereInput = { status: 'ACTIVE' };

    if (dateFrom && dateTo) {
      where.voucherDate = {
        gte: new Date(dateFrom as string),
        lte: new Date(dateTo as string),
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
    const voucher = await prisma.purchaseVoucher.findUnique({
      where: { id: Number(req.params.id) },
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
    const prefix = data.purchaseType === 'URD' ? 'URD' : 'PUR';

    // Generate voucher number
    const sequence = await prisma.voucherSequence.upsert({
      where: {
        prefix_entityType_financialYear: {
          prefix,
          entityType: 'PURCHASE',
          financialYear: data.financialYear || '2025-2026',
        },
      },
      update: { lastNumber: { increment: 1 } },
      create: {
        prefix,
        entityType: 'PURCHASE',
        financialYear: data.financialYear || '2025-2026',
        lastNumber: 1,
      },
    });

    const voucherNo = `${prefix}/${sequence.lastNumber}`;

    const voucher = await prisma.$transaction(async (tx) => {
      const purchaseVoucher = await tx.purchaseVoucher.create({
        data: {
          voucherNo,
          voucherPrefix: prefix,
          voucherNumber: sequence.lastNumber,
          voucherDate: new Date(data.voucherDate),
          purchaseType: data.purchaseType || 'URD',
          accountId: data.accountId,
          branchId: data.branchId,
          userId: data.userId,
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

      // Create purchase items (less weight/style details)
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          await tx.purchaseItem.create({
            data: {
              purchaseVoucherId: purchaseVoucher.id,
              styleName: item.styleName,
              weight: item.weight || 0,
              pcs: item.pcs || 0,
              amtCalcOn: item.amtCalcOn,
              rate: item.rate || 0,
              amount: item.amount || 0,
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
