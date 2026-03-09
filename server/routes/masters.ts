import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

// ============================================================
// METAL TYPES
// ============================================================
router.get('/metal-types', async (_req: Request, res: Response) => {
  try {
    const metalTypes = await prisma.metalType.findMany({ where: { isActive: true } });
    res.json(metalTypes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metal types' });
  }
});

router.post('/metal-types', async (req: Request, res: Response) => {
  try {
    const metalType = await prisma.metalType.create({ data: req.body });
    res.status(201).json(metalType);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create metal type' });
  }
});

// ============================================================
// ITEM GROUPS
// ============================================================
router.get('/item-groups', async (_req: Request, res: Response) => {
  try {
    const groups = await prisma.itemGroup.findMany({
      where: { isActive: true },
      include: { metalType: true },
    });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch item groups' });
  }
});

router.post('/item-groups', async (req: Request, res: Response) => {
  try {
    const group = await prisma.itemGroup.create({ data: req.body });
    res.status(201).json(group);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create item group' });
  }
});

// ============================================================
// PURITIES
// ============================================================
router.get('/purities', async (_req: Request, res: Response) => {
  try {
    const purities = await prisma.purity.findMany({ where: { isActive: true } });
    res.json(purities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch purities' });
  }
});

router.post('/purities', async (req: Request, res: Response) => {
  try {
    const purity = await prisma.purity.create({ data: req.body });
    res.status(201).json(purity);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create purity' });
  }
});

// ============================================================
// METAL RATES
// ============================================================
router.get('/metal-rates', async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const where: any = { isActive: true };

    if (date) {
      const d = new Date(date as string);
      where.date = {
        gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
      };
    }

    const rates = await prisma.metalRate.findMany({
      where,
      include: { metalType: true },
      orderBy: { date: 'desc' },
    });
    res.json(rates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metal rates' });
  }
});

router.get('/metal-rates/latest', async (_req: Request, res: Response) => {
  try {
    // Get latest rate for each metal type + purity combination
    const rates = await prisma.metalRate.findMany({
      where: { isActive: true },
      orderBy: { date: 'desc' },
      distinct: ['metalTypeId', 'purityCode'],
      include: { metalType: true },
    });
    res.json(rates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch latest rates' });
  }
});

router.post('/metal-rates', async (req: Request, res: Response) => {
  try {
    const rate = await prisma.metalRate.create({ data: req.body });
    res.status(201).json(rate);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create metal rate' });
  }
});

// ============================================================
// SALESMEN
// ============================================================
router.get('/salesmen', async (_req: Request, res: Response) => {
  try {
    const salesmen = await prisma.salesman.findMany({ where: { isActive: true } });
    res.json(salesmen);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch salesmen' });
  }
});

router.post('/salesmen', async (req: Request, res: Response) => {
  try {
    const salesman = await prisma.salesman.create({ data: req.body });
    res.status(201).json(salesman);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create salesman' });
  }
});

// ============================================================
// COUNTERS
// ============================================================
router.get('/counters', async (req: Request, res: Response) => {
  try {
    const { branchId } = req.query;
    const where: any = { isActive: true };
    if (branchId) where.branchId = Number(branchId);

    const counters = await prisma.counter.findMany({ where });
    res.json(counters);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch counters' });
  }
});

router.post('/counters', async (req: Request, res: Response) => {
  try {
    const counter = await prisma.counter.create({ data: req.body });
    res.status(201).json(counter);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create counter' });
  }
});

// ============================================================
// GST CONFIG
// ============================================================
router.get('/gst-config', async (_req: Request, res: Response) => {
  try {
    const configs = await prisma.gstConfig.findMany({ where: { isActive: true } });
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch GST config' });
  }
});

router.post('/gst-config', async (req: Request, res: Response) => {
  try {
    const config = await prisma.gstConfig.create({ data: req.body });
    res.status(201).json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create GST config' });
  }
});

// ============================================================
// COMPANY
// ============================================================
router.get('/company', async (_req: Request, res: Response) => {
  try {
    const company = await prisma.company.findFirst();
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

router.post('/company', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.company.findFirst();
    let company;
    if (existing) {
      company = await prisma.company.update({ where: { id: existing.id }, data: req.body });
    } else {
      company = await prisma.company.create({ data: req.body });
    }
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save company' });
  }
});

export default router;
