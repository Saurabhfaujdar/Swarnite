# JewelERP: Electron → Web-First Migration Roadmap

> **Last updated:** 2026-03-11
> **Status:** In-progress (Phase 1 substantially complete)

---

## 1. Current-State Assessment

### Architecture
```
┌──────────────────────────────────────────────────────────────┐
│  Electron Shell (electron/main.ts)                           │
│  ┌────────────────┐   IPC    ┌─────────────────────────────┐ │
│  │  Native Menu   │ ───────► │  React SPA (Vite, port 5173)│ │
│  │  BrowserWindow │          │  React Router v7            │ │
│  └────────────────┘          │  TanStack Query v5          │ │
│                              │  Axios → /api/*             │ │
│                              └──────────┬──────────────────┘ │
└─────────────────────────────────────────┼────────────────────┘
                                          │ HTTP
                              ┌───────────▼──────────────┐
                              │  Express API (port 3001)  │
                              │  JWT auth, Prisma ORM     │
                              └───────────┬──────────────┘
                                          │
                              ┌───────────▼──────────────┐
                              │  PostgreSQL               │
                              └──────────────────────────┘
```

### What already works for web

| Layer | Component | Web-ready? | Notes |
|-------|-----------|------------|-------|
| **Frontend** | React SPA | **Yes** | BrowserRouter, Vite dev server, no fs/node imports |
| **Frontend** | API client (`src/lib/api.ts`) | **Yes** | Axios with `/api` base, interceptors for JWT |
| **Frontend** | Auth store (`src/lib/auth.ts`) | **Yes** | Zustand store with `companyId`, hydrate/logout |
| **Frontend** | Electron guard in App.tsx | **Yes** | `if (electronAPI?.onNavigate)` — no-op in browser |
| **Backend** | Express server | **Yes** | Standalone process, no Electron coupling |
| **Backend** | Auth middleware | **Yes** | JWT-based `authenticate()` on all 11 route files |
| **Backend** | Tenant isolation | **Yes** | `companyId` on 15 models, `tenantScope()` + `canAccessBranch()` applied |
| **Backend** | Security headers | **Yes** | Helmet, CORS, rate limiter configured |
| **Backend** | Centralized config | **Yes** | `server/config.ts` with env validation |
| **Database** | Multi-tenant schema | **Yes** | `companyId` FK + index on all transactional models |
| **Infra** | Docker build | **Yes** | Multi-stage Dockerfile, docker-compose, nginx.conf |
| **Infra** | CI pipeline | **Yes** | GitHub Actions with test + docker build jobs |

### What does NOT work for web

| Issue | Location | Severity |
|-------|----------|----------|
| No route guards — unauthenticated users can navigate to any page | `src/App.tsx` | **High** |
| Layout hardcodes "User: Admin" instead of real user | `src/components/Layout/Layout.tsx` | Medium |
| No logout button in UI | `src/components/Layout/Layout.tsx` | Medium |
| Login page shows default credentials ("admin / admin123") | `src/pages/Login.tsx` | Low (UX) |
| `package.json` has `"main": "dist-electron/main.js"` (Electron entry) | `package.json` | Low |
| Electron deps inflate `npm install` (electron, electron-builder) | `package.json` | Low |
| nginx.conf proxies `/` to Express (should serve static) | `nginx.conf` | Low (perf) |

---

## 2. Target-State Architecture

```
                        ┌─────────────────┐
                        │   CDN / Nginx   │
                        │  Static SPA     │
                        │  (dist/*.html,  │
                        │   js, css)      │
                        └───────┬─────────┘
                                │  /api/*
                        ┌───────▼─────────┐
                        │  Express API    │
                        │  Node 20        │
                        │  Helmet + CORS  │
                        │  JWT + tenant   │
                        │  isolation      │
                        └───────┬─────────┘
                                │
                        ┌───────▼─────────┐
                        │  PostgreSQL 16  │
                        │  (managed or    │
                        │   Docker)       │
                        └─────────────────┘

Optional (Phase 5):
┌──────────────────────┐
│ Electron thin shell  │
│ loadURL(https://...) │
│ No IPC, no menu      │
└──────────────────────┘
```

**Key principles:**
- SPA served as static files (Nginx or CDN), never through Express
- API is the single gateway to data — all state lives in PostgreSQL
- JWT carries `userId`, `role`, `companyId`, `branchId`
- `companyId` scopes every query; `branchId` scopes operational data
- Electron becomes an optional thin wrapper that loads the web URL

---

## 3. Workstreams

| # | Workstream | Owner | Description |
|---|------------|-------|-------------|
| W1 | **Frontend Auth & Guards** | Frontend | Route protection, auth state, logout, real user display |
| W2 | **Electron Decoupling** | Frontend | Remove dead Electron useEffect; clean package.json |
| W3 | **Session Hardening** | Backend | Token refresh, secure cookie option, password policies |
| W4 | **Deployment Pipeline** | DevOps | Nginx static serving, SSL, healthcheck, zero-downtime |
| W5 | **Data Migration** | DBA | Backfill `companyId` on existing rows, seed default company |
| W6 | **Electron Wrapper** | Optional | Thin shell pointing to hosted URL |

---

## 4. Milestone-Based Roadmap

### Phase 1 — Browser-Runnable App
> **Goal:** Any user can open a browser, log in, and use JewelERP without Electron.

| # | Task | Status | Files |
|---|------|--------|-------|
| 1.1 | Centralized config (`server/config.ts`) | **Done** | `server/config.ts` |
| 1.2 | Prisma schema: `companyId` on all transactional models | **Done** | `prisma/schema.prisma` |
| 1.3 | Auth middleware: `authenticate()` extracts `companyId` from JWT | **Done** | `server/middleware/branchAccess.ts` |
| 1.4 | Apply `authenticate` + `tenantScope` to all 11 route files | **Done** | `server/routes/*.ts` |
| 1.5 | Security middleware (Helmet, CORS, rate limiter) | **Done** | `server/app.ts` |
| 1.6 | Auth store (Zustand) with `companyId`, `hydrate`, `logout` | **Done** | `src/lib/auth.ts` |
| 1.7 | **Route guards** — redirect to `/login` if unauthenticated | **TODO** | `src/App.tsx` |
| 1.8 | **Layout** — display real user name + logout button | **TODO** | `src/components/Layout/Layout.tsx` |
| 1.9 | **Login** — use auth store, remove hardcoded credentials hint | **TODO** | `src/pages/Login.tsx` |
| 1.10 | Remove Electron `useEffect` from App.tsx | **TODO** | `src/App.tsx` |

**Success criteria:**
- [ ] `npm run dev` → open `http://localhost:5173` in Chrome → login → use all features
- [ ] Unauthenticated navigation to `/sales/retail` redirects to `/login`
- [ ] Layout shows logged-in user's name and branch
- [ ] Logout button clears token and redirects to `/login`
- [ ] Server compiles cleanly (`npx tsc --noEmit -p tsconfig.server.json` → 0 errors)
- [ ] Frontend compiles cleanly (`npx tsc --noEmit` → 0 errors)

---

### Phase 2 — Central Hosting & Config Cleanup
> **Goal:** One deployed instance serves multiple browser users.

| # | Task | Status | Files |
|---|------|--------|-------|
| 2.1 | `vite.config.ts`: env-based API URL for production builds | **TODO** | `vite.config.ts` |
| 2.2 | Nginx: serve `dist/` as static, proxy only `/api` | **TODO** | `nginx.conf` |
| 2.3 | Dockerfile: copy `dist/` into nginx container | **TODO** | `Dockerfile`, `docker-compose.yml` |
| 2.4 | Data migration script: backfill `companyId` on existing rows | **TODO** | `prisma/migrations/…` |
| 2.5 | Seed script: create default Company if none exists | **TODO** | `prisma/seed.ts` |
| 2.6 | `.env.production` template with all required vars | **TODO** | `.env.production.example` |
| 2.7 | Package.json: de-prioritize Electron scripts | **TODO** | `package.json` |

**Success criteria:**
- [ ] `docker compose up` → healthy containers → browser access on port 80
- [ ] Existing single-tenant data has `companyId = 1` after migration
- [ ] SPA loads from Nginx (not proxied through Express)
- [ ] API responds on `/api/health` from Docker container
- [ ] No env var missing in production (`config.ts` throws on boot if so)

---

### Phase 3 — Auth & Session Hardening
> **Goal:** Production-grade auth suitable for multi-user web access.

| # | Task | Status | Files |
|---|------|--------|-------|
| 3.1 | Token refresh endpoint (`POST /api/auth/refresh`) | **TODO** | `server/routes/auth.ts` |
| 3.2 | Shorter token TTL (1h access + 7d refresh) | **TODO** | `server/config.ts`, auth route |
| 3.3 | `httpOnly` secure cookie option for refresh token | **TODO** | `server/routes/auth.ts` |
| 3.4 | Password complexity validation on register/change | **TODO** | `server/routes/auth.ts` |
| 3.5 | Account lockout after N failed attempts | **TODO** | `server/routes/auth.ts` |
| 3.6 | Audit log for login/logout events | **TODO** | `server/routes/auth.ts` |
| 3.7 | Frontend: auto-refresh token before expiry | **TODO** | `src/lib/api.ts` |
| 3.8 | Frontend: "Session expired" toast instead of silent redirect | **TODO** | `src/lib/api.ts` |

**Success criteria:**
- [ ] Token expires after 1 hour; refresh extends seamlessly
- [ ] 5 failed logins → 15 min lockout
- [ ] Passwords require minimum 8 chars, 1 number, 1 uppercase
- [ ] Refresh token stored in `httpOnly` cookie (not localStorage)
- [ ] Login/logout events appear in audit log

---

### Phase 4 — Production Deployment
> **Goal:** Live, monitored, backed-up production instance.

| # | Task | Status | Files |
|---|------|--------|-------|
| 4.1 | SSL certificates (Let's Encrypt or managed) | **TODO** | `nginx.conf` |
| 4.2 | Uncomment SSL block in nginx.conf, add redirect 80→443 | **TODO** | `nginx.conf` |
| 4.3 | Database backup cron (pg_dump daily) | **TODO** | `docker-compose.yml` or host cron |
| 4.4 | Health check endpoint (`/api/health`) | **TODO** | `server/app.ts` |
| 4.5 | Structured logging (JSON format) | **TODO** | `server/app.ts` or logger module |
| 4.6 | Error monitoring (Sentry or equivalent) | **TODO** | `server/app.ts`, `src/main.tsx` |
| 4.7 | GitHub Actions: deploy on merge to `main` | **TODO** | `.github/workflows/deploy.yml` |
| 4.8 | Load testing (k6 or artillery) | **TODO** | `tests/load/` |
| 4.9 | WAF / DDoS protection (Cloudflare or equivalent) | **TODO** | Infra |

**Success criteria:**
- [ ] HTTPS with valid cert, HTTP redirects to HTTPS
- [ ] Daily automated backups with verified restore procedure
- [ ] `/api/health` returns `200` with DB connectivity check
- [ ] P95 response time < 500ms for typical operations
- [ ] Alerts fire on 5xx spike or health check failure
- [ ] Zero-downtime deploys via rolling update

---

### Phase 5 — Electron Wrapper Simplification (Optional)
> **Goal:** If desktop distribution is still needed, reduce Electron to a thin shell.

| # | Task | Status | Files |
|---|------|--------|-------|
| 5.1 | Replace `loadFile` with `loadURL(https://app.jewelerp.com)` | **TODO** | `electron/main.ts` |
| 5.2 | Remove application menu (users navigate via web UI) | **TODO** | `electron/main.ts` |
| 5.3 | Remove preload.ts (no IPC needed) | **TODO** | `electron/preload.ts` |
| 5.4 | Move `electron`, `electron-builder` to optional dep group | **TODO** | `package.json` |
| 5.5 | Add `build:electron-shell` script for packaging | **TODO** | `package.json` |

**Success criteria:**
- [ ] Electron app opens and loads the hosted web URL
- [ ] No IPC, no preload, no native menu
- [ ] Shell binary size < 100 MB (vs current full bundle)
- [ ] Offline: shows "No connection" message, no data loss

---

## 5. What Can Remain Unchanged

| Component | Why |
|-----------|-----|
| `src/lib/api.ts` | Axios client with `/api` base + interceptors is already web-native |
| `src/lib/utils.ts` | Pure functions — no platform dependencies |
| `src/lib/export.ts` | Uses Blob API for downloads — browser-native |
| `src/main.tsx` | Standard React 18 entry — BrowserRouter, QueryClient, Toaster |
| All page components (`src/pages/**`) | Pure React — no Electron or Node imports |
| `src/components/TaxInvoice.tsx` | Print-oriented React component — browser-compatible |
| All backend route files (`server/routes/**`) | Already tenant-isolated with `authenticate` + `tenantScope` |
| `server/middleware/branchAccess.ts` | Complete tenant + branch isolation middleware |
| `server/config.ts` | Env-based config with prod validation |
| `server/app.ts` | Helmet, CORS, rate limit already configured |
| `prisma/schema.prisma` | Multi-tenant schema with `companyId` on all models |
| `vite.config.ts` | No Electron plugin — dev proxy to `:3001` works |
| `Dockerfile` | Multi-stage build correct |
| `docker-compose.yml` | PostgreSQL + app + nginx stack |
| `.github/workflows/ci.yml` | Test + build pipeline |
| All test files (`tests/**`) | Jest + Vitest tests are framework-agnostic |

---

## 6. What Must Be Refactored

| File | Change | Phase |
|------|--------|-------|
| `src/App.tsx` | Add `<PrivateRoute>` wrapper; remove Electron `useEffect` | 1 |
| `src/components/Layout/Layout.tsx` | Read user from `useAuthStore()`; add logout button | 1 |
| `src/pages/Login.tsx` | Use `useAuthStore().login()`; remove credentials hint | 1 |
| `nginx.conf` | Serve `dist/` as static files; proxy only `/api` | 2 |
| `package.json` | Remove `"main"` field; clean Electron scripts from default `build` | 2 |
| `server/routes/auth.ts` | Add refresh endpoint; shorter TTL; secure cookie | 3 |
| `src/lib/api.ts` | Add token refresh interceptor; session-expired toast | 3 |

---

## 7. What Can Be Deferred

| Item | Reason | Defer until |
|------|--------|-------------|
| OAuth / SSO integration | Single-tenant is fine initially | Post-launch |
| WebSocket real-time updates | Polling via TanStack Query is sufficient | Post-launch |
| File/image uploads (S3) | No file upload features exist yet | When needed |
| Multi-language / i18n | India-only market currently | When needed |
| Electron wrapper simplification | Not blocking web launch | Phase 5 |
| Mobile-responsive CSS | Desktop ERP — users are on desktops | Post-launch |
| Email notifications | No email features exist | When needed |
| Redis session store | In-memory JWT works at current scale | > 1000 concurrent |

---

## 8. Rollback Plan

### Per-Phase Rollback

| Phase | Rollback trigger | Rollback action | Data impact |
|-------|-----------------|-----------------|-------------|
| **1** | Frontend breaks for Electron users | `git revert` the App.tsx/Layout changes; Electron useEffect is safely guarded | None |
| **2** | Docker deploy fails | Keep running `npm run dev` locally; nginx is additive | None |
| **3** | Token refresh breaks sessions | Revert to 24h access token (single JWT, no refresh) | None — tokens are stateless |
| **4** | Production outage | Revert to previous Docker image tag; DB has prior backup | Restore from pg_dump |
| **5** | Electron users can't connect | Re-enable `loadFile` fallback to local `dist/` | None |

### Cross-Cutting Safety

- **Database:** Prisma migrations are forward-only but additive (new columns are nullable or have defaults). No destructive schema changes.
- **Backfill script:** Idempotent — can run multiple times safely (`UPDATE ... WHERE companyId IS NULL`).
- **Feature flags:** The Electron guard (`if (electronAPI?.onNavigate)`) is already a de-facto feature flag. No code path breaks if it's absent.

---

## 9. Success Criteria Summary

| Phase | Gate | Measurable |
|-------|------|------------|
| **1 — Browser-Runnable** | App works fully in Chrome without Electron | All routes accessible after login; logout works; no console errors referencing `electronAPI` |
| **2 — Centrally Hosted** | `docker compose up` serves the app | Browser loads SPA from Nginx on port 80; API responds; existing data intact with `companyId = 1` |
| **3 — Auth Hardened** | Tokens are short-lived with refresh | Access token TTL = 1h; refresh via `httpOnly` cookie; lockout after 5 failures; audit log entries for auth events |
| **4 — Production** | Live, monitored, backed up | HTTPS valid; health check green; daily backup verified; P95 < 500ms; alerting active |
| **5 — Electron Thin** | Desktop users connect to hosted URL | Shell binary < 100 MB; opens hosted URL; no IPC or native menu; shows offline message gracefully |

---

## Appendix A — Files Created / Modified by Prior Work

These changes are already committed and compiling:

```
CREATED:
  server/config.ts                  — centralized env config
  src/lib/auth.ts                   — Zustand auth store
  docs/WEB_FIRST_MIGRATION.md       — earlier migration analysis
  Dockerfile                        — multi-stage Node 20 build
  docker-compose.yml                — postgres + app + nginx
  nginx.conf                        — reverse proxy config
  .github/workflows/ci.yml          — test + docker build
  .dockerignore                     — build exclusions

MODIFIED:
  prisma/schema.prisma              — companyId on 15 models
  server/app.ts                     — helmet, CORS, rate-limit
  server/middleware/branchAccess.ts  — tenantScope(), canAccessBranch()
  server/routes/auth.ts             — companyId in JWT, company in login response
  server/routes/sales.ts            — tenantScope on all queries
  server/routes/purchase.ts         — tenantScope on all queries
  server/routes/inventory.ts        — labelScope through branch.companyId
  server/routes/accounts.ts         — companyId filtering
  server/routes/cashBank.ts         — tenantScope + companyId on sequences
  server/routes/layaway.ts          — tenantScope + canAccessBranch
  server/routes/customerPayments.ts — companyId filtering
  server/routes/reports.ts          — tenantScope on all aggregations
  server/routes/masters.ts          — companyId scoping
  server/routes/branch.ts           — companyId on transfers
  server/routes/branchManagement.ts — companyId on audit logs + transfers
  .env.example                      — expanded with all config vars
```

## Appendix B — Immediate Next Actions (Phase 1 Remaining)

The following 4 file changes complete Phase 1:

**1. `src/App.tsx`** — Add `PrivateRoute` wrapper, remove Electron `useEffect`
```tsx
// Wrap Layout in auth check:
// If no token → Navigate to /login
// Hydrate auth store on mount
```

**2. `src/components/Layout/Layout.tsx`** — Real user + logout
```tsx
// Replace "User: Admin" with useAuthStore().user.fullName
// Add logout button that calls useAuthStore().logout()
```

**3. `src/pages/Login.tsx`** — Use auth store
```tsx
// Call useAuthStore().login(token, user) instead of raw localStorage
// Remove "Default: admin / admin123" hint
```

**4. `package.json`** — Remove Electron from default build path
```json
// Change "build" to not include build:electron
// Keep build:electron and package as separate opt-in scripts
```
