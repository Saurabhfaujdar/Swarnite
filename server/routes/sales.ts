import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { authenticate, tenantScope, canAccessBranch } from '../middleware/branchAccess';

const router = Router();

// All sales routes require authentication
router.use(authenticate);

// Auto-close ACTIVE vouchers not edited for 20 days
const CLOSE_AFTER_DAYS = 20;
async function autoCloseStaleVouchers(tenantWhere: any) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CLOSE_AFTER_DAYS);
  await prisma.salesVoucher.updateMany({
    where: {
      ...tenantWhere,
      status: 'ACTIVE',
      updatedAt: { lt: cutoff },
    },
    data: { status: 'CLOSED' },
  });
}

// ============================================================
// GET /api/sales - List sales vouchers with filters
// ============================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      dateFrom,
      dateTo,
      customerId,
      salesmanId,
      page = '1',
      limit = '50',
      // New filter / search params
      search,
      voucherNo,
      status,
      salesmanName,
      narration,
      reference,
      minAmount,
      maxAmount,
      minDue,
      maxDue,
      minGrossWeight,
      maxGrossWeight,
      minNetWeight,
      maxNetWeight,
      paymentMode,
      labelNo,
      itemName,
      sortBy = 'voucherDate',
      sortOrder = 'desc',
    } = req.query;

    const where: Prisma.SalesVoucherWhereInput = {
      ...tenantScope(req),
    };

    // Auto-close stale vouchers before listing
    await autoCloseStaleVouchers(tenantScope(req));

    // Status filter (default to excluding cancelled unless explicitly requested)
    if (status && status !== 'ALL') {
      where.status = status as any;
    }

    // Date range (parse date strings as local time to avoid UTC mismatch)
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) {
        const start = new Date(dateFrom + 'T00:00:00');
        where.voucherDate.gte = start;
      }
      if (dateTo) {
        const end = new Date(dateTo + 'T23:59:59.999');
        where.voucherDate.lte = end;
      }
    }

    // Exact customer ID
    if (customerId) where.accountId = Number(customerId);

    // Exact salesman ID
    if (salesmanId) where.salesmanId = Number(salesmanId);

    // Voucher number partial match
    if (voucherNo) {
      where.voucherNo = { contains: voucherNo as string, mode: 'insensitive' };
    }

    // Salesman name partial match (when no ID)
    if (salesmanName && !salesmanId) {
      where.salesman = { name: { contains: salesmanName as string, mode: 'insensitive' } };
    }

    // Narration partial match
    if (narration) {
      where.narration = { contains: narration as string, mode: 'insensitive' };
    }

    // Reference partial match
    if (reference) {
      where.reference = { contains: reference as string, mode: 'insensitive' };
    }

    // Amount range filters
    if (minAmount || maxAmount) {
      where.voucherAmount = {};
      if (minAmount) where.voucherAmount.gte = Number(minAmount);
      if (maxAmount) where.voucherAmount.lte = Number(maxAmount);
    }

    // Due amount range filters
    if (minDue || maxDue) {
      where.dueAmount = {};
      if (minDue) where.dueAmount.gte = Number(minDue);
      if (maxDue) where.dueAmount.lte = Number(maxDue);
    }

    // Gross weight range
    if (minGrossWeight || maxGrossWeight) {
      where.totalGrossWeight = {};
      if (minGrossWeight) where.totalGrossWeight.gte = Number(minGrossWeight);
      if (maxGrossWeight) where.totalGrossWeight.lte = Number(maxGrossWeight);
    }

    // Net weight range
    if (minNetWeight || maxNetWeight) {
      where.totalNetWeight = {};
      if (minNetWeight) where.totalNetWeight.gte = Number(minNetWeight);
      if (maxNetWeight) where.totalNetWeight.lte = Number(maxNetWeight);
    }

    // Payment mode filter (has cash / bank / card / oldGold)
    if (paymentMode) {
      const mode = paymentMode as string;
      if (mode === 'CASH') where.cashAmount = { gt: 0 };
      else if (mode === 'BANK') where.bankAmount = { gt: 0 };
      else if (mode === 'CARD') where.cardAmount = { gt: 0 };
      else if (mode === 'UPI') where.upiAmount = { gt: 0 };
      else if (mode === 'OLD_GOLD') where.oldGoldAmount = { gt: 0 };
      else if (mode === 'DUE') where.dueAmount = { gt: 0 };
    }

    // Item-level filters — label number or item name search
    if (labelNo || itemName) {
      where.items = {
        some: {
          ...(labelNo ? { labelNo: { contains: labelNo as string, mode: 'insensitive' as const } } : {}),
          ...(itemName ? { itemName: { contains: itemName as string, mode: 'insensitive' as const } } : {}),
        },
      };
    }

    // Free-text search across voucher number, customer name, narration, reference
    if (search) {
      where.OR = [
        { voucherNo: { contains: search as string, mode: 'insensitive' } },
        { account: { name: { contains: search as string, mode: 'insensitive' } } },
        { narration: { contains: search as string, mode: 'insensitive' } },
        { reference: { contains: search as string, mode: 'insensitive' } },
        { salesman: { name: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    // Dynamic sorting
    const validSortFields = [
      'voucherDate', 'voucherNo', 'voucherAmount', 'dueAmount',
      'totalGrossWeight', 'totalNetWeight', 'metalAmount', 'labourAmount',
      'cashAmount', 'bankAmount', 'createdAt',
    ];
    const orderField = validSortFields.includes(sortBy as string) ? (sortBy as string) : 'voucherDate';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy: any = { [orderField]: orderDir };

    const [vouchers, total] = await Promise.all([
      prisma.salesVoucher.findMany({
        where,
        include: {
          account: { select: { id: true, name: true, mobile: true, gstin: true } },
          salesman: { select: { id: true, name: true } },
          items: true,
        },
        orderBy,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.salesVoucher.count({ where }),
    ]);

    res.json({ vouchers, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales vouchers' });
  }
});

// ============================================================
// GET /api/sales/:id - Get single sales voucher
// ============================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const voucher = await prisma.salesVoucher.findFirst({
      where: { id: Number(req.params.id), ...tenantScope(req) },
      include: {
        account: true,
        salesman: true,
        items: { include: { item: true, label: true } },
        branch: true,
        user: { select: { id: true, fullName: true } },
      },
    });

    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });

    // Auto-close if stale
    if (voucher.status === 'ACTIVE') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - CLOSE_AFTER_DAYS);
      if (voucher.updatedAt < cutoff) {
        await prisma.salesVoucher.update({ where: { id: voucher.id }, data: { status: 'CLOSED' } });
        voucher.status = 'CLOSED';
      }
    }

    res.json(voucher);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch voucher' });
  }
});

// ============================================================
// POST /api/sales - Create new sales voucher (Retail Sales Entry)
// ============================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    // Validate payment does not exceed voucher amount + outstanding balance
    const totalPaid = Number(data.cashAmount || 0) + Number(data.bankAmount || 0) + Number(data.cardAmount || 0) + Number(data.upiAmount || 0) + Number(data.oldGoldAmount || 0) + Number(data.advanceAmount || 0);
    const previousOs = Number(data.previousOs || 0);
    const voucherAmt = Number(data.voucherAmount || 0);
    const maxAllowed = voucherAmt + (previousOs > 0 ? previousOs : 0);
    
    console.log('Payment validation:', { totalPaid, previousOs, voucherAmt, maxAllowed, passes: totalPaid <= maxAllowed });
    
    if (totalPaid > maxAllowed) {
      return res.status(400).json({ error: 'Total payment cannot exceed voucher amount plus outstanding balance' });
    }

    // Use authenticated user's branch/user if not provided
    const branchId = data.branchId || req.branchId!;
    const userId = data.userId || req.userId!;

    // Validate branch access for the write
    if (!canAccessBranch(req, branchId)) {
      return res.status(403).json({ error: 'Access denied to target branch' });
    }

    const voucher = await prisma.$transaction(async (tx) => {
      // Generate voucher number inside transaction to avoid orphaned sequence on rollback
      const sequence = await tx.voucherSequence.upsert({
        where: {
          companyId_prefix_entityType_financialYear: {
            companyId: req.companyId!,
            prefix: data.voucherPrefix || 'JGI',
            entityType: 'SALES',
            financialYear: data.financialYear || '2025-2026',
          },
        },
        update: { lastNumber: { increment: 1 } },
        create: {
          companyId: req.companyId!,
          prefix: data.voucherPrefix || 'JGI',
          entityType: 'SALES',
          financialYear: data.financialYear || '2025-2026',
          lastNumber: 1,
        },
      });

      const voucherNo = `${data.voucherPrefix || 'JGI'}/${sequence.lastNumber}`;

      // Create the sales voucher
      const salesVoucher = await tx.salesVoucher.create({
        data: {
          voucherNo,
          voucherPrefix: data.voucherPrefix || 'JGI',
          voucherNumber: sequence.lastNumber,
          voucherDate: new Date(data.voucherDate),
          accountId: data.accountId,
          salesmanId: data.salesmanId || null,
          companyId: req.companyId!,
          branchId,
          userId,
          totalGrossWeight: data.totalGrossWeight || 0,
          totalNetWeight: data.totalNetWeight || 0,
          totalPcs: data.totalPcs || 0,
          metalAmount: data.metalAmount || 0,
          labourAmount: data.labourAmount || 0,
          otherCharge: data.otherCharge || 0,
          discountStAmount: data.discountStAmount || 0,
          totalAmount: data.totalAmount || 0,
          taxableAmount: data.taxableAmount || 0,
          cgstAmount: data.cgstAmount || 0,
          sgstAmount: data.sgstAmount || 0,
          igstAmount: data.igstAmount || 0,
          totalGstAmount: data.totalGstAmount || 0,
          discountPercent: data.discountPercent || 0,
          discountAmount: data.discountAmount || 0,
          roundingDiscount: data.roundingDiscount || 0,
          voucherAmount: data.voucherAmount || 0,
          cashAmount: data.cashAmount || 0,
          bankAmount: data.bankAmount || 0,
          cardAmount: data.cardAmount || 0,
          upiAmount: data.upiAmount || 0,
          oldGoldAmount: data.oldGoldAmount || 0,
          advanceAmount: data.advanceAmount || 0,
          paymentAmount: data.paymentAmount || 0,
          dueAmount: data.dueAmount || 0,
          previousOs: data.previousOs || 0,
          finalDue: data.finalDue || 0,
          discountScheme: data.discountScheme,
          narration: data.narration,
          reference: data.reference,
        },
      });

      // Create sales items
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          await tx.salesItem.create({
            data: {
              salesVoucherId: salesVoucher.id,
              labelId: item.labelId || null,
              itemId: item.itemId,
              labelNo: item.labelNo,
              itemName: item.itemName,
              grossWeight: item.grossWeight || 0,
              netWeight: item.netWeight || 0,
              fineWeight: item.fineWeight || 0,
              pcs: item.pcs || 1,
              metalRate: item.metalRate || 0,
              metalAmount: item.metalAmount || 0,
              diamondWeight: item.diamondWeight || 0,
              labourRate: item.labourRate || 0,
              labourAmount: item.labourAmount || 0,
              otherCharge: item.otherCharge || 0,
              discountStAmt: item.discountStAmt || 0,
              totalAmount: item.totalAmount || 0,
              taxableAmount: item.taxableAmount || 0,
              styleName: item.styleName,
              lessWeight: item.lessWeight || 0,
            },
          });

          // Validate label is IN_STOCK and belongs to user's branch before selling
          if (item.labelId) {
            const label = await tx.label.findUnique({ where: { id: item.labelId }, select: { branchId: true, status: true, labelNo: true, pcsCount: true } });
            if (!label || !canAccessBranch(req, label.branchId)) {
              throw new Error(`Label ${item.labelId} not accessible from your branch`);
            }
            if (label.status !== 'IN_STOCK') {
              throw new Error(`Label ${label.labelNo || item.labelNo} is not available for sale (status: ${label.status})`);
            }
            const salePcs = item.pcs || 1;
            if (salePcs > label.pcsCount) {
              throw new Error(`Label ${label.labelNo || item.labelNo} has only ${label.pcsCount} pcs available, cannot sell ${salePcs}`);
            }
            if (salePcs < 1) {
              throw new Error(`Invalid pcs count: ${salePcs}. Must sell at least 1 pc.`);
            }
            const remainingPcs = label.pcsCount - salePcs;
            // Only mark as SOLD when ALL pieces are sold (pcsCount becomes 0)
            const newStatus = remainingPcs === 0 ? 'SOLD' : 'IN_STOCK';
            await tx.label.update({
              where: { id: item.labelId },
              data: {
                pcsCount: remainingPcs,
                status: newStatus,
              },
            });
          }
        }
      }

      // Update customer balance
      await tx.account.update({
        where: { id: data.accountId },
        data: {
          closingBalance: {
            increment: data.dueAmount || 0,
          },
          balanceType: 'DR',
        },
      });

      // If advance was used, record a CustomerPayment entry for tracking
      const advanceUsed = Number(data.advanceAmount || 0);
      if (advanceUsed > 0) {
        // Get the latest receipt number for advance-used records
        const advSeq = await tx.voucherSequence.upsert({
          where: {
            companyId_prefix_entityType_financialYear: {
              companyId: req.companyId!,
              prefix: 'CPR',
              entityType: 'CUSTOMER_PAYMENT',
              financialYear: data.financialYear || '2025-2026',
            },
          },
          update: { lastNumber: { increment: 1 } },
          create: {
            companyId: req.companyId!,
            prefix: 'CPR',
            entityType: 'CUSTOMER_PAYMENT',
            financialYear: data.financialYear || '2025-2026',
            lastNumber: 1,
          },
        });

        const account = await tx.account.findUnique({
          where: { id: data.accountId },
          select: { closingBalance: true },
        });

        await tx.customerPayment.create({
          data: {
            receiptNo: `CPR/${advSeq.lastNumber}`,
            receiptPrefix: 'CPR',
            receiptNumber: advSeq.lastNumber,
            paymentDate: new Date(data.voucherDate),
            accountId: data.accountId,
            companyId: req.companyId!,
            paymentType: 'ADVANCE',
            cashAmount: 0,
            bankAmount: 0,
            cardAmount: 0,
            upiAmount: 0,
            totalAmount: advanceUsed,
            balanceBefore: Number(account?.closingBalance || 0) + advanceUsed, // before the increment above
            balanceAfter: Number(account?.closingBalance || 0),
            salesVoucherId: salesVoucher.id,
            narration: `Advance used for sale ${voucherNo}`,
          },
        });
      }

      return salesVoucher;
    });

    // Fetch complete voucher
    const fullVoucher = await prisma.salesVoucher.findUnique({
      where: { id: voucher.id },
      include: { account: true, items: true, salesman: true },
    });

    res.status(201).json(fullVoucher);
  } catch (error: any) {
    console.error('Error creating sales voucher:', error);
    // Provide more specific error messages
    if (error.code === 'P2002' && error.meta?.target?.includes('voucherNo')) {
      return res.status(409).json({ error: 'Voucher number conflict. Please try again.' });
    }
    if (error.message) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create sales voucher' });
  }
});

// ============================================================
// PUT /api/sales/:id - Update sales voucher (payment & details)
// ============================================================
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const data = req.body;

    const result = await prisma.$transaction(async (tx) => {
      // Fetch existing voucher with tenant scope
      const existing = await tx.salesVoucher.findFirst({
        where: { id, ...tenantScope(req) },
        include: { items: true },
      });

      if (!existing) throw new Error('Voucher not found');
      if (existing.status === 'CLOSED') throw new Error('Cannot edit a closed voucher. Vouchers are automatically closed after 20 days.');
      if (existing.status !== 'ACTIVE') throw new Error('Cannot edit a cancelled voucher');

      // Validate payment does not exceed voucher amount
      const effectiveVoucherAmount = Number(data.voucherAmount ?? existing.voucherAmount);
      const totalPaid = Number(data.cashAmount ?? existing.cashAmount ?? 0) + Number(data.bankAmount ?? existing.bankAmount ?? 0) + Number(data.cardAmount ?? existing.cardAmount ?? 0) + Number(data.upiAmount ?? existing.upiAmount ?? 0) + Number(data.oldGoldAmount ?? existing.oldGoldAmount ?? 0) + Number(data.advanceAmount ?? existing.advanceAmount ?? 0);
      if (totalPaid > effectiveVoucherAmount) {
        throw new Error('Total payment cannot exceed voucher amount');
      }

      // Calculate balance difference: old dueAmount vs new dueAmount
      const oldDue = Number(existing.dueAmount);
      const newDue = Number(data.dueAmount ?? oldDue);
      const dueDiff = newDue - oldDue;

      // Update voucher fields
      const updated = await tx.salesVoucher.update({
        where: { id },
        data: {
          salesmanId: data.salesmanId !== undefined ? (data.salesmanId || null) : undefined,
          cashAmount: data.cashAmount ?? existing.cashAmount,
          bankAmount: data.bankAmount ?? existing.bankAmount,
          cardAmount: data.cardAmount ?? existing.cardAmount,
          upiAmount: data.upiAmount ?? existing.upiAmount,
          oldGoldAmount: data.oldGoldAmount ?? existing.oldGoldAmount,
          advanceAmount: data.advanceAmount ?? existing.advanceAmount,
          paymentAmount: data.paymentAmount ?? existing.paymentAmount,
          dueAmount: data.dueAmount ?? existing.dueAmount,
          previousOs: data.previousOs ?? existing.previousOs,
          finalDue: data.finalDue ?? existing.finalDue,
          discountAmount: data.discountAmount ?? existing.discountAmount,
          roundingDiscount: data.roundingDiscount ?? existing.roundingDiscount,
          voucherAmount: data.voucherAmount ?? existing.voucherAmount,
          narration: data.narration !== undefined ? data.narration : existing.narration,
          reference: data.reference !== undefined ? data.reference : existing.reference,
        },
      });

      // Adjust customer balance if due changed
      if (dueDiff !== 0) {
        await tx.account.update({
          where: { id: existing.accountId },
          data: {
            closingBalance: { increment: dueDiff },
          },
        });
      }

      return updated;
    });

    // Fetch complete voucher for response
    const fullVoucher = await prisma.salesVoucher.findUnique({
      where: { id },
      include: { account: true, items: { include: { item: true, label: true } }, salesman: true, branch: true, user: { select: { id: true, fullName: true } } },
    });

    res.json(fullVoucher);
  } catch (error: any) {
    console.error('Error updating sales voucher:', error);
    res.status(error.message === 'Voucher not found' ? 404 : error.message?.includes('Cannot edit') || error.message?.includes('cannot exceed') ? 400 : 500)
      .json({ error: error.message || 'Failed to update voucher' });
  }
});

// ============================================================
// DELETE /api/sales/:id - Cancel/void sales voucher
// ============================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await prisma.$transaction(async (tx) => {
      const voucher = await tx.salesVoucher.findFirst({
        where: { id, ...tenantScope(req) },
        include: { items: true },
      });

      if (!voucher) throw new Error('Voucher not found');

      // Restore label statuses and pcsCount
      for (const item of voucher.items) {
        if (item.labelId) {
          const salePcs = Number(item.pcs) || 1;
          await tx.label.update({
            where: { id: item.labelId },
            data: {
              pcsCount: { increment: salePcs },
              status: 'IN_STOCK',
            },
          });
        }
      }

      // Restore customer balance
      await tx.account.update({
        where: { id: voucher.accountId },
        data: {
          closingBalance: { decrement: Number(voucher.dueAmount) },
        },
      });

      // Mark as cancelled
      await tx.salesVoucher.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    });

    res.json({ message: 'Voucher cancelled' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel voucher' });
  }
});

export default router;
