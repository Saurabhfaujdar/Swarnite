-- Repair Management Module — initial schema.
--
-- All statements use IF NOT EXISTS / DO $$ BEGIN ... EXCEPTION blocks
-- so this migration is safe to re-run on databases that may have been
-- partially synced via `prisma db push` in dev. See
-- .github/copilot-instructions.md for the discipline this follows.

-- ─── Enums ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "RepairStatus" AS ENUM (
    'RECEIVED',
    'UNDER_INSPECTION',
    'ESTIMATE_PENDING',
    'WAITING_CUSTOMER_APPROVAL',
    'ASSIGNED_TO_KARIGER',
    'IN_PROGRESS',
    'RETURNED_BY_KARIGER',
    'QUALITY_CHECK',
    'READY_FOR_DELIVERY',
    'DELIVERED',
    'REWORK_REQUIRED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RepairPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RepairPhotoType" AS ENUM ('BEFORE', 'AFTER', 'DAMAGE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WeightAdjustmentType" AS ENUM (
    'NORMAL_WASTAGE',
    'RECOVERABLE_GOLD',
    'EXTRA_GOLD_ADDED',
    'STONE_REMOVAL',
    'APPROVED_REDUCTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RepairChargeType" AS ENUM (
    'LABOR', 'POLISH', 'STONE_REPLACEMENT', 'EXTRA_GOLD', 'URGENCY', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RepairPaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "KarigerMetalTxnType" AS ENUM (
    'GOLD_RECEIVABLE', 'GOLD_PAYABLE', 'WASTAGE', 'ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "KarigerMoneyEntryType" AS ENUM (
    'LABOR_PAYABLE', 'PAYMENT_MADE', 'ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── karigers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "karigers" (
  "id"             SERIAL NOT NULL,
  "code"           TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "mobile"         TEXT,
  "address"        TEXT,
  "idProof"        TEXT,
  "specialization" TEXT,
  "companyId"      INTEGER NOT NULL,
  "branchId"       INTEGER,
  "metalBalance"   DECIMAL(65,30) NOT NULL DEFAULT 0,
  "moneyBalance"   DECIMAL(65,30) NOT NULL DEFAULT 0,
  "isActive"       BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "karigers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "karigers_companyId_code_key" ON "karigers"("companyId", "code");
CREATE INDEX IF NOT EXISTS "karigers_companyId_idx" ON "karigers"("companyId");
CREATE INDEX IF NOT EXISTS "karigers_branchId_idx" ON "karigers"("branchId");

DO $$ BEGIN
  ALTER TABLE "karigers" ADD CONSTRAINT "karigers_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "karigers" ADD CONSTRAINT "karigers_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── repair_jobs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "repair_jobs" (
  "id"                   SERIAL NOT NULL,
  "repairNo"             TEXT NOT NULL,
  "repairPrefix"         TEXT NOT NULL DEFAULT 'REP',
  "repairNumber"         INTEGER NOT NULL,
  "customerAccountId"    INTEGER,
  "customerName"         TEXT NOT NULL,
  "customerMobile"       TEXT,
  "branchId"             INTEGER NOT NULL,
  "companyId"            INTEGER NOT NULL,
  "status"               "RepairStatus" NOT NULL DEFAULT 'RECEIVED',
  "priority"             "RepairPriority" NOT NULL DEFAULT 'NORMAL',
  "intakeDate"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedDeliveryDate" TIMESTAMP(3),
  "deliveredDate"        TIMESTAMP(3),
  "assignedKarigerId"    INTEGER,
  "estimatedAmount"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "advanceReceived"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "customerNotes"        TEXT,
  "internalNotes"        TEXT,
  "approvalRequired"     BOOLEAN NOT NULL DEFAULT FALSE,
  "approvedAt"           TIMESTAMP(3),
  "approvedBy"           INTEGER,
  "approvalRemarks"      TEXT,
  "deliverySignature"    TEXT,
  "deliveredBy"          INTEGER,
  "receivedBy"           TEXT,
  "createdBy"            INTEGER NOT NULL,
  "updatedBy"            INTEGER,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "repair_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "repair_jobs_repairNo_key" ON "repair_jobs"("repairNo");
CREATE INDEX IF NOT EXISTS "repair_jobs_companyId_idx" ON "repair_jobs"("companyId");
CREATE INDEX IF NOT EXISTS "repair_jobs_branchId_idx" ON "repair_jobs"("branchId");
CREATE INDEX IF NOT EXISTS "repair_jobs_status_idx" ON "repair_jobs"("status");
CREATE INDEX IF NOT EXISTS "repair_jobs_assignedKarigerId_idx" ON "repair_jobs"("assignedKarigerId");
CREATE INDEX IF NOT EXISTS "repair_jobs_customerAccountId_idx" ON "repair_jobs"("customerAccountId");

DO $$ BEGIN
  ALTER TABLE "repair_jobs" ADD CONSTRAINT "repair_jobs_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "repair_jobs" ADD CONSTRAINT "repair_jobs_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "repair_jobs" ADD CONSTRAINT "repair_jobs_assignedKarigerId_fkey"
    FOREIGN KEY ("assignedKarigerId") REFERENCES "karigers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── repair_items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "repair_items" (
  "id"               SERIAL NOT NULL,
  "repairJobId"      INTEGER NOT NULL,
  "ornamentType"     TEXT NOT NULL,
  "metalTypeId"      INTEGER NOT NULL,
  "purity"           TEXT NOT NULL,
  "grossWeight"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "netWeight"        DECIMAL(65,30) NOT NULL DEFAULT 0,
  "stoneWeight"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "quantity"         INTEGER NOT NULL DEFAULT 1,
  "description"      TEXT,
  "conditionNotes"   TEXT,
  "hallmarkDetails"  TEXT,
  "issueDescription" TEXT,
  "returnedWeight"   DECIMAL(65,30),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repair_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "repair_items_repairJobId_idx" ON "repair_items"("repairJobId");

DO $$ BEGIN
  ALTER TABLE "repair_items" ADD CONSTRAINT "repair_items_repairJobId_fkey"
    FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "repair_items" ADD CONSTRAINT "repair_items_metalTypeId_fkey"
    FOREIGN KEY ("metalTypeId") REFERENCES "metal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── repair_photos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "repair_photos" (
  "id"            SERIAL NOT NULL,
  "repairJobId"   INTEGER NOT NULL,
  "repairItemId"  INTEGER,
  "type"          "RepairPhotoType" NOT NULL,
  "storagePath"   TEXT NOT NULL,
  "mimeType"      TEXT NOT NULL DEFAULT 'image/jpeg',
  "uploadedBy"    INTEGER NOT NULL,
  "uploadedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repair_photos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "repair_photos_repairJobId_idx" ON "repair_photos"("repairJobId");
CREATE INDEX IF NOT EXISTS "repair_photos_repairItemId_idx" ON "repair_photos"("repairItemId");

DO $$ BEGIN
  ALTER TABLE "repair_photos" ADD CONSTRAINT "repair_photos_repairJobId_fkey"
    FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "repair_photos" ADD CONSTRAINT "repair_photos_repairItemId_fkey"
    FOREIGN KEY ("repairItemId") REFERENCES "repair_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── repair_state_history ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "repair_state_history" (
  "id"          SERIAL NOT NULL,
  "repairJobId" INTEGER NOT NULL,
  "fromState"   "RepairStatus",
  "toState"     "RepairStatus" NOT NULL,
  "remarks"     TEXT,
  "changedBy"   INTEGER NOT NULL,
  "changedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repair_state_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "repair_state_history_repairJobId_idx" ON "repair_state_history"("repairJobId");
CREATE INDEX IF NOT EXISTS "repair_state_history_changedAt_idx" ON "repair_state_history"("changedAt");

DO $$ BEGIN
  ALTER TABLE "repair_state_history" ADD CONSTRAINT "repair_state_history_repairJobId_fkey"
    FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── repair_kariger_assignments ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "repair_kariger_assignments" (
  "id"                  SERIAL NOT NULL,
  "repairJobId"         INTEGER NOT NULL,
  "karigerId"           INTEGER NOT NULL,
  "assignedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedReturnDate"  TIMESTAMP(3),
  "returnedAt"          TIMESTAMP(3),
  "issuedWeight"        DECIMAL(65,30) NOT NULL DEFAULT 0,
  "returnedWeight"      DECIMAL(65,30),
  "assignmentNotes"     TEXT,
  "assignedBy"          INTEGER NOT NULL,
  CONSTRAINT "repair_kariger_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "repair_kariger_assignments_repairJobId_idx" ON "repair_kariger_assignments"("repairJobId");
CREATE INDEX IF NOT EXISTS "repair_kariger_assignments_karigerId_idx" ON "repair_kariger_assignments"("karigerId");

DO $$ BEGIN
  ALTER TABLE "repair_kariger_assignments" ADD CONSTRAINT "repair_kariger_assignments_repairJobId_fkey"
    FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "repair_kariger_assignments" ADD CONSTRAINT "repair_kariger_assignments_karigerId_fkey"
    FOREIGN KEY ("karigerId") REFERENCES "karigers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── repair_weight_adjustments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "repair_weight_adjustments" (
  "id"               SERIAL NOT NULL,
  "repairJobId"      INTEGER NOT NULL,
  "repairItemId"     INTEGER,
  "adjustmentType"   "WeightAdjustmentType" NOT NULL,
  "originalWeight"   DECIMAL(65,30) NOT NULL,
  "finalWeight"      DECIMAL(65,30) NOT NULL,
  "differenceWeight" DECIMAL(65,30) NOT NULL,
  "ratePerGram"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amount"           DECIMAL(65,30) NOT NULL DEFAULT 0,
  "remarks"          TEXT,
  "approvedBy"       INTEGER,
  "createdBy"        INTEGER NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repair_weight_adjustments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "repair_weight_adjustments_repairJobId_idx" ON "repair_weight_adjustments"("repairJobId");

DO $$ BEGIN
  ALTER TABLE "repair_weight_adjustments" ADD CONSTRAINT "repair_weight_adjustments_repairJobId_fkey"
    FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "repair_weight_adjustments" ADD CONSTRAINT "repair_weight_adjustments_repairItemId_fkey"
    FOREIGN KEY ("repairItemId") REFERENCES "repair_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── repair_charges ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "repair_charges" (
  "id"            SERIAL NOT NULL,
  "repairJobId"   INTEGER NOT NULL,
  "chargeType"    "RepairChargeType" NOT NULL,
  "description"   TEXT,
  "quantity"      DECIMAL(65,30) NOT NULL DEFAULT 1,
  "rate"          DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amount"        DECIMAL(65,30) NOT NULL DEFAULT 0,
  "gstApplicable" BOOLEAN NOT NULL DEFAULT TRUE,
  "gstPercent"    DECIMAL(65,30) NOT NULL DEFAULT 3,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repair_charges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "repair_charges_repairJobId_idx" ON "repair_charges"("repairJobId");

DO $$ BEGIN
  ALTER TABLE "repair_charges" ADD CONSTRAINT "repair_charges_repairJobId_fkey"
    FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── repair_invoices ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "repair_invoices" (
  "id"             SERIAL NOT NULL,
  "repairJobId"    INTEGER NOT NULL,
  "invoiceNo"      TEXT NOT NULL,
  "invoicePrefix"  TEXT NOT NULL DEFAULT 'REPI',
  "invoiceNumber"  INTEGER NOT NULL,
  "invoiceDate"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "subtotal"       DECIMAL(65,30) NOT NULL DEFAULT 0,
  "cgstAmount"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "sgstAmount"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "igstAmount"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "gstAmount"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalAmount"    DECIMAL(65,30) NOT NULL DEFAULT 0,
  "paidAmount"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "dueAmount"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "paymentStatus"  "RepairPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "cashAmount"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "bankAmount"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "cardAmount"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "upiAmount"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "repair_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "repair_invoices_repairJobId_key" ON "repair_invoices"("repairJobId");
CREATE UNIQUE INDEX IF NOT EXISTS "repair_invoices_invoiceNo_key" ON "repair_invoices"("invoiceNo");
CREATE INDEX IF NOT EXISTS "repair_invoices_repairJobId_idx" ON "repair_invoices"("repairJobId");

DO $$ BEGIN
  ALTER TABLE "repair_invoices" ADD CONSTRAINT "repair_invoices_repairJobId_fkey"
    FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── kariger_metal_ledger ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "kariger_metal_ledger" (
  "id"                      SERIAL NOT NULL,
  "karigerId"               INTEGER NOT NULL,
  "repairJobId"             INTEGER,
  "metalTypeId"             INTEGER NOT NULL,
  "transactionType"         "KarigerMetalTxnType" NOT NULL,
  "weight"                  DECIMAL(65,30) NOT NULL,
  "ratePerGram"             DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amount"                  DECIMAL(65,30) NOT NULL DEFAULT 0,
  "balanceAfterTransaction" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "remarks"                 TEXT,
  "createdBy"               INTEGER NOT NULL,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kariger_metal_ledger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "kariger_metal_ledger_karigerId_idx" ON "kariger_metal_ledger"("karigerId");
CREATE INDEX IF NOT EXISTS "kariger_metal_ledger_repairJobId_idx" ON "kariger_metal_ledger"("repairJobId");
CREATE INDEX IF NOT EXISTS "kariger_metal_ledger_createdAt_idx" ON "kariger_metal_ledger"("createdAt");

DO $$ BEGIN
  ALTER TABLE "kariger_metal_ledger" ADD CONSTRAINT "kariger_metal_ledger_karigerId_fkey"
    FOREIGN KEY ("karigerId") REFERENCES "karigers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "kariger_metal_ledger" ADD CONSTRAINT "kariger_metal_ledger_repairJobId_fkey"
    FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "kariger_metal_ledger" ADD CONSTRAINT "kariger_metal_ledger_metalTypeId_fkey"
    FOREIGN KEY ("metalTypeId") REFERENCES "metal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── kariger_money_ledger ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "kariger_money_ledger" (
  "id"                      SERIAL NOT NULL,
  "karigerId"               INTEGER NOT NULL,
  "repairJobId"             INTEGER,
  "entryType"               "KarigerMoneyEntryType" NOT NULL,
  "debit"                   DECIMAL(65,30) NOT NULL DEFAULT 0,
  "credit"                  DECIMAL(65,30) NOT NULL DEFAULT 0,
  "balanceAfterTransaction" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "remarks"                 TEXT,
  "createdBy"               INTEGER NOT NULL,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kariger_money_ledger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "kariger_money_ledger_karigerId_idx" ON "kariger_money_ledger"("karigerId");
CREATE INDEX IF NOT EXISTS "kariger_money_ledger_repairJobId_idx" ON "kariger_money_ledger"("repairJobId");
CREATE INDEX IF NOT EXISTS "kariger_money_ledger_createdAt_idx" ON "kariger_money_ledger"("createdAt");

DO $$ BEGIN
  ALTER TABLE "kariger_money_ledger" ADD CONSTRAINT "kariger_money_ledger_karigerId_fkey"
    FOREIGN KEY ("karigerId") REFERENCES "karigers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "kariger_money_ledger" ADD CONSTRAINT "kariger_money_ledger_repairJobId_fkey"
    FOREIGN KEY ("repairJobId") REFERENCES "repair_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
