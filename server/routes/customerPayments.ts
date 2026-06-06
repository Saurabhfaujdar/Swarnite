import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { authenticate, tenantScope } from '../middleware/branchAccess';

const router = Router();

router.use(authenticate);

// ============================================================
// GET /api/customer-payments - List payments with filters
// Includes standalone customer payments, sale payments, and layaway payments
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
      sortOrder = 'desc',
      page = '1',
      limit = '50',
    } = req.query;

    const pageNum = Math.max(1, Number(page));
    const pageSize = Math.min(100, Math.max(1, Number(limit)));
    const typeFilter = (paymentType as string) || 'ALL';
    const statusFilter = (status as string) || 'ALL';
    const searchStr = search ? String(search) : undefined;

    // Common date filter builder
    const dateFilter = (dateFrom || dateTo) ? {
      ...(dateFrom ? { gte: new Date(dateFrom as string) } : {}),
      ...(dateTo ? { lte: (() => { const d = new Date(dateTo as string); d.setHours(23, 59, 59, 999); return d; })() } : {}),
    } : undefined;

    // Determine which sources to query based on type filter
    const queryPayments = typeFilter === 'ALL' || typeFilter === 'ADVANCE' || typeFilter === 'DUE_PAYMENT' || typeFilter === 'REFUND';
    const querySales = typeFilter === 'ALL' || typeFilter === 'SALE';
    const queryLayaway = typeFilter === 'ALL' || typeFilter === 'LAYAWAY';

    const accountSelect = { id: true, name: true, mobile: true, closingBalance: true, balanceType: true } as const;
    const allResults: any[] = [];

    // 1. Query CustomerPayments
    if (queryPayments) {
      const where: Prisma.CustomerPaymentWhereInput = { companyId: req.companyId };
      if (accountId) where.accountId = Number(accountId);
      if (typeFilter === 'ADVANCE') where.paymentType = 'ADVANCE';
      if (typeFilter === 'DUE_PAYMENT') where.paymentType = 'DUE_PAYMENT';
      if (typeFilter === 'REFUND') where.paymentType = 'REFUND';
      if (statusFilter !== 'ALL') where.status = statusFilter as any;
      if (dateFilter) where.paymentDate = dateFilter;
      if (searchStr) {
        where.OR = [
          { receiptNo: { contains: searchStr, mode: 'insensitive' } },
          { narration: { contains: searchStr, mode: 'insensitive' } },
          { reference: { contains: searchStr, mode: 'insensitive' } },
          { account: { name: { contains: searchStr, mode: 'insensitive' } } },
        ];
      }

      const payments = await prisma.customerPayment.findMany({
        where,
        include: { account: { select: accountSelect } },
      });

      for (const p of payments) {
        allResults.push({
          id: p.id,
          receiptNo: p.receiptNo,
          paymentDate: p.paymentDate,
          source: 'PAYMENT',
          paymentType: p.paymentType,
          account: p.account,
          cashAmount: p.cashAmount,
          bankAmount: p.bankAmount,
          cardAmount: p.cardAmount,
          upiAmount: p.upiAmount,
          totalAmount: p.totalAmount,
          balanceBefore: p.balanceBefore,
          balanceAfter: p.balanceAfter,
          status: p.status,
          narration: p.narration,
        });
      }
    }

    // 2. Query SalesVoucher payments (only ACTIVE sales with payment > 0)
    //
    // For sales that were converted from a layaway, fold the historical
    // LayawayPayment rows in as `children` of the sale row (consolidated
    // pattern, same as schemes below). The sale's own cash/bank/card/upi
    // already equal sum(layaway payments + final payment) — see
    // routes/layaway.ts convert flow — so the consolidated parent totals
    // line up exactly with the sum of its children. The standalone
    // LAYAWAY query (block 3) skips these payments so they don't appear
    // twice on the page.
    const convertedLayawayPaymentIds = new Set<number>();
    if (querySales && (statusFilter === 'ALL' || statusFilter === 'ACTIVE')) {
      const salesWhere: Prisma.SalesVoucherWhereInput = {
        companyId: req.companyId,
        status: 'ACTIVE',
        paymentAmount: { gt: 0 },
      };
      if (accountId) salesWhere.accountId = Number(accountId);
      if (dateFilter) salesWhere.voucherDate = dateFilter;
      if (searchStr) {
        salesWhere.OR = [
          { voucherNo: { contains: searchStr, mode: 'insensitive' } },
          { account: { name: { contains: searchStr, mode: 'insensitive' } } },
        ];
      }

      const sales = await prisma.salesVoucher.findMany({
        where: salesWhere,
        include: { account: { select: accountSelect } },
      });

      // Look up any layaways that were converted into the sales we just
      // fetched, keyed by the sale voucher number that the convert flow
      // wrote into LayawayEntry.convertedToSaleId.
      const saleVoucherNos = sales.map(s => s.voucherNo);
      const convertedLayaways = saleVoucherNos.length > 0
        ? await prisma.layawayEntry.findMany({
            where: {
              companyId: req.companyId,
              status: 'CONVERTED',
              convertedToSaleId: { in: saleVoucherNos },
            },
            include: {
              payments: { orderBy: { paymentDate: 'asc' } },
            },
          })
        : [];
      const layawayBySaleVoucher = new Map<string, typeof convertedLayaways[number]>();
      for (const ly of convertedLayaways) {
        if (ly.convertedToSaleId) layawayBySaleVoucher.set(ly.convertedToSaleId, ly);
      }

      for (const s of sales) {
        const sourceLayaway = layawayBySaleVoucher.get(s.voucherNo);
        if (sourceLayaway && sourceLayaway.payments.length > 0) {
          // Build child rows from the original LayawayPayments. Keep their
          // ORIGINAL layaway voucher number visible so audit trails stay
          // tied to the LY/N booking they were captured against.
          const children = sourceLayaway.payments.map((lp, idx) => {
            const mode = lp.paymentMode || 'Cash';
            const amt = Number(lp.amount);
            convertedLayawayPaymentIds.add(lp.id);
            const isFinal = lp.narration === 'Final balance payment at conversion';
            return {
              id: lp.id,
              receiptNo: sourceLayaway.voucherNo, // original LY/N — not the sale
              paymentDate: lp.paymentDate,
              source: 'LAYAWAY' as const,
              paymentType: 'LAYAWAY' as const,
              account: s.account,
              cashAmount: mode === 'Cash' ? amt : 0,
              bankAmount: mode === 'Bank' ? amt : 0,
              cardAmount: mode === 'Card' ? amt : 0,
              upiAmount: mode === 'UPI' ? amt : 0,
              totalAmount: amt,
              balanceBefore: 0,
              balanceAfter: 0,
              status: 'ACTIVE',
              narration: lp.narration || `Payment against layaway ${sourceLayaway.voucherNo}`,
              childLabel: isFinal ? 'Final' : `L${idx + 1}`,
            };
          });

          allResults.push({
            id: s.id,
            receiptNo: s.voucherNo,
            paymentDate: s.voucherDate,
            source: 'SALE',
            paymentType: 'SALE',
            account: s.account,
            cashAmount: s.cashAmount,
            bankAmount: s.bankAmount,
            cardAmount: s.cardAmount,
            upiAmount: s.upiAmount,
            totalAmount: s.paymentAmount,
            balanceBefore: s.previousOs,
            balanceAfter: s.finalDue,
            status: s.status,
            narration: `Payment against sale ${s.voucherNo} (converted from layaway ${sourceLayaway.voucherNo})`,
            isConsolidated: true,
            consolidationLabel: 'pmts',
            installmentCount: children.length,
            children,
          });
        } else {
          allResults.push({
            id: s.id,
            receiptNo: s.voucherNo,
            paymentDate: s.voucherDate,
            source: 'SALE',
            paymentType: 'SALE',
            account: s.account,
            cashAmount: s.cashAmount,
            bankAmount: s.bankAmount,
            cardAmount: s.cardAmount,
            upiAmount: s.upiAmount,
            totalAmount: s.paymentAmount,
            balanceBefore: s.previousOs,
            balanceAfter: s.finalDue,
            status: s.status,
            narration: `Payment against sale ${s.voucherNo}`,
          });
        }
      }
    }

    // 3. Query individual LayawayPayment records
    if (queryLayaway && (statusFilter === 'ALL' || statusFilter === 'ACTIVE')) {
      const layawayPayWhere: Prisma.LayawayPaymentWhereInput = {
        layaway: {
          companyId: req.companyId,
          status: { notIn: ['CANCELLED'] },
        },
      };
      if (accountId) layawayPayWhere.layaway = { ...layawayPayWhere.layaway as any, accountId: Number(accountId) };
      if (dateFilter) layawayPayWhere.paymentDate = dateFilter;
      if (searchStr) {
        layawayPayWhere.OR = [
          { layaway: { voucherNo: { contains: searchStr, mode: 'insensitive' } } },
          { layaway: { account: { name: { contains: searchStr, mode: 'insensitive' } } } },
          { layaway: { convertedToSaleId: { contains: searchStr, mode: 'insensitive' } } },
          { narration: { contains: searchStr, mode: 'insensitive' } },
        ];
      }

      const layawayPayments = await prisma.layawayPayment.findMany({
        where: layawayPayWhere,
        include: {
          layaway: {
            select: {
              voucherNo: true,
              status: true,
              convertedToSaleId: true,
              accountId: true,
              account: { select: accountSelect },
            },
          },
        },
      });

      for (const lp of layawayPayments) {
        // Skip payments that have already been nested under their
        // converted sale row (block 2). Avoids the audit double-count
        // where a LayawayPayment appeared both as a standalone row AND
        // inside the JGI/N sale total.
        if (convertedLayawayPaymentIds.has(lp.id)) continue;

        const mode = lp.paymentMode || 'Cash';
        const amt = Number(lp.amount);
        // Always show the ORIGINAL layaway voucher number. The earlier
        // approach of re-keying to the converted sale voucher made it
        // impossible to trace a payment back to the LY/N booking it
        // was captured against — a problem at audit time.
        allResults.push({
          id: lp.id,
          receiptNo: lp.layaway.voucherNo,
          paymentDate: lp.paymentDate,
          source: 'LAYAWAY',
          paymentType: 'LAYAWAY',
          account: lp.layaway.account,
          cashAmount: mode === 'Cash' ? amt : 0,
          bankAmount: mode === 'Bank' ? amt : 0,
          cardAmount: mode === 'Card' ? amt : 0,
          upiAmount: mode === 'UPI' ? amt : 0,
          totalAmount: amt,
          balanceBefore: 0,
          balanceAfter: 0,
          status: 'ACTIVE',
          narration: lp.narration || `Payment against layaway ${lp.layaway.voucherNo}`,
        });
      }
    }

    // 4. Query SchemeInstallment payments (PAID installments)
    //
    // Display rule: every scheme — regardless of status (ACTIVE, MATURED,
    // REDEEMED, CANCELLED) — is collapsed into a single consolidated row
    // per scheme. Individual installments are tucked under `children` so
    // the UI can expand them on demand. This keeps the Customer Payments
    // page tidy when a customer has paid many installments and behaves
    // identically across all customers regardless of where their scheme
    // is in its lifecycle.
    const queryScheme = typeFilter === 'ALL' || typeFilter === 'SCHEME';
    if (queryScheme && (statusFilter === 'ALL' || statusFilter === 'ACTIVE')) {
      const schemeInstWhere: Prisma.SchemeInstallmentWhereInput = {
        status: 'PAID',
        scheme: {
          companyId: req.companyId,
        },
      };
      if (accountId) schemeInstWhere.scheme = { ...schemeInstWhere.scheme as any, accountId: Number(accountId) };
      if (dateFilter) schemeInstWhere.paidDate = dateFilter;
      if (searchStr) {
        schemeInstWhere.OR = [
          { scheme: { schemeNo: { contains: searchStr, mode: 'insensitive' } } },
          { scheme: { account: { name: { contains: searchStr, mode: 'insensitive' } } } },
          { narration: { contains: searchStr, mode: 'insensitive' } },
        ];
      }

      const schemePayments = await prisma.schemeInstallment.findMany({
        where: schemeInstWhere,
        include: {
          scheme: {
            select: {
              id: true,
              schemeNo: true,
              status: true,
              accountId: true,
              account: { select: accountSelect },
            },
          },
        },
      });

      // Bucket installments by scheme so we can decide per-scheme whether
      // to emit a consolidated row or individual ones.
      type Installment = (typeof schemePayments)[number];
      const bySchemeId = new Map<number, Installment[]>();
      for (const si of schemePayments) {
        const list = bySchemeId.get(si.scheme.id) ?? [];
        list.push(si);
        bySchemeId.set(si.scheme.id, list);
      }

      const toRow = (si: Installment) => {
        const mode = si.paymentMode || 'Cash';
        const amt = Number(si.amount);
        return {
          id: si.id,
          receiptNo: si.scheme.schemeNo,
          paymentDate: si.paidDate || si.dueDate,
          source: 'SCHEME' as const,
          paymentType: 'SCHEME' as const,
          account: si.scheme.account,
          cashAmount: mode === 'Cash' ? amt : 0,
          bankAmount: mode === 'Bank' ? amt : 0,
          cardAmount: mode === 'Card' ? amt : 0,
          upiAmount: mode === 'UPI' ? amt : 0,
          totalAmount: amt,
          balanceBefore: 0,
          balanceAfter: 0,
          status: 'ACTIVE',
          narration: si.narration || `Scheme ${si.scheme.schemeNo} installment #${si.installmentNo}`,
          installmentNo: si.installmentNo,
        };
      };

      for (const [, installments] of bySchemeId) {
        const schemeStatus = installments[0].scheme.status; // same scheme → same status

        // Always emit a single consolidated row per scheme so every
        // customer's payments view stays uniform.
        const sortedInst = [...installments].sort(
          (a, b) =>
            new Date(a.paidDate || a.dueDate).getTime() -
            new Date(b.paidDate || b.dueDate).getTime(),
        );
        const children = sortedInst.map(toRow);
        const totals = children.reduce(
          (acc, c) => ({
            cash: acc.cash + Number(c.cashAmount),
            bank: acc.bank + Number(c.bankAmount),
            card: acc.card + Number(c.cardAmount),
            upi: acc.upi + Number(c.upiAmount),
            total: acc.total + Number(c.totalAmount),
          }),
          { cash: 0, bank: 0, card: 0, upi: 0, total: 0 },
        );
        const latest = sortedInst[sortedInst.length - 1];
        const scheme = latest.scheme;

        allResults.push({
          // Prefix with `scheme-` so React keys never collide with raw
          // installment ids and so the FE can detect consolidated rows.
          id: `scheme-${scheme.id}`,
          receiptNo: scheme.schemeNo,
          paymentDate: latest.paidDate || latest.dueDate,
          source: 'SCHEME' as const,
          paymentType: 'SCHEME' as const,
          account: scheme.account,
          cashAmount: totals.cash,
          bankAmount: totals.bank,
          cardAmount: totals.card,
          upiAmount: totals.upi,
          totalAmount: totals.total,
          balanceBefore: 0,
          balanceAfter: 0,
          status: 'ACTIVE',
          narration: `Scheme ${scheme.schemeNo} ${schemeStatus.toLowerCase()} — ${children.length} installment${children.length === 1 ? '' : 's'}`,
          isConsolidated: true,
          schemeId: scheme.id,
          schemeStatus, // 'REDEEMED' | 'CANCELLED'
          installmentCount: children.length,
          children,
        });
      }
    }

    // 5. Query Repair payments (advance + invoice payments)
    const queryRepair = typeFilter === 'ALL' || typeFilter === 'REPAIR';
    if (queryRepair && (statusFilter === 'ALL' || statusFilter === 'ACTIVE')) {
      const repairWhere: Prisma.RepairJobWhereInput = {
        companyId: req.companyId,
      };
      if (accountId) repairWhere.customerAccountId = Number(accountId);
      if (searchStr) {
        repairWhere.OR = [
          { repairNo: { contains: searchStr, mode: 'insensitive' } },
          { customerName: { contains: searchStr, mode: 'insensitive' } },
        ];
      }

      const repairJobs = await prisma.repairJob.findMany({
        where: {
          ...repairWhere,
          AND: [
            { OR: [{ advanceReceived: { gt: 0 } }, { invoice: { paidAmount: { gt: 0 } } }] },
          ],
        },
        include: {
          invoice: true,
        },
      });

      for (const rj of repairJobs) {
        const acct = { id: rj.customerAccountId || 0, name: rj.customerName, mobile: rj.customerMobile || '', closingBalance: 0, balanceType: 'DR' };

        // If there's an advance, add it as a payment row
        if (Number(rj.advanceReceived) > 0) {
          const amt = Number(rj.advanceReceived);
          const withinDateRange = !dateFilter || (
            rj.intakeDate >= (dateFilter.gte || new Date(0)) &&
            rj.intakeDate <= (dateFilter.lte || new Date('9999-12-31'))
          );
          if (withinDateRange) {
            allResults.push({
              id: `repair-adv-${rj.id}`,
              receiptNo: rj.repairNo,
              paymentDate: rj.intakeDate,
              source: 'REPAIR',
              paymentType: 'REPAIR',
              account: acct,
              cashAmount: amt,
              bankAmount: 0,
              cardAmount: 0,
              upiAmount: 0,
              totalAmount: amt,
              balanceBefore: 0,
              balanceAfter: 0,
              status: 'ACTIVE',
              narration: `Advance for repair ${rj.repairNo}`,
            });
          }
        }

        // If there's an invoice with payment beyond the advance
        if (rj.invoice && Number(rj.invoice.paidAmount) > Number(rj.advanceReceived)) {
          const invoicePaid = Number(rj.invoice.paidAmount) - Number(rj.advanceReceived);
          const withinDateRange = !dateFilter || (
            rj.invoice.invoiceDate >= (dateFilter.gte || new Date(0)) &&
            rj.invoice.invoiceDate <= (dateFilter.lte || new Date('9999-12-31'))
          );
          if (withinDateRange) {
            allResults.push({
              id: `repair-inv-${rj.invoice.id}`,
              receiptNo: rj.invoice.invoiceNo,
              paymentDate: rj.invoice.invoiceDate,
              source: 'REPAIR',
              paymentType: 'REPAIR',
              account: acct,
              cashAmount: Math.max(0, Number(rj.invoice.cashAmount) - Number(rj.advanceReceived)),
              bankAmount: Number(rj.invoice.bankAmount),
              cardAmount: Number(rj.invoice.cardAmount),
              upiAmount: Number(rj.invoice.upiAmount),
              totalAmount: invoicePaid,
              balanceBefore: 0,
              balanceAfter: 0,
              status: 'ACTIVE',
              narration: `Payment for repair invoice ${rj.invoice.invoiceNo}`,
            });
          }
        }
      }
    }

    // Sort by date
    const dirMul = sortOrder === 'asc' ? 1 : -1;
    allResults.sort((a, b) => dirMul * (new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()));

    // Paginate
    const total = allResults.length;
    const paginatedResults = allResults.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    res.json({ payments: paginatedResults, total, page: pageNum, limit: pageSize });
  } catch (error) {
    console.error('Error listing customer payments:', error);
    res.status(500).json({ error: 'Failed to list customer payments' });
  }
});

// ============================================================
// GET /api/customer-payments/balance/:accountId - Get balance history for a customer
// (Must be defined before /:id to avoid Express matching "balance" as an id)
// ============================================================
router.get('/balance/:accountId', async (req: Request, res: Response) => {
  try {
    const accountId = Number(req.params.accountId);
    const { dateFrom, dateTo } = req.query;

    const account = await prisma.account.findFirst({
      where: { id: accountId, companyId: req.companyId },
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
          bankAmount: true, cardAmount: true, upiAmount: true,
          oldGoldGross: true, oldGoldNet: true, oldGoldRate: true, oldGoldAmount: true,
          balanceBefore: true, balanceAfter: true, narration: true, reference: true,
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

    // Customer payments → credit by default (customer pays us). REFUND
    // is the inverse — we paid the customer, so it increases what they
    // owe / reduces their CR balance, i.e. a debit on the ledger.
    for (const p of payments) {
      const isRefund = p.paymentType === 'REFUND';
      const amt = Number(p.totalAmount);
      history.push({
        date: new Date(p.paymentDate),
        type: p.paymentType,
        voucherNo: p.receiptNo,
        debit: isRefund ? amt : 0,
        credit: isRefund ? 0 : amt,
        details: p.narration || (
          isRefund
            ? `Refund paid to customer${Number(p.oldGoldAmount) > 0 ? ` (incl. Old Gold ₹${Number(p.oldGoldAmount).toLocaleString('en-IN')})` : ''}`
            : `${p.paymentType === 'ADVANCE' ? 'Advance' : 'Due'} payment${Number(p.oldGoldAmount) > 0 ? ` (incl. Old Gold ₹${Number(p.oldGoldAmount).toLocaleString('en-IN')})` : ''}`
        ),
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
// GET /api/customer-payments/:id - Get single payment
// ============================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const payment = await prisma.customerPayment.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
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
// POST /api/customer-payments - Record a customer payment
// ============================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.accountId) {
      return res.status(400).json({ error: 'Customer (accountId) is required' });
    }

    // Validate old gold: if weight is provided, rate must also be provided
    const oldGoldNet = Number(data.oldGoldNet || 0);
    const oldGoldRate = Number(data.oldGoldRate || 0);
    const oldGoldAmount = oldGoldNet > 0 && oldGoldRate > 0 ? Math.round(oldGoldNet * oldGoldRate * 100) / 100 : 0;

    const totalAmount = Number(data.cashAmount || 0) + Number(data.bankAmount || 0) + Number(data.cardAmount || 0) + Number(data.upiAmount || 0) + oldGoldAmount;
    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero' });
    }

    if (!data.paymentType || !['ADVANCE', 'DUE_PAYMENT', 'REFUND'].includes(data.paymentType)) {
      return res.status(400).json({ error: 'Payment type must be ADVANCE, DUE_PAYMENT, or REFUND' });
    }
    const isRefund = data.paymentType === 'REFUND';

    const payment = await prisma.$transaction(async (tx) => {
      // Generate receipt number inside transaction to ensure rollback on failure
      const sequence = await tx.voucherSequence.upsert({
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

      const receiptNo = `CPR/${sequence.lastNumber}`;
      // Get current customer balance
      const account = await tx.account.findUnique({
        where: { id: data.accountId },
        select: { closingBalance: true, balanceType: true },
      });

      if (!account) throw new Error('Account not found');

      const balanceBefore = Number(account.closingBalance);

      // For ADVANCE / DUE_PAYMENT: customer is paying us, balance decreases
      // (CR / advance grows). For REFUND: we are paying the customer back
      // (e.g. cancelled layaway advance), so balance increases
      // (CR shrinks toward zero, or moves toward DR if we overpay).
      const balanceAfter = isRefund
        ? balanceBefore + totalAmount
        : balanceBefore - totalAmount;

      // Create the payment record
      const paymentRecord = await tx.customerPayment.create({
        data: {
          receiptNo,
          receiptPrefix: 'CPR',
          receiptNumber: sequence.lastNumber,
          paymentDate: new Date(data.paymentDate || new Date()),
          accountId: data.accountId,
          companyId: req.companyId!,
          paymentType: data.paymentType,
          cashAmount: data.cashAmount || 0,
          bankAmount: data.bankAmount || 0,
          cardAmount: data.cardAmount || 0,
          upiAmount: data.upiAmount || 0,
          oldGoldGross: data.oldGoldGross || 0,
          oldGoldNet: oldGoldNet,
          oldGoldRate: oldGoldRate,
          oldGoldAmount: oldGoldAmount,
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
      const payment = await tx.customerPayment.findFirst({
        where: { id: paymentId, companyId: req.companyId },
      });

      if (!payment) throw new Error('NOT_FOUND');
      if (payment.status !== 'ACTIVE') throw new Error('ALREADY_CANCELLED');

      // Reverse the balance change. A REFUND originally INCREASED the
      // balance (we paid the customer back), so cancelling it must
      // decrement the balance. Other payment types decreased the balance
      // and are reversed by incrementing.
      const reverseDelta = Number(payment.totalAmount);
      const isRefund = payment.paymentType === 'REFUND';
      await tx.account.update({
        where: { id: payment.accountId },
        data: {
          closingBalance: isRefund
            ? { decrement: reverseDelta }
            : { increment: reverseDelta },
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
