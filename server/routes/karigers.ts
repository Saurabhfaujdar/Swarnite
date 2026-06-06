/**
 * Kariger Master + Ledger Routes
 * ──────────────────────────────
 *  GET    /api/karigers              — list karigers (with optional active filter)
 *  POST   /api/karigers              — create kariger
 *  GET    /api/karigers/:id          — kariger detail with snapshot balances
 *  PUT    /api/karigers/:id          — update kariger
 *  GET    /api/karigers/:id/metal-ledger  — metal ledger entries
 *  GET    /api/karigers/:id/money-ledger  — money ledger entries
 *  POST   /api/karigers/:id/payment       — record a money payment to kariger
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/branchAccess';
import { logger } from '../logger';
import { postMoneyLedger } from '../services/repairLedger';

const router = Router();
router.use(authenticate);

// ── List karigers ────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const { active, search } = req.query;
    const where: any = { companyId: req.companyId };
    if (active === 'true') where.isActive = true;
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { code: { contains: String(search), mode: 'insensitive' } },
        { mobile: { contains: String(search), mode: 'insensitive' } },
      ];
    }
    const karigers = await prisma.kariger.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    res.json({ karigers });
  } catch (err) {
    logger.error('karigers.list failed', { err: (err as Error)?.message, stack: (err as Error)?.stack });
    res.status(500).json({ error: 'Failed to list karigers' });
  }
});

// ── Create kariger ───────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const { code, name, mobile, address, city, state, pincode, landmark, idProof, specialization, branchId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    // Only users on the master (head office) branch may add karigers.
    if (req.branchId) {
      const userBranch = await prisma.branch.findUnique({
        where: { id: req.branchId },
        select: { isMaster: true },
      });
      if (!userBranch?.isMaster) {
        return res.status(403).json({ error: 'Only the main branch can add karigars' });
      }
    }

    // Auto-generate K001-style code when not supplied
    let finalCode = code?.trim();
    if (!finalCode) {
      const count = await prisma.kariger.count({ where: { companyId: req.companyId! } });
      finalCode = `K${String(count + 1).padStart(3, '0')}`;
    }

    const kariger = await prisma.kariger.create({
      data: {
        code: finalCode,
        name: name.trim(),
        mobile: mobile || null,
        address: address || null,
        city: city || null,
        state: state || null,
        pincode: pincode || null,
        landmark: landmark || null,
        idProof: idProof || null,
        specialization: specialization || null,
        companyId: req.companyId!,
        branchId: branchId || req.branchId || null,
      },
    });
    res.status(201).json({ kariger });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(400).json({ error: 'Kariger code already exists' });
    }
    logger.error('karigers.create failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to create kariger' });
  }
});

// ── Get one ──────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const kariger = await prisma.kariger.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { repairJobs: true, assignments: true } },
      },
    });
    if (!kariger) return res.status(404).json({ error: 'Kariger not found' });
    res.json({ kariger });
  } catch (err) {
    logger.error('karigers.get failed', { err: (err as Error)?.message });
    res.status(500).json({ error: 'Failed to fetch kariger' });
  }
});

// ── Update ───────────────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.kariger.findFirst({ where: { id, companyId: req.companyId } });
    if (!existing) return res.status(404).json({ error: 'Kariger not found' });

    if (req.branchId) {
      const userBranch = await prisma.branch.findUnique({
        where: { id: req.branchId },
        select: { isMaster: true },
      });
      if (!userBranch?.isMaster) {
        return res.status(403).json({ error: 'Only the main branch can edit karigars' });
      }
    }

    const { name, mobile, address, city, state, pincode, landmark, idProof, specialization, branchId, isActive } = req.body;
    const kariger = await prisma.kariger.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(mobile !== undefined ? { mobile: mobile || null } : {}),
        ...(address !== undefined ? { address: address || null } : {}),
        ...(city !== undefined ? { city: city || null } : {}),
        ...(state !== undefined ? { state: state || null } : {}),
        ...(pincode !== undefined ? { pincode: pincode || null } : {}),
        ...(landmark !== undefined ? { landmark: landmark || null } : {}),
        ...(idProof !== undefined ? { idProof: idProof || null } : {}),
        ...(specialization !== undefined ? { specialization: specialization || null } : {}),
        ...(branchId !== undefined ? { branchId: branchId || null } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
      },
    });
    res.json({ kariger });
  } catch (err: any) {
    logger.error('karigers.update failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to update kariger' });
  }
});

// ── Metal ledger ─────────────────────────────────────────────────
router.get('/:id/metal-ledger', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const kariger = await prisma.kariger.findFirst({ where: { id, companyId: req.companyId } });
    if (!kariger) return res.status(404).json({ error: 'Kariger not found' });

    const entries = await prisma.karigerMetalLedger.findMany({
      where: { karigerId: id },
      include: {
        metalType: { select: { name: true } },
        repairJob: { select: { repairNo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ balance: kariger.metalBalance, entries });
  } catch (err) {
    logger.error('karigers.metalLedger failed', { err: (err as Error)?.message });
    res.status(500).json({ error: 'Failed to fetch metal ledger' });
  }
});

// ── Money ledger ─────────────────────────────────────────────────
router.get('/:id/money-ledger', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const kariger = await prisma.kariger.findFirst({ where: { id, companyId: req.companyId } });
    if (!kariger) return res.status(404).json({ error: 'Kariger not found' });

    const entries = await prisma.karigerMoneyLedger.findMany({
      where: { karigerId: id },
      include: { repairJob: { select: { repairNo: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ balance: kariger.moneyBalance, entries });
  } catch (err) {
    logger.error('karigers.moneyLedger failed', { err: (err as Error)?.message });
    res.status(500).json({ error: 'Failed to fetch money ledger' });
  }
});

// ── Pay kariger (settle outstanding labour) ──────────────────────
router.post('/:id/payment', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { amount, remarks } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'amount must be > 0' });

    const kariger = await prisma.kariger.findFirst({ where: { id, companyId: req.companyId } });
    if (!kariger) return res.status(404).json({ error: 'Kariger not found' });

    const entry = await prisma.$transaction(async (tx) =>
      postMoneyLedger({
        tx,
        karigerId: id,
        entryType: 'PAYMENT_MADE',
        credit: amt,
        remarks: remarks || `Payment to ${kariger.name}`,
        userId: req.userId!,
      }),
    );
    res.status(201).json({ entry });
  } catch (err: any) {
    logger.error('karigers.payment failed', { err: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Failed to record payment' });
  }
});

export default router;
