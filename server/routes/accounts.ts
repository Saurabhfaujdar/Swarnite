import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

// ============================================================
// ACCOUNTS / CUSTOMERS / SUPPLIERS
// ============================================================

// POST /api/accounts/gstin-search - Search GSTIN via GST API
router.post('/gstin-search', async (req: Request, res: Response) => {
  try {
    const { gstin } = req.body;
    if (!gstin || typeof gstin !== 'string') {
      return res.status(400).json({ error: 'GSTIN number is required' });
    }

    // Validate GSTIN format: 2-digit state code + 10-char PAN + 1 entity + 1 Z + 1 check
    const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    const cleanGstin = gstin.trim().toUpperCase();
    if (!gstinPattern.test(cleanGstin)) {
      return res.status(400).json({ error: 'Invalid GSTIN format. Must be 15 characters (e.g. 09AAACH7409R1ZZ)' });
    }

    // Extract PAN from GSTIN (characters 3-12)
    const pan = cleanGstin.substring(2, 12);

    // State code mapping
    const stateMap: Record<string, string> = {
      '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
      '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
      '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
      '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
      '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
      '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
      '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
      '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
      '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
      '29': 'Karnataka', '30': 'Goa', '32': 'Kerala',
      '33': 'Tamil Nadu', '34': 'Puducherry', '36': 'Telangana',
      '37': 'Andhra Pradesh', '38': 'Ladakh',
    };
    const stateCode = cleanGstin.substring(0, 2);
    const stateName = stateMap[stateCode] || '';

    // Try external GST verification API (free tier)
    let apiResult: any = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(
        `https://sheet.gstincheck.co.in/check/3b228cd6e06b5c5b9c8a9a580e38cd3e/${cleanGstin}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        if (data.flag && data.data) {
          apiResult = {
            tradeName: data.data.tradeNam || data.data.tradeName || '',
            legalName: data.data.lgnm || data.data.legalName || '',
            status: data.data.sts || data.data.status || '',
            type: data.data.dty || data.data.dealerType || '',
            address: [
              data.data.pradr?.addr?.bno,
              data.data.pradr?.addr?.bnm,
              data.data.pradr?.addr?.st,
              data.data.pradr?.addr?.loc,
              data.data.pradr?.addr?.dst,
              data.data.pradr?.addr?.stcd,
              data.data.pradr?.addr?.pncd,
            ].filter(Boolean).join(', '),
            blockNo: data.data.pradr?.addr?.bno || '',
            building: data.data.pradr?.addr?.bnm || '',
            street: data.data.pradr?.addr?.st || '',
            area: data.data.pradr?.addr?.loc || '',
            city: data.data.pradr?.addr?.dst || '',
            state: data.data.pradr?.addr?.stcd || stateName,
            pincode: data.data.pradr?.addr?.pncd || '',
          };
        }
      }
    } catch (fetchErr: any) {
      // External API failed — fallback to format-based extraction
      console.log('GST API fetch failed, using format-based extraction:', fetchErr.message);
    }

    // If external API didn't return data, try a secondary free API
    if (!apiResult) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(
          `https://appyflow.in/api/verifyGST?gstNo=${cleanGstin}&key_secret=free_tier`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          if (data.taxpayerInfo) {
            const info = data.taxpayerInfo;
            apiResult = {
              tradeName: info.tradeNam || '',
              legalName: info.lgnm || '',
              status: info.sts || '',
              type: info.dty || '',
              address: info.pradr?.adr || '',
              blockNo: info.pradr?.addr?.bno || '',
              building: info.pradr?.addr?.bnm || '',
              street: info.pradr?.addr?.st || '',
              area: info.pradr?.addr?.loc || '',
              city: info.pradr?.addr?.dst || '',
              state: info.pradr?.addr?.stcd || stateName,
              pincode: info.pradr?.addr?.pncd || '',
            };
          }
        }
      } catch (fetchErr2: any) {
        console.log('Secondary GST API also failed:', fetchErr2.message);
      }
    }

    // Also check if this GSTIN already exists in our database
    const existingAccount = await prisma.account.findFirst({
      where: { gstin: cleanGstin, isActive: true },
      select: { id: true, name: true, type: true, city: true, state: true },
    });

    // Return either full API data or format-based data
    res.json({
      gstin: cleanGstin,
      valid: true,
      stateCode,
      stateName,
      pan,
      existingAccount: existingAccount || null,
      ...(apiResult || {
        tradeName: '',
        legalName: '',
        status: 'Unable to verify — enter details manually',
        type: '',
        address: '',
        blockNo: '',
        building: '',
        street: '',
        area: '',
        city: '',
        state: stateName,
        pincode: '',
      }),
    });
  } catch (error) {
    console.error('GSTIN search error:', error);
    res.status(500).json({ error: 'Failed to search GSTIN' });
  }
});

// GET /api/accounts - List accounts with search
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, type, page = '1', limit = '50' } = req.query;
    const where: any = { isActive: true };

    if (type) where.type = type;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { mobile: { contains: search as string } },
        { gstin: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.account.count({ where }),
    ]);

    res.json({ accounts, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// GET /api/accounts/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// GET /api/accounts/:id/ledger - Get account ledger/transactions
router.get('/:id/ledger', async (req: Request, res: Response) => {
  try {
    const accountId = Number(req.params.id);
    const { dateFrom, dateTo } = req.query;

    const dateFilter = dateFrom && dateTo ? {
      gte: new Date(dateFrom as string),
      lte: new Date(dateTo as string),
    } : undefined;

    const [sales, purchases, cashEntries, customerPayments] = await Promise.all([
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
      prisma.purchaseVoucher.findMany({
        where: {
          accountId,
          status: 'ACTIVE',
          ...(dateFilter ? { voucherDate: dateFilter } : {}),
        },
        select: {
          id: true, voucherNo: true, voucherDate: true,
          totalAmount: true, finalAmount: true,
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
      prisma.customerPayment.findMany({
        where: {
          accountId,
          status: 'ACTIVE',
          ...(dateFilter ? { paymentDate: dateFilter } : {}),
        },
        select: {
          id: true, receiptNo: true, paymentDate: true,
          paymentType: true, totalAmount: true,
          cashAmount: true, bankAmount: true, cardAmount: true,
          balanceBefore: true, balanceAfter: true, narration: true,
        },
        orderBy: { paymentDate: 'asc' },
      }),
    ]);

    res.json({ sales, purchases, cashEntries, customerPayments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ledger' });
  }
});

// POST /api/accounts - Create new account
router.post('/', async (req: Request, res: Response) => {
  try {
    const account = await prisma.account.create({ data: req.body });
    res.status(201).json(account);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PUT /api/accounts/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const account = await prisma.account.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE /api/accounts/:id (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.account.update({
      where: { id: Number(req.params.id) },
      data: { isActive: false },
    });
    res.json({ message: 'Account deactivated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// GET /api/accounts/:id/outstanding - Get outstanding balance
router.get('/:id/outstanding', async (req: Request, res: Response) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: Number(req.params.id) },
      select: { closingBalance: true, balanceType: true, name: true },
    });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch outstanding' });
  }
});

export default router;
