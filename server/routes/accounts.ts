import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/branchAccess';
import { config } from '../config';

const router = Router();

router.use(authenticate);

// ============================================================
// Customer Category Logic
// ============================================================
// New Customer: 0-1 purchases
// Regular Customer: 2-5 purchases
// VIP Customer: Total spend > ₹5,00,000
// Premium Customer: Total spend > ₹20,00,000
// Inactive Customer: No purchase in 12 months (overrides others)
// ============================================================
interface CustomerCategory {
  label: string;
  color: string; // tailwind color key
}

async function computeCustomerCategory(accountId: number, companyId: number): Promise<CustomerCategory> {
  const [stats, lastSale] = await Promise.all([
    prisma.salesVoucher.aggregate({
      where: { accountId, companyId, status: 'ACTIVE' },
      _count: { id: true },
      _sum: { voucherAmount: true },
    }),
    prisma.salesVoucher.findFirst({
      where: { accountId, companyId, status: 'ACTIVE' },
      orderBy: { voucherDate: 'desc' },
      select: { voucherDate: true },
    }),
  ]);

  const totalPurchases = stats._count.id;
  const totalSpend = Number(stats._sum.voucherAmount || 0);

  // Check inactive first (no purchase in 12 months)
  if (totalPurchases > 0 && lastSale) {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    if (lastSale.voucherDate < twelveMonthsAgo) {
      return { label: 'Inactive', color: 'gray' };
    }
  }

  // Spend-based tiers take priority
  if (totalSpend >= 2000000) return { label: 'Premium', color: 'amber' };
  if (totalSpend >= 500000) return { label: 'VIP', color: 'purple' };

  // Purchase-count based
  if (totalPurchases <= 1) return { label: 'New', color: 'green' };
  if (totalPurchases <= 5) return { label: 'Regular', color: 'blue' };

  // >5 purchases but under ₹5L spend
  return { label: 'Regular', color: 'blue' };
}

async function enrichAccountsWithCategory(accounts: any[], companyId: number): Promise<any[]> {
  const accountIds = accounts.filter(a => a.type === 'CUSTOMER').map(a => a.id);
  if (accountIds.length === 0) return accounts;

  // Batch aggregate: count + sum per account
  const [countAgg, lastSales] = await Promise.all([
    prisma.salesVoucher.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accountIds }, companyId, status: 'ACTIVE' },
      _count: { id: true },
      _sum: { voucherAmount: true },
    }),
    prisma.salesVoucher.findMany({
      where: { accountId: { in: accountIds }, companyId, status: 'ACTIVE' },
      orderBy: { voucherDate: 'desc' },
      distinct: ['accountId'],
      select: { accountId: true, voucherDate: true },
    }),
  ]);

  const statsMap = new Map<number, { count: number; total: number }>();
  for (const row of countAgg) {
    statsMap.set(row.accountId, { count: row._count.id, total: Number(row._sum.voucherAmount || 0) });
  }
  const lastSaleMap = new Map<number, Date>();
  for (const row of lastSales) {
    lastSaleMap.set(row.accountId, row.voucherDate);
  }

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  return accounts.map(a => {
    if (a.type !== 'CUSTOMER') return a;
    const s = statsMap.get(a.id) || { count: 0, total: 0 };
    const lastDate = lastSaleMap.get(a.id);
    let category: CustomerCategory;

    if (s.count > 0 && lastDate && lastDate < twelveMonthsAgo) {
      category = { label: 'Inactive', color: 'gray' };
    } else if (s.total >= 2000000) {
      category = { label: 'Premium', color: 'amber' };
    } else if (s.total >= 500000) {
      category = { label: 'VIP', color: 'purple' };
    } else if (s.count <= 1) {
      category = { label: 'New', color: 'green' };
    } else {
      category = { label: 'Regular', color: 'blue' };
    }

    return { ...a, customerTag: category };
  });
}

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

    const enriched = await enrichAccountsWithCategory(accounts, req.companyId!);
    res.json({ accounts: enriched, total });
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
    const customerTag = account.type === 'CUSTOMER'
      ? await computeCustomerCategory(account.id, req.companyId!)
      : undefined;
    res.json({ ...account, customerTag });
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

    const [sales, oldGoldPurchases, layaways, repairs] = await Promise.all([
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
          paymentAmount: true, dueAmount: true,
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
          OR: [
            { description: { contains: 'OLD GOLD', mode: 'insensitive' } },
            { group: 'OGN' },
          ],
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
      prisma.repairJob.findMany({
        where: {
          customerAccountId: accountId,
          companyId: req.companyId,
          ...(dateFilter ? { intakeDate: dateFilter } : {}),
        },
        select: {
          id: true, repairNo: true, intakeDate: true,
          status: true, priority: true,
          estimatedAmount: true, advanceReceived: true,
          customerNotes: true, deliveredDate: true,
          items: {
            select: {
              id: true, ornamentType: true, metalType: { select: { name: true } },
              purity: true, grossWeight: true, issueDescription: true,
            },
          },
          invoice: {
            select: {
              id: true, invoiceNo: true, totalAmount: true,
              paidAmount: true, dueAmount: true, paymentStatus: true,
            },
          },
        },
        orderBy: { intakeDate: 'desc' },
      }),
    ]);

    const totalSalesAmount = sales.reduce((s, v) => s + Number(v.voucherAmount), 0);
    const totalOGPurchaseAmount = oldGoldPurchases.reduce((s, v) => s + Number(v.finalAmount || v.totalAmount), 0);
    const totalRepairAmount = repairs.reduce((s, r) => s + Number(r.invoice?.totalAmount || r.estimatedAmount || 0), 0);

    res.json({
      sales,
      oldGoldPurchases,
      layaways,
      repairs,
      summary: {
        totalSalesCount: sales.length,
        totalSalesAmount,
        totalOGPurchaseCount: oldGoldPurchases.length,
        totalOGPurchaseAmount,
        totalLayawayCount: layaways.length,
        totalRepairCount: repairs.length,
        totalRepairAmount,
      },
    });
  } catch (error: any) {
    console.error('History endpoint error:', error?.message || error);
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
    if (data.mobile && !/^\d{10}$/.test(String(data.mobile))) {
      return res.status(400).json({ error: 'Mobile number must be exactly 10 digits' });
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
    if (data.mobile && !/^\d{10}$/.test(String(data.mobile))) {
      return res.status(400).json({ error: 'Mobile number must be exactly 10 digits' });
    }
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
