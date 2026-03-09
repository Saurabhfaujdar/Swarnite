import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';

const router = Router();

// ============================================================
// LABELS / SKU Management
// ============================================================

// GET /api/inventory/labels - List labels with filters
router.get('/labels', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, groupName, status, counterId, page = '1', limit = '100' } = req.query;

    const where: Prisma.LabelWhereInput = {};

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo as string);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }
    if (status) where.status = status as any;
    if (counterId) where.counterId = Number(counterId);
    if (groupName && groupName !== 'ALL') {
      where.item = { itemGroup: { name: groupName as string } };
    }

    const [labels, total] = await Promise.all([
      prisma.label.findMany({
        where,
        include: {
          item: { include: { itemGroup: true, purity: true, metalType: true } },
          prefix: true,
          branch: { select: { name: true } },
          counter: { select: { name: true } },
        },
        orderBy: { labelNo: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.label.count({ where }),
    ]);

    res.json({ labels, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

// GET /api/inventory/labels/search?labelNo=XX/123 - Search by label number
// Must be before /labels/:id to avoid "search" matching as :id
router.get('/labels/search', async (req: Request, res: Response) => {
  try {
    const labelNo = req.query.labelNo as string;
    if (!labelNo) return res.status(400).json({ error: 'labelNo query parameter is required' });

    const label = await prisma.label.findUnique({
      where: { labelNo },
      include: {
        item: { include: { itemGroup: true, purity: true, metalType: true } },
        branch: true,
        counter: true,
      },
    });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    res.json(label);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search label' });
  }
});

// GET /api/inventory/labels/:id
router.get('/labels/:id', async (req: Request, res: Response) => {
  try {
    const label = await prisma.label.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        item: { include: { itemGroup: true, purity: true, metalType: true } },
        branch: true,
        counter: true,
      },
    });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    res.json(label);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch label' });
  }
});

// POST /api/inventory/labels - Create label (Label Preparation Entry)
router.post('/labels', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    // Get or create prefix and increment
    const prefix = await prisma.labelPrefix.update({
      where: { id: data.prefixId },
      data: { lastNumber: { increment: 1 } },
    });

    const labelNo = `${prefix.prefix}/${prefix.lastNumber}`;

    const label = await prisma.label.create({
      data: {
        labelNo,
        prefixId: data.prefixId,
        itemId: data.itemId,
        grossWeight: data.grossWeight || 0,
        netWeight: data.netWeight || 0,
        pcsCount: data.pcsCount || 1,
        mrp: data.mrp,
        salePrice: data.salePrice,
        branchId: data.branchId,
        counterId: data.counterId,
        huid: data.huid,
        status: 'IN_STOCK',
      },
      include: {
        item: { include: { itemGroup: true, purity: true } },
        branch: true,
      },
    });

    res.status(201).json(label);
  } catch (error) {
    console.error('Error creating label:', error);
    res.status(500).json({ error: 'Failed to create label' });
  }
});

// POST /api/inventory/labels/batch - Batch create labels
router.post('/labels/batch', async (req: Request, res: Response) => {
  try {
    const { labels: labelData, prefixId, branchId, counterId } = req.body;
    const createdLabels = [];

    // Resolve branchId - use provided or fall back to first branch
    let resolvedBranchId = branchId;
    if (!resolvedBranchId) {
      const branch = await prisma.branch.findFirst({ where: { isActive: true } });
      if (!branch) return res.status(400).json({ error: 'No active branch found' });
      resolvedBranchId = branch.id;
    }

    for (const data of labelData) {
      // Resolve prefixId: use top-level prefixId, per-item prefixId, or look up by prefix string
      let itemPrefixId = prefixId || data.prefixId;
      if (!itemPrefixId && data.prefix) {
        const found = await prisma.labelPrefix.findUnique({ where: { prefix: data.prefix } });
        if (found) itemPrefixId = found.id;
      }
      // If still no prefix, auto-detect from item's group
      if (!itemPrefixId && data.itemId) {
        const item = await prisma.item.findUnique({ where: { id: data.itemId }, select: { itemGroupId: true } });
        if (item) {
          const groupPrefix = await prisma.labelPrefix.findFirst({ where: { itemGroupId: item.itemGroupId } });
          if (groupPrefix) itemPrefixId = groupPrefix.id;
        }
      }

      if (!itemPrefixId) return res.status(400).json({ error: 'Could not resolve label prefix for item' });

      // Resolve counterId: use top-level counterId, per-item counterId, or look up by counterCode
      let itemCounterId = counterId || data.counterId;
      if (!itemCounterId && data.counterCode) {
        const found = await prisma.counter.findUnique({ where: { code: data.counterCode } });
        if (found) itemCounterId = found.id;
      }

      const prefix = await prisma.labelPrefix.update({
        where: { id: itemPrefixId },
        data: { lastNumber: { increment: 1 } },
      });

      const labelNo = `${prefix.prefix}/${prefix.lastNumber}`;

      const label = await prisma.label.create({
        data: {
          labelNo,
          prefixId: itemPrefixId,
          itemId: data.itemId,
          grossWeight: data.grossWeight || 0,
          netWeight: data.netWeight || 0,
          pcsCount: data.pcsCount || 1,
          mrp: data.mrp,
          salePrice: data.salePrice,
          branchId: resolvedBranchId,
          counterId: itemCounterId || null,
          huid: data.huid || null,
          status: 'IN_STOCK',
        },
      });

      createdLabels.push(label);
    }

    res.status(201).json({ count: createdLabels.length, created: createdLabels.length, labels: createdLabels });
  } catch (error) {
    console.error('Error creating labels batch:', error);
    res.status(500).json({ error: 'Failed to create labels' });
  }
});

// PUT /api/inventory/labels/:id
router.put('/labels/:id', async (req: Request, res: Response) => {
  try {
    const label = await prisma.label.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    res.json(label);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update label' });
  }
});

// DELETE /api/inventory/labels/:id
router.delete('/labels/:id', async (req: Request, res: Response) => {
  try {
    await prisma.label.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Label deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete label' });
  }
});

// ============================================================
// ITEMS Management
// ============================================================

router.get('/items', async (_req: Request, res: Response) => {
  try {
    const items = await prisma.item.findMany({
      where: { isActive: true },
      include: { itemGroup: true, purity: true, metalType: true },
      orderBy: { name: 'asc' },
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

router.post('/items', async (req: Request, res: Response) => {
  try {
    const item = await prisma.item.create({ data: req.body });
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// ============================================================
// COUNTER WISE REPORT
// ============================================================
router.get('/counter-report', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, counterId } = req.query;

    const where: Prisma.LabelWhereInput = {};
    if (counterId) where.counterId = Number(counterId);

    // Get all items with their stock by counter
    const labels = await prisma.label.findMany({
      where: {
        ...where,
        status: 'IN_STOCK',
      },
      include: {
        item: { include: { itemGroup: true, metalType: true, purity: true } },
        counter: true,
      },
    });

    // Group by item
    const grouped = labels.reduce((acc: any, label) => {
      const key = label.item.name;
      if (!acc[key]) {
        acc[key] = {
          itemName: label.item.name,
          metalId: label.item.metalType.code,
          prefixName: label.item.code,
          openingPcs: 0,
          receiptPcs: 0,
          issuePcs: 0,
          closingPcs: 0,
          metalName: label.item.metalType.name,
          closingNetWeight: 0,
        };
      }
      acc[key].closingPcs += 1;
      acc[key].closingNetWeight += Number(label.netWeight);
      return acc;
    }, {});

    res.json({ items: Object.values(grouped), total: labels.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate counter report' });
  }
});

// ============================================================
// STOCK SUMMARY
// ============================================================
router.get('/stock-summary', async (_req: Request, res: Response) => {
  try {
    const summary = await prisma.label.groupBy({
      by: ['status'],
      _count: { id: true },
      _sum: { grossWeight: true, netWeight: true },
    });

    const totalInStock = await prisma.label.count({ where: { status: 'IN_STOCK' } });
    const totalSold = await prisma.label.count({ where: { status: 'SOLD' } });

    res.json({ summary, totalInStock, totalSold });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stock summary' });
  }
});

// ============================================================
// PREFIXES
// ============================================================
router.get('/prefixes', async (_req: Request, res: Response) => {
  try {
    const prefixes = await prisma.labelPrefix.findMany({
      where: { isActive: true },
      include: { itemGroup: true },
    });
    res.json(prefixes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prefixes' });
  }
});

router.post('/prefixes', async (req: Request, res: Response) => {
  try {
    const prefix = await prisma.labelPrefix.create({ data: req.body });
    res.status(201).json(prefix);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create prefix' });
  }
});

export default router;
