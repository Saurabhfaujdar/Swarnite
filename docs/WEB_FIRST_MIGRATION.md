# JewelERP — Web-First Migration Plan

## 1. Target Architecture

```
                          ┌─────────────────────────────────┐
                          │         LOAD BALANCER            │
                          │    (Nginx / Cloud ALB)           │
                          └──────────┬──────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
           ┌────────▼──────────┐         ┌────────────▼────────┐
           │  Vite Static SPA  │         │  Express API Server  │
           │  (CDN / Nginx)    │         │  (Node.js cluster)   │
           │  ─────────────    │         │  ──────────────────  │
           │  React 18 + TS    │         │  JWT Auth            │
           │  TanStack Query   │         │  Tenant Middleware   │
           │  Tailwind CSS     │         │  Branch Middleware   │
           │  React Router     │         │  Rate Limiting       │
           └───────────────────┘         │  Helmet/CORS         │
                                         └──────────┬───────────┘
                                                    │
                                         ┌──────────▼───────────┐
                                         │  PostgreSQL 15+      │
                                         │  ─────────────────── │
                                         │  Row-level tenant    │
                                         │  isolation via       │
                                         │  companyId FK on     │
                                         │  every entity        │
                                         │                      │
                                         │  Prisma ORM          │
                                         └──────────────────────┘
```

### Key Principles
- **Shared database, row-level isolation**: All tenants share one PostgreSQL instance with `companyId` on every transactional table. No schema-per-tenant complexity.
- **JWT carries tenant context**: Token includes `companyId` + `branchId` + `role`. Every API call is scoped.
- **API-first**: Frontend only talks via `/api/*`. No server-rendered pages.
- **Electron becomes optional thin shell**: Points at deployed URL instead of bundling backend.
- **Single deployment serves all customers**: One server, one database, one frontend build.

---

## 2. Gap Analysis — Current vs. Web-First

| Area | Current State | Gap | Required Change |
|------|--------------|-----|-----------------|
| **JWT Token** | `{userId, role, branchId}` | No tenant identity | Add `companyId` to token payload |
| **Tenant isolation** | None — single-company assumption | Any user sees all companies' data | Add `companyId` FK to all transactional models; enforce via middleware |
| **Branch isolation** | `branchWhere()` exists but **not applied** in 9/11 route files | Data leak across branches | Apply `branchWhere(req)` to every GET/PUT/DELETE query |
| **Write validation** | `branchId` accepted from request body without checking | Users can write to foreign branches | Validate with `canAccessBranch()` before every write |
| **Label status changes** | No branch ownership check | Cross-branch label manipulation | Verify label.branchId ∈ req.branchScope before status change |
| **VoucherSequence** | Unique on `(prefix, entityType, financialYear)` | Two companies can collide on same voucher number | Add `companyId` to unique constraint |
| **Company endpoint** | `findFirst()` — returns first company | Multi-tenant impossible | Scope to `req.companyId` |
| **Master data** | Global (MetalType, ItemGroup, Purity) | Shared across tenants | Phase 1: Keep global (shared catalog). Phase 2: Add companyId if customization needed |
| **Account model** | `branchId` is optional | Accounts float across tenants | Add required `companyId`, keep optional `branchId` |
| **Auth registration** | No company assignment | Users created without tenant | Require `companyId` on registration |
| **Frontend API** | `baseURL: '/api'` | No tenant context header | Send companyId from auth state (already in token — no header needed) |
| **CORS** | `cors()` — allows all origins | Security risk | Whitelist production domains |
| **HTTPS** | Not configured | Required for production | Terminate at load balancer |
| **Rate limiting** | None | Abuse risk | Add `express-rate-limit` |
| **Secrets** | Hardcoded fallback JWT_SECRET | Security risk | Require env var, crash on missing |
| **Helmet** | Not used | Missing security headers | Add `helmet()` middleware |
| **File storage** | `Company.logo` stored as `Bytes` in DB | Not scalable | Phase 2: Move to S3/MinIO |
| **Electron** | Hardcoded `localhost:3001` | Assumes local server | Load from config URL |
| **CI/CD** | None | Manual deployments | Add GitHub Actions + Docker |

---

## 3. Frontend Changes

### 3.1 Remove Electron Dependency in App.tsx
The `electronAPI.onNavigate` listener is harmless in web (it's guarded by `if (electronAPI)`), so **no change needed** — it already works in both environments.

### 3.2 API Layer — No Changes Needed
The current API layer (`src/lib/api.ts`) already:
- Uses relative `/api` base URL (works with any proxy)
- Attaches JWT from localStorage
- Redirects to `/login` on 401

Since `companyId` is embedded in the JWT token and extracted server-side, the frontend doesn't need to send a separate tenant header.

### 3.3 Layout — Show Actual User Info
Currently hardcoded `[User : Admin]`. Should display actual user/branch from auth state. (This is an existing UI bug, not a migration blocker.)

### 3.4 Vite Config — Production Build
Already correct for web deployment. The dev proxy (`/api → localhost:3001`) is only active in dev. In production, Nginx routes `/api/*` to the Express server.

---

## 4. Backend Changes

### 4.1 Prisma Schema Changes (see implementation below)
- Add `companyId Int` to: `User`, `Account`, `SalesVoucher`, `PurchaseVoucher`, `CashEntry`, `BankEntry`, `JournalEntry`, `BranchTransfer`, `LayawayEntry`, `CustomerPayment`, `VoucherSequence`, `Salesman`, `MetalRate`, `LabelPrefix`, `Counter`, `AuditLog`
- Add `company Company @relation(...)` to each model
- Update `VoucherSequence @@unique` to include `companyId`
- Add `@@index([companyId])` to transactional models

### 4.2 Tenant + Branch Middleware (see implementation below)
- Extend `authenticate()` to extract `companyId` from JWT
- Add `companyWhere(req)` helper — returns `{ companyId: req.companyId }`
- Combine with `branchWhere(req)` for scoped queries: `{ ...companyWhere(req), ...branchWhere(req) }`
- New helper: `tenantScope(req)` returns both filters merged

### 4.3 Apply Isolation to All Routes
Every route file needs:
1. Import `authenticate` middleware
2. Apply `tenantScope(req)` to every `findMany`, `findFirst`, `count`, `aggregate`, `groupBy`
3. Validate `canAccessBranch(req, data.branchId)` on every write
4. Validate label ownership before status changes

### 4.4 VoucherSequence Scoping
Every `voucherSequence.upsert()` must include `companyId` in the unique where clause.

---

## 5. Authentication Changes

### 5.1 JWT Payload
```typescript
// BEFORE:
jwt.sign({ userId, role, branchId }, JWT_SECRET, { expiresIn: '24h' });

// AFTER:
jwt.sign({ userId, role, companyId, branchId }, JWT_SECRET, { expiresIn: '24h' });
```

### 5.2 Login — Include Company Context
The login flow loads `user.branch.companyId`. This gets embedded in the token.

### 5.3 Registration — Require Company
`POST /api/auth/register` must require `companyId` (passed by admin creating users for their company).

### 5.4 Remove Hardcoded JWT Fallback
```typescript
// BEFORE:
const JWT_SECRET = process.env.JWT_SECRET || 'jewelerp-secret-key-change-in-production';

// AFTER:
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
```

### 5.5 /auth/me — Return Company Info
Include `branch.company` in the response so the frontend knows the tenant.

---

## 6. Deployment Architecture

### 6.1 Recommended Stack
```
┌─────────────────────────────────────────────────────┐
│                      VPS / Cloud VM                  │
│                                                      │
│  ┌──────────────────┐     ┌──────────────────────┐  │
│  │     Nginx         │     │   PostgreSQL 15+     │  │
│  │  ─────────────    │     │   ─────────────────  │  │
│  │  :443 → TLS       │     │   :5432              │  │
│  │  / → static SPA   │     │   Connection pooling  │  │
│  │  /api → :3001     │     │   via PgBouncer       │  │
│  └──────────────────┘     └──────────────────────┘  │
│                                                      │
│  ┌──────────────────┐                                │
│  │  Node.js :3001    │                                │
│  │  (PM2 cluster)    │                                │
│  └──────────────────┘                                │
└─────────────────────────────────────────────────────┘
```

### 6.2 Alternative: Docker Compose
```yaml
services:
  db:
    image: postgres:15
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: jewelerp
      POSTGRES_USER: jewelerp
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  api:
    build: .
    ports: ["3001:3001"]
    environment:
      DATABASE_URL: postgresql://jewelerp:${DB_PASSWORD}@db:5432/jewelerp
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
    depends_on: [db]

  web:
    image: nginx:alpine
    ports: ["443:443", "80:80"]
    volumes:
      - ./dist:/usr/share/nginx/html
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on: [api]
```

---

## 7. Environment / Configuration Changes

### 7.1 Required Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/jewelerp

# Authentication (MUST be set — no fallback)
JWT_SECRET=<random-64-char-string>

# Server
PORT=3001
NODE_ENV=production

# CORS (comma-separated allowed origins)
CORS_ORIGINS=https://erp.yourcompany.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

### 7.2 Config Module
Create `server/config.ts` to centralize and validate env vars at startup.

---

## 8. File Storage Strategy

### Phase 1 (Current — Keep As-Is)
- `Company.logo` stays as `Bytes` in PostgreSQL
- Acceptable for small logos (< 1MB each)
- No user-uploaded files in the current schema

### Phase 2 (When Needed)
- Move to S3-compatible storage (AWS S3, MinIO, Cloudflare R2)
- Store URL reference in DB instead of binary
- Add presigned URL generation for uploads
- Add CDN for serving static assets

---

## 9. Electron De-scoping / Wrapper Strategy

### Option A: Thin Shell (Recommended)
Convert Electron from a full app container to a thin wrapper that loads the web URL:
```typescript
// electron/main.ts — AFTER
const APP_URL = process.env.JEWELERP_URL || 'https://erp.yourcompany.com';
mainWindow.loadURL(APP_URL);
```

Benefits:
- No local server needed
- Updates happen server-side (zero desktop deployment)
- Keeps the "desktop app" feel for customers who want it
- Menu navigation still works via IPC to React Router

### Option B: Remove Electron Entirely
- Delete `electron/` folder
- Remove electron dependencies from package.json
- Remove electron build scripts
- Ship browser-only product

### Recommendation: Option A for Phase 1, Option B long-term.

---

## 10. CI/CD Plan

### GitHub Actions Pipeline
```
┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│  Push to  │───▶│  Lint +  │───▶│  Build +  │───▶│  Deploy  │
│   main    │    │  Test    │    │  Docker   │    │  to VPS  │
└──────────┘    └──────────┘    └───────────┘    └──────────┘
```

Stages:
1. **Lint & Type Check**: `tsc --noEmit` + ESLint
2. **Unit Tests**: `vitest run`
3. **Integration Tests**: `jest --config jest.config.js` (with test DB)
4. **Build**: `vite build` + `tsc -p tsconfig.server.json`
5. **Docker Image**: Build & push to registry
6. **Deploy**: SSH to VPS, pull image, restart via PM2/Docker Compose
7. **Migrate**: Run `prisma migrate deploy` on the production DB

---

## 11. Production Hardening Checklist

### Security
- [ ] Remove hardcoded JWT_SECRET fallback — require env var
- [ ] Add `helmet()` middleware for security headers
- [ ] Configure CORS with explicit origin whitelist
- [ ] Add `express-rate-limit` to prevent brute-force
- [ ] Add request body size limit (`express.json({ limit: '1mb' })`)
- [ ] Sanitize all user inputs (already using express-validator in some places)
- [ ] Enable HTTPS (terminate at Nginx/load balancer)
- [ ] Add CSRF protection for cookie-based auth (if ever added)
- [ ] Audit npm dependencies for known vulnerabilities (`npm audit`)

### Reliability
- [ ] Add health check endpoint (already exists: `GET /api/health`)
- [ ] Add graceful shutdown handler (SIGTERM)
- [ ] Add request logging (morgan or pino)
- [ ] Add structured error logging
- [ ] Set up database connection pooling
- [ ] Add database backup automation (pg_dump cron)

### Performance
- [ ] Enable Prisma query logging in development only
- [ ] Add database indexes for common query patterns (most already exist)
- [ ] Enable gzip compression (`compression` middleware)
- [ ] Set appropriate cache headers for static assets (Nginx)
- [ ] Consider read replicas if query load grows

### Monitoring
- [ ] Application error tracking (Sentry or similar)
- [ ] Uptime monitoring (UptimeRobot, Pingdom)
- [ ] Database size monitoring
- [ ] API response time tracking

---

## 12. Migration Steps (Ordered)

### Phase 1: Fix Data Isolation (CRITICAL — Do First)
1. **Add `companyId` to Prisma schema** — new FK on all transactional models
2. **Create migration** — `prisma migrate dev --name add-company-id`
3. **Backfill existing data** — set `companyId` from `branch.companyId` for all rows
4. **Add tenant middleware** — extract & enforce `companyId` from JWT
5. **Apply `branchWhere()` to all routes** — fix the 9 routes currently missing it
6. **Validate writes** — add `canAccessBranch()` checks to all POST/PUT/DELETE
7. **Add `companyId` to JWT** — update login to include it
8. **Update `VoucherSequence` unique constraint** — include `companyId`

### Phase 2: Harden for Production
9. **Remove JWT_SECRET fallback** — require env var
10. **Add `helmet()`** — security headers
11. **Configure CORS whitelist** — restrict to known origins
12. **Add rate limiting** — prevent abuse
13. **Add request logging** — morgan/pino
14. **Add graceful shutdown** — handle SIGTERM

### Phase 3: Deploy
15. **Create Dockerfile** — multi-stage build (frontend + backend)
16. **Create docker-compose.yml** — API + DB + Nginx
17. **Create Nginx config** — serve SPA + proxy API
18. **Create `.env.production`** — production environment template
19. **Set up CI/CD** — GitHub Actions workflow
20. **Deploy to VPS/cloud** — initial deployment

### Phase 4: Electron De-scope
21. **Update `electron/main.ts`** — load from configurable URL
22. **Make Electron build optional** — separate npm script
23. **Update `package.json`** — conditional electron dependencies

---

## 13. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|-----------|------------|
| 1 | **Data leak between tenants** if `companyId` filter missed | Critical | Medium | Automated tests that verify every query includes companyId filter. Prisma middleware as safety net. |
| 2 | **Voucher number collision** during migration | High | Low | Run backfill in maintenance window. Add unique constraint after backfill. |
| 3 | **Breaking existing single-tenant users** | High | Medium | Default companyId=1 for existing data. Migration script is idempotent. |
| 4 | **Performance degradation** with tenant filter on every query | Medium | Low | Indexes on `companyId` column. Query plans verified before deploy. |
| 5 | **JWT secret rotation** breaks active sessions | Medium | Low | Support checking against both old and new secret during rotation window. |
| 6 | **Database size growth** with shared-DB multi-tenancy | Low | Medium | Monitor per-tenant row counts. Plan sharding strategy for 100+ tenants. |
| 7 | **Noisy neighbor** — one tenant's heavy queries affect others | Medium | Low | Connection pooling per tenant. Rate limiting per user. |
| 8 | **Branch hierarchy corruption** across tenants | Critical | Very Low | Foreign key constraints ensure branches can only reference companies they belong to. |
| 9 | **Electron users lose offline capability** | Low | Medium | Not currently offline-capable anyway. Document that web is the primary product. |
| 10 | **Migration downtime** | Medium | Medium | Run additive schema changes (add columns) without downtime. Backfill in batches. |

---

## Implementation Files Created

The following files contain the actual implementation code:

| File | Purpose |
|------|---------|
| `server/config.ts` | Centralized environment config with validation |
| `server/middleware/tenantScope.ts` | Tenant isolation middleware + helpers |
| `server/middleware/branchAccess.ts` | Updated with companyId support |
| `server/routes/auth.ts` | Updated JWT with companyId |
| `server/routes/sales.ts` | Updated with tenant + branch scoping |
| `server/routes/purchase.ts` | Updated with tenant + branch scoping |
| `server/routes/inventory.ts` | Updated with tenant + branch scoping |
| `server/routes/accounts.ts` | Updated with tenant + branch scoping |
| `server/routes/cashBank.ts` | Updated with tenant + branch scoping |
| `server/routes/layaway.ts` | Updated with tenant + branch scoping |
| `server/routes/customerPayments.ts` | Updated with tenant + branch scoping |
| `server/routes/reports.ts` | Updated with tenant + branch scoping |
| `server/routes/masters.ts` | Updated with tenant + branch scoping |
| `server/routes/branch.ts` | Updated with tenant + branch scoping |
| `server/routes/branchManagement.ts` | Updated with tenant + branch scoping |
| `server/app.ts` | Updated with helmet, CORS, rate-limit |
| `prisma/schema.prisma` | Updated with companyId on all models |
| `prisma/migrations/add_company_id_backfill.sql` | Data backfill script |
| `Dockerfile` | Multi-stage production build |
| `docker-compose.yml` | Full deployment stack |
| `nginx.conf` | Reverse proxy + SPA serving |
| `.github/workflows/deploy.yml` | CI/CD pipeline |
| `.env.example` | Environment variable template |
