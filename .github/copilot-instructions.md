---
applyTo: "prisma/**,server/**"
---

# Prisma migration discipline

This repo has been bitten before by schema-vs-migrations drift. Follow these
rules whenever you touch `prisma/schema.prisma` or anything under
`prisma/migrations/`.

## Rules

1. **Never use `prisma db push` against a tracked database.** Always create a
   migration file via `npx prisma migrate dev --name <short_description>` so
   the change is reproducible on staging and production.
2. **Every model / enum / column added to `schema.prisma` MUST have a
   corresponding migration file under `prisma/migrations/`.** Prod runs
   `npx prisma migrate deploy` on container start (see [Dockerfile](../Dockerfile)) — if the migration is
   missing, the table will silently not exist on prod even though the schema
   says it does.
3. **Make new migrations idempotent when the table may already exist on some
   databases.** Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
   and wrap `ALTER TABLE ... ADD CONSTRAINT` / `CREATE TYPE` in
   `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.
   See `prisma/migrations/20260506000000_ensure_stock_requests_tables/` for a
   reference pattern.
4. **Before declaring a Prisma-related fix done, verify migrations and schema
   are in sync** with:
   ```
   npx prisma migrate diff \
     --from-migrations prisma/migrations \
     --to-schema-datamodel prisma/schema.prisma \
     --exit-code
   ```
   A non-zero exit means a model in `schema.prisma` has no migration covering
   it — fix it before merging.

## Known historical drift incidents

- **2026-05-06** — `StockRequest` / `StockRequestItem` models existed in
  `schema.prisma` and `0_init/migration.sql`, but production had been
  initialised from an older `0_init` snapshot. `prisma migrate deploy`
  treated `0_init` as applied and never created the tables, so every
  `/api/stock-requests/*` endpoint returned 500 with
  `The table public.stock_requests does not exist in the current database.`
  Fixed by adding `20260506000000_ensure_stock_requests_tables/` (idempotent).

# Debugging deployed Cloud Run 500s

When an endpoint 500s on the Cloud Run service `swarnite`
(region `asia-south2`, project `project-f0c59548-341b-4817-ac5`):

1. The browser network tab and the request log
   (`logName` ending in `%2Frequests`) only show the status code, not the
   cause. Don't stop there.
2. Most route handlers wrap errors with `logger.error('<route>.<op> failed', { err, stack, ... })`.
   These land in the **stdout / stderr** stream as `jsonPayload`, not in the
   request log.
3. Find the real error with a Logs Explorer query like:
   ```
   resource.type="cloud_run_revision"
   resource.labels.service_name="swarnite"
   logName=~"stdout|stderr"
   severity>=ERROR
   ```
   Or filter to a single failed request by its trace id from the request log:
   ```
   trace="projects/project-f0c59548-341b-4817-ac5/traces/<TRACE_ID>"
   ```
4. Frontend `catch` blocks should surface `err.response?.data?.error` in the
   toast (not a generic message), so deployment failures are diagnosable
   without log access. Match the pattern in
   [src/pages/Branch/StockRequest.tsx](../src/pages/Branch/StockRequest.tsx).
