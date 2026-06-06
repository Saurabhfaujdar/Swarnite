-- Courier Integration Migration
-- Adds structured address fields to karigers, COURIER charge type, and courier_shipments table.

-- 1. Add structured address fields to karigers
ALTER TABLE "karigers" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "karigers" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "karigers" ADD COLUMN IF NOT EXISTS "pincode" TEXT;
ALTER TABLE "karigers" ADD COLUMN IF NOT EXISTS "landmark" TEXT;

-- 2. Add COURIER to RepairChargeType enum
DO $$ BEGIN
  ALTER TYPE "RepairChargeType" ADD VALUE IF NOT EXISTS 'COURIER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create CourierShipmentType enum
DO $$ BEGIN
  CREATE TYPE "CourierShipmentType" AS ENUM ('REPAIR_TO_KARIGAR', 'REPAIR_FROM_KARIGAR', 'BRANCH_TRANSFER', 'STOCK_REQUEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Create CourierShipmentStatus enum
DO $$ BEGIN
  CREATE TYPE "CourierShipmentStatus" AS ENUM ('CREATED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Create courier_shipments table
CREATE TABLE IF NOT EXISTS "courier_shipments" (
  "id" SERIAL PRIMARY KEY,
  "shipmentType" "CourierShipmentType" NOT NULL,
  "status" "CourierShipmentStatus" NOT NULL DEFAULT 'CREATED',
  "entityType" TEXT NOT NULL,
  "entityId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "courierPartner" TEXT,
  "awbNumber" TEXT,
  "trackingUrl" TEXT,
  "shiprocketOrderId" TEXT,
  "shiprocketShipmentId" TEXT,
  "pickupAddress" JSONB,
  "deliveryAddress" JSONB,
  "weightGrams" DECIMAL,
  "declaredValue" DECIMAL,
  "courierCharges" DECIMAL,
  "estimatedDelivery" TIMESTAMPTZ,
  "pickedUpAt" TIMESTAMPTZ,
  "deliveredAt" TIMESTAMPTZ,
  "lastWebhookPayload" JSONB,
  "lastWebhookAt" TIMESTAMPTZ,
  "createdById" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS "courier_shipments_entity_type_entity_id_idx" ON "courier_shipments" ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "courier_shipments_company_id_idx" ON "courier_shipments" ("companyId");
CREATE INDEX IF NOT EXISTS "courier_shipments_awb_number_idx" ON "courier_shipments" ("awbNumber");
CREATE INDEX IF NOT EXISTS "courier_shipments_shiprocket_order_id_idx" ON "courier_shipments" ("shiprocketOrderId");
CREATE INDEX IF NOT EXISTS "courier_shipments_status_idx" ON "courier_shipments" ("status");
