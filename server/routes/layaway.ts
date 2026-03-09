import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

// ============================================================
// GET /api/layaway - List layaway entries
// ============================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      dateFrom,
      dateTo,
      customerId,
      salesmanName,
      status,
      search,
    } = req.query;

    const where: any = {};

    if (status && status !== 'ALL') where.status = status;
    if (customerId) where.accountId = Number(customerId);
    if (salesmanName && salesmanName !== 'All') where.salesmanName = salesmanName;

    if (dateFrom && dateTo) {
      where.voucherDate = {
        gte: new Date(dateFrom as string),
        lte: new Date(new Date(dateTo as string).setHours(23, 59, 59, 999)),
      };
    }

    if (search) {
      where.OR = [
        { voucherNo: { contains: search as string, mode: 'insensitive' } },
        { account: { name: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    const entries = await prisma.layawayEntry.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, mobile: true, closingBalance: true } },
        branch: { select: { name: true } },
        items: {
          include: {
            label: { select: { id: true, labelNo: true, status: true } },
          },
        },
        payments: true,
      },
      orderBy: { voucherDate: 'desc' },
    });

    const totalAmount = entries.reduce(
      (sum, e) => sum + Number(e.voucherAmount),
      0,
    );

    res.json({ entries, totalAmount });
  } catch (error) {
    console.error('Error fetching layaway entries:', error);
    res.status(500).json({ error: 'Failed to fetch layaway entries' });
  }
});

// ============================================================
// GET /api/layaway/:id - Get single layaway entry
// ============================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const entry = await prisma.layawayEntry.findUnique({
      where: { id },
      include: {
        account: true,
        branch: { select: { name: true } },
        items: {
          include: {
            label: {
              include: {
                item: { include: { purity: true, metalType: true, itemGroup: true } },
              },
            },
          },
        },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });

    if (!entry) {
      return res.status(404).json({ error: 'Layaway entry not found' });
    }

    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch layaway entry' });
  }
});

// ============================================================
// POST /api/layaway - Create layaway entry (with items)
// ============================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.accountId) {
      return res.status(400).json({ error: 'Customer is required' });
    }
    if (!data.items || data.items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Generate voucher number
      const sequence = await tx.voucherSequence.upsert({
        where: {
          prefix_entityType_financialYear: {
            prefix: 'LY',
            entityType: 'LAYAWAY',
            financialYear: data.financialYear || '2025-2026',
          },
        },
        update: { lastNumber: { increment: 1 } },
        create: {
          prefix: 'LY',
          entityType: 'LAYAWAY',
          financialYear: data.financialYear || '2025-2026',
          lastNumber: 1,
        },
      });

      const voucherNo = `LY/${sequence.lastNumber}`;

      // Create the layaway entry
      const entry = await tx.layawayEntry.create({
        data: {
          voucherNo,
          voucherPrefix: 'LY',
          voucherNumber: sequence.lastNumber,
          voucherDate: new Date(data.voucherDate || new Date()),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          accountId: data.accountId,
          branchId: data.branchId || 1,
          salesmanName: data.salesmanName || null,
          totalGrossWeight: data.totalGrossWeight || 0,
          totalNetWeight: data.totalNetWeight || 0,
          totalFineWeight: data.totalFineWeight || 0,
          totalPcs: data.totalPcs || 0,
          metalAmount: data.metalAmount || 0,
          labourAmount: data.labourAmount || 0,
          otherCharge: data.otherCharge || 0,
          discountAmount: data.discountAmount || 0,
          taxableAmount: data.taxableAmount || 0,
          cgstAmount: data.cgstAmount || 0,
          sgstAmount: data.sgstAmount || 0,
          totalAmount: data.totalAmount || 0,
          roundingDiscount: data.roundingDiscount || 0,
          voucherAmount: data.voucherAmount || 0,
          cashAmount: data.cashAmount || 0,
          bankAmount: data.bankAmount || 0,
          cardAmount: data.cardAmount || 0,
          oldGoldAmount: data.oldGoldAmount || 0,
          paymentAmount: data.paymentAmount || 0,
          dueAmount: data.dueAmount || 0,
          previousOs: data.previousOs || 0,
          finalDue: data.finalDue || 0,
          narration: data.narration || null,
          reference: data.reference || null,
          bookName: data.bookName || null,
        },
      });

      // Create layaway items + update label status to LAYAWAY
      for (const item of data.items) {
        await tx.layawayItem.create({
          data: {
            layawayEntryId: entry.id,
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
            discountAmt: item.discountAmt || 0,
            taxableAmount: item.taxableAmount || 0,
            totalAmount: item.totalAmount || 0,
          },
        });

        // Set label status to LAYAWAY (removes from stock)
        if (item.labelId) {
          await tx.label.update({
            where: { id: item.labelId },
            data: { status: 'LAYAWAY' },
          });
        }
      }

      // Update customer balance (debit the due amount)
      if (data.dueAmount && data.dueAmount > 0) {
        await tx.account.update({
          where: { id: data.accountId },
          data: {
            closingBalance: { increment: data.dueAmount },
            balanceType: 'DR',
          },
        });
      }

      return entry;
    });

    // Fetch the complete entry
    const fullEntry = await prisma.layawayEntry.findUnique({
      where: { id: result.id },
      include: {
        account: true,
        items: true,
        payments: true,
      },
    });

    res.status(201).json(fullEntry);
  } catch (error) {
    console.error('Error creating layaway entry:', error);
    res.status(500).json({ error: 'Failed to create layaway entry' });
  }
});

// ============================================================
// PUT /api/layaway/:id - Update layaway entry
// ============================================================
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const data = req.body;

    const entry = await prisma.layawayEntry.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!entry) {
      return res.status(404).json({ error: 'Layaway entry not found' });
    }

    if (entry.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Cannot modify a cancelled layaway' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Restore old label statuses to IN_STOCK
      for (const item of entry.items) {
        if (item.labelId) {
          await tx.label.update({
            where: { id: item.labelId },
            data: { status: 'IN_STOCK' },
          });
        }
      }

      // Delete old items
      await tx.layawayItem.deleteMany({ where: { layawayEntryId: id } });

      // Update entry fields
      const updatedEntry = await tx.layawayEntry.update({
        where: { id },
        data: {
          voucherDate: data.voucherDate ? new Date(data.voucherDate) : undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          accountId: data.accountId,
          salesmanName: data.salesmanName,
          totalGrossWeight: data.totalGrossWeight || 0,
          totalNetWeight: data.totalNetWeight || 0,
          totalFineWeight: data.totalFineWeight || 0,
          totalPcs: data.totalPcs || 0,
          metalAmount: data.metalAmount || 0,
          labourAmount: data.labourAmount || 0,
          otherCharge: data.otherCharge || 0,
          discountAmount: data.discountAmount || 0,
          taxableAmount: data.taxableAmount || 0,
          cgstAmount: data.cgstAmount || 0,
          sgstAmount: data.sgstAmount || 0,
          totalAmount: data.totalAmount || 0,
          roundingDiscount: data.roundingDiscount || 0,
          voucherAmount: data.voucherAmount || 0,
          cashAmount: data.cashAmount || 0,
          bankAmount: data.bankAmount || 0,
          cardAmount: data.cardAmount || 0,
          oldGoldAmount: data.oldGoldAmount || 0,
          paymentAmount: data.paymentAmount || 0,
          dueAmount: data.dueAmount || 0,
          narration: data.narration,
        },
      });

      // Re-create items + update labels to LAYAWAY
      if (data.items) {
        for (const item of data.items) {
          await tx.layawayItem.create({
            data: {
              layawayEntryId: id,
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
              discountAmt: item.discountAmt || 0,
              taxableAmount: item.taxableAmount || 0,
              totalAmount: item.totalAmount || 0,
            },
          });

          if (item.labelId) {
            await tx.label.update({
              where: { id: item.labelId },
              data: { status: 'LAYAWAY' },
            });
          }
        }
      }

      return updatedEntry;
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating layaway entry:', error);
    res.status(500).json({ error: 'Failed to update layaway entry' });
  }
});

// ============================================================
// DELETE /api/layaway/:id - Cancel / delete layaway
//   → Restores all label statuses back to IN_STOCK
// ============================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const entry = await prisma.layawayEntry.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!entry) {
      return res.status(404).json({ error: 'Layaway entry not found' });
    }

    if (entry.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Layaway is already cancelled' });
    }

    await prisma.$transaction(async (tx) => {
      // Restore all labels to IN_STOCK
      for (const item of entry.items) {
        if (item.labelId) {
          await tx.label.update({
            where: { id: item.labelId },
            data: { status: 'IN_STOCK' },
          });
        }
      }

      // Reverse customer balance (if due was added)
      if (Number(entry.dueAmount) > 0) {
        await tx.account.update({
          where: { id: entry.accountId },
          data: {
            closingBalance: { decrement: Number(entry.dueAmount) },
          },
        });
      }

      // Mark as cancelled
      await tx.layawayEntry.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    });

    res.json({ message: 'Layaway cancelled and items restored to stock' });
  } catch (error) {
    console.error('Error cancelling layaway:', error);
    res.status(500).json({ error: 'Failed to cancel layaway' });
  }
});

// ============================================================
// POST /api/layaway/:id/payment - Add payment to layaway
// ============================================================
router.post('/:id/payment', async (req: Request, res: Response) => {
  try {
    const layawayId = Number(req.params.id);
    const data = req.body;

    if (!data.amount || data.amount <= 0) {
      return res.status(400).json({ error: 'Payment amount is required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.layawayPayment.create({
        data: {
          layawayId,
          amount: data.amount,
          paymentMode: data.paymentMode || 'Cash',
          paymentDate: new Date(data.paymentDate || new Date()),
          reference: data.reference,
          narration: data.narration,
        },
      });

      // Update layaway payment totals
      const layaway = await tx.layawayEntry.update({
        where: { id: layawayId },
        data: {
          paymentAmount: { increment: data.amount },
          dueAmount: { decrement: data.amount },
          finalDue: { decrement: data.amount },
        },
      });

      // Update customer balance
      await tx.account.update({
        where: { id: layaway.accountId },
        data: {
          closingBalance: { decrement: data.amount },
        },
      });

      // Check if fully paid → complete
      if (Number(layaway.dueAmount) <= 0) {
        await tx.layawayEntry.update({
          where: { id: layawayId },
          data: { status: 'COMPLETED' },
        });
      }

      return { payment, layaway };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error adding payment:', error);
    res.status(500).json({ error: 'Failed to add payment' });
  }
});

export default router;
