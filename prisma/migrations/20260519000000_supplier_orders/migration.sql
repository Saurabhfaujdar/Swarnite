-- Supplier Order Module — initial schema.
--
-- All statements use IF NOT EXISTS / DO $$ BEGIN ... EXCEPTION blocks
-- so this migration is safe to re-run on databases that may have been
-- partially synced via `prisma db push` in dev. See
-- .github/copilot-instructions.md for the discipline this follows.

-- ─── Enums ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "SupplierOrderStatus" AS ENUM (
    'DRAFT',
    'SENT_TO_SUPPLIER',
    'SUPPLIER_ACKNOWLEDGED',
    'ADVANCE_PAID',
    'IN_PRODUCTION',
    'DISPATCHED',
    'PARTIALLY_RECEIVED',
    'RECEIVED_PENDING_QC',
    'QC_COMPLETED',
    'INVOICE_RECEIVED',
    'PURCHASE_POSTED',
    'PAYMENT_PENDING',
    'CLOSED',
    'CANCELLED',
    'REJECTED',
    'SHORT_DELIVERED',
    'EXCESS_DELIVERED',
    'RETURNED_TO_SUPPLIER',
    'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierOrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierOrderItemStatus" AS ENUM (
    'PENDING', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'SHORT_CLOSED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierReceiptStatus" AS ENUM (
    'PENDING_QC', 'QC_IN_PROGRESS', 'QC_PASSED', 'QC_FAILED', 'PARTIAL_PASS', 'RETURNED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierReceiptItemQcStatus" AS ENUM (
    'PENDING', 'PASSED', 'FAILED', 'CONDITIONAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierOrderAdjustmentType" AS ENUM (
    'NORMAL_WASTAGE',
    'SHORT_RECEIVED',
    'EXCESS_RECEIVED',
    'PURITY_DIFFERENCE',
    'STONE_WEIGHT_DIFFERENCE',
    'RATE_DIFFERENCE',
    'MANUAL_ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierOrderInvoiceStatus" AS ENUM (
    'DRAFT', 'CONFIRMED', 'DISPUTED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierLedgerTransactionType" AS ENUM (
    'METAL_ISSUED',
    'METAL_RECEIVED',
    'WASTAGE_APPROVED',
    'EXCESS_RECEIVED',
    'SHORTAGE',
    'METAL_RETURN',
    'METAL_ADJUSTMENT',
    'ORDER_PAYABLE',
    'ADVANCE_PAID',
    'DELIVERY_PAYMENT',
    'INVOICE_ADJUSTMENT',
    'SETTLEMENT',
    'REFUND_RECEIVED',
    'DEBIT_NOTE',
    'CREDIT_NOTE',
    'MONEY_ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── supplier_orders ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_orders" (
  "id"                       SERIAL NOT NULL,
  "orderNo"                  TEXT NOT NULL,
  "orderPrefix"              TEXT NOT NULL DEFAULT 'SO',
  "orderNumber"              INTEGER NOT NULL,
  "orderDate"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supplierId"               INTEGER NOT NULL,
  "companyId"                INTEGER NOT NULL,
  "branchId"                 INTEGER NOT NULL,
  "status"                   "SupplierOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "priority"                 "SupplierOrderPriority" NOT NULL DEFAULT 'NORMAL',
  "expectedDeliveryDate"     TIMESTAMP(3),
  "acknowledgementDate"      TIMESTAMP(3),
  "cancelledAt"              TIMESTAMP(3),
  "closedAt"                 TIMESTAMP(3),
  "supplierReferenceNo"      TEXT,
  "rateLockType"             TEXT,
  "rateLockedAt"             TIMESTAMP(3),
  "goldRate"                 DECIMAL(65,30) NOT NULL DEFAULT 0,
  "silverRate"               DECIMAL(65,30) NOT NULL DEFAULT 0,
  "estimatedAmount"          DECIMAL(65,30) NOT NULL DEFAULT 0,
  "advancePaid"              DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalOrderedGrossWeight"  DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalOrderedNetWeight"    DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalReceivedGrossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalReceivedNetWeight"   DECIMAL(65,30) NOT NULL DEFAULT 0,
  "approvalRequired"         BOOLEAN NOT NULL DEFAULT FALSE,
  "approvedById"             INTEGER,
  "approvedAt"               TIMESTAMP(3),
  "notes"                    TEXT,
  "createdById"              INTEGER NOT NULL,
  "updatedById"              INTEGER,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_orders_orderNo_key" ON "supplier_orders"("orderNo");
CREATE INDEX IF NOT EXISTS "supplier_orders_companyId_branchId_status_idx" ON "supplier_orders"("companyId", "branchId", "status");
CREATE INDEX IF NOT EXISTS "supplier_orders_supplierId_idx" ON "supplier_orders"("supplierId");
CREATE INDEX IF NOT EXISTS "supplier_orders_orderDate_idx" ON "supplier_orders"("orderDate");
CREATE INDEX IF NOT EXISTS "supplier_orders_status_idx" ON "supplier_orders"("status");

DO $$ BEGIN
  ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── supplier_order_items ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_order_items" (
  "id"                     SERIAL NOT NULL,
  "supplierOrderId"        INTEGER NOT NULL,
  "category"               TEXT NOT NULL,
  "ornamentType"           TEXT,
  "metalTypeId"            INTEGER NOT NULL,
  "purity"                 TEXT,
  "orderedQty"             INTEGER NOT NULL DEFAULT 1,
  "orderedGrossWeight"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "orderedNetWeight"       DECIMAL(65,30) NOT NULL DEFAULT 0,
  "expectedWastagePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "makingChargeType"       TEXT,
  "makingChargeValue"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "stoneDetails"           TEXT,
  "designReference"        TEXT,
  "size"                   TEXT,
  "status"                 "SupplierOrderItemStatus" NOT NULL DEFAULT 'PENDING',
  "remarks"                TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "supplier_order_items_supplierOrderId_idx" ON "supplier_order_items"("supplierOrderId");

DO $$ BEGIN
  ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_supplierOrderId_fkey"
    FOREIGN KEY ("supplierOrderId") REFERENCES "supplier_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_metalTypeId_fkey"
    FOREIGN KEY ("metalTypeId") REFERENCES "metal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── supplier_order_state_history ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_order_state_history" (
  "id"              SERIAL NOT NULL,
  "supplierOrderId" INTEGER NOT NULL,
  "fromStatus"      "SupplierOrderStatus",
  "toStatus"        "SupplierOrderStatus" NOT NULL,
  "reason"          TEXT,
  "metadataJson"    JSONB,
  "changedById"     INTEGER NOT NULL,
  "changedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_order_state_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "supplier_order_state_history_orderId_changedAt_idx" ON "supplier_order_state_history"("supplierOrderId", "changedAt");

DO $$ BEGIN
  ALTER TABLE "supplier_order_state_history" ADD CONSTRAINT "supplier_order_state_history_supplierOrderId_fkey"
    FOREIGN KEY ("supplierOrderId") REFERENCES "supplier_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── supplier_order_receipts ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_order_receipts" (
  "id"               SERIAL NOT NULL,
  "receiptNo"        TEXT NOT NULL,
  "receiptPrefix"    TEXT NOT NULL DEFAULT 'SR',
  "receiptNumber"    INTEGER NOT NULL,
  "supplierOrderId"  INTEGER NOT NULL,
  "companyId"        INTEGER NOT NULL,
  "branchId"         INTEGER NOT NULL,
  "receivedDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedById"     INTEGER NOT NULL,
  "status"           "SupplierReceiptStatus" NOT NULL DEFAULT 'PENDING_QC',
  "packageReference" TEXT,
  "remarks"          TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_order_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_order_receipts_receiptNo_key" ON "supplier_order_receipts"("receiptNo");
CREATE INDEX IF NOT EXISTS "supplier_order_receipts_supplierOrderId_idx" ON "supplier_order_receipts"("supplierOrderId");
CREATE INDEX IF NOT EXISTS "supplier_order_receipts_companyId_branchId_idx" ON "supplier_order_receipts"("companyId", "branchId");
CREATE INDEX IF NOT EXISTS "supplier_order_receipts_receiptNo_idx" ON "supplier_order_receipts"("receiptNo");

DO $$ BEGIN
  ALTER TABLE "supplier_order_receipts" ADD CONSTRAINT "supplier_order_receipts_supplierOrderId_fkey"
    FOREIGN KEY ("supplierOrderId") REFERENCES "supplier_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_order_receipts" ADD CONSTRAINT "supplier_order_receipts_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_order_receipts" ADD CONSTRAINT "supplier_order_receipts_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── supplier_order_receipt_items ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_order_receipt_items" (
  "id"                  SERIAL NOT NULL,
  "receiptId"           INTEGER NOT NULL,
  "supplierOrderItemId" INTEGER NOT NULL,
  "receivedQty"         INTEGER NOT NULL DEFAULT 1,
  "receivedGrossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "receivedNetWeight"   DECIMAL(65,30) NOT NULL DEFAULT 0,
  "receivedPurity"      DECIMAL(65,30),
  "acceptedQty"         INTEGER NOT NULL DEFAULT 0,
  "rejectedQty"         INTEGER NOT NULL DEFAULT 0,
  "acceptedGrossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "acceptedNetWeight"   DECIMAL(65,30) NOT NULL DEFAULT 0,
  "qcStatus"            "SupplierReceiptItemQcStatus" NOT NULL DEFAULT 'PENDING',
  "qcRemarks"           TEXT,
  "inventoryPosted"     BOOLEAN NOT NULL DEFAULT FALSE,
  "inventoryItemId"     INTEGER,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_order_receipt_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "supplier_order_receipt_items_receiptId_idx" ON "supplier_order_receipt_items"("receiptId");
CREATE INDEX IF NOT EXISTS "supplier_order_receipt_items_orderItemId_idx" ON "supplier_order_receipt_items"("supplierOrderItemId");

DO $$ BEGIN
  ALTER TABLE "supplier_order_receipt_items" ADD CONSTRAINT "supplier_order_receipt_items_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "supplier_order_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_order_receipt_items" ADD CONSTRAINT "supplier_order_receipt_items_orderItemId_fkey"
    FOREIGN KEY ("supplierOrderItemId") REFERENCES "supplier_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── supplier_order_weight_adjustments ──────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_order_weight_adjustments" (
  "id"                  SERIAL NOT NULL,
  "supplierOrderId"     INTEGER NOT NULL,
  "receiptItemId"       INTEGER,
  "supplierOrderItemId" INTEGER,
  "receiptId"           INTEGER,
  "adjustmentType"      "SupplierOrderAdjustmentType" NOT NULL,
  "metalTypeId"         INTEGER NOT NULL,
  "purity"              DECIMAL(65,30) NOT NULL DEFAULT 0,
  "grossDelta"          DECIMAL(65,30) NOT NULL DEFAULT 0,
  "netDelta"            DECIMAL(65,30) NOT NULL DEFAULT 0,
  "fineWeightDelta"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "estimatedValue"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "reason"              TEXT,
  "approvalRequired"    BOOLEAN NOT NULL DEFAULT FALSE,
  "approvedById"        INTEGER,
  "approvedAt"          TIMESTAMP(3),
  "createdById"         INTEGER NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_order_weight_adjustments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "supplier_order_weight_adjustments_orderId_idx" ON "supplier_order_weight_adjustments"("supplierOrderId");
CREATE INDEX IF NOT EXISTS "supplier_order_weight_adjustments_receiptId_idx" ON "supplier_order_weight_adjustments"("receiptId");

DO $$ BEGIN
  ALTER TABLE "supplier_order_weight_adjustments" ADD CONSTRAINT "supplier_order_weight_adjustments_orderId_fkey"
    FOREIGN KEY ("supplierOrderId") REFERENCES "supplier_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_order_weight_adjustments" ADD CONSTRAINT "supplier_order_weight_adjustments_receiptItemId_fkey"
    FOREIGN KEY ("receiptItemId") REFERENCES "supplier_order_receipt_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_order_weight_adjustments" ADD CONSTRAINT "supplier_order_weight_adjustments_orderItemId_fkey"
    FOREIGN KEY ("supplierOrderItemId") REFERENCES "supplier_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_order_weight_adjustments" ADD CONSTRAINT "supplier_order_weight_adjustments_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "supplier_order_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_order_weight_adjustments" ADD CONSTRAINT "supplier_order_weight_adjustments_metalTypeId_fkey"
    FOREIGN KEY ("metalTypeId") REFERENCES "metal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── supplier_order_invoices ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_order_invoices" (
  "id"                SERIAL NOT NULL,
  "invoiceNo"         TEXT NOT NULL,
  "invoicePrefix"     TEXT NOT NULL DEFAULT 'SPI',
  "invoiceNumber"     INTEGER NOT NULL,
  "supplierInvoiceNo" TEXT,
  "supplierOrderId"   INTEGER NOT NULL,
  "invoiceDate"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "taxableAmount"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "cgstAmount"        DECIMAL(65,30) NOT NULL DEFAULT 0,
  "sgstAmount"        DECIMAL(65,30) NOT NULL DEFAULT 0,
  "igstAmount"        DECIMAL(65,30) NOT NULL DEFAULT 0,
  "gstAmount"         DECIMAL(65,30) NOT NULL DEFAULT 0,
  "otherCharges"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "discountAmount"    DECIMAL(65,30) NOT NULL DEFAULT 0,
  "advanceAdjusted"   DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalAmount"       DECIMAL(65,30) NOT NULL DEFAULT 0,
  "paidAmount"        DECIMAL(65,30) NOT NULL DEFAULT 0,
  "dueAmount"         DECIMAL(65,30) NOT NULL DEFAULT 0,
  "status"            "SupplierOrderInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById"       INTEGER NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_order_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_order_invoices_invoiceNo_key" ON "supplier_order_invoices"("invoiceNo");
CREATE INDEX IF NOT EXISTS "supplier_order_invoices_supplierOrderId_idx" ON "supplier_order_invoices"("supplierOrderId");

DO $$ BEGIN
  ALTER TABLE "supplier_order_invoices" ADD CONSTRAINT "supplier_order_invoices_supplierOrderId_fkey"
    FOREIGN KEY ("supplierOrderId") REFERENCES "supplier_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── supplier_order_payments ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_order_payments" (
  "id"              SERIAL NOT NULL,
  "paymentNo"       TEXT NOT NULL,
  "paymentPrefix"   TEXT NOT NULL DEFAULT 'SPP',
  "paymentNumber"   INTEGER NOT NULL,
  "supplierOrderId" INTEGER NOT NULL,
  "invoiceId"       INTEGER,
  "paymentDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount"          DECIMAL(65,30) NOT NULL DEFAULT 0,
  "paymentMode"     TEXT NOT NULL,
  "referenceNo"     TEXT,
  "notes"           TEXT,
  "createdById"     INTEGER NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_order_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_order_payments_paymentNo_key" ON "supplier_order_payments"("paymentNo");
CREATE INDEX IF NOT EXISTS "supplier_order_payments_supplierOrderId_idx" ON "supplier_order_payments"("supplierOrderId");
CREATE INDEX IF NOT EXISTS "supplier_order_payments_invoiceId_idx" ON "supplier_order_payments"("invoiceId");

DO $$ BEGIN
  ALTER TABLE "supplier_order_payments" ADD CONSTRAINT "supplier_order_payments_supplierOrderId_fkey"
    FOREIGN KEY ("supplierOrderId") REFERENCES "supplier_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_order_payments" ADD CONSTRAINT "supplier_order_payments_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "supplier_order_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── supplier_metal_ledger ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_metal_ledger" (
  "id"                      SERIAL NOT NULL,
  "supplierId"              INTEGER NOT NULL,
  "companyId"               INTEGER NOT NULL,
  "branchId"                INTEGER NOT NULL,
  "supplierOrderId"         INTEGER,
  "receiptId"               INTEGER,
  "metalTypeId"             INTEGER NOT NULL,
  "purity"                  DECIMAL(65,30) NOT NULL DEFAULT 0,
  "transactionType"         "SupplierLedgerTransactionType" NOT NULL,
  "grossWeight"             DECIMAL(65,30) NOT NULL DEFAULT 0,
  "netWeight"               DECIMAL(65,30) NOT NULL DEFAULT 0,
  "fineWeight"              DECIMAL(65,30) NOT NULL DEFAULT 0,
  "direction"               TEXT NOT NULL DEFAULT 'ISSUED',
  "balanceAfterTransaction" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "remarks"                 TEXT,
  "createdById"             INTEGER NOT NULL,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_metal_ledger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "supplier_metal_ledger_supplierId_idx" ON "supplier_metal_ledger"("supplierId");
CREATE INDEX IF NOT EXISTS "supplier_metal_ledger_companyId_branchId_idx" ON "supplier_metal_ledger"("companyId", "branchId");
CREATE INDEX IF NOT EXISTS "supplier_metal_ledger_supplierOrderId_idx" ON "supplier_metal_ledger"("supplierOrderId");
CREATE INDEX IF NOT EXISTS "supplier_metal_ledger_createdAt_idx" ON "supplier_metal_ledger"("createdAt");

DO $$ BEGIN
  ALTER TABLE "supplier_metal_ledger" ADD CONSTRAINT "supplier_metal_ledger_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_metal_ledger" ADD CONSTRAINT "supplier_metal_ledger_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_metal_ledger" ADD CONSTRAINT "supplier_metal_ledger_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_metal_ledger" ADD CONSTRAINT "supplier_metal_ledger_supplierOrderId_fkey"
    FOREIGN KEY ("supplierOrderId") REFERENCES "supplier_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_metal_ledger" ADD CONSTRAINT "supplier_metal_ledger_metalTypeId_fkey"
    FOREIGN KEY ("metalTypeId") REFERENCES "metal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── supplier_money_ledger ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_money_ledger" (
  "id"                      SERIAL NOT NULL,
  "supplierId"              INTEGER NOT NULL,
  "companyId"               INTEGER NOT NULL,
  "branchId"                INTEGER NOT NULL,
  "supplierOrderId"         INTEGER,
  "invoiceId"               INTEGER,
  "paymentId"               INTEGER,
  "transactionType"         "SupplierLedgerTransactionType" NOT NULL,
  "debit"                   DECIMAL(65,30) NOT NULL DEFAULT 0,
  "credit"                  DECIMAL(65,30) NOT NULL DEFAULT 0,
  "balanceAfterTransaction" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "remarks"                 TEXT,
  "reference"               TEXT,
  "createdById"             INTEGER NOT NULL,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_money_ledger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "supplier_money_ledger_supplierId_idx" ON "supplier_money_ledger"("supplierId");
CREATE INDEX IF NOT EXISTS "supplier_money_ledger_companyId_branchId_idx" ON "supplier_money_ledger"("companyId", "branchId");
CREATE INDEX IF NOT EXISTS "supplier_money_ledger_supplierOrderId_idx" ON "supplier_money_ledger"("supplierOrderId");
CREATE INDEX IF NOT EXISTS "supplier_money_ledger_createdAt_idx" ON "supplier_money_ledger"("createdAt");

DO $$ BEGIN
  ALTER TABLE "supplier_money_ledger" ADD CONSTRAINT "supplier_money_ledger_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_money_ledger" ADD CONSTRAINT "supplier_money_ledger_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_money_ledger" ADD CONSTRAINT "supplier_money_ledger_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_money_ledger" ADD CONSTRAINT "supplier_money_ledger_supplierOrderId_fkey"
    FOREIGN KEY ("supplierOrderId") REFERENCES "supplier_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_money_ledger" ADD CONSTRAINT "supplier_money_ledger_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "supplier_order_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
