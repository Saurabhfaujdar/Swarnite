import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { config } from '../config';
import { auditLog } from '../middleware/audit';
import { authenticate } from '../middleware/branchAccess';

const router = Router();

// ─── Helper: parse duration string to ms ────────────────────
function parseDuration(dur: string): number {
  const match = dur.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (multipliers[unit] || 86_400_000);
}

// ─── Helper: generate refresh token + persist ────────────────
async function createRefreshToken(userId: number, companyId: number, branchId: number | null, req: Request) {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + parseDuration(config.refreshTokenExpiresIn));

  // Enforce max sessions per user — delete oldest if over limit
  const existing = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (existing.length >= config.refreshTokenMaxPerUser) {
    const toDelete = existing.slice(0, existing.length - config.refreshTokenMaxPerUser + 1);
    await prisma.refreshToken.updateMany({
      where: { id: { in: toDelete.map(t => t.id) } },
      data: { revokedAt: new Date() },
    });
  }

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      companyId,
      branchId,
      expiresAt,
      userAgent: req.headers['user-agent']?.slice(0, 256),
      ipAddress: req.ip,
    },
  });

  return { token, expiresAt };
}

// ─── Helper: set refresh cookie ──────────────────────────────
function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie('jewelerp_refresh', token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    domain: config.cookieDomain,
    path: '/api/auth',        // only sent to auth endpoints
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie('jewelerp_refresh', {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    domain: config.cookieDomain,
    path: '/api/auth',
  });
}

// ─── Helper: sign access token ───────────────────────────────
function signAccessToken(user: { id: number; role: string; companyId: number; branchId: number | null }) {
  return jwt.sign(
    { userId: user.id, role: user.role, companyId: user.companyId, branchId: user.branchId },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions,
  );
}

// ================================================================
// POST /api/auth/login
// Returns: access token in body, refresh token as httpOnly cookie
// ================================================================
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { branch: { include: { company: true } } },
    });

    if (!user || !user.isActive) {
      auditLog(req, 'LOGIN_FAILED', { username, reason: 'invalid_user' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      auditLog(req, 'LOGIN_FAILED', { username, reason: 'invalid_password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Sign short-lived access token
    const accessToken = signAccessToken(user);

    // Create & set refresh token cookie
    const refresh = await createRefreshToken(user.id, user.companyId, user.branchId, req);
    setRefreshCookie(res, refresh.token, refresh.expiresAt);

    auditLog(req, 'LOGIN', { userId: user.id, companyId: user.companyId, branchId: user.branchId });

    res.json({
      token: accessToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
        branch: user.branch,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ================================================================
// POST /api/auth/refresh
// Reads refresh cookie, validates, rotates token, returns new access token
// ================================================================
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.jewelerp_refresh;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    // Find and validate the stored token
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { branch: { include: { company: true } } } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      clearRefreshCookie(res);
      // If token was found but revoked/expired, it might be a reuse attack — revoke all for user
      if (stored && stored.revokedAt) {
        await prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        auditLog(req, 'REFRESH_TOKEN_REUSE', { userId: stored.userId });
      }
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const { user } = stored;
    if (!user.isActive) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Account disabled' });
    }

    // Rotate: revoke old token, issue new one
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const newRefresh = await createRefreshToken(user.id, user.companyId, user.branchId, req);
    setRefreshCookie(res, newRefresh.token, newRefresh.expiresAt);

    const accessToken = signAccessToken(user);

    res.json({
      token: accessToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
        branch: user.branch,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ================================================================
// POST /api/auth/logout
// Revokes the current refresh token and clears cookie
// ================================================================
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.jewelerp_refresh;
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearRefreshCookie(res);

    // Try to log who logged out (access token may still be valid)
    const authHeader = req.headers.authorization?.replace('Bearer ', '');
    if (authHeader) {
      try {
        const decoded = jwt.verify(authHeader, config.jwtSecret) as { userId: number };
        auditLog(req, 'LOGOUT', { userId: decoded.userId });
      } catch { /* token expired, that's ok */ }
    }

    res.json({ message: 'Logged out' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ================================================================
// POST /api/auth/logout-all  (requires auth)
// Revokes ALL refresh tokens for the current user — signs out everywhere
// ================================================================
router.post('/logout-all', authenticate, async (req: Request, res: Response) => {
  try {
    const count = await prisma.refreshToken.updateMany({
      where: { userId: req.userId!, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearRefreshCookie(res);
    auditLog(req, 'LOGOUT_ALL', { userId: req.userId, revokedCount: count.count });
    res.json({ message: 'All sessions revoked', count: count.count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

// ================================================================
// GET /api/auth/sessions  (requires auth)
// List active sessions for the current user
// ================================================================
router.get('/sessions', authenticate, async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.userId!, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// ================================================================
// DELETE /api/auth/sessions/:id  (requires auth)
// Revoke a specific session
// ================================================================
router.delete('/sessions/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const result = await prisma.refreshToken.updateMany({
      where: { id, userId: req.userId!, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ message: 'Session revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// ================================================================
// POST /api/auth/register (admin only — requires auth)
// ================================================================
router.post('/register', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { username, password, fullName, role, branchId, companyId } = req.body;
    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { username, password: hashedPassword, fullName, role, branchId, companyId },
    });

    auditLog(req, 'USER_CREATED', { targetUserId: user.id, username });
    res.status(201).json({ id: user.id, username: user.username, fullName: user.fullName });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ================================================================
// GET /api/auth/me (requires auth)
// ================================================================
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, username: true, fullName: true, role: true,
        companyId: true, branchId: true,
        branch: { include: { company: { select: { id: true, name: true } } } },
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ================================================================
// PUT /api/auth/change-password (requires auth)
// ================================================================
router.put('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await prisma.user.update({
      where: { id: req.userId },
      data: { password: await bcrypt.hash(newPassword, 12) },
    });

    // Revoke all refresh tokens so user must re-login everywhere
    await prisma.refreshToken.updateMany({
      where: { userId: req.userId!, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    auditLog(req, 'PASSWORD_CHANGED', { userId: req.userId });
    clearRefreshCookie(res);
    res.json({ message: 'Password changed. Please log in again.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
