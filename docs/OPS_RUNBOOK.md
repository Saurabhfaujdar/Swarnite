# JewelERP — Operations Runbook

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [First-Time Setup](#first-time-setup)
4. [Starting the Stack](#starting-the-stack)
5. [Stopping the Stack](#stopping-the-stack)
6. [Environment Configuration](#environment-configuration)
7. [Database Operations](#database-operations)
8. [Backup & Recovery](#backup--recovery)
9. [Monitoring & Health Checks](#monitoring--health-checks)
10. [Troubleshooting](#troubleshooting)
11. [SSL / HTTPS Setup](#ssl--https-setup)
12. [Updating / Rolling Deploys](#updating--rolling-deploys)

---

## Architecture Overview

```
Browser → Nginx (:80/443) → Express App (:3001) → PostgreSQL (:5432)
                                  ├── API routes  /api/*
                                  └── Static SPA  / (Vite build)
```

| Service | Image | Purpose |
|---------|-------|---------|
| `db` | `postgres:16-alpine` | PostgreSQL database |
| `app` | `jewelerp:latest` | Express API + static frontend |
| `nginx` | `nginx:alpine` | Reverse proxy, TLS termination |
| `backup` | `postgres:16-alpine` | Sidecar: scheduled DB backups |

---

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- Git
- Domain name (for production) with DNS pointed at your server
- TLS certificates (Let's Encrypt recommended)

---

## First-Time Setup

### 1. Clone and configure

```bash
git clone <repo-url> /opt/jewelerp
cd /opt/jewelerp
```

### 2. Create environment file

```bash
# For staging:
cp deploy/staging.env .env

# For production:
cp deploy/production.env .env
```

Edit `.env` and fill in all `REPLACE_OR_INJECT_VIA_SECRETS` values:

```bash
# REQUIRED secrets — generate strong random values:
DATABASE_URL=postgresql://jewelerp:<PASSWORD>@db:5432/jewelerp
JWT_SECRET=<random-64-chars>
REFRESH_TOKEN_SECRET=<random-64-chars>

# Generate secrets with:
openssl rand -base64 48
```

### 3. (Optional) Set per-environment frontend config

```bash
# The default public/config.js works for most setups (API_URL: '/api').
# To brand staging differently:
cp deploy/config.staging.js public/config.js
```

### 4. Build and start

```bash
docker compose up -d --build
```

### 5. Seed initial data (first time only)

```bash
docker compose exec app npx prisma db seed
```

---

## Starting the Stack

```bash
cd /opt/jewelerp

# Standard start
docker compose up -d

# With backup sidecar
docker compose --profile backup up -d

# View logs
docker compose logs -f app
docker compose logs -f nginx
```

### Verify startup

```bash
# Health check
curl http://localhost/api/health

# Expected response:
# {"status":"ok","version":"...","env":"production"}

# Readiness (includes DB connectivity)
curl http://localhost/api/health/ready
```

---

## Stopping the Stack

### Graceful shutdown

```bash
docker compose down
```

The app handles SIGTERM gracefully — it stops accepting new requests, drains in-flight requests (30s timeout), closes DB connections, then exits.

### Full teardown (keeps data)

```bash
docker compose down
```

### Full teardown **including database volume** (DESTRUCTIVE)

```bash
docker compose down -v
```

> ⚠️ This deletes all database data permanently. Ensure you have a backup.

---

## Environment Configuration

### Configuration hierarchy

| Layer | Where | Rebuild needed? |
|-------|-------|-----------------|
| **Runtime frontend** | `public/config.js` | No — volume mount swap |
| **Server env vars** | `.env` or `deploy/*.env` | No — restart only |
| **Build-time frontend** | `VITE_*` in build env | Yes — rebuild image |

### Key environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | Access token signing key |
| `REFRESH_TOKEN_SECRET` | ✅ | — | Refresh token signing key |
| `NODE_ENV` | ✅ | development | `development`, `staging`, `production` |
| `PORT` | — | 3001 | Server listen port |
| `CORS_ORIGIN` | — | `*` | Allowed CORS origins |
| `SERVE_STATIC` | — | false | Serve Vite build from Express |
| `STATIC_DIR` | — | dist | Path to Vite build output |
| `COOKIE_SECURE` | — | false | Secure flag on refresh cookie |
| `COOKIE_DOMAIN` | — | — | Domain for refresh cookie |
| `COOKIE_SAME_SITE` | — | lax | SameSite cookie policy |

### Swapping frontend config without rebuild

```bash
# Copy the environment-specific config
cp deploy/config.production.js public/config.js

# Restart just the app (nginx caches might need clearing)
docker compose restart app
```

Or volume-mount in `docker-compose.yml`:
```yaml
volumes:
  - ./deploy/config.production.js:/app/dist/config.js:ro
```

---

## Database Operations

### Run pending migrations

```bash
docker compose exec app npx prisma migrate deploy
```

> Migrations run automatically on container start (in CMD).

#### Branch hierarchy data heal (May 2026)

Migration `20260501000000_backfill_branch_hierarchy` re-runs the
`branches.isMaster` / `branchType` / `parentId` backfill **idempotently**.
It ships purely as a self-heal for instances where the previous
`20260423000000_fix_branch_unique_constraint` data UPDATE either didn't
take effect or was applied to a database that was reseeded afterwards.

There is nothing to do operationally beyond redeploying — the container's
entrypoint runs `prisma migrate deploy` automatically. To verify after
deploy:

```bash
docker compose exec app npx prisma migrate status
docker compose exec db psql -U jewelerp -d jewelerp -c \
  "SELECT \"companyId\", count(*) FILTER (WHERE \"isMaster\") AS masters FROM branches WHERE \"isDeleted\"=false GROUP BY 1;"
```

Each company should report exactly one master row.

### Create a new migration (development)

```bash
npx prisma migrate dev --name describe_change
```

### Open Prisma Studio (development only)

```bash
npx prisma studio
```

### Connect to database directly

```bash
docker compose exec db psql -U jewelerp -d jewelerp
```

---

## Backup & Recovery

### Automatic backups

Enable the backup sidecar:

```bash
docker compose --profile backup up -d backup
```

Backups are saved to the `backups` Docker volume as gzipped SQL dumps. Retention is controlled by `BACKUP_RETENTION_DAYS` (default: 30).

### Manual backup

```bash
docker compose exec db pg_dump -U jewelerp jewelerp | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restore from backup

```bash
# 1. Stop the app (keep DB running)
docker compose stop app

# 2. Drop and recreate the database
docker compose exec db psql -U jewelerp -c "DROP DATABASE jewelerp;"
docker compose exec db psql -U jewelerp -c "CREATE DATABASE jewelerp;"

# 3. Restore
gunzip -c backup_20250101_120000.sql.gz | docker compose exec -T db psql -U jewelerp -d jewelerp

# 4. Start the app (migrations will run automatically)
docker compose start app
```

### List backups

```bash
docker compose exec backup ls -la /backups/
```

---

## Monitoring & Health Checks

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Liveness — app is running |
| `GET /api/health/ready` | Readiness — app + DB are connected |

### Docker health check

Built into the Dockerfile. Docker automatically restarts unhealthy containers when configured with `restart: unless-stopped`.

### Check container status

```bash
docker compose ps
docker compose logs --tail=50 app
docker compose logs --tail=50 db
```

### View real-time logs

```bash
docker compose logs -f app
```

### Check database connections

```bash
docker compose exec db psql -U jewelerp -c "SELECT count(*) FROM pg_stat_activity WHERE datname='jewelerp';"
```

---

## Troubleshooting

### App won't start — "migration failed"

```bash
# Check migration status
docker compose exec app npx prisma migrate status

# If stuck, check DB connectivity
docker compose exec app npx prisma db execute --stdin <<< "SELECT 1"

# Fix: manually run migrations
docker compose exec app npx prisma migrate deploy
```

### "ECONNREFUSED" to database

The `db` service may not be ready yet. Docker Compose's `depends_on` with `condition: service_healthy` should handle this, but if not:

```bash
# Check DB health
docker compose exec db pg_isready -U jewelerp

# Restart DB then app
docker compose restart db
sleep 5
docker compose restart app
```

### 502 Bad Gateway from Nginx

The app hasn't started yet or has crashed:

```bash
docker compose logs app --tail=20
docker compose restart app
```

### Token / auth issues

```bash
# Clear all refresh tokens (force all users to re-login)
docker compose exec db psql -U jewelerp -c "DELETE FROM \"RefreshToken\";"
```

### Out of disk space

```bash
# Check Docker disk usage
docker system df

# Prune unused images and build cache
docker system prune -f

# Check backup volume size
docker compose exec backup du -sh /backups/
```

---

## SSL / HTTPS Setup

### Using Let's Encrypt (recommended)

1. Install certbot on the host:
   ```bash
   apt install certbot
   ```

2. Obtain certificate:
   ```bash
   certbot certonly --standalone -d jewelerp.example.com
   ```

3. Mount certs and enable SSL in `docker-compose.yml`:
   ```yaml
   nginx:
     volumes:
       - /etc/letsencrypt/live/jewelerp.example.com/fullchain.pem:/etc/nginx/ssl/fullchain.pem:ro
       - /etc/letsencrypt/live/jewelerp.example.com/privkey.pem:/etc/nginx/ssl/privkey.pem:ro
     ports:
       - "443:443"
       - "80:80"
   ```

4. Uncomment the HTTPS server block in `nginx.conf` and enable the HTTP→HTTPS redirect.

5. Restart:
   ```bash
   docker compose restart nginx
   ```

### Auto-renewal

```bash
# Add to crontab:
0 3 * * * certbot renew --quiet && docker compose restart nginx
```

---

## Updating / Rolling Deploys

### Pull latest image and restart

```bash
cd /opt/jewelerp
git pull

# Rebuild and restart (zero-downtime if using multiple replicas)
docker compose up -d --build

# Migrations run automatically on start
```

### Rollback

```bash
# Use a specific image tag
docker compose pull app
docker compose up -d --no-build
```

### CI/CD flow

| Event | Action |
|-------|--------|
| Push to `main` | Build image → push to GHCR → deploy to staging |
| Push tag `v*` | Build image → push to GHCR → deploy to production (manual approval) |

---

## Quick Reference

```bash
# Start everything
docker compose --profile backup up -d

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Backup now
docker compose exec db pg_dump -U jewelerp jewelerp | gzip > backup.sql.gz

# Check health
curl localhost/api/health/ready

# Run migrations
docker compose exec app npx prisma migrate deploy

# Restart single service
docker compose restart app
```
