-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'CASHIER', 'USER');

-- CreateEnum
CREATE TYPE "BranchType" AS ENUM ('MASTER', 'BRANCH');

-- CreateEnum
CREATE TYPE "LabelStatus" AS ENUM ('IN_STOCK', 'SOLD', 'TRANSFERRED', 'ON_APPROVAL', 'RETURNED', 'LAYAWAY');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BRANCH', 'BANK', 'CASH', 'EXPENSE', 'INCOME', 'SALESMAN');

-- CreateEnum
CREATE TYPE "BalanceType" AS ENUM ('CR', 'DR', 'NONE');

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('URD', 'REGULAR', 'IMPORT');

-- CreateEnum
CREATE TYPE "CashVoucherType" AS ENUM ('RECEIPT', 'PAYMENT');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('JOURNAL', 'DEBIT_NOTE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('ISSUE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "LayawayStatus" AS ENUM ('ACTIVE', 'PARTIALLY_PAID', 'OVERDUE', 'READY_FOR_CONVERSION', 'COMPLETED', 'CONVERTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('ADVANCE', 'DUE_PAYMENT');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'VOID', 'CLOSED');

-- CreateEnum
CREATE TYPE "StockRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SchemeStatus" AS ENUM ('ACTIVE', 'MATURED', 'REDEEMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PAID', 'MISSED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "logo" BYTEA,
    "financialYearStart" TIMESTAMP(3) NOT NULL,
    "financialYearEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchType" "BranchType" NOT NULL DEFAULT 'BRANCH',
    "isMaster" BOOLEAN NOT NULL DEFAULT false,
    "parentId" INTEGER,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metal_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "metal_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_groups" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "metalTypeId" INTEGER NOT NULL,
    "hsnCode" TEXT,
    "cgstRate" DECIMAL(65,30) NOT NULL DEFAULT 1.5,
    "sgstRate" DECIMAL(65,30) NOT NULL DEFAULT 1.5,
    "igstRate" DECIMAL(65,30) NOT NULL DEFAULT 3.0,
    "requiresTagId" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "item_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purities" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentage" DECIMAL(65,30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "purities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "itemGroupId" INTEGER NOT NULL,
    "metalTypeId" INTEGER NOT NULL,
    "purityId" INTEGER NOT NULL,
    "description" TEXT,
    "mrp" DECIMAL(65,30),
    "salePrice" DECIMAL(65,30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_prefixes" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "itemGroupId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "label_prefixes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" SERIAL NOT NULL,
    "labelNo" TEXT NOT NULL,
    "prefixId" INTEGER NOT NULL,
    "tagId" TEXT,
    "itemId" INTEGER NOT NULL,
    "grossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pcsCount" INTEGER NOT NULL DEFAULT 1,
    "mrp" DECIMAL(65,30),
    "salePrice" DECIMAL(65,30),
    "branchId" INTEGER NOT NULL,
    "counterId" INTEGER,
    "status" "LabelStatus" NOT NULL DEFAULT 'IN_STOCK',
    "huid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metal_rates" (
    "id" SERIAL NOT NULL,
    "metalTypeId" INTEGER NOT NULL,
    "purityCode" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "metal_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "groupHead" TEXT DEFAULT 'Sundry Debtors',
    "customerCategory" TEXT DEFAULT 'Normal',
    "mobile" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "blockNo" TEXT,
    "building" TEXT,
    "street" TEXT,
    "area" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "gstin" TEXT,
    "gstVerified" BOOLEAN NOT NULL DEFAULT false,
    "gstTradeName" TEXT,
    "gstStatus" TEXT,
    "compositionScheme" BOOLEAN NOT NULL DEFAULT false,
    "pan" TEXT,
    "aadhar" TEXT,
    "idProof" TEXT,
    "reference" TEXT,
    "remark" TEXT,
    "closingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceType" "BalanceType" NOT NULL DEFAULT 'NONE',
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salesmen" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "mobile" TEXT,
    "companyId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "salesmen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_vouchers" (
    "id" SERIAL NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "voucherPrefix" TEXT NOT NULL DEFAULT 'JGI',
    "voucherNumber" INTEGER NOT NULL,
    "voucherDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" INTEGER NOT NULL,
    "salesmanId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "totalGrossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalNetWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalPcs" INTEGER NOT NULL DEFAULT 0,
    "metalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "labourAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherCharge" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountStAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalGstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "roundingDiscount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "voucherAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cashAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "bankAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cardAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "upiAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "oldGoldAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "advanceAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "dueAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "previousOs" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "finalDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountScheme" TEXT,
    "narration" TEXT,
    "reference" TEXT,
    "isReturned" BOOLEAN NOT NULL DEFAULT false,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_items" (
    "id" SERIAL NOT NULL,
    "salesVoucherId" INTEGER NOT NULL,
    "labelId" INTEGER,
    "itemId" INTEGER NOT NULL,
    "labelNo" TEXT,
    "itemName" TEXT NOT NULL,
    "grossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fineWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pcs" INTEGER NOT NULL DEFAULT 1,
    "metalRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "diamondWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "labourRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "labourAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherCharge" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountStAmt" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "styleName" TEXT,
    "lessWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_vouchers" (
    "id" SERIAL NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "voucherPrefix" TEXT NOT NULL DEFAULT 'PUR',
    "voucherNumber" INTEGER NOT NULL,
    "voucherDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseType" "PurchaseType" NOT NULL DEFAULT 'URD',
    "accountId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "description" TEXT,
    "variety" TEXT,
    "group" TEXT,
    "totalGrossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalNetWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalFineWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalPcs" INTEGER NOT NULL DEFAULT 0,
    "otherWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "purity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metalRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherCharge" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "valAddAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "finalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "salesmanName" TEXT,
    "narration" TEXT,
    "reference" TEXT,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" SERIAL NOT NULL,
    "purchaseVoucherId" INTEGER NOT NULL,
    "labelId" INTEGER,
    "itemId" INTEGER,
    "styleName" TEXT,
    "weight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pcs" INTEGER NOT NULL DEFAULT 0,
    "amtCalcOn" TEXT,
    "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_entries" (
    "id" SERIAL NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "voucherPrefix" TEXT NOT NULL,
    "voucherNumber" INTEGER NOT NULL,
    "voucherDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voucherType" "CashVoucherType" NOT NULL,
    "bookName" TEXT NOT NULL DEFAULT 'Cash',
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "totalCredit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalDebit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "placeOfSupply" TEXT,
    "narration" TEXT,
    "reference" TEXT,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_entry_lines" (
    "id" SERIAL NOT NULL,
    "cashEntryId" INTEGER NOT NULL,
    "crDr" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tdsAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tcsAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "gstApplicable" BOOLEAN NOT NULL DEFAULT false,
    "narration" TEXT,

    CONSTRAINT "cash_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_entries" (
    "id" SERIAL NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "voucherPrefix" TEXT NOT NULL,
    "voucherNumber" INTEGER NOT NULL,
    "voucherDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voucherType" TEXT NOT NULL,
    "bookName" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "reference" TEXT,
    "chequeNo" TEXT,
    "chequeDate" TIMESTAMP(3),
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" SERIAL NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "voucherPrefix" TEXT NOT NULL,
    "voucherNumber" INTEGER NOT NULL,
    "voucherDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryType" "JournalType" NOT NULL,
    "companyId" INTEGER NOT NULL,
    "narration" TEXT,
    "reference" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_lines" (
    "id" SERIAL NOT NULL,
    "journalEntryId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "crDr" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "narration" TEXT,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_transfers" (
    "id" SERIAL NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "voucherPrefix" TEXT NOT NULL,
    "voucherNumber" INTEGER NOT NULL,
    "voucherDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transferType" "TransferType" NOT NULL,
    "companyId" INTEGER NOT NULL,
    "issuingBranchId" INTEGER NOT NULL,
    "receivingBranchId" INTEGER NOT NULL,
    "totalGrossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalNetWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalPcs" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "billNo" TEXT,
    "narration" TEXT,
    "reference" TEXT,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_transfer_items" (
    "id" SERIAL NOT NULL,
    "branchTransferId" INTEGER NOT NULL,
    "labelId" INTEGER,
    "itemName" TEXT NOT NULL,
    "grossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pcs" INTEGER NOT NULL DEFAULT 1,
    "purityName" TEXT,
    "otherCharge" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "labourRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "labourAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "branch_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layaway_entries" (
    "id" SERIAL NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "voucherPrefix" TEXT NOT NULL DEFAULT 'LY',
    "voucherNumber" INTEGER NOT NULL,
    "voucherDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "pricingModel" TEXT NOT NULL DEFAULT 'FLOATING',
    "metalRateAtBooking" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "accountId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "salesmanName" TEXT,
    "totalGrossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalNetWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalFineWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalPcs" INTEGER NOT NULL DEFAULT 0,
    "metalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "labourAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherCharge" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "roundingDiscount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "voucherAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cashAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "bankAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cardAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "upiAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "oldGoldAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "dueAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "previousOs" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "finalDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "convertedToSaleId" TEXT,
    "narration" TEXT,
    "reference" TEXT,
    "bookName" TEXT,
    "status" "LayawayStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layaway_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layaway_items" (
    "id" SERIAL NOT NULL,
    "layawayEntryId" INTEGER NOT NULL,
    "labelId" INTEGER,
    "itemId" INTEGER NOT NULL,
    "labelNo" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "grossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fineWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pcs" INTEGER NOT NULL DEFAULT 1,
    "metalRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "diamondWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "labourRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "labourAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherCharge" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountAmt" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "layaway_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layaway_payments" (
    "id" SERIAL NOT NULL,
    "layawayId" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(65,30) NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "reference" TEXT,
    "narration" TEXT,

    CONSTRAINT "layaway_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layaway_status_history" (
    "id" SERIAL NOT NULL,
    "layawayId" INTEGER NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL DEFAULT 'SYSTEM',
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "layaway_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" SERIAL NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "receiptPrefix" TEXT NOT NULL DEFAULT 'CPR',
    "receiptNumber" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "paymentType" "PaymentType" NOT NULL,
    "cashAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "bankAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cardAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "upiAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "oldGoldGross" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "oldGoldNet" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "oldGoldRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "oldGoldAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceBefore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "salesVoucherId" INTEGER,
    "bankName" TEXT,
    "chequeNo" TEXT,
    "narration" TEXT,
    "reference" TEXT,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_sequences" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "financialYear" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "voucher_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gst_configs" (
    "id" SERIAL NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "description" TEXT,
    "cgstRate" DECIMAL(65,30) NOT NULL DEFAULT 1.5,
    "sgstRate" DECIMAL(65,30) NOT NULL DEFAULT 1.5,
    "igstRate" DECIMAL(65,30) NOT NULL DEFAULT 3.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gst_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "oldData" JSONB,
    "newData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_requests" (
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

-- CreateTable
CREATE TABLE "stock_request_items" (
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

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_staff" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "branch_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_schemes" (
    "id" SERIAL NOT NULL,
    "schemeNo" TEXT NOT NULL,
    "schemePrefix" TEXT NOT NULL DEFAULT 'SS',
    "schemeNumber" INTEGER NOT NULL,
    "schemeName" TEXT NOT NULL DEFAULT 'Gold Savings Scheme',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "accountId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "durationMonths" INTEGER NOT NULL DEFAULT 11,
    "monthlyAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "bonusMonths" INTEGER NOT NULL DEFAULT 1,
    "bonusAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "missedInstallments" INTEGER NOT NULL DEFAULT 0,
    "totalPaidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "maturityValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "reference" TEXT,
    "status" "SchemeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheme_installments" (
    "id" SERIAL NOT NULL,
    "schemeId" INTEGER NOT NULL,
    "installmentNo" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentMode" TEXT,
    "reference" TEXT,
    "narration" TEXT,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheme_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'document',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE INDEX "branches_companyId_idx" ON "branches"("companyId");

-- CreateIndex
CREATE INDEX "branches_parentId_idx" ON "branches"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "counters_code_key" ON "counters"("code");

-- CreateIndex
CREATE UNIQUE INDEX "metal_types_name_key" ON "metal_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "metal_types_code_key" ON "metal_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "item_groups_code_key" ON "item_groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purities_code_key" ON "purities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "items_code_key" ON "items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "label_prefixes_prefix_key" ON "label_prefixes"("prefix");

-- CreateIndex
CREATE INDEX "label_prefixes_companyId_idx" ON "label_prefixes"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "labels_labelNo_key" ON "labels"("labelNo");

-- CreateIndex
CREATE UNIQUE INDEX "labels_prefixId_tagId_key" ON "labels"("prefixId", "tagId");

-- CreateIndex
CREATE INDEX "metal_rates_companyId_idx" ON "metal_rates"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "metal_rates_companyId_metalTypeId_purityCode_date_key" ON "metal_rates"("companyId", "metalTypeId", "purityCode", "date");

-- CreateIndex
CREATE INDEX "accounts_companyId_idx" ON "accounts"("companyId");

-- CreateIndex
CREATE INDEX "accounts_branchId_idx" ON "accounts"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "salesmen_code_key" ON "salesmen"("code");

-- CreateIndex
CREATE INDEX "salesmen_companyId_idx" ON "salesmen"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_vouchers_voucherNo_key" ON "sales_vouchers"("voucherNo");

-- CreateIndex
CREATE INDEX "sales_vouchers_companyId_idx" ON "sales_vouchers"("companyId");

-- CreateIndex
CREATE INDEX "sales_vouchers_voucherDate_idx" ON "sales_vouchers"("voucherDate");

-- CreateIndex
CREATE INDEX "sales_vouchers_accountId_idx" ON "sales_vouchers"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_vouchers_voucherNo_key" ON "purchase_vouchers"("voucherNo");

-- CreateIndex
CREATE INDEX "purchase_vouchers_companyId_idx" ON "purchase_vouchers"("companyId");

-- CreateIndex
CREATE INDEX "purchase_vouchers_voucherDate_idx" ON "purchase_vouchers"("voucherDate");

-- CreateIndex
CREATE UNIQUE INDEX "cash_entries_voucherNo_key" ON "cash_entries"("voucherNo");

-- CreateIndex
CREATE INDEX "cash_entries_companyId_idx" ON "cash_entries"("companyId");

-- CreateIndex
CREATE INDEX "cash_entries_voucherDate_idx" ON "cash_entries"("voucherDate");

-- CreateIndex
CREATE UNIQUE INDEX "bank_entries_voucherNo_key" ON "bank_entries"("voucherNo");

-- CreateIndex
CREATE INDEX "bank_entries_companyId_idx" ON "bank_entries"("companyId");

-- CreateIndex
CREATE INDEX "bank_entries_voucherDate_idx" ON "bank_entries"("voucherDate");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_voucherNo_key" ON "journal_entries"("voucherNo");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_idx" ON "journal_entries"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_transfers_voucherNo_key" ON "branch_transfers"("voucherNo");

-- CreateIndex
CREATE INDEX "branch_transfers_companyId_idx" ON "branch_transfers"("companyId");

-- CreateIndex
CREATE INDEX "branch_transfers_voucherDate_idx" ON "branch_transfers"("voucherDate");

-- CreateIndex
CREATE UNIQUE INDEX "layaway_entries_voucherNo_key" ON "layaway_entries"("voucherNo");

-- CreateIndex
CREATE INDEX "layaway_entries_accountId_status_idx" ON "layaway_entries"("accountId", "status");

-- CreateIndex
CREATE INDEX "layaway_entries_expiryDate_status_idx" ON "layaway_entries"("expiryDate", "status");

-- CreateIndex
CREATE INDEX "layaway_status_history_layawayId_changedAt_idx" ON "layaway_status_history"("layawayId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payments_receiptNo_key" ON "customer_payments"("receiptNo");

-- CreateIndex
CREATE INDEX "customer_payments_companyId_idx" ON "customer_payments"("companyId");

-- CreateIndex
CREATE INDEX "customer_payments_accountId_idx" ON "customer_payments"("accountId");

-- CreateIndex
CREATE INDEX "customer_payments_paymentDate_idx" ON "customer_payments"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_sequences_companyId_prefix_entityType_financialYear_key" ON "voucher_sequences"("companyId", "prefix", "entityType", "financialYear");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_idx" ON "audit_logs"("companyId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_branchId_idx" ON "audit_logs"("branchId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_requests_requestNo_key" ON "stock_requests"("requestNo");

-- CreateIndex
CREATE INDEX "stock_requests_companyId_idx" ON "stock_requests"("companyId");

-- CreateIndex
CREATE INDEX "stock_requests_requestingBranchId_idx" ON "stock_requests"("requestingBranchId");

-- CreateIndex
CREATE INDEX "stock_requests_sourceBranchId_idx" ON "stock_requests"("sourceBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "branch_staff_branchId_idx" ON "branch_staff"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_staff_userId_branchId_key" ON "branch_staff"("userId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "savings_schemes_schemeNo_key" ON "savings_schemes"("schemeNo");

-- CreateIndex
CREATE INDEX "savings_schemes_companyId_idx" ON "savings_schemes"("companyId");

-- CreateIndex
CREATE INDEX "savings_schemes_accountId_idx" ON "savings_schemes"("accountId");

-- CreateIndex
CREATE INDEX "savings_schemes_branchId_idx" ON "savings_schemes"("branchId");

-- CreateIndex
CREATE INDEX "savings_schemes_startDate_idx" ON "savings_schemes"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "scheme_installments_schemeId_installmentNo_key" ON "scheme_installments"("schemeId", "installmentNo");

-- CreateIndex
CREATE INDEX "attachments_companyId_idx" ON "attachments"("companyId");

-- CreateIndex
CREATE INDEX "attachments_entityType_entityId_idx" ON "attachments"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "attachments_uploadedById_idx" ON "attachments"("uploadedById");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counters" ADD CONSTRAINT "counters_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_groups" ADD CONSTRAINT "item_groups_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "metal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_itemGroupId_fkey" FOREIGN KEY ("itemGroupId") REFERENCES "item_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "metal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "purities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_prefixes" ADD CONSTRAINT "label_prefixes_itemGroupId_fkey" FOREIGN KEY ("itemGroupId") REFERENCES "item_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_prefixes" ADD CONSTRAINT "label_prefixes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_prefixId_fkey" FOREIGN KEY ("prefixId") REFERENCES "label_prefixes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "counters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metal_rates" ADD CONSTRAINT "metal_rates_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "metal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metal_rates" ADD CONSTRAINT "metal_rates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salesmen" ADD CONSTRAINT "salesmen_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_vouchers" ADD CONSTRAINT "sales_vouchers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_vouchers" ADD CONSTRAINT "sales_vouchers_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "salesmen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_vouchers" ADD CONSTRAINT "sales_vouchers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_vouchers" ADD CONSTRAINT "sales_vouchers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_vouchers" ADD CONSTRAINT "sales_vouchers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_salesVoucherId_fkey" FOREIGN KEY ("salesVoucherId") REFERENCES "sales_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_vouchers" ADD CONSTRAINT "purchase_vouchers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_vouchers" ADD CONSTRAINT "purchase_vouchers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_vouchers" ADD CONSTRAINT "purchase_vouchers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_vouchers" ADD CONSTRAINT "purchase_vouchers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchaseVoucherId_fkey" FOREIGN KEY ("purchaseVoucherId") REFERENCES "purchase_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_entry_lines" ADD CONSTRAINT "cash_entry_lines_cashEntryId_fkey" FOREIGN KEY ("cashEntryId") REFERENCES "cash_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_entry_lines" ADD CONSTRAINT "cash_entry_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_issuingBranchId_fkey" FOREIGN KEY ("issuingBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_receivingBranchId_fkey" FOREIGN KEY ("receivingBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfer_items" ADD CONSTRAINT "branch_transfer_items_branchTransferId_fkey" FOREIGN KEY ("branchTransferId") REFERENCES "branch_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfer_items" ADD CONSTRAINT "branch_transfer_items_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_entries" ADD CONSTRAINT "layaway_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_entries" ADD CONSTRAINT "layaway_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_entries" ADD CONSTRAINT "layaway_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_items" ADD CONSTRAINT "layaway_items_layawayEntryId_fkey" FOREIGN KEY ("layawayEntryId") REFERENCES "layaway_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_items" ADD CONSTRAINT "layaway_items_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_items" ADD CONSTRAINT "layaway_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_payments" ADD CONSTRAINT "layaway_payments_layawayId_fkey" FOREIGN KEY ("layawayId") REFERENCES "layaway_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_status_history" ADD CONSTRAINT "layaway_status_history_layawayId_fkey" FOREIGN KEY ("layawayId") REFERENCES "layaway_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_sequences" ADD CONSTRAINT "voucher_sequences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_requestingBranchId_fkey" FOREIGN KEY ("requestingBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_request_items" ADD CONSTRAINT "stock_request_items_stockRequestId_fkey" FOREIGN KEY ("stockRequestId") REFERENCES "stock_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_request_items" ADD CONSTRAINT "stock_request_items_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_staff" ADD CONSTRAINT "branch_staff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_schemes" ADD CONSTRAINT "savings_schemes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_schemes" ADD CONSTRAINT "savings_schemes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_schemes" ADD CONSTRAINT "savings_schemes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_installments" ADD CONSTRAINT "scheme_installments_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "savings_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

