import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, tenantScope, canAccessBranch } from '../middleware/branchAccess';

const router = Router();

router.use(authenticate);

// ============================================================
// GET /api/savings-scheme - List savings schemes
// ============================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, customerId, status, search } = req.query;

    const where: any = { ...tenantScope(req) };

    if (status && status !== 'ALL') where.status = status;
    if (customerId) where.accountId = Number(customerId);

    if (dateFrom && dateTo) {
      where.startDate = {
        gte: new Date(dateFrom as string),
        lte: new Date(new Date(dateTo as string).setHours(23, 59, 59, 999)),
      };
    }

    if (search) {
      where.OR = [
        { schemeNo: { contains: search as string, mode: 'insensitive' } },
        { account: { name: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    const schemes = await prisma.savingsScheme.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, mobile: true } },
        branch: { select: { name: true } },
        installments: { orderBy: { installmentNo: 'asc' } },
      },
      orderBy: { startDate: 'desc' },
    });

    const totalMaturityValue = schemes.reduce(
      (sum, s) => sum + Number(s.maturityValue),
      0,
    );

    res.json({ schemes, totalMaturityValue });
  } catch (error) {
    console.error('Error fetching savings schemes:', error);
    res.status(500).json({ error: 'Failed to fetch savings schemes' });
  }
});

// ============================================================
// GET /api/savings-scheme/:id - Get single savings scheme
// ============================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const scheme = await prisma.savingsScheme.findFirst({
      where: { id, ...tenantScope(req) },
      include: {
        account: true,
        branch: { select: { name: true } },
        installments: { orderBy: { installmentNo: 'asc' } },
      },
    });

    if (!scheme) {
      return res.status(404).json({ error: 'Savings scheme not found' });
    }

    res.json(scheme);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch savings scheme' });
  }
});

// ============================================================
// POST /api/savings-scheme - Create savings scheme
// ============================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.accountId) {
      return res.status(400).json({ error: 'Customer is required' });
    }
    if (!data.monthlyAmount || data.monthlyAmount <= 0) {
      return res.status(400).json({ error: 'Monthly amount is required' });
    }
    if (!data.durationMonths || data.durationMonths <= 0) {
      return res.status(400).json({ error: 'Duration (months) is required' });
    }
    if (!data.branchId || !canAccessBranch(req, data.branchId)) {
      return res.status(403).json({ error: 'Access denied to target branch' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Generate scheme number
      const sequence = await tx.voucherSequence.upsert({
        where: {
          companyId_prefix_entityType_financialYear: {
            companyId: req.companyId!,
            prefix: 'SS',
            entityType: 'SAVINGS_SCHEME',
            financialYear: data.financialYear || '2025-2026',
          },
        },
        update: { lastNumber: { increment: 1 } },
        create: {
          companyId: req.companyId!,
          prefix: 'SS',
          entityType: 'SAVINGS_SCHEME',
          financialYear: data.financialYear || '2025-2026',
          lastNumber: 1,
        },
      });

      const schemeNo = `SS/${sequence.lastNumber}`;
      const durationMonths = data.durationMonths;
      const monthlyAmount = Number(data.monthlyAmount);
      const bonusMonths = data.bonusMonths ?? 1;
      const bonusAmount = bonusMonths * monthlyAmount;

      const startDate = new Date(data.startDate || new Date());
      const maturityDate = new Date(startDate);
      maturityDate.setMonth(maturityDate.getMonth() + durationMonths);

      // Create the savings scheme
      const scheme = await tx.savingsScheme.create({
        data: {
          schemeNo,
          schemePrefix: 'SS',
          schemeNumber: sequence.lastNumber,
          schemeName: data.schemeName || 'Gold Savings Scheme',
          startDate,
          maturityDate,
          accountId: data.accountId,
          companyId: req.companyId!,
          branchId: data.branchId,
          durationMonths,
          monthlyAmount,
          bonusMonths,
          bonusAmount,
          maturityValue: (durationMonths * monthlyAmount) + bonusAmount,
          narration: data.narration || null,
          reference: data.reference || null,
        },
      });

      // Pre-create installment slots
      for (let i = 1; i <= durationMonths; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        await tx.schemeInstallment.create({
          data: {
            schemeId: scheme.id,
            installmentNo: i,
            dueDate,
            amount: 0,
            status: 'PENDING',
          },
        });
      }

      return scheme;
    });

    const fullScheme = await prisma.savingsScheme.findUnique({
      where: { id: result.id },
      include: {
        account: true,
        installments: { orderBy: { installmentNo: 'asc' } },
      },
    });

    res.status(201).json(fullScheme);
  } catch (error) {
    console.error('Error creating savings scheme:', error);
    res.status(500).json({ error: 'Failed to create savings scheme' });
  }
});

// ============================================================
// POST /api/savings-scheme/:id/installment - Pay an installment
// ============================================================
router.post('/:id/installment', async (req: Request, res: Response) => {
  try {
    const schemeId = Number(req.params.id);
    const data = req.body;

    if (!data.installmentNo) {
      return res.status(400).json({ error: 'Installment number is required' });
    }
    if (!data.amount || data.amount <= 0) {
      return res.status(400).json({ error: 'Payment amount is required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const scheme = await tx.savingsScheme.findFirst({
        where: { id: schemeId, ...tenantScope(req) },
      });

      if (!scheme) throw new Error('Savings scheme not found');
      if (scheme.status === 'CANCELLED') throw new Error('Scheme is cancelled');
      if (scheme.status === 'REDEEMED') throw new Error('Scheme is already redeemed');

      const installment = await tx.schemeInstallment.findUnique({
        where: {
          schemeId_installmentNo: {
            schemeId,
            installmentNo: data.installmentNo,
          },
        },
      });

      if (!installment) throw new Error('Installment not found');
      if (installment.status === 'PAID') throw new Error('Installment is already paid');

      // Update installment
      await tx.schemeInstallment.update({
        where: { id: installment.id },
        data: {
          amount: data.amount,
          paymentMode: data.paymentMode || 'Cash',
          paidDate: new Date(data.paidDate || new Date()),
          reference: data.reference || null,
          narration: data.narration || null,
          status: 'PAID',
        },
      });

      // Update scheme totals
      const paidInstallments = scheme.paidInstallments + 1;
      const totalPaidAmount = Number(scheme.totalPaidAmount) + Number(data.amount);
      const bonusAmount = Number(scheme.bonusAmount);

      const updateData: any = {
        paidInstallments,
        totalPaidAmount,
        maturityValue: totalPaidAmount + bonusAmount,
      };

      // Check if all installments are paid → MATURED
      if (paidInstallments >= scheme.durationMonths) {
        updateData.status = 'MATURED';
      }

      const updatedScheme = await tx.savingsScheme.update({
        where: { id: schemeId },
        data: updateData,
      });

      return updatedScheme;
    });

    const fullScheme = await prisma.savingsScheme.findUnique({
      where: { id: schemeId },
      include: {
        account: true,
        installments: { orderBy: { installmentNo: 'asc' } },
      },
    });

    res.status(201).json(fullScheme);
  } catch (error: any) {
    console.error('Error paying installment:', error);
    res.status(400).json({ error: error.message || 'Failed to pay installment' });
  }
});

// ============================================================
// PUT /api/savings-scheme/:id/mark-missed - Mark missed installments
// ============================================================
router.put('/:id/mark-missed', async (req: Request, res: Response) => {
  try {
    const schemeId = Number(req.params.id);

    const scheme = await prisma.savingsScheme.findFirst({
      where: { id: schemeId, ...tenantScope(req) },
      include: { installments: true },
    });

    if (!scheme) {
      return res.status(404).json({ error: 'Savings scheme not found' });
    }

    const now = new Date();
    let missedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const inst of scheme.installments) {
        if (inst.status === 'PENDING' && inst.dueDate < now) {
          await tx.schemeInstallment.update({
            where: { id: inst.id },
            data: { status: 'MISSED' },
          });
          missedCount++;
        }
      }

      if (missedCount > 0) {
        await tx.savingsScheme.update({
          where: { id: schemeId },
          data: { missedInstallments: { increment: missedCount } },
        });
      }
    });

    res.json({ message: `${missedCount} installments marked as missed` });
  } catch (error) {
    console.error('Error marking missed installments:', error);
    res.status(500).json({ error: 'Failed to mark missed installments' });
  }
});

// ============================================================
// PUT /api/savings-scheme/:id/redeem - Redeem matured scheme
// ============================================================
router.put('/:id/redeem', async (req: Request, res: Response) => {
  try {
    const schemeId = Number(req.params.id);

    const scheme = await prisma.savingsScheme.findFirst({
      where: { id: schemeId, ...tenantScope(req) },
    });

    if (!scheme) {
      return res.status(404).json({ error: 'Savings scheme not found' });
    }
    if (scheme.status !== 'MATURED') {
      return res.status(400).json({ error: 'Only matured schemes can be redeemed' });
    }

    await prisma.$transaction(async (tx) => {
      // Mark scheme as redeemed
      await tx.savingsScheme.update({
        where: { id: schemeId },
        data: { status: 'REDEEMED' },
      });

      // Credit the maturity value to customer account as advance (CR balance)
      await tx.account.update({
        where: { id: scheme.accountId },
        data: {
          closingBalance: { decrement: Number(scheme.maturityValue) },
          balanceType: 'CR',
        },
      });
    });

    res.json({ message: 'Scheme redeemed. Maturity value credited to customer account.' });
  } catch (error) {
    console.error('Error redeeming scheme:', error);
    res.status(500).json({ error: 'Failed to redeem scheme' });
  }
});

// ============================================================
// DELETE /api/savings-scheme/:id - Cancel savings scheme
// ============================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const scheme = await prisma.savingsScheme.findFirst({
      where: { id, ...tenantScope(req) },
    });

    if (!scheme) {
      return res.status(404).json({ error: 'Savings scheme not found' });
    }
    if (scheme.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Scheme is already cancelled' });
    }
    if (scheme.status === 'REDEEMED') {
      return res.status(400).json({ error: 'Cannot cancel a redeemed scheme' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.savingsScheme.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // If any amount was paid, credit it back to customer as advance
      if (Number(scheme.totalPaidAmount) > 0) {
        await tx.account.update({
          where: { id: scheme.accountId },
          data: {
            closingBalance: { decrement: Number(scheme.totalPaidAmount) },
            balanceType: 'CR',
          },
        });
      }
    });

    res.json({ message: 'Savings scheme cancelled. Paid amount credited to customer account.' });
  } catch (error) {
    console.error('Error cancelling savings scheme:', error);
    res.status(500).json({ error: 'Failed to cancel savings scheme' });
  }
});

export default router;
