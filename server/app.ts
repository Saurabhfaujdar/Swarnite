import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { requestId, requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './prisma';
import salesRoutes from './routes/sales';
import purchaseRoutes from './routes/purchase';
import inventoryRoutes from './routes/inventory';
import accountsRoutes from './routes/accounts';
import branchRoutes from './routes/branch';
import branchManagementRoutes from './routes/branchManagement';
import mastersRoutes from './routes/masters';
import reportsRoutes from './routes/reports';
import authRoutes from './routes/auth';
import cashBankRoutes from './routes/cashBank';
import layawayRoutes from './routes/layaway';
import customerPaymentRoutes from './routes/customerPayments';
import savingsSchemeRoutes from './routes/savingsScheme';
import filesRoutes from './routes/files';
import stockRequestRoutes from './routes/stockRequest';

const app = express();

// Trust reverse proxy (nginx) — needed for correct req.ip and rate limiting
if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}

// Request ID — assign early so all downstream middleware can use it
app.use(requestId);

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: config.corsOrigins === '*' ? true : (config.corsOrigins ?? true),
  credentials: true,
  exposedHeaders: ['X-Request-Id'],
}));

// Propagate request ID in response header
app.use((_req, res, next) => {
  res.setHeader('X-Request-Id', _req.requestId || '');
  next();
});

// Request logging
app.use(requestLogger);

// Global rate limiting
app.use('/api/', rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Health & Readiness ────────────────────────────────────

/** Liveness probe — always returns ok if the process is running */
app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    version: config.appVersion,
    env: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

/** Readiness probe — checks database connectivity */
app.get('/api/ready', async (_, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not_ready', timestamp: new Date().toISOString() });
  }
});

// ─── Auth routes (login/register are unauthenticated) ──────
// Stricter rate limit on auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' },
});
app.use('/api/auth', authLimiter, authRoutes);

// ─── All other routes (auth middleware applied per-router) ──
app.use('/api/sales', salesRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/branch', branchRoutes);
app.use('/api/branches', branchManagementRoutes);
app.use('/api/masters', mastersRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/cash-bank', cashBankRoutes);
app.use('/api/layaway', layawayRoutes);
app.use('/api/customer-payments', customerPaymentRoutes);
app.use('/api/savings-scheme', savingsSchemeRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/stock-requests', stockRequestRoutes);

// ─── Static files + SPA fallback (production builds) ───────
if (config.serveStatic) {
  const staticPath = path.resolve(config.staticDir);
  app.use(express.static(staticPath, {
    maxAge: '1y',               // cache-bust via Vite hashed filenames
    index: false,               // let the fallback handle /
  }));
  // SPA fallback: any non-API GET returns index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

// ─── Global error handler (must be last) ───────────────────
app.use(errorHandler);

export default app;
