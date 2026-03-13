import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, tenantScope, branchWhere } from '../middleware/branchAccess';

const router = Router();

router.use(authenticate);

// ============================================================
// DAILY SALES REPORT
// ============================================================
router.get('/daily-sales', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, groupBy } = req.query;
    const where: any = { status: 'ACTIVE', ...tenantScope(req) };

    if (dateFrom && dateTo) {
      where.voucherDate = {
        gte: new Date(dateFrom as string),
        lte: new Date(dateTo as string),
      };
    }

    const sales = await prisma.salesVoucher.findMany({
      where,
      include: {
        account: { select: { name: true, mobile: true, gstin: true } },
        salesman: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { voucherDate: 'asc' },
    });

    // Determine grouping key
    const getGroupKey = (v: any): string => {
      if (groupBy === 'salesman') return v.salesman?.name || 'No Salesman';
      if (groupBy === 'counter') return v.branch?.name || 'Unknown';
      // Default: group by date
      return new Date(v.voucherDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    // Group and aggregate
    const grouped: Record<string, any> = {};
    for (const v of sales) {
      const key = getGroupKey(v);
      if (!grouped[key]) {
        grouped[key] = {
          date: key,
          voucherCount: 0,
          totalGrossWeight: 0,
          totalNetWeight: 0,
          metalAmount: 0,
          labourAmount: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          totalAmount: 0,
          cashAmount: 0,
          bankAmount: 0,
          cardAmount: 0,
          upiAmount: 0,
          oldGoldAmount: 0,
          advanceAmount: 0,
          dueAmount: 0,
        };
      }
      const g = grouped[key];
      g.voucherCount += 1;
      g.totalGrossWeight += Number(v.totalGrossWeight);
      g.totalNetWeight += Number(v.totalNetWeight);
      g.metalAmount += Number(v.metalAmount);
      g.labourAmount += Number(v.labourAmount);
      g.cgstAmount += Number(v.cgstAmount);
      g.sgstAmount += Number(v.sgstAmount);
      g.totalAmount += Number(v.voucherAmount);
      g.cashAmount += Number(v.cashAmount);
      g.bankAmount += Number(v.bankAmount);
      g.cardAmount += Number(v.cardAmount);
      g.upiAmount += Number(v.upiAmount);
      g.oldGoldAmount += Number(v.oldGoldAmount);
      g.advanceAmount += Number(v.advanceAmount);
      g.dueAmount += Number(v.dueAmount);
    }

    const rows = Object.values(grouped);

    const summary = {
      totalVouchers: sales.length,
      totalGrossWeight: sales.reduce((sum, s) => sum + Number(s.totalGrossWeight), 0),
      totalNetWeight: sales.reduce((sum, s) => sum + Number(s.totalNetWeight), 0),
      totalAmount: sales.reduce((sum, s) => sum + Number(s.voucherAmount), 0),
      cashAmount: sales.reduce((sum, s) => sum + Number(s.cashAmount), 0),
      bankAmount: sales.reduce((sum, s) => sum + Number(s.bankAmount), 0),
      cardAmount: sales.reduce((sum, s) => sum + Number(s.cardAmount), 0),
      upiAmount: sales.reduce((sum, s) => sum + Number(s.upiAmount), 0),
      oldGoldAmount: sales.reduce((sum, s) => sum + Number(s.oldGoldAmount), 0),
      advanceAmount: sales.reduce((sum, s) => sum + Number(s.advanceAmount), 0),
      dueAmount: sales.reduce((sum, s) => sum + Number(s.dueAmount), 0),
      totalCollected: sales.reduce((sum, s) => sum + Number(s.paymentAmount), 0),
    };

    res.json({ rows, summary });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate sales report' });
  }
});

// ============================================================
// DAILY PURCHASE REPORT
// ============================================================
router.get('/daily-purchase', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, type } = req.query;
    const where: any = { status: 'ACTIVE', ...tenantScope(req) };

    if (dateFrom && dateTo) {
      where.voucherDate = {
        gte: new Date(dateFrom as string),
        lte: new Date(dateTo as string),
      };
    }
    if (type) where.purchaseType = type;

    const purchases = await prisma.purchaseVoucher.findMany({
      where,
      include: { account: { select: { name: true, mobile: true } } },
      orderBy: { voucherDate: 'asc' },
    });

    const summary = {
      totalVouchers: purchases.length,
      totalAmount: purchases.reduce((sum, p) => sum + Number(p.finalAmount), 0),
      totalGrossWeight: purchases.reduce((sum, p) => sum + Number(p.totalGrossWeight), 0),
      totalNetWeight: purchases.reduce((sum, p) => sum + Number(p.totalNetWeight), 0),
      totalFineWeight: purchases.reduce((sum, p) => sum + Number(p.totalFineWeight), 0),
    };

    res.json({ purchases, summary });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate purchase report' });
  }
});

// ============================================================
// STOCK REPORT
// ============================================================
router.get('/stock', async (req: Request, res: Response) => {
  try {
    const { branchId, counterId, groupName, metalType } = req.query;
    const where: any = { status: 'IN_STOCK', branch: { companyId: req.companyId }, ...branchWhere(req) };

    if (branchId) where.branchId = Number(branchId);
    if (counterId) where.counterId = Number(counterId);
    if (groupName && groupName !== 'ALL') {
      where.item = { itemGroup: { name: groupName as string } };
    }

    const labels = await prisma.label.findMany({
      where,
      include: {
        item: { include: { itemGroup: true, purity: true, metalType: true } },
        branch: { select: { name: true } },
        counter: { select: { name: true } },
      },
      orderBy: { labelNo: 'asc' },
    });

    // Group by item
    const grouped: Record<string, any> = {};
    for (const label of labels) {
      const key = label.item.name;
      if (!grouped[key]) {
        grouped[key] = {
          itemName: label.item.name,
          metalType: label.item.metalType.name,
          purity: label.item.purity.name,
          group: label.item.itemGroup.name,
          pcs: 0,
          grossWeight: 0,
          netWeight: 0,
          labels: [],
        };
      }
      grouped[key].pcs += 1;
      grouped[key].grossWeight += Number(label.grossWeight);
      grouped[key].netWeight += Number(label.netWeight);
      grouped[key].labels.push(label);
    }

    res.json({
      items: Object.values(grouped),
      totalPcs: labels.length,
      totalGrossWeight: labels.reduce((sum, l) => sum + Number(l.grossWeight), 0),
      totalNetWeight: labels.reduce((sum, l) => sum + Number(l.netWeight), 0),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate stock report' });
  }
});

// ============================================================
// GST REPORT
// ============================================================
router.get('/gst', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, type } = req.query;

    if (type === 'sales' || !type) {
      const sales = await prisma.salesVoucher.findMany({
        where: {
          status: 'ACTIVE',
          ...tenantScope(req),
          voucherDate: {
            gte: new Date(dateFrom as string),
            lte: new Date(dateTo as string),
          },
        },
        include: {
          account: { select: { name: true, gstin: true } },
          items: { include: { item: { include: { itemGroup: true } } } },
        },
        orderBy: { voucherDate: 'asc' },
      });

      const totalTaxable = sales.reduce((sum, s) => sum + Number(s.taxableAmount), 0);
      const totalCgst = sales.reduce((sum, s) => sum + Number(s.cgstAmount), 0);
      const totalSgst = sales.reduce((sum, s) => sum + Number(s.sgstAmount), 0);
      const totalIgst = sales.reduce((sum, s) => sum + Number(s.igstAmount), 0);

      res.json({
        type: 'sales',
        vouchers: sales,
        summary: { totalTaxable, totalCgst, totalSgst, totalIgst, totalTax: totalCgst + totalSgst + totalIgst },
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate GST report' });
  }
});

// ============================================================
// OUTSTANDING REPORT
// ============================================================
router.get('/outstanding', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const where: any = { isActive: true, companyId: req.companyId };

    if (type === 'debtors') {
      where.balanceType = 'DR';
      where.closingBalance = { gt: 0 };
    } else if (type === 'creditors') {
      where.balanceType = 'CR';
      where.closingBalance = { gt: 0 };
    } else {
      where.closingBalance = { not: 0 };
    }

    const accounts = await prisma.account.findMany({
      where,
      select: {
        id: true, name: true, mobile: true, city: true,
        closingBalance: true, balanceType: true, type: true,
      },
      orderBy: { name: 'asc' },
    });

    const totalOutstanding = accounts.reduce((sum, a) => sum + Number(a.closingBalance), 0);

    res.json({ accounts, totalOutstanding });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate outstanding report' });
  }
});

// ============================================================
// DASHBOARD SUMMARY
// ============================================================
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      todaySales,
      todayPurchases,
      totalStock,
      totalCustomers,
      latestRates,
    ] = await Promise.all([
      prisma.salesVoucher.aggregate({
        where: { status: 'ACTIVE', ...tenantScope(req), voucherDate: { gte: today, lt: tomorrow } },
        _sum: { voucherAmount: true },
        _count: true,
      }),
      prisma.purchaseVoucher.aggregate({
        where: { status: 'ACTIVE', ...tenantScope(req), voucherDate: { gte: today, lt: tomorrow } },
        _sum: { finalAmount: true },
        _count: true,
      }),
      prisma.label.count({ where: { status: 'IN_STOCK', branch: { companyId: req.companyId }, ...branchWhere(req) } }),
      prisma.account.count({ where: { type: 'CUSTOMER', isActive: true, companyId: req.companyId } }),
      prisma.metalRate.findMany({
        where: { isActive: true, companyId: req.companyId },
        orderBy: { date: 'desc' },
        distinct: ['metalTypeId', 'purityCode'],
        take: 10,
        include: { metalType: true },
      }),
    ]);

    res.json({
      todaySales: {
        count: todaySales._count,
        amount: todaySales._sum.voucherAmount || 0,
      },
      todayPurchases: {
        count: todayPurchases._count,
        amount: todayPurchases._sum.finalAmount || 0,
      },
      totalStock,
      totalCustomers,
      latestRates,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;
