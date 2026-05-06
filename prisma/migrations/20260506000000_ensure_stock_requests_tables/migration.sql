-- Idempotent creation of stock_requests / stock_request_items tables.
--
-- These models exist in schema.prisma and in 0_init/migration.sql, but some
-- production databases were initialised from an older snapshot that pre-dated
-- the StockRequest feature. `prisma migrate deploy` therefore reports 0_init
-- as already applied and never creates the tables, causing every
-- /api/stock-requests/* call to 500 with:
--   "The table public.stock_requests does not exist in the current database."
--
-- This migration uses IF NOT EXISTS guards so it is a no-op on databases that
-- already have the tables, and safely backfills the rest.

-- Enum --------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "StockRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- stock_requests ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "stock_requests" (
    "id" SERIAL NOT NULL,
    "requestNo" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestingBranchId" INTEGER NOT NULL,
    "sourceBranchId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "status" "StockRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" INTEGER,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "narration" TEXT,
    "totalPcs" INTEGER NOT NULL DEFAULT 0,
    "totalGrossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stock_requests_requestNo_key" ON "stock_requests"("requestNo");
CREATE INDEX IF NOT EXISTS "stock_requests_companyId_idx" ON "stock_requests"("companyId");
CREATE INDEX IF NOT EXISTS "stock_requests_requestingBranchId_idx" ON "stock_requests"("requestingBranchId");
CREATE INDEX IF NOT EXISTS "stock_requests_sourceBranchId_idx" ON "stock_requests"("sourceBranchId");

DO $$ BEGIN
  ALTER TABLE "stock_requests"
    ADD CONSTRAINT "stock_requests_requestingBranchId_fkey"
    FOREIGN KEY ("requestingBranchId") REFERENCES "branches"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_requests"
    ADD CONSTRAINT "stock_requests_sourceBranchId_fkey"
    FOREIGN KEY ("sourceBranchId") REFERENCES "branches"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_requests"
    ADD CONSTRAINT "stock_requests_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- stock_request_items ----------------------------------------------------
CREATE TABLE IF NOT EXISTS "stock_request_items" (
    "id" SERIAL NOT NULL,
    "stockRequestId" INTEGER NOT NULL,
    "labelId" INTEGER NOT NULL,
    "labelNo" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "grossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pcs" INTEGER NOT NULL DEFAULT 1,
    "purityName" TEXT,

    CONSTRAINT "stock_request_items_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "stock_request_items"
    ADD CONSTRAINT "stock_request_items_stockRequestId_fkey"
    FOREIGN KEY ("stockRequestId") REFERENCES "stock_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_request_items"
    ADD CONSTRAINT "stock_request_items_labelId_fkey"
    FOREIGN KEY ("labelId") REFERENCES "labels"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
