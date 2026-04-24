import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/branchAccess';
import { config } from '../config';

const router = Router();

router.use(authenticate);

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

    // Call official GST API: GET /commonapi/v1.3/search?gstin={}&action=TP
    let apiResult: any = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const url = `${config.gstApiBaseUrl}/commonapi/v1.3/search?gstin=${cleanGstin}&action=TP`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data: any = await response.json();
        // Official GST API response fields (ref: commonapi/v1.3/search action=TP)
        // lgnm = legal name, tradeNam = trade name, sts = status, dty = dealer type
        // stjCd = state jurisdiction code, stj = state jurisdiction
        // ctjCd = centre jurisdiction code, ctj = centre jurisdiction
        // rgdt = registration date, lstupdt = last updated date
        // cxdt = cancellation date, ctb = constitution of business
        // einvoiceStatus = e-invoice status, nba = nature of business activities
        // pradr = principal address, adadr = additional addresses
        if (data && data.gstin) {
          const pradr = data.pradr?.addr || {};
          apiResult = {
            tradeName: data.tradeNam || '',
            legalName: data.lgnm || '',
            status: data.sts || '',
            type: data.dty || '',
            constitutionOfBusiness: data.ctb || '',
            registrationDate: data.rgdt || '',
            lastUpdated: data.lstupdt || '',
            cancellationDate: data.cxdt || '',
            einvoiceStatus: data.einvoiceStatus || '',
            stateJurisdictionCode: data.stjCd || '',
            stateJurisdiction: data.stj || '',
            centreJurisdictionCode: data.ctjCd || '',
            centreJurisdiction: data.ctj || '',
            natureOfBusiness: Array.isArray(data.nba) ? data.nba : [],
            address: [
              pradr.bno, pradr.bnm, pradr.st,
              pradr.loc, pradr.dst, pradr.stcd, pradr.pncd,
            ].filter(Boolean).join(', '),
            blockNo: pradr.bno || '',
            building: pradr.bnm || '',
            street: pradr.st || '',
            area: pradr.loc || '',
            city: pradr.dst || '',
            state: pradr.stcd || stateName,
            pincode: pradr.pncd || '',
            additionalAddresses: Array.isArray(data.adadr) ? data.adadr : [],
          };
        }
      }
    } catch (fetchErr: any) {
      console.log('GST API fetch failed:', fetchErr.message);
    }

    // Check if this GSTIN already exists in our database
    const existingAccount = await prisma.account.findFirst({
      where: { gstin: cleanGstin, isActive: true, companyId: req.companyId },
      select: { id: true, name: true, type: true, city: true, state: true },
    });

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
        status: '',
        type: '',
        constitutionOfBusiness: '',
        registrationDate: '',
        lastUpdated: '',
        cancellationDate: '',
        einvoiceStatus: '',
        stateJurisdictionCode: '',
        stateJurisdiction: '',
        centreJurisdictionCode: '',
        centreJurisdiction: '',
        natureOfBusiness: [],
        address: '',
        blockNo: '',
        building: '',
        street: '',
        area: '',
        city: '',
        state: stateName,
        pincode: '',
        additionalAddresses: [],
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
    const where: any = { isActive: true, companyId: req.companyId };

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
    const account = await prisma.account.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
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

// GET /api/accounts/:id/history - Sales & Old Gold Purchase history for a customer
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const accountId = Number(req.params.id);
    if (isNaN(accountId)) return res.status(400).json({ error: 'Invalid account ID' });
    const { dateFrom, dateTo } = req.query;

    const dateFilter = dateFrom && dateTo ? {
      gte: new Date(dateFrom as string + 'T00:00:00'),
      lte: new Date(dateTo as string + 'T23:59:59.999'),
    } : undefined;

    const [sales, oldGoldPurchases, layaways] = await Promise.all([
      prisma.salesVoucher.findMany({
        where: {
          accountId,
          status: 'ACTIVE',
          companyId: req.companyId,
          ...(dateFilter ? { voucherDate: dateFilter } : {}),
        },
        select: {
          id: true, voucherNo: true, voucherDate: true,
          totalGrossWeight: true, totalNetWeight: true, totalPcs: true,
          metalAmount: true, labourAmount: true, voucherAmount: true,
          paymentAmount: true, dueAmount: true, oldGoldAmount: true,
          cashAmount: true, bankAmount: true, cardAmount: true,
          upiAmount: true, status: true,
          salesman: { select: { name: true } },
          items: {
            select: {
              id: true, labelNo: true, itemName: true,
              grossWeight: true, netWeight: true, pcs: true,
              metalRate: true, metalAmount: true, labourAmount: true,
              totalAmount: true,
            },
          },
        },
        orderBy: { voucherDate: 'desc' },
      }),
      prisma.purchaseVoucher.findMany({
        where: {
          accountId,
          status: 'ACTIVE',
          description: { contains: 'OLD GOLD', mode: 'insensitive' },
          companyId: req.companyId,
          ...(dateFilter ? { voucherDate: dateFilter } : {}),
        },
        select: {
          id: true, voucherNo: true, voucherDate: true,
          totalGrossWeight: true, totalNetWeight: true, totalFineWeight: true,
          totalPcs: true, metalRate: true, metalAmount: true,
          totalAmount: true, finalAmount: true,
          items: {
            select: {
              id: true, styleName: true, weight: true, pcs: true,
              rate: true, amount: true,
            },
          },
        },
        orderBy: { voucherDate: 'desc' },
      }),
      prisma.layawayEntry.findMany({
        where: {
          accountId,
          status: { not: 'CANCELLED' },
          companyId: req.companyId,
          ...(dateFilter ? { voucherDate: dateFilter } : {}),
        },
        select: {
          id: true, voucherNo: true, voucherDate: true,
          totalGrossWeight: true, totalNetWeight: true, totalPcs: true,
          metalAmount: true, labourAmount: true, voucherAmount: true,
          paymentAmount: true, dueAmount: true, status: true,
        },
        orderBy: { voucherDate: 'desc' },
      }),
    ]);

    const totalSalesAmount = sales.reduce((s, v) => s + Number(v.voucherAmount), 0);
    const totalOldGoldAmount = sales.reduce((s, v) => s + Number(v.oldGoldAmount), 0);
    const totalOGPurchaseAmount = oldGoldPurchases.reduce((s, v) => s + Number(v.finalAmount || v.totalAmount), 0);

    res.json({
      sales,
      oldGoldPurchases,
      layaways,
      summary: {
        totalSalesCount: sales.length,
        totalSalesAmount,
        totalOldGoldInSales: totalOldGoldAmount,
        totalOGPurchaseCount: oldGoldPurchases.length,
        totalOGPurchaseAmount,
        totalLayawayCount: layaways.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch customer history' });
  }
});

// Allowed fields for Account create/update
const ACCOUNT_FIELDS = [
  'name', 'type', 'groupHead', 'customerCategory',
  'mobile', 'phone', 'email',
  'blockNo', 'building', 'street', 'area', 'address',
  'city', 'state', 'pincode',
  'gstin', 'gstVerified', 'gstTradeName', 'gstStatus', 'compositionScheme',
  'pan', 'aadhar', 'idProof', 'reference', 'remark',
  'closingBalance', 'balanceType', 'branchId',
];

function sanitizeAccountData(body: any): Record<string, any> {
  const data: Record<string, any> = {};
  // Map openingBalance → closingBalance
  if (body.openingBalance !== undefined && body.closingBalance === undefined) {
    body.closingBalance = body.openingBalance;
  }
  for (const key of ACCOUNT_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

// POST /api/accounts - Create new account
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = sanitizeAccountData(req.body);
    if (!data.name || !String(data.name).trim()) {
      return res.status(400).json({ error: 'Account name is required' });
    }
    if (!data.type) {
      return res.status(400).json({ error: 'Account type is required' });
    }
    const account = await prisma.account.create({ data: { ...data, companyId: req.companyId! } as any });
    res.status(201).json(account);
  } catch (error: any) {
    console.error('Error creating account:', error);
    const msg = error?.code === 'P2002' ? 'An account with this information already exists' : 'Failed to create account';
    res.status(500).json({ error: msg });
  }
});

// PUT /api/accounts/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.account.findFirst({ where: { id: Number(req.params.id), companyId: req.companyId } });
    if (!existing) return res.status(404).json({ error: 'Account not found' });

    const data = sanitizeAccountData(req.body);
    const account = await prisma.account.update({
      where: { id: existing.id },
      data,
    });
    res.json(account);
  } catch (error: any) {
    console.error('Error updating account:', error);
    const msg = error?.code === 'P2002' ? 'An account with this information already exists' : 'Failed to update account';
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/accounts/:id (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.account.findFirst({ where: { id: Number(req.params.id), companyId: req.companyId } });
    if (!existing) return res.status(404).json({ error: 'Account not found' });

    await prisma.account.update({
      where: { id: existing.id },
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
    const account = await prisma.account.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      select: { closingBalance: true, balanceType: true, name: true },
    });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch outstanding' });
  }
});

export default router;
