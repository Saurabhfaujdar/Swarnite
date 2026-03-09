/**
 * Branch Access Control Middleware
 * ─────────────────────────────────
 * Enforces data isolation between branches:
 *  - Branch users can only read/write their own branch's data.
 *  - Master branch users can access all child branch data.
 *  - Injects `req.branchScope` with the allowed branch IDs.
 *
 * Usage:
 *   router.get('/', requireBranch, branchFilter, handler);
 *   router.post('/', requireBranch, requireMaster, handler);
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'jewelerp-secret-key-change-in-production';

// Extend Express Request to carry branch context
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
      branchId?: number;
      branchScope?: number[];   // List of branch IDs the user can access
      isMasterBranch?: boolean; // Whether the user's branch is the master
    }
  }
}

// ─── 1. Authenticate & extract user + branch context ──────────

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string; branchId: number };
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    req.branchId = decoded.branchId;

    // Load the user's branch to check master status
    if (decoded.branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: decoded.branchId },
        select: { id: true, isMaster: true, parentId: true, isActive: true, isDeleted: true },
      });

      if (!branch || !branch.isActive || branch.isDeleted) {
        return res.status(403).json({ error: 'Branch is disabled or deleted' });
      }

      req.isMasterBranch = branch.isMaster;

      if (branch.isMaster) {
        // Master can access itself + all children
        const children = await prisma.branch.findMany({
          where: { parentId: branch.id, isDeleted: false },
          select: { id: true },
        });
        req.branchScope = [branch.id, ...children.map(c => c.id)];
      } else {
        // Branch user can only access their own branch
        req.branchScope = [branch.id];
      }
    } else {
      // ADMIN without branch — full access (system admin)
      if (decoded.role === 'ADMIN') {
        req.isMasterBranch = true;
        req.branchScope = []; // empty = no filter (all access)
      } else {
        return res.status(403).json({ error: 'User not assigned to any branch' });
      }
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── 2. Require the user to be in a branch ────────────────────

export function requireBranch(req: Request, res: Response, next: NextFunction) {
  if (!req.branchId) {
    return res.status(403).json({ error: 'Branch assignment required' });
  }
  next();
}

// ─── 3. Require the user to be in the master branch ───────────

export function requireMaster(req: Request, res: Response, next: NextFunction) {
  if (!req.isMasterBranch) {
    return res.status(403).json({
      error: 'This operation requires master branch access',
    });
  }
  next();
}

// ─── 4. Require ADMIN role ────────────────────────────────────

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ─── 5. Build a Prisma where-clause for branch filtering ──────
/**
 * Returns a branchId filter for Prisma queries.
 * - Master branch user with scope [] (ADMIN) → no filter (all data).
 * - Master branch user with scope [1,2,3] → { branchId: { in: [1,2,3] } }
 * - Branch user with scope [2] → { branchId: 2 }
 *
 * Usage: const where = { ...otherFilters, ...branchWhere(req) };
 */
export function branchWhere(req: Request): Record<string, any> {
  if (!req.branchScope || req.branchScope.length === 0) {
    return {}; // system admin — no restriction
  }
  if (req.branchScope.length === 1) {
    return { branchId: req.branchScope[0] };
  }
  return { branchId: { in: req.branchScope } };
}

// ─── 6. Validate target branch is within user's scope ─────────
/**
 * Checks if a target branchId is accessible by the current user.
 * Use this for write operations to prevent cross-branch writes.
 */
export function canAccessBranch(req: Request, targetBranchId: number): boolean {
  if (!req.branchScope || req.branchScope.length === 0) {
    return true; // system admin
  }
  return req.branchScope.includes(targetBranchId);
}

// ─── 7. Validate a master can override a specific child branch ─
/**
 * Checks if the user's master branch is the parent of the target branch.
 * Used for operations like editing branch data, disabling branches.
 */
export async function canOverrideBranch(req: Request, targetBranchId: number): Promise<boolean> {
  if (!req.isMasterBranch) return false;
  if (req.branchScope && req.branchScope.length === 0) return true; // admin

  const targetBranch = await prisma.branch.findUnique({
    where: { id: targetBranchId },
    select: { parentId: true },
  });

  return targetBranch?.parentId === req.branchId;
}
