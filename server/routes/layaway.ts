import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, tenantScope, canAccessBranch } from '../middleware/branchAccess';

const router = Router();

router.use(authenticate);

// ─── Helpers ────────────────────────────────────────────────

async function recordStatusHistory(
  tx: any,
  layawayId: number,
  fromStatus: string,
  toStatus: string,
  reason?: string,
  changedBy = 'USER',
) {
  await tx.layawayStatusHistory.create({
    data: { layawayId, fromStatus, toStatus, reason: reason || null, changedBy },
  });
}

function deriveStatus(voucherAmount: number, paymentAmount: number, currentStatus: string): string {
  if (currentStatus === 'CANCELLED' || currentStatus === 'CONVERTED' || currentStatus === 'EXPIRED') {
    return currentStatus;
  }
  if (paymentAmount <= 0) return 'ACTIVE';
  if (paymentAmount >= voucherAmount) return 'READY_FOR_CONVERSION';
  return 'PARTIALLY_PAID';
}

// ============================================================
// GET /api/layaway - List layaway entries
// ============================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, customerId, salesmanName, status, search } = req.query;
    const where: any = { ...tenantScope(req) };

    if (status && status !== 'ALL') where.status = status;
    if (customerId) where.accountId = Number(customerId);
    if (salesmanName && salesmanName !== 'All') where.salesmanName = salesmanName;

    if (dateFrom && dateTo) {
      where.voucherDate = {
        gte: new Date(dateFrom + 'T00:00:00'),
        lte: new Date(dateTo + 'T23:59:59.999'),
      };
    }

    if (search) {
      where.OR = [
        { voucherNo: { contains: search as string, mode: 'insensitive' } },
        { account: { name: { contains: search as string, mode: 'insensitive' } } },
        { account: { mobile: { contains: search as string } } },
      ];
    }

    const entries = await prisma.layawayEntry.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, mobile: true, closingBalance: true, balanceType: true } },
        branch: { select: { name: true } },
        items: { include: { label: { select: { id: true, labelNo: true, status: true } } } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
      orderBy: { voucherDate: 'desc' },
    });

    const totalAmount = entries.reduce((sum, e) => sum + Number(e.voucherAmount), 0);
    res.json({ entries, totalAmount });
  } catch (error) {
    console.error('Error fetching layaway entries:', error);
    res.status(500).json({ error: 'Failed to fetch layaway entries' });
  }
});

// ============================================================
// GET /api/layaway/:id - Get single layaway entry
// ============================================================
// ============================================================
// GET /api/layaway/by-voucher?voucherNo=LY%2F5
// Lookup a layaway entry by its voucher number. Uses a query
// parameter (not a path segment) because real-world voucher
// numbers contain '/' characters which Express normalises into
// path separators even when URL-encoded.
// ============================================================
router.get('/by-voucher', async (req: Request, res: Response) => {
  try {
    const voucherNo = String(req.query.voucherNo || '').trim();
    if (!voucherNo) return res.status(400).json({ error: 'voucherNo is required' });

    const entry = await prisma.layawayEntry.findFirst({
      where: { voucherNo, ...tenantScope(req) },
      include: {
        account: true,
        branch: { select: { name: true } },
        items: {
          include: {
            label: { include: { item: { include: { purity: true, metalType: true, itemGroup: true } } } },
          },
        },
        payments: { orderBy: { paymentDate: 'desc' } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
      },
    });

    if (!entry) return res.status(404).json({ error: 'Layaway entry not found' });
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch layaway entry' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const entry = await prisma.layawayEntry.findFirst({
      where: { id, ...tenantScope(req) },
      include: {
        account: true,
        branch: { select: { name: true } },
        items: {
          include: {
            label: { include: { item: { include: { purity: true, metalType: true, itemGroup: true } } } },
          },
        },
        payments: { orderBy: { paymentDate: 'desc' } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
      },
    });

    if (!entry) return res.status(404).json({ error: 'Layaway entry not found' });
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch layaway entry' });
  }
});

// ============================================================
// GET /api/layaway/:id/conversion-preview
// Returns current metal rates, per-item variance, and balance due
// ============================================================
router.get('/:id/conversion-preview', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const entry = await prisma.layawayEntry.findFirst({
      where: { id, ...tenantScope(req) },
      include: {
        account: { select: { id: true, name: true, mobile: true } },
        items: {
          include: {
            label: {
              include: { item: { include: { purity: true, metalType: true } } },
            },
          },
        },
        payments: true,
      },
    });

    if (!entry) return res.status(404).json({ error: 'Layaway not found' });
    if (entry.status === 'CANCELLED' || entry.status === 'CONVERTED' || entry.status === 'EXPIRED') {
      return res.status(400).json({ error: `Cannot convert a layaway with status ${entry.status}` });
    }

    // Fetch latest metal rates
    const latestRates = await prisma.metalRate.findMany({
      where: { isActive: true, companyId: req.companyId },
      orderBy: { date: 'desc' },
      distinct: ['metalTypeId', 'purityCode'],
      include: { metalType: true },
    });

    const totalPaid = Number(entry.paymentAmount);
    const bookingValue = Number(entry.voucherAmount);
    const pricingModel = entry.pricingModel || 'FLOATING';

    // Compute per-item current value based on pricing model
    const itemPreviews = entry.items.map((item) => {
      const metalTypeName = item.label?.item?.metalType?.name;
      const purityCode = item.label?.item?.purity?.code;
      const currentRateRecord = latestRates.find(
        (r) => r.metalType?.name === metalTypeName && r.purityCode === purityCode,
      );
      const currentRate = currentRateRecord ? Number(currentRateRecord.rate) : 0;
      const bookingRate = Number(item.metalRate);

      const netWt = Number(item.netWeight);
      const purityPct = Number(item.label?.item?.purity?.percentage || 0);
      const fineWt = (netWt * purityPct) / 100;
      const labourAmt = Number(item.labourAmount);
      const otherAmt = Number(item.otherCharge);
      const bookingItemValue = Number(item.totalAmount);

      let currentItemValue = bookingItemValue;

      if (pricingModel === 'FLOATING') {
        // Recalculate entirely at current rate
        const currentMetalAmt = fineWt * currentRate;
        currentItemValue = currentMetalAmt + labourAmt + otherAmt;
      } else if (pricingModel === 'HYBRID') {
        // Metal value at current rate, making charges locked
        const currentMetalAmt = fineWt * currentRate;
        const bookingMetalAmt = Number(item.metalAmount);
        currentItemValue = bookingItemValue - bookingMetalAmt + currentMetalAmt;
      }
      // LOCKED: currentItemValue = bookingItemValue (no change)

      const variance = currentItemValue - bookingItemValue;

      return {
        id: item.id,
        labelNo: item.labelNo,
        itemName: item.itemName,
        netWeight: netWt,
        grossWeight: Number(item.grossWeight),
        metalRateAtBooking: bookingRate,
        currentMetalRate: currentRate,
        bookingItemValue,
        currentItemValue: Math.round(currentItemValue),
        variance: Math.round(variance),
        variancePct: bookingItemValue > 0 ? Math.round((variance / bookingItemValue) * 1000) / 10 : 0,
        pricingModel,
      };
    });

    const totalCurrentValue = itemPreviews.reduce((s, i) => s + i.currentItemValue, 0);
    const totalVariance = totalCurrentValue - bookingValue;
    const finalBalanceDue = totalCurrentValue - totalPaid;

    res.json({
      id: entry.id,
      voucherNo: entry.voucherNo,
      customer: entry.account,
      pricingModel,
      bookingValue,
      totalCurrentValue,
      totalVariance,
      totalPaid,
      balanceDue: Math.max(0, finalBalanceDue),
      items: itemPreviews,
      status: entry.status,
    });
  } catch (error) {
    console.error('Conversion preview error:', error);
    res.status(500).json({ error: 'Failed to generate conversion preview' });
  }
});

// ============================================================
// POST /api/layaway - Create layaway entry (with items)
// ============================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.accountId) return res.status(400).json({ error: 'Customer is required' });
    if (!data.items || data.items.length === 0) return res.status(400).json({ error: 'At least one item is required' });
    if (!data.branchId || !canAccessBranch(req, data.branchId)) {
      return res.status(403).json({ error: 'Access denied to target branch' });
    }

    // Validate all items have required fields
    for (const item of data.items) {
      if (!item.itemId) {
        return res.status(400).json({ error: `Item "${item.itemName || item.labelNo}" is missing itemId` });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Get max existing voucher number to prevent conflicts
      const maxExisting = await tx.layawayEntry.findFirst({
        where: { companyId: req.companyId!, voucherPrefix: 'LY' },
        orderBy: { voucherNumber: 'desc' },
        select: { voucherNumber: true },
      });
      const minNextNumber = (maxExisting?.voucherNumber || 0) + 1;

      let sequence = await tx.voucherSequence.upsert({
        where: {
          companyId_prefix_entityType_financialYear: {
            companyId: req.companyId!,
            prefix: 'LY',
            entityType: 'LAYAWAY',
            financialYear: data.financialYear || '2025-2026',
          },
        },
        update: { lastNumber: { increment: 1 } },
        create: {
          companyId: req.companyId!,
          prefix: 'LY',
          entityType: 'LAYAWAY',
          financialYear: data.financialYear || '2025-2026',
          lastNumber: 1,
        },
      });

      // Ensure voucher number doesn't conflict with existing entries
      let voucherNumber = sequence.lastNumber;
      if (voucherNumber < minNextNumber) {
        voucherNumber = minNextNumber;
        await tx.voucherSequence.update({
          where: {
            companyId_prefix_entityType_financialYear: {
              companyId: req.companyId!,
              prefix: 'LY',
              entityType: 'LAYAWAY',
              financialYear: data.financialYear || '2025-2026',
            },
          },
          data: { lastNumber: voucherNumber },
        });
      }

      const voucherNo = `LY/${voucherNumber}`;
      const voucherAmount = data.voucherAmount || 0;
      const paymentAmount = data.paymentAmount || 0;
      const initialStatus = deriveStatus(voucherAmount, paymentAmount, 'ACTIVE');

      const entry = await tx.layawayEntry.create({
        data: {
          voucherNo,
          voucherPrefix: 'LY',
          voucherNumber,
          voucherDate: new Date(data.voucherDate || new Date()),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          pricingModel: data.pricingModel || 'FLOATING',
          metalRateAtBooking: data.metalRateAtBooking || 0,
          accountId: data.accountId,
          companyId: req.companyId!,
          branchId: data.branchId,
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
          voucherAmount,
          cashAmount: data.cashAmount || 0,
          bankAmount: data.bankAmount || 0,
          cardAmount: data.cardAmount || 0,
          upiAmount: data.upiAmount || 0,
          oldGoldAmount: data.oldGoldAmount || 0,
          paymentAmount,
          dueAmount: data.dueAmount || 0,
          previousOs: data.previousOs || 0,
          finalDue: data.finalDue || 0,
          narration: data.narration || null,
          reference: data.reference || null,
          bookName: data.bookName || null,
          status: initialStatus as any,
        },
      });

      // Record initial status
      await recordStatusHistory(tx, entry.id, 'NEW', initialStatus, 'Layaway booking created');

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

        if (item.labelId) {
          const label = await tx.label.findUnique({ where: { id: item.labelId }, select: { pcsCount: true, grossWeight: true, netWeight: true } });
          if (!label) throw new Error(`Label not found: ${item.labelId}`);
          const layawayPcs = item.pcs || 1;
          if (layawayPcs > label.pcsCount) {
            throw new Error(`Label ${item.labelNo} has only ${label.pcsCount} pcs in stock`);
          }
          const remainingPcs = label.pcsCount - layawayPcs;
          // Decrement weights by reserved weights so the label's remaining
          // gross/net reflects what is still physically in stock. Only
          // applied when both label and reserved item weights are positive
          // (legacy fixtures may omit weight fields).
          const reservedGross = Number(item.grossWeight) || 0;
          const reservedNet = Number(item.netWeight) || 0;
          const labelGross = Number(label.grossWeight) || 0;
          const labelNet = Number(label.netWeight) || 0;
          const updateData: any = {
            pcsCount: remainingPcs,
            ...(remainingPcs === 0 ? { status: 'LAYAWAY' } : {}),
          };
          if (labelGross > 0 && reservedGross > 0) {
            if (reservedGross > labelGross + 1e-6) {
              throw new Error(`Label ${item.labelNo} has only ${labelGross}g gross in stock`);
            }
            updateData.grossWeight = remainingPcs === 0 ? 0 : Math.max(0, labelGross - reservedGross);
          }
          if (labelNet > 0 && reservedNet > 0) {
            if (reservedNet > labelNet + 1e-6) {
              throw new Error(`Label ${item.labelNo} has only ${labelNet}g net in stock`);
            }
            updateData.netWeight = remainingPcs === 0 ? 0 : Math.max(0, labelNet - reservedNet);
          }
          await tx.label.update({
            where: { id: item.labelId },
            data: updateData,
          });
        }
      }

      // If token/partial payment collected at booking, record it
      if (paymentAmount > 0) {
        await tx.layawayPayment.create({
          data: {
            layawayId: entry.id,
            amount: paymentAmount,
            paymentMode: data.cashAmount > 0 ? 'Cash' : data.upiAmount > 0 ? 'UPI' : data.bankAmount > 0 ? 'Bank' : 'Card',
            paymentDate: new Date(data.voucherDate || new Date()),
            narration: 'Token / initial payment at booking',
          },
        });
      }

      // Update customer balance (debit due amount)
      if (data.dueAmount && data.dueAmount > 0) {
        await tx.account.update({
          where: { id: data.accountId },
          data: { closingBalance: { increment: data.dueAmount }, balanceType: 'DR' },
        });
      }

      return entry;
    });

    const fullEntry = await prisma.layawayEntry.findUnique({
      where: { id: result.id },
      include: { account: true, items: true, payments: true, statusHistory: true },
    });

    res.status(201).json(fullEntry);
  } catch (error: any) {
    console.error('Error creating layaway entry:', error);
    res.status(500).json({ error: error?.message || 'Failed to create layaway entry' });
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
      return res.status(400).json({ error: 'Payment amount must be greater than zero' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const layaway = await tx.layawayEntry.findFirst({
        where: { id: layawayId, ...tenantScope(req) },
      });
      if (!layaway) throw new Error('Layaway not found');
      if (['CANCELLED', 'CONVERTED', 'EXPIRED'].includes(layaway.status)) {
        throw new Error(`Cannot collect payment on a ${layaway.status} layaway`);
      }

      const newPaymentTotal = Number(layaway.paymentAmount) + Number(data.amount);
      const voucherAmount = Number(layaway.voucherAmount);
      if (newPaymentTotal > voucherAmount) {
        throw new Error(`Payment of ₹${data.amount} would exceed booking value ₹${voucherAmount}. Balance due is ₹${voucherAmount - Number(layaway.paymentAmount)}`);
      }

      const payment = await tx.layawayPayment.create({
        data: {
          layawayId,
          amount: data.amount,
          paymentMode: data.paymentMode || 'Cash',
          paymentDate: new Date(data.paymentDate || new Date()),
          reference: data.reference || null,
          narration: data.narration || null,
        },
      });

      const newDue = voucherAmount - newPaymentTotal;
      const newStatus = deriveStatus(voucherAmount, newPaymentTotal, layaway.status);

      // Build payment mode increment
      const mode = (data.paymentMode || 'Cash') as string;
      const modeIncrement: Record<string, any> = {};
      if (mode === 'Cash') modeIncrement.cashAmount = { increment: Number(data.amount) };
      else if (mode === 'Bank') modeIncrement.bankAmount = { increment: Number(data.amount) };
      else if (mode === 'Card') modeIncrement.cardAmount = { increment: Number(data.amount) };
      else if (mode === 'UPI') modeIncrement.upiAmount = { increment: Number(data.amount) };
      else modeIncrement.cashAmount = { increment: Number(data.amount) };

      const updated = await tx.layawayEntry.update({
        where: { id: layawayId },
        data: {
          paymentAmount: newPaymentTotal,
          dueAmount: newDue,
          finalDue: newDue,
          status: newStatus as any,
          ...modeIncrement,
        },
      });

      if (newStatus !== layaway.status) {
        await recordStatusHistory(tx, layawayId, layaway.status, newStatus,
          `Payment of ₹${data.amount} collected`);
      }

      // Update customer balance
      await tx.account.update({
        where: { id: layaway.accountId },
        data: { closingBalance: { decrement: Number(data.amount) } },
      });

      return { payment, layaway: updated };
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Error adding payment:', error);
    res.status(error.message?.includes('exceed') ? 400 : 500)
      .json({ error: error.message || 'Failed to add payment' });
  }
});

// ============================================================
// POST /api/layaway/:id/convert - Convert layaway to sale
// Marks layaway as CONVERTED, releases labels to SOLD
// ============================================================
router.post('/:id/convert', async (req: Request, res: Response) => {
  try {
    const layawayId = Number(req.params.id);
    const data = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const layaway = await tx.layawayEntry.findFirst({
        where: { id: layawayId, ...tenantScope(req) },
        include: { items: true },
      });
      if (!layaway) throw new Error('Layaway not found');
      if (!['ACTIVE', 'PARTIALLY_PAID', 'READY_FOR_CONVERSION', 'OVERDUE'].includes(layaway.status)) {
        throw new Error(`Layaway status ${layaway.status} cannot be converted`);
      }

      // Record any final balance payment
      if (data.finalPaymentAmount && data.finalPaymentAmount > 0) {
        await tx.layawayPayment.create({
          data: {
            layawayId,
            amount: data.finalPaymentAmount,
            paymentMode: data.finalPaymentMode || 'Cash',
            paymentDate: new Date(),
            narration: 'Final balance payment at conversion',
          },
        });
        await tx.account.update({
          where: { id: layaway.accountId },
          data: { closingBalance: { decrement: Number(data.finalPaymentAmount) } },
        });
      }

      // Release all reserved labels → SOLD only when pcsCount is exactly 0
      for (const item of layaway.items) {
        if (item.labelId) {
          const label = await tx.label.findUnique({ where: { id: item.labelId }, select: { pcsCount: true } });
          // Only mark as SOLD when ALL pieces are sold (pcsCount === 0)
          if (label && label.pcsCount === 0) {
            await tx.label.update({
              where: { id: item.labelId },
              data: { status: 'SOLD' },
            });
          } else if (label && label.pcsCount > 0) {
            // Ensure it stays IN_STOCK if there are remaining pieces
            await tx.label.update({
              where: { id: item.labelId },
              data: { status: 'IN_STOCK' },
            });
          }
        }
      }

      // Generate a fresh JGI sales voucher number so the converted
      // sale joins the regular sales-voucher series instead of reusing
      // the LY/N booking number. Customer payments + ledger entries
      // can then be re-keyed against this number for a single source
      // of truth across the lifecycle.
      const salesPrefix = 'JGI';
      const financialYear = data.financialYear || '2025-2026';

      // Allocate a collision-safe sales voucher number. Production data may
      // contain SalesVoucher rows whose `voucherNumber` is ahead of the
      // VoucherSequence row (legacy imports, seeds, or older code paths that
      // bypassed the sequence). Bumping the sequence past MAX(voucherNumber)
      // before incrementing prevents "Unique constraint failed (voucherNo)".
      const maxExisting = await tx.salesVoucher.aggregate({
        where: { companyId: req.companyId!, voucherPrefix: salesPrefix },
        _max: { voucherNumber: true },
      });
      const maxNumber = maxExisting._max.voucherNumber ?? 0;

      let saleSeq = await tx.voucherSequence.upsert({
        where: {
          companyId_prefix_entityType_financialYear: {
            companyId: req.companyId!,
            prefix: salesPrefix,
            entityType: 'SALES',
            financialYear,
          },
        },
        update: { lastNumber: { increment: 1 } },
        create: {
          companyId: req.companyId!,
          prefix: salesPrefix,
          entityType: 'SALES',
          financialYear,
          lastNumber: Math.max(1, maxNumber + 1),
        },
      });

      if (saleSeq.lastNumber <= maxNumber) {
        saleSeq = await tx.voucherSequence.update({
          where: {
            companyId_prefix_entityType_financialYear: {
              companyId: req.companyId!,
              prefix: salesPrefix,
              entityType: 'SALES',
              financialYear,
            },
          },
          data: { lastNumber: maxNumber + 1 },
        });
      }
      const saleVoucherNo = `${salesPrefix}/${saleSeq.lastNumber}`;
      const voucherPrefix = salesPrefix;
      const voucherNumber = saleSeq.lastNumber;

      // Calculate total payment amount including final payment
      const finalAmt = Number(data.finalPaymentAmount) || 0;
      const totalPayment = Number(layaway.paymentAmount) + finalAmt;

      // Distribute final payment into the correct payment mode bucket
      const finalMode = (data.finalPaymentMode || 'Cash') as string;
      const saleCash = Number(layaway.cashAmount) + (finalMode === 'Cash' ? finalAmt : 0);
      const saleBank = Number(layaway.bankAmount) + (finalMode === 'Bank' ? finalAmt : 0);
      const saleCard = Number(layaway.cardAmount) + (finalMode === 'Card' ? finalAmt : 0);
      const saleUpi  = Number(layaway.upiAmount)  + (finalMode === 'UPI'  ? finalAmt : 0);
      const saleOg   = Number(layaway.oldGoldAmount) + (finalMode === 'OldGold' ? finalAmt : 0);

      // Create the SalesVoucher from layaway data
      const salesVoucher = await tx.salesVoucher.create({
        data: {
          voucherNo: saleVoucherNo,
          voucherPrefix,
          voucherNumber: voucherNumber,
          voucherDate: new Date(),
          accountId: layaway.accountId,
          salesmanId: null,
          companyId: req.companyId!,
          branchId: layaway.branchId,
          userId: req.userId!,
          totalGrossWeight: layaway.totalGrossWeight,
          totalNetWeight: layaway.totalNetWeight,
          totalPcs: layaway.totalPcs,
          metalAmount: layaway.metalAmount,
          labourAmount: layaway.labourAmount,
          otherCharge: layaway.otherCharge,
          discountStAmount: 0,
          totalAmount: layaway.totalAmount,
          taxableAmount: layaway.taxableAmount,
          cgstAmount: layaway.cgstAmount,
          sgstAmount: layaway.sgstAmount,
          igstAmount: 0,
          totalGstAmount: Number(layaway.cgstAmount) + Number(layaway.sgstAmount),
          discountPercent: 0,
          discountAmount: layaway.discountAmount,
          roundingDiscount: layaway.roundingDiscount,
          voucherAmount: layaway.voucherAmount,
          cashAmount: saleCash,
          bankAmount: saleBank,
          cardAmount: saleCard,
          upiAmount: saleUpi,
          oldGoldAmount: saleOg,
          advanceAmount: 0,
          paymentAmount: totalPayment,
          dueAmount: 0,
          previousOs: layaway.previousOs,
          finalDue: 0,
          narration: layaway.narration ? `Converted from Layaway ${layaway.voucherNo}. ${layaway.narration}` : `Converted from Layaway ${layaway.voucherNo}`,
          reference: layaway.reference,
          status: 'ACTIVE',
        },
      });

      // Create SalesItems from layaway items
      for (const item of layaway.items) {
        await tx.salesItem.create({
          data: {
            salesVoucherId: salesVoucher.id,
            labelId: item.labelId || null,
            itemId: item.itemId,
            labelNo: item.labelNo,
            itemName: item.itemName,
            grossWeight: item.grossWeight,
            netWeight: item.netWeight,
            fineWeight: item.fineWeight,
            pcs: item.pcs,
            metalRate: item.metalRate,
            metalAmount: item.metalAmount,
            diamondWeight: item.diamondWeight,
            labourRate: item.labourRate,
            labourAmount: item.labourAmount,
            otherCharge: item.otherCharge,
            discountStAmt: item.discountAmt,
            totalAmount: item.totalAmount,
            taxableAmount: item.taxableAmount,
          },
        });
      }

      // Mark layaway CONVERTED, store generated sale voucher number
      const converted = await tx.layawayEntry.update({
        where: { id: layawayId },
        data: {
          status: 'CONVERTED',
          convertedToSaleId: saleVoucherNo,
          dueAmount: 0,
          finalDue: 0,
          ...(finalAmt > 0 ? { paymentAmount: { increment: finalAmt } } : {}),
        },
      });

      await recordStatusHistory(tx, layawayId, layaway.status, 'CONVERTED',
        `Converted to sale ${saleVoucherNo}`);

      return { converted, saleVoucherNo, saleVoucherId: salesVoucher.id };
    });

    res.json({
      message: 'Layaway converted successfully',
      layaway: result.converted,
      saleVoucherNo: result.saleVoucherNo,
      saleVoucherId: result.saleVoucherId,
    });
  } catch (error: any) {
    console.error('Error converting layaway:', error);
    res.status(400).json({ error: error.message || 'Failed to convert layaway' });
  }
});

// ============================================================
// PUT /api/layaway/:id - Update layaway entry
// ============================================================
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const data = req.body;

    const entry = await prisma.layawayEntry.findFirst({
      where: { id, ...tenantScope(req) },
      include: { items: true },
    });
    if (!entry) return res.status(404).json({ error: 'Layaway entry not found' });
    if (entry.status === 'CANCELLED' || entry.status === 'CONVERTED') {
      return res.status(400).json({ error: `Cannot modify a ${entry.status} layaway` });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Restore old label pcsCount
      for (const item of entry.items) {
        if (item.labelId) {
          await tx.label.update({
            where: { id: item.labelId },
            data: { pcsCount: { increment: Number(item.pcs) || 1 }, status: 'IN_STOCK' },
          });
        }
      }

      await tx.layawayItem.deleteMany({ where: { layawayEntryId: id } });

      const updatedEntry = await tx.layawayEntry.update({
        where: { id },
        data: {
          voucherDate: data.voucherDate ? new Date(data.voucherDate) : undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
          pricingModel: data.pricingModel,
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
          upiAmount: data.upiAmount || 0,
          oldGoldAmount: data.oldGoldAmount || 0,
          paymentAmount: data.paymentAmount || 0,
          dueAmount: data.dueAmount || 0,
          narration: data.narration,
        },
      });

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
            const label = await tx.label.findUnique({ where: { id: item.labelId }, select: { pcsCount: true } });
            if (!label) throw new Error(`Label not found: ${item.labelId}`);
            const layawayPcs = item.pcs || 1;
            if (layawayPcs > label.pcsCount) {
              throw new Error(`Label ${item.labelNo} has only ${label.pcsCount} pcs in stock`);
            }
            const remainingPcs = label.pcsCount - layawayPcs;
            await tx.label.update({
              where: { id: item.labelId },
              data: { pcsCount: remainingPcs, ...(remainingPcs === 0 ? { status: 'LAYAWAY' } : {}) },
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
// DELETE /api/layaway/:id - Cancel layaway → restore labels
// ============================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const entry = await prisma.layawayEntry.findFirst({
      where: { id, ...tenantScope(req) },
      include: { items: true },
    });
    if (!entry) return res.status(404).json({ error: 'Layaway entry not found' });
    if (entry.status === 'CANCELLED') return res.status(400).json({ error: 'Layaway is already cancelled' });
    if (entry.status === 'CONVERTED') return res.status(400).json({ error: 'Cannot cancel a converted layaway' });

    const prevStatus = entry.status;
    await prisma.$transaction(async (tx) => {
      for (const item of entry.items) {
        if (item.labelId) {
          await tx.label.update({
            where: { id: item.labelId },
            data: { pcsCount: { increment: Number(item.pcs) || 1 }, status: 'IN_STOCK' },
          });
        }
      }

      if (Number(entry.dueAmount) > 0) {
        await tx.account.update({
          where: { id: entry.accountId },
          data: { closingBalance: { decrement: Number(entry.dueAmount) } },
        });
      }

      await tx.layawayEntry.update({ where: { id }, data: { status: 'CANCELLED' } });
      await recordStatusHistory(tx, id, prevStatus, 'CANCELLED',
        req.body?.reason || 'Cancelled by user');
    });

    res.json({ message: 'Layaway cancelled and items restored to stock' });
  } catch (error) {
    console.error('Error cancelling layaway:', error);
    res.status(500).json({ error: 'Failed to cancel layaway' });
  }
});

export default router;
