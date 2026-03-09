import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

// ============================================================
// CASH ENTRIES
// ============================================================

// GET /api/cash-bank/cash - List cash entries
router.get('/cash', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, type } = req.query;
    const where: any = { status: 'ACTIVE' };

    if (dateFrom && dateTo) {
      where.voucherDate = {
        gte: new Date(dateFrom as string),
        lte: new Date(dateTo as string),
      };
    }
    if (type) where.voucherType = type;

    const entries = await prisma.cashEntry.findMany({
      where,
      include: { lines: { include: { account: { select: { name: true, mobile: true } } } } },
      orderBy: { voucherDate: 'desc' },
    });

    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cash entries' });
  }
});

// POST /api/cash-bank/cash - Create cash entry
router.post('/cash', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const prefix = data.voucherType === 'RECEIPT' ? 'CI' : 'CO';

    const sequence = await prisma.voucherSequence.upsert({
      where: {
        prefix_entityType_financialYear: {
          prefix,
          entityType: 'CASH',
          financialYear: data.financialYear || '2025-2026',
        },
      },
      update: { lastNumber: { increment: 1 } },
      create: { prefix, entityType: 'CASH', financialYear: data.financialYear || '2025-2026', lastNumber: 1 },
    });

    const voucherNo = `${prefix}/${sequence.lastNumber}`;

    const entry = await prisma.$transaction(async (tx) => {
      const cashEntry = await tx.cashEntry.create({
        data: {
          voucherNo,
          voucherPrefix: prefix,
          voucherNumber: sequence.lastNumber,
          voucherDate: new Date(data.voucherDate),
          voucherType: data.voucherType,
          bookName: data.bookName || 'Cash',
          branchId: data.branchId,
          userId: data.userId,
          totalCredit: data.totalCredit || 0,
          totalDebit: data.totalDebit || 0,
          balance: data.balance || 0,
          reverseCharge: data.reverseCharge || false,
          placeOfSupply: data.placeOfSupply,
          narration: data.narration,
          reference: data.reference,
        },
      });

      // Create entry lines
      if (data.lines && data.lines.length > 0) {
        for (const line of data.lines) {
          await tx.cashEntryLine.create({
            data: {
              cashEntryId: cashEntry.id,
              crDr: line.crDr,
              accountId: line.accountId,
              date: new Date(line.date || data.voucherDate),
              amount: line.amount || 0,
              tdsAmount: line.tdsAmount || 0,
              tcsAmount: line.tcsAmount || 0,
              netAmount: line.netAmount || 0,
              gstApplicable: line.gstApplicable || false,
              narration: line.narration,
            },
          });

          // Update account balance
          const increment = line.crDr === 'CR' ? -(line.amount || 0) : (line.amount || 0);
          await tx.account.update({
            where: { id: line.accountId },
            data: { closingBalance: { increment } },
          });
        }
      }

      return cashEntry;
    });

    const fullEntry = await prisma.cashEntry.findUnique({
      where: { id: entry.id },
      include: { lines: { include: { account: true } } },
    });

    res.status(201).json(fullEntry);
  } catch (error) {
    console.error('Error creating cash entry:', error);
    res.status(500).json({ error: 'Failed to create cash entry' });
  }
});

// ============================================================
// BANK ENTRIES
// ============================================================

router.get('/bank', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where: any = { status: 'ACTIVE' };

    if (dateFrom && dateTo) {
      where.voucherDate = {
        gte: new Date(dateFrom as string),
        lte: new Date(dateTo as string),
      };
    }

    const entries = await prisma.bankEntry.findMany({
      where,
      orderBy: { voucherDate: 'desc' },
    });

    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bank entries' });
  }
});

router.post('/bank', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    const sequence = await prisma.voucherSequence.upsert({
      where: {
        prefix_entityType_financialYear: {
          prefix: 'BK',
          entityType: 'BANK',
          financialYear: data.financialYear || '2025-2026',
        },
      },
      update: { lastNumber: { increment: 1 } },
      create: { prefix: 'BK', entityType: 'BANK', financialYear: data.financialYear || '2025-2026', lastNumber: 1 },
    });

    const entry = await prisma.bankEntry.create({
      data: {
        voucherNo: `BK/${sequence.lastNumber}`,
        voucherPrefix: 'BK',
        voucherNumber: sequence.lastNumber,
        voucherDate: new Date(data.voucherDate),
        voucherType: data.voucherType,
        bookName: data.bookName,
        branchId: data.branchId,
        userId: data.userId,
        totalAmount: data.totalAmount || 0,
        narration: data.narration,
        reference: data.reference,
        chequeNo: data.chequeNo,
        chequeDate: data.chequeDate ? new Date(data.chequeDate) : null,
      },
    });

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create bank entry' });
  }
});

// ============================================================
// JOURNAL / DEBIT NOTE / CREDIT NOTE
// ============================================================

router.get('/journal', async (req: Request, res: Response) => {
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { status: 'ACTIVE' },
      include: { lines: { include: { account: true } } },
      orderBy: { voucherDate: 'desc' },
    });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

router.post('/journal', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    const sequence = await prisma.voucherSequence.upsert({
      where: {
        prefix_entityType_financialYear: {
          prefix: 'JV',
          entityType: 'JOURNAL',
          financialYear: data.financialYear || '2025-2026',
        },
      },
      update: { lastNumber: { increment: 1 } },
      create: { prefix: 'JV', entityType: 'JOURNAL', financialYear: data.financialYear || '2025-2026', lastNumber: 1 },
    });

    const entry = await prisma.$transaction(async (tx) => {
      const journal = await tx.journalEntry.create({
        data: {
          voucherNo: `JV/${sequence.lastNumber}`,
          voucherPrefix: 'JV',
          voucherNumber: sequence.lastNumber,
          voucherDate: new Date(data.voucherDate),
          entryType: data.entryType || 'JOURNAL',
          narration: data.narration,
          totalAmount: data.totalAmount || 0,
        },
      });

      for (const line of data.lines || []) {
        await tx.journalEntryLine.create({
          data: {
            journalEntryId: journal.id,
            accountId: line.accountId,
            crDr: line.crDr,
            amount: line.amount || 0,
            narration: line.narration,
          },
        });
      }

      return journal;
    });

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create journal entry' });
  }
});

export default router;
