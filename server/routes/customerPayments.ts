import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';

const router = Router();

// ============================================================
// GET /api/customer-payments - List payments with filters
// ============================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      accountId,
      paymentType,
      dateFrom,
      dateTo,
      status,
      search,
      sortBy = 'paymentDate',
      sortOrder = 'desc',
      page = '1',
      limit = '50',
    } = req.query;

    const where: Prisma.CustomerPaymentWhereInput = {};

    if (accountId) where.accountId = Number(accountId);
    if (paymentType && paymentType !== 'ALL') where.paymentType = paymentType as any;
    if (status && status !== 'ALL') where.status = status as any;

    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom as string);
      if (dateTo) {
        const end = new Date(dateTo as string);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    if (search) {
      const s = String(search);
      where.OR = [
        { receiptNo: { contains: s, mode: 'insensitive' } },
        { narration: { contains: s, mode: 'insensitive' } },
        { reference: { contains: s, mode: 'insensitive' } },
        { account: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const pageNum = Math.max(1, Number(page));
    const pageSize = Math.min(100, Math.max(1, Number(limit)));

    const validSortFields: Record<string, string> = {
      paymentDate: 'paymentDate',
      totalAmount: 'totalAmount',
      receiptNo: 'receiptNo',
      createdAt: 'createdAt',
    };
    const orderField = validSortFields[sortBy as string] || 'paymentDate';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [payments, total] = await Promise.all([
      prisma.customerPayment.findMany({
        where,
        include: {
          account: { select: { id: true, name: true, mobile: true, closingBalance: true, balanceType: true } },
        },
        orderBy: { [orderField]: orderDir },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      prisma.customerPayment.count({ where }),
    ]);

    res.json({ payments, total, page: pageNum, limit: pageSize });
  } catch (error) {
    console.error('Error listing customer payments:', error);
    res.status(500).json({ error: 'Failed to list customer payments' });
  }
});

// ============================================================
// GET /api/customer-payments/:id - Get single payment
// ============================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const payment = await prisma.customerPayment.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        account: { select: { id: true, name: true, mobile: true, closingBalance: true, balanceType: true } },
      },
    });

    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

// ============================================================
// GET /api/customer-payments/balance/:accountId - Get balance history for a customer
// ============================================================
router.get('/balance/:accountId', async (req: Request, res: Response) => {
  try {
    const accountId = Number(req.params.accountId);
    const { dateFrom, dateTo } = req.query;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, name: true, mobile: true, closingBalance: true, balanceType: true },
    });

    if (!account) return res.status(404).json({ error: 'Account not found' });

    const dateFilter: Prisma.DateTimeFilter | undefined = (dateFrom || dateTo)
      ? {
          ...(dateFrom ? { gte: new Date(dateFrom as string) } : {}),
          ...(dateTo ? { lte: (() => { const d = new Date(dateTo as string); d.setHours(23, 59, 59, 999); return d; })() } : {}),
        }
      : undefined;

    // Fetch all balance-affecting transactions in parallel
    const [payments, sales, cashEntries] = await Promise.all([
      prisma.customerPayment.findMany({
        where: {
          accountId,
          status: 'ACTIVE',
          ...(dateFilter ? { paymentDate: dateFilter } : {}),
        },
        select: {
          id: true, receiptNo: true, paymentDate: true,
          paymentType: true, totalAmount: true, cashAmount: true,
          bankAmount: true, cardAmount: true, balanceBefore: true,
          balanceAfter: true, narration: true, reference: true,
        },
        orderBy: { paymentDate: 'asc' },
      }),
      prisma.salesVoucher.findMany({
        where: {
          accountId,
          status: 'ACTIVE',
          ...(dateFilter ? { voucherDate: dateFilter } : {}),
        },
        select: {
          id: true, voucherNo: true, voucherDate: true,
          voucherAmount: true, paymentAmount: true, dueAmount: true,
          advanceAmount: true,
        },
        orderBy: { voucherDate: 'asc' },
      }),
      prisma.cashEntryLine.findMany({
        where: {
          accountId,
          cashEntry: {
            status: 'ACTIVE',
            ...(dateFilter ? { voucherDate: dateFilter } : {}),
          },
        },
        include: { cashEntry: { select: { voucherNo: true, voucherDate: true } } },
        orderBy: { cashEntry: { voucherDate: 'asc' } },
      }),
    ]);

    // Build a unified timeline
    type HistoryEntry = {
      date: Date;
      type: string;       // 'SALE' | 'ADVANCE' | 'DUE_PAYMENT' | 'CASH_RECEIPT' | 'CASH_PAYMENT'
      voucherNo: string;
      debit: number;       // Increases what customer owes (sale due)
      credit: number;      // Decreases what customer owes (payment)
      details: string;
    };

    const history: HistoryEntry[] = [];

    // Sales → debit (customer owes more)
    for (const s of sales) {
      const due = Number(s.dueAmount || 0);
      if (due > 0) {
        history.push({
          date: new Date(s.voucherDate),
          type: 'SALE',
          voucherNo: s.voucherNo,
          debit: due,
          credit: 0,
          details: `Sale ₹${Number(s.voucherAmount).toLocaleString('en-IN')}, Paid ₹${Number(s.paymentAmount).toLocaleString('en-IN')}`,
        });
      }
      // If advance was used in this sale
      const adv = Number(s.advanceAmount || 0);
      if (adv > 0) {
        history.push({
          date: new Date(s.voucherDate),
          type: 'ADVANCE_USED',
          voucherNo: s.voucherNo,
          debit: 0,
          credit: adv,
          details: `Advance applied to sale ${s.voucherNo}`,
        });
      }
    }

    // Customer payments → credit (customer pays, balance decreases)
    for (const p of payments) {
      history.push({
        date: new Date(p.paymentDate),
        type: p.paymentType,
        voucherNo: p.receiptNo,
        debit: 0,
        credit: Number(p.totalAmount),
        details: p.narration || `${p.paymentType === 'ADVANCE' ? 'Advance' : 'Due'} payment`,
      });
    }

    // Cash entries
    for (const ce of cashEntries) {
      history.push({
        date: new Date(ce.cashEntry.voucherDate),
        type: ce.crDr === 'CR' ? 'CASH_RECEIPT' : 'CASH_PAYMENT',
        voucherNo: ce.cashEntry.voucherNo,
        debit: ce.crDr === 'DR' ? Number(ce.amount) : 0,
        credit: ce.crDr === 'CR' ? Number(ce.amount) : 0,
        details: ce.narration || 'Cash entry',
      });
    }

    // Sort by date
    history.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate running balance
    let runningBalance = 0;
    const timeline = history.map((h) => {
      runningBalance += h.debit - h.credit;
      return { ...h, balance: runningBalance };
    });

    res.json({
      account,
      currentBalance: Number(account.closingBalance),
      balanceType: account.balanceType,
      history: timeline,
    });
  } catch (error) {
    console.error('Error fetching balance history:', error);
    res.status(500).json({ error: 'Failed to fetch balance history' });
  }
});

// ============================================================
// POST /api/customer-payments - Record a customer payment
// ============================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.accountId) {
      return res.status(400).json({ error: 'Customer (accountId) is required' });
    }

    const totalAmount = Number(data.cashAmount || 0) + Number(data.bankAmount || 0) + Number(data.cardAmount || 0);
    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero' });
    }

    if (!data.paymentType || !['ADVANCE', 'DUE_PAYMENT'].includes(data.paymentType)) {
      return res.status(400).json({ error: 'Payment type must be ADVANCE or DUE_PAYMENT' });
    }

    // Generate receipt number
    const sequence = await prisma.voucherSequence.upsert({
      where: {
        prefix_entityType_financialYear: {
          prefix: 'CPR',
          entityType: 'CUSTOMER_PAYMENT',
          financialYear: data.financialYear || '2025-2026',
        },
      },
      update: { lastNumber: { increment: 1 } },
      create: {
        prefix: 'CPR',
        entityType: 'CUSTOMER_PAYMENT',
        financialYear: data.financialYear || '2025-2026',
        lastNumber: 1,
      },
    });

    const receiptNo = `CPR/${sequence.lastNumber}`;

    const payment = await prisma.$transaction(async (tx) => {
      // Get current customer balance
      const account = await tx.account.findUnique({
        where: { id: data.accountId },
        select: { closingBalance: true, balanceType: true },
      });

      if (!account) throw new Error('Account not found');

      const balanceBefore = Number(account.closingBalance);

      // For ADVANCE: customer is paying before a purchase → closingBalance decreases (goes negative = credit)
      // For DUE_PAYMENT: customer is paying outstanding → closingBalance decreases
      const balanceAfter = balanceBefore - totalAmount;

      // Create the payment record
      const paymentRecord = await tx.customerPayment.create({
        data: {
          receiptNo,
          receiptPrefix: 'CPR',
          receiptNumber: sequence.lastNumber,
          paymentDate: new Date(data.paymentDate || new Date()),
          accountId: data.accountId,
          paymentType: data.paymentType,
          cashAmount: data.cashAmount || 0,
          bankAmount: data.bankAmount || 0,
          cardAmount: data.cardAmount || 0,
          totalAmount,
          balanceBefore,
          balanceAfter,
          salesVoucherId: data.salesVoucherId || null,
          bankName: data.bankName || null,
          chequeNo: data.chequeNo || null,
          narration: data.narration || null,
          reference: data.reference || null,
        },
      });

      // Update customer's closing balance
      await tx.account.update({
        where: { id: data.accountId },
        data: {
          closingBalance: balanceAfter,
          balanceType: balanceAfter > 0 ? 'DR' : balanceAfter < 0 ? 'CR' : 'NONE',
        },
      });

      return paymentRecord;
    });

    // Fetch complete record with account
    const fullPayment = await prisma.customerPayment.findUnique({
      where: { id: payment.id },
      include: {
        account: { select: { id: true, name: true, mobile: true, closingBalance: true, balanceType: true } },
      },
    });

    res.status(201).json(fullPayment);
  } catch (error: any) {
    console.error('Error creating customer payment:', error);
    if (error.message === 'Account not found') {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.status(500).json({ error: 'Failed to create customer payment' });
  }
});

// ============================================================
// DELETE /api/customer-payments/:id - Cancel a payment
// ============================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const paymentId = Number(req.params.id);

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.customerPayment.findUnique({
        where: { id: paymentId },
      });

      if (!payment) throw new Error('NOT_FOUND');
      if (payment.status !== 'ACTIVE') throw new Error('ALREADY_CANCELLED');

      // Reverse the balance change: add back the payment amount
      await tx.account.update({
        where: { id: payment.accountId },
        data: {
          closingBalance: {
            increment: Number(payment.totalAmount),
          },
        },
      });

      // Re-evaluate balance type after reversal
      const updatedAccount = await tx.account.findUnique({
        where: { id: payment.accountId },
        select: { closingBalance: true },
      });

      if (updatedAccount) {
        const bal = Number(updatedAccount.closingBalance);
        await tx.account.update({
          where: { id: payment.accountId },
          data: {
            balanceType: bal > 0 ? 'DR' : bal < 0 ? 'CR' : 'NONE',
          },
        });
      }

      // Mark payment as cancelled
      await tx.customerPayment.update({
        where: { id: paymentId },
        data: { status: 'CANCELLED' },
      });

      return { message: 'Payment cancelled successfully' };
    });

    res.json(result);
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (error.message === 'ALREADY_CANCELLED') {
      return res.status(400).json({ error: 'Payment is already cancelled' });
    }
    console.error('Error cancelling payment:', error);
    res.status(500).json({ error: 'Failed to cancel payment' });
  }
});

export default router;
