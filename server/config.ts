/**
 * Centralized Configuration
 * ─────────────────────────
 * Single source of truth for all backend configuration.
 * Validates required environment variables at startup.
 * Import this instead of reading process.env directly.
 *
 * Environment hierarchy: development → staging → production
 * Secrets in production come from env vars (injected by Docker/CI/secrets manager).
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`${name} must be a valid integer, got "${raw}"`);
  return parsed;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isDev = nodeEnv === 'development';
const isStaging = nodeEnv === 'staging';
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';
const isProductionLike = isProd || isStaging;

export const config = {
  // ─── App identity ────────────────────────────────────────
  appName: 'JewelERP',
  appVersion: process.env.APP_VERSION || '1.0.0',
  port: envInt('PORT', 3001),
  nodeEnv,
  isDev,
  isStaging,
  isProd,
  isTest,
  isProductionLike,

  // ─── Database ────────────────────────────────────────────
  databaseUrl: isProductionLike
    ? requireEnv('DATABASE_URL')
    : (process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jewelerp'),

  // ─── JWT / Access tokens ─────────────────────────────────
  jwtSecret: isProductionLike
    ? requireEnv('JWT_SECRET')
    : (process.env.JWT_SECRET || 'jewelerp-dev-secret-do-not-use-in-prod'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',

  // ─── Refresh tokens ─────────────────────────────────────
  refreshTokenSecret: isProductionLike
    ? requireEnv('REFRESH_TOKEN_SECRET')
    : (process.env.REFRESH_TOKEN_SECRET || 'jewelerp-refresh-dev-secret'),
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  refreshTokenMaxPerUser: envInt('REFRESH_TOKEN_MAX_PER_USER', 5),

  // ─── Cookies ─────────────────────────────────────────────
  cookieSecure: envBool('COOKIE_SECURE', isProductionLike),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cookieSameSite: (process.env.COOKIE_SAMESITE || (isDev ? 'lax' : 'strict')) as 'strict' | 'lax' | 'none',

  // ─── CORS ────────────────────────────────────────────────
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : (isDev ? '*' : undefined),

  // ─── Rate limiting ───────────────────────────────────────
  rateLimitWindowMs: envInt('RATE_LIMIT_WINDOW_MS', 900_000),
  rateLimitMax: envInt('RATE_LIMIT_MAX', isProd ? 100 : 200),
  authRateLimitWindowMs: envInt('AUTH_RATE_LIMIT_WINDOW_MS', 900_000),
  authRateLimitMax: envInt('AUTH_RATE_LIMIT_MAX', isProd ? 10 : 15),

  // ─── Logging ─────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),

  // ─── Server lifecycle ────────────────────────────────────
  shutdownTimeoutMs: envInt('SHUTDOWN_TIMEOUT_MS', 10_000),
  trustProxy: envInt('TRUST_PROXY', isProductionLike ? 1 : 0),

  // ─── Static file serving ─────────────────────────────────
  // In Docker production, Express serves the built frontend from dist/
  serveStatic: envBool('SERVE_STATIC', isProductionLike),
  staticDir: process.env.STATIC_DIR || 'dist',

  // ─── GST API ─────────────────────────────────────────────
  // Official GST taxpayer lookup: GET {gstApiBaseUrl}/commonapi/v1.3/search?gstin={gstin}&action=TP
  gstApiBaseUrl: process.env.GST_API_BASE_URL || 'https://api.gst.gov.in',

  // ─── Backup (injected at container level) ────────────────
  backupEnabled: envBool('BACKUP_ENABLED', false),
  backupCron: process.env.BACKUP_CRON || '0 2 * * *', // 2 AM daily
  backupRetentionDays: envInt('BACKUP_RETENTION_DAYS', 30),
};
