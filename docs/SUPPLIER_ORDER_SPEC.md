# Supplier Order Flow — Functional Specification

> **Module**: Supplier Orders  
> **Version**: 1.0  
> **Date**: 2026-05-19  
> **Architecture Reference**: Repair Module (`server/routes/repairs.ts`, `server/services/repairWorkflow.ts`, `server/services/repairLedger.ts`)

---

## 1. User Personas & Permissions

| Persona | Role Token | Can Do |
|---------|-----------|--------|
| **Owner / Admin** | `ADMIN` | Everything. Override approvals. Cancel after advance. Write off shortages. Force-close. |
| **Manager** | `MANAGER` | Create/edit orders. Approve rate changes, excess, shortage write-offs. Record payments. Post purchase. |
| **Cashier / Accountant** | `ACCOUNTANT` | Record advances. Record payments. View ledgers. Cannot modify order items or approve weight discrepancies. |
| **Inventory Staff** | `STAFF` | Receive goods. Perform QC/weight verification. Cannot approve rate changes or make payments. |

### Permission Matrix

| Operation | ADMIN | MANAGER | ACCOUNTANT | STAFF |
|-----------|:-----:|:-------:|:----------:|:-----:|
| Create/edit draft order | ✓ | ✓ | ✗ | ✗ |
| Send order to supplier | ✓ | ✓ | ✗ | ✗ |
| Record acknowledgement | ✓ | ✓ | ✗ | ✗ |
| Pay advance | ✓ | ✓ | ✓ | ✗ |
| Receive goods (physical) | ✓ | ✓ | ✗ | ✓ |
| Perform QC / verify weights | ✓ | ✓ | ✗ | ✓ |
| Classify weight discrepancy | ✓ | ✓ | ✗ | ✓ (propose) |
| Approve excess/shortage/rate change | ✓ | ✓ | ✗ | ✗ |
| Record supplier invoice | ✓ | ✓ | ✓ | ✗ |
| Post purchase (inventory induction) | ✓ | ✓ | ✗ | ✗ |
| Make payment | ✓ | ✓ | ✓ | ✗ |
| Cancel order | ✓ | ✓ (pre-advance only) | ✗ | ✗ |
| Close order | ✓ | ✓ | ✗ | ✗ |
| Add notes/attachments | ✓ | ✓ | ✓ | ✓ |

---

## 2. Data Models

### 2.1 Enums

```prisma
enum SupplierOrderStatus {
  DRAFT
  SENT_TO_SUPPLIER
  SUPPLIER_ACKNOWLEDGED
  ADVANCE_PAID
  IN_PRODUCTION
  DISPATCHED
  PARTIALLY_RECEIVED
  RECEIVED_PENDING_QC
  QC_COMPLETED
  INVOICE_RECEIVED
  PURCHASE_POSTED
  PAYMENT_PENDING
  CLOSED
  // Special
  CANCELLED
  REJECTED
  SHORT_DELIVERED
  EXCESS_DELIVERED
  RETURNED_TO_SUPPLIER
  DISPUTED
}

enum SupplierOrderItemType {
  JEWELRY          // Finished jewelry (ring, chain, bangle)
  BULLION          // Gold/silver bars
  COIN             // Minted coins
  STONE            // Diamonds, gems
  CUSTOM           // Custom-made items (design-based)
  RAW_MATERIAL     // Wire, sheet, findings
}

enum SupplierReceiptStatus {
  PENDING_QC
  QC_PASSED
  QC_FAILED
  PARTIAL_PASS
  RETURNED
}

enum WeightDiscrepancyType {
  NORMAL_WASTAGE        // Expected making loss (within tolerance)
  EXCESS_RECEIVED       // Supplier sent more than ordered
  SHORT_RECEIVED        // Supplier sent less than ordered
  PURITY_DIFFERENCE     // Actual purity differs from ordered
  STONE_WEIGHT_DIFF     // Stone weight differs
  APPROVED_ADJUSTMENT   // Manager-approved manual correction
}

enum SupplierPaymentType {
  ADVANCE              // Pre-delivery payment
  ON_DELIVERY          // Payment at goods receipt
  AGAINST_INVOICE      // Payment against supplier's invoice
  FINAL_SETTLEMENT     // Closing payment
  REFUND               // Supplier refund (excess advance, return)
  ADJUSTMENT           // Debit/credit note
}

enum SupplierPaymentMode {
  CASH
  BANK_TRANSFER
  CHEQUE
  UPI
  GOLD_EXCHANGE        // Old gold given as payment
  ADJUSTMENT           // Book entry (debit/credit note)
}

enum SupplierMetalTxnType {
  METAL_ISSUED         // Shop sends gold/material to supplier for making
  METAL_RECEIVED       // Supplier delivers finished goods
  WASTAGE_APPROVED     // Agreed making loss written off
  EXCESS_RECEIVED      // More than ordered received
  SHORTAGE             // Less than ordered, written off
  RETURN               // Goods returned to supplier
  ADJUSTMENT           // Manual correction
}

enum SupplierMoneyTxnType {
  ORDER_PAYABLE        // Goods value owed to supplier
  ADVANCE_PAID         // Advance payment made
  DELIVERY_PAYMENT     // Payment on delivery
  INVOICE_ADJUSTMENT   // Difference between estimate and final invoice
  SETTLEMENT           // Final payment
  REFUND_RECEIVED      // Supplier returned money
  DEBIT_NOTE           // Reduction in payable (return, shortage, defect)
  CREDIT_NOTE          // Increase in payable (rate revision, extra)
  ADJUSTMENT           // Manual correction
}

enum ApprovalType {
  RATE_CHANGE          // Rate changed after acknowledgement
  EXCESS_RECEIPT       // Received more than tolerance allows
  SHORTAGE_WRITEOFF    // Writing off shortage as accepted loss
  PAYABLE_ADJUSTMENT   // Manual adjustment to money owed
  CANCELLATION         // Cancel after advance paid
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}
```

### 2.2 Core Models

#### SupplierOrder (Master Document)

```prisma
model SupplierOrder {
  id                Int                    @id @default(autoincrement())
  orderNo           String                 @unique  // "SO/1", "SO/2"
  orderPrefix       String                 @default("SO")
  orderNumber       Int                    // Sequential within FY
  orderDate         DateTime               @default(now())

  // Supplier (Account with type=SUPPLIER)
  supplierId        Int
  supplier          Account                @relation("SupplierOrders", fields: [supplierId], references: [id])
  supplierName      String                 // Denormalized for display
  supplierGstin     String?                // Snapshot at order time

  // Scope
  companyId         Int
  company           Company                @relation(fields: [companyId], references: [id])
  branchId          Int
  branch            Branch                 @relation(fields: [branchId], references: [id])

  // Status
  status            SupplierOrderStatus    @default(DRAFT)
  priority          String                 @default("NORMAL")  // LOW, NORMAL, HIGH, URGENT

  // Dates
  expectedDeliveryDate DateTime?
  actualDeliveryDate   DateTime?
  acknowledgementDate  DateTime?
  closedAt             DateTime?

  // Amounts (estimated at order time, finalized at invoice)
  estimatedTotal       Decimal              @default(0)  // Sum of item estimates
  advancePaid          Decimal              @default(0)  // Total advance paid
  invoicedTotal        Decimal?             // Supplier's final invoice amount
  totalPaid            Decimal              @default(0)  // Total payments made
  balanceDue           Decimal              @default(0)  // invoicedTotal - totalPaid (or estimatedTotal if no invoice)

  // Metal tracking (aggregate for quick dashboard)
  totalOrderedWeight   Decimal              @default(0)  // Total metal weight ordered (grams)
  totalReceivedWeight  Decimal              @default(0)  // Total metal weight received (grams)
  totalIssuedWeight    Decimal              @default(0)  // Metal issued to supplier for making (grams)

  // Approval gates
  approvalRequired     Boolean              @default(false)
  approvalType         ApprovalType?
  approvalRemarks      String?
  approvedAt           DateTime?
  approvedBy           Int?

  // Metadata
  narration           String?               // Free-text description of order
  reference           String?               // External ref (supplier quote no, email ref)
  terms               String?               // Payment/delivery terms text
  internalNotes       String?               // Private notes (not shared with supplier)

  // Audit
  createdBy           Int
  updatedBy           Int?
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt

  // Relations
  items               SupplierOrderItem[]
  receipts            SupplierReceipt[]
  payments            SupplierOrderPayment[]
  stateHistory        SupplierOrderStateHistory[]
  approvals           SupplierOrderApproval[]
  metalLedger         SupplierMetalLedger[]
  moneyLedger         SupplierMoneyLedger[]
  attachments         SupplierOrderAttachment[]
  purchaseVoucher     PurchaseVoucher?       @relation("SupplierOrderPurchase")

  @@index([companyId, branchId, status])
  @@index([supplierId])
  @@index([orderDate])
  @@index([status])
  @@map("supplier_orders")
}
```

#### SupplierOrderItem (Line Items)

```prisma
model SupplierOrderItem {
  id                  Int                    @id @default(autoincrement())
  supplierOrderId     Int
  supplierOrder       SupplierOrder          @relation(fields: [supplierOrderId], references: [id], onDelete: Cascade)

  // Item details
  itemType            SupplierOrderItemType  @default(JEWELRY)
  description         String                 // "22KT Gold Chain 20 inch", "1oz Gold Bar"
  itemGroupId         Int?                   // FK to ItemGroup (optional for custom)
  itemGroup           ItemGroup?             @relation(fields: [itemGroupId], references: [id])
  metalTypeId         Int
  metalType           MetalType              @relation(fields: [metalTypeId], references: [id])
  purityId            Int?
  purity              Purity?                @relation(fields: [purityId], references: [id])

  // Quantity
  quantity            Int                    @default(1)   // Number of pieces
  orderedWeight       Decimal                @default(0)   // Total metal weight ordered (grams)

  // Rates (snapshot at order time)
  metalRatePerGram    Decimal                @default(0)   // Gold/silver rate per gram
  makingChargeType    String?                // "per_gram", "per_piece", "percentage", "lump_sum"
  makingChargeRate    Decimal                @default(0)   // Making charge rate
  makingChargeAmount  Decimal                @default(0)   // Calculated making charge total
  stoneCharge         Decimal                @default(0)   // Stone setting / stone cost
  otherCharges        Decimal                @default(0)   // Hallmark, polish, certification
  estimatedAmount     Decimal                @default(0)   // Total estimated cost for this line

  // Design reference (for custom items)
  designRef           String?                // Design number or reference
  designNotes         String?                // Special instructions

  // Delivery tracking (aggregated from receipts)
  receivedQuantity    Int                    @default(0)
  receivedWeight      Decimal                @default(0)   // Total weight received so far
  acceptedWeight      Decimal                @default(0)   // Weight that passed QC
  rejectedQuantity    Int                    @default(0)

  // Status (derived from received vs ordered)
  isFullyReceived     Boolean                @default(false)
  isShortClosed       Boolean                @default(false) // Accepted as final even if under-delivered

  createdAt           DateTime               @default(now())
  updatedAt           DateTime               @updatedAt

  receiptItems        SupplierReceiptItem[]

  @@index([supplierOrderId])
  @@map("supplier_order_items")
}
```

#### SupplierReceipt (Goods Receipt / Delivery)

```prisma
model SupplierReceipt {
  id                  Int                    @id @default(autoincrement())
  receiptNo           String                 @unique  // "SR/1"
  receiptPrefix       String                 @default("SR")
  receiptNumber       Int
  receiptDate         DateTime               @default(now())

  supplierOrderId     Int
  supplierOrder       SupplierOrder          @relation(fields: [supplierOrderId], references: [id])

  // Scope
  companyId           Int
  company             Company                @relation(fields: [companyId], references: [id])
  branchId            Int
  branch              Branch                 @relation(fields: [branchId], references: [id])

  // Receipt details
  status              SupplierReceiptStatus  @default(PENDING_QC)
  challanNo           String?                // Supplier's delivery challan number
  challanDate         DateTime?
  transportDetails    String?                // Courier, vehicle, person delivering
  receivedBy          Int                    // User who physically received
  verifiedBy          Int?                   // User who did QC
  verifiedAt          DateTime?

  // Aggregate weights
  totalReceivedWeight Decimal                @default(0)
  totalAcceptedWeight Decimal                @default(0)
  totalRejectedWeight Decimal                @default(0)

  // QC summary
  qcRemarks           String?
  qcPassedAt          DateTime?

  createdAt           DateTime               @default(now())
  updatedAt           DateTime               @updatedAt

  items               SupplierReceiptItem[]
  discrepancies       SupplierWeightDiscrepancy[]

  @@index([supplierOrderId])
  @@index([companyId, branchId])
  @@index([receiptDate])
  @@map("supplier_receipts")
}
```

#### SupplierReceiptItem (Per-Item Receipt Detail)

```prisma
model SupplierReceiptItem {
  id                  Int                    @id @default(autoincrement())
  supplierReceiptId   Int
  supplierReceipt     SupplierReceipt        @relation(fields: [supplierReceiptId], references: [id], onDelete: Cascade)
  orderItemId         Int
  orderItem           SupplierOrderItem      @relation(fields: [orderItemId], references: [id])

  // Received details
  receivedQuantity    Int                    @default(1)
  receivedGrossWeight Decimal                @default(0)
  receivedNetWeight   Decimal                @default(0)
  stoneWeight         Decimal                @default(0)
  actualPurity        Decimal?               // Tested purity (percentage), null if not tested

  // QC result
  qcStatus            String                 @default("PENDING")  // PENDING, PASSED, FAILED, CONDITIONAL
  qcRemarks           String?

  // Accepted (post-QC)
  acceptedQuantity    Int                    @default(0)
  acceptedWeight      Decimal                @default(0)   // Final accepted net weight
  rejectedQuantity    Int                    @default(0)
  rejectedWeight      Decimal                @default(0)
  rejectionReason     String?

  // Rate snapshot at receipt (may differ from order if rate revision approved)
  ratePerGram         Decimal                @default(0)
  amount              Decimal                @default(0)   // acceptedWeight × ratePerGram

  // Label creation (post purchase-posting)
  labelId             Int?                   // Created label after purchase posting
  label               Label?                 @relation(fields: [labelId], references: [id])

  createdAt           DateTime               @default(now())

  @@index([supplierReceiptId])
  @@index([orderItemId])
  @@map("supplier_receipt_items")
}
```

#### SupplierWeightDiscrepancy (Classified Differences)

```prisma
model SupplierWeightDiscrepancy {
  id                  Int                    @id @default(autoincrement())
  supplierReceiptId   Int
  supplierReceipt     SupplierReceipt        @relation(fields: [supplierReceiptId], references: [id])
  orderItemId         Int

  discrepancyType     WeightDiscrepancyType
  orderedWeight       Decimal                // Expected weight
  receivedWeight      Decimal                // Actual weight
  differenceWeight    Decimal                // Signed: +ve = excess, -ve = short
  differencePercent   Decimal                // % difference for tolerance checks

  // Rate + amount (for financial impact)
  ratePerGram         Decimal                @default(0)
  amount              Decimal                @default(0)  // |differenceWeight| × rate

  // Tolerance check
  withinTolerance     Boolean                @default(false)  // Auto-approved if within configured tolerance
  tolerancePercent    Decimal                @default(0)      // Configured tolerance at time of check

  // Approval (required if outside tolerance)
  requiresApproval    Boolean                @default(false)
  approvedBy          Int?
  approvedAt          DateTime?
  approvalRemarks     String?

  remarks             String?
  classifiedBy        Int                    // User who classified
  createdAt           DateTime               @default(now())

  @@index([supplierReceiptId])
  @@map("supplier_weight_discrepancies")
}
```

#### SupplierOrderPayment

```prisma
model SupplierOrderPayment {
  id                  Int                    @id @default(autoincrement())
  paymentNo           String                 @unique  // "SPP/1"
  paymentPrefix       String                 @default("SPP")
  paymentNumber       Int
  paymentDate         DateTime               @default(now())

  supplierOrderId     Int
  supplierOrder       SupplierOrder          @relation(fields: [supplierOrderId], references: [id])

  // Scope
  companyId           Int
  company             Company                @relation(fields: [companyId], references: [id])
  branchId            Int
  branch              Branch                 @relation(fields: [branchId], references: [id])

  // Payment details
  paymentType         SupplierPaymentType
  paymentMode         SupplierPaymentMode
  amount              Decimal                @default(0)

  // Mode-specific details
  bankName            String?
  chequeNo            String?
  chequeDate          DateTime?
  upiRef             String?
  transactionRef     String?

  // Gold exchange (if paying via old gold)
  goldWeight          Decimal?               // Grams of gold given
  goldPurity          Decimal?               // Purity percentage
  goldRate            Decimal?               // Rate per gram
  goldAmount          Decimal?               // Calculated gold value

  // Balance tracking
  balanceBefore       Decimal                @default(0)
  balanceAfter        Decimal                @default(0)

  narration           String?
  reference           String?
  createdBy           Int
  createdAt           DateTime               @default(now())

  @@index([supplierOrderId])
  @@index([companyId, branchId])
  @@index([paymentDate])
  @@map("supplier_order_payments")
}
```

#### SupplierOrderStateHistory (Immutable Audit Trail)

```prisma
model SupplierOrderStateHistory {
  id                  Int                    @id @default(autoincrement())
  supplierOrderId     Int
  supplierOrder       SupplierOrder          @relation(fields: [supplierOrderId], references: [id])

  fromState           SupplierOrderStatus
  toState             SupplierOrderStatus
  remarks             String?
  metadata            Json?                  // Additional context (e.g., receipt ID that triggered transition)

  changedBy           Int
  changedAt           DateTime               @default(now())

  @@index([supplierOrderId, changedAt])
  @@map("supplier_order_state_history")
}
```

#### SupplierOrderApproval

```prisma
model SupplierOrderApproval {
  id                  Int                    @id @default(autoincrement())
  supplierOrderId     Int
  supplierOrder       SupplierOrder          @relation(fields: [supplierOrderId], references: [id])

  approvalType        ApprovalType
  status              ApprovalStatus         @default(PENDING)
  requestedBy         Int
  requestedAt         DateTime               @default(now())
  description         String                 // What needs approval and why

  // Context
  originalValue       String?                // e.g., original rate
  proposedValue       String?                // e.g., new rate
  amount              Decimal?               // Financial impact

  // Resolution
  resolvedBy          Int?
  resolvedAt          DateTime?
  resolutionRemarks   String?

  @@index([supplierOrderId])
  @@index([status])
  @@map("supplier_order_approvals")
}
```

#### SupplierMetalLedger

```prisma
model SupplierMetalLedger {
  id                      Int                    @id @default(autoincrement())
  supplierId              Int                    // Account.id (type=SUPPLIER)
  supplier                Account                @relation("SupplierMetalLedger", fields: [supplierId], references: [id])
  supplierOrderId         Int?
  supplierOrder           SupplierOrder?         @relation(fields: [supplierOrderId], references: [id])
  supplierReceiptId       Int?                   // Which receipt triggered this

  metalTypeId             Int
  metalType               MetalType              @relation(fields: [metalTypeId], references: [id])
  transactionType         SupplierMetalTxnType
  weight                  Decimal                // Signed: +ve = shop issued to supplier, -ve = supplier delivered to shop
  purity                  Decimal                @default(0)   // Purity percentage
  fineWeight              Decimal                @default(0)   // weight × (purity/100)
  ratePerGram             Decimal                @default(0)
  amount                  Decimal                @default(0)
  balanceAfterTransaction Decimal                @default(0)   // Running balance (grams fine)

  remarks                 String?
  createdBy               Int
  createdAt               DateTime               @default(now())

  @@index([supplierId])
  @@index([supplierOrderId])
  @@index([createdAt])
  @@map("supplier_metal_ledger")
}
```

#### SupplierMoneyLedger

```prisma
model SupplierMoneyLedger {
  id                      Int                    @id @default(autoincrement())
  supplierId              Int                    // Account.id (type=SUPPLIER)
  supplier                Account                @relation("SupplierMoneyLedger", fields: [supplierId], references: [id])
  supplierOrderId         Int?
  supplierOrder           SupplierOrder?         @relation(fields: [supplierOrderId], references: [id])
  supplierPaymentId       Int?                   // Which payment triggered this

  transactionType         SupplierMoneyTxnType
  debit                   Decimal                @default(0)   // Increases payable (order value, credit note)
  credit                  Decimal                @default(0)   // Decreases payable (payment, debit note, refund)
  balanceAfterTransaction Decimal                @default(0)   // Running balance: +ve = shop owes supplier
  rateSnapshot            Decimal?               // Gold rate at time of transaction (for reference)

  remarks                 String?
  reference               String?                // Voucher/invoice ref
  createdBy               Int
  createdAt               DateTime               @default(now())

  @@index([supplierId])
  @@index([supplierOrderId])
  @@index([createdAt])
  @@map("supplier_money_ledger")
}
```

#### SupplierOrderAttachment

```prisma
model SupplierOrderAttachment {
  id                  Int                    @id @default(autoincrement())
  supplierOrderId     Int
  supplierOrder       SupplierOrder          @relation(fields: [supplierOrderId], references: [id])
  
  fileName            String
  fileType            String                 // "image/jpeg", "application/pdf"
  storagePath         String                 // Path in file storage
  category            String                 @default("OTHER")  // ORDER, INVOICE, CHALLAN, DESIGN, QC_PHOTO, OTHER
  uploadedBy          Int
  createdAt           DateTime               @default(now())

  @@index([supplierOrderId])
  @@map("supplier_order_attachments")
}
```

### 2.3 Relations to Add on Existing Models

```prisma
// On Account model — add:
  supplierOrders      SupplierOrder[]        @relation("SupplierOrders")
  supplierMetalLedger SupplierMetalLedger[]  @relation("SupplierMetalLedger")
  supplierMoneyLedger SupplierMoneyLedger[]  @relation("SupplierMoneyLedger")

// On Company model — add:
  supplierOrders      SupplierOrder[]
  supplierReceipts    SupplierReceipt[]

// On Branch model — add:
  supplierOrders      SupplierOrder[]
  supplierReceipts    SupplierReceipt[]

// On MetalType model — add:
  supplierOrderItems     SupplierOrderItem[]
  supplierMetalLedger    SupplierMetalLedger[]

// On ItemGroup model — add:
  supplierOrderItems     SupplierOrderItem[]

// On Purity model — add:
  supplierOrderItems     SupplierOrderItem[]

// On Label model — add:
  supplierReceiptItems   SupplierReceiptItem[]

// On PurchaseVoucher model — add:
  supplierOrderId     Int?                   @unique
  supplierOrder       SupplierOrder?         @relation("SupplierOrderPurchase", fields: [supplierOrderId], references: [id])
```

---

## 3. Workflow State Machine

### 3.1 Primary Flow (Happy Path)

```
DRAFT → SENT_TO_SUPPLIER → SUPPLIER_ACKNOWLEDGED → ADVANCE_PAID → IN_PRODUCTION
  → DISPATCHED → PARTIALLY_RECEIVED → RECEIVED_PENDING_QC → QC_COMPLETED
  → INVOICE_RECEIVED → PURCHASE_POSTED → PAYMENT_PENDING → CLOSED
```

### 3.2 Allowed Transitions Map

```typescript
const ALLOWED_TRANSITIONS: Record<SupplierOrderStatus, SupplierOrderStatus[]> = {
  DRAFT: [
    'SENT_TO_SUPPLIER',
    'CANCELLED',                    // Can cancel draft freely
  ],
  SENT_TO_SUPPLIER: [
    'SUPPLIER_ACKNOWLEDGED',
    'REJECTED',                     // Supplier declined
    'CANCELLED',                    // Buyer cancels before ack
  ],
  SUPPLIER_ACKNOWLEDGED: [
    'ADVANCE_PAID',                 // Advance paid (optional, can skip)
    'IN_PRODUCTION',                // Direct if no advance needed
    'DISPATCHED',                   // Immediate dispatch (stock items)
    'CANCELLED',                    // Cancel before production
  ],
  ADVANCE_PAID: [
    'IN_PRODUCTION',
    'DISPATCHED',                   // Immediate dispatch after advance
    'CANCELLED',                    // Requires ADMIN approval
  ],
  IN_PRODUCTION: [
    'DISPATCHED',
    'CANCELLED',                    // Requires ADMIN approval + refund handling
  ],
  DISPATCHED: [
    'PARTIALLY_RECEIVED',
    'RECEIVED_PENDING_QC',          // Full receipt in one go
  ],
  PARTIALLY_RECEIVED: [
    'PARTIALLY_RECEIVED',           // Another partial receipt
    'RECEIVED_PENDING_QC',          // Final receipt received
    'SHORT_DELIVERED',              // Supplier confirms no more coming
    'RETURNED_TO_SUPPLIER',         // All received items returned
  ],
  RECEIVED_PENDING_QC: [
    'QC_COMPLETED',
    'RETURNED_TO_SUPPLIER',         // Failed QC entirely
    'DISPUTED',                     // Cannot agree on quality/weight
  ],
  QC_COMPLETED: [
    'INVOICE_RECEIVED',
    'PURCHASE_POSTED',              // Can post without formal invoice (small suppliers)
    'RETURNED_TO_SUPPLIER',         // Post-QC rejection (rare)
  ],
  INVOICE_RECEIVED: [
    'PURCHASE_POSTED',
    'DISPUTED',                     // Invoice doesn't match order/receipt
  ],
  PURCHASE_POSTED: [
    'PAYMENT_PENDING',
    'CLOSED',                       // If already fully paid (advance covered it)
  ],
  PAYMENT_PENDING: [
    'CLOSED',
  ],

  // Special / terminal states
  CLOSED: [],                        // Terminal
  CANCELLED: [],                     // Terminal
  REJECTED: [
    'DRAFT',                         // Re-draft after supplier rejects (revise and resend)
  ],
  SHORT_DELIVERED: [
    'RECEIVED_PENDING_QC',           // Accept short delivery, proceed with what we have
    'CANCELLED',                     // Cancel remainder
    'DISPUTED',
  ],
  EXCESS_DELIVERED: [
    'RECEIVED_PENDING_QC',           // Accept excess (with approval)
    'RETURNED_TO_SUPPLIER',          // Return excess
  ],
  RETURNED_TO_SUPPLIER: [
    'CLOSED',                        // After return settled
    'CANCELLED',                     // Write off
  ],
  DISPUTED: [
    'RECEIVED_PENDING_QC',           // Dispute resolved, proceed
    'RETURNED_TO_SUPPLIER',          // Dispute → return
    'CANCELLED',                     // Dispute → cancel
    'CLOSED',                        // Dispute settled commercially
  ],
};
```

### 3.3 Transition Rules

| Transition | Pre-condition | Side Effect |
|---|---|---|
| DRAFT → SENT_TO_SUPPLIER | At least 1 item, `estimatedTotal > 0` | — |
| SENT → SUPPLIER_ACKNOWLEDGED | — | Set `acknowledgementDate` |
| * → ADVANCE_PAID | Payment amount > 0 recorded | Post money ledger (ADVANCE_PAID) |
| * → DISPATCHED | — | — |
| DISPATCHED → PARTIALLY_RECEIVED | Receipt created with items | Update `totalReceivedWeight`, post metal ledger |
| * → RECEIVED_PENDING_QC | All ordered items have receipts OR short-closed | — |
| RECEIVED_PENDING_QC → QC_COMPLETED | All receipt items have qcStatus ≠ PENDING | — |
| QC → INVOICE_RECEIVED | Invoice number + amount recorded | Post money ledger (ORDER_PAYABLE) |
| * → PURCHASE_POSTED | QC passed, no pending approvals | Create PurchaseVoucher + Labels. Post metal ledger. **IDEMPOTENT**: skip if already posted |
| PURCHASE_POSTED → PAYMENT_PENDING | — | — |
| PAYMENT_PENDING → CLOSED | `balanceDue ≤ 0` (fully settled) | Set `closedAt` |
| * → CANCELLED | See approval rules below | Reverse any pending ledger entries |
| * → RETURNED_TO_SUPPLIER | Return receipt created | Post metal ledger (RETURN), post money ledger (DEBIT_NOTE) |

### 3.4 Auto-Transitions (Triggered by Data Changes)

| Trigger | Auto-Transition |
|---|---|
| Receipt created where `sum(receivedWeight) < sum(orderedWeight)` | → PARTIALLY_RECEIVED |
| Receipt created where `sum(receivedWeight) >= sum(orderedWeight)` | → RECEIVED_PENDING_QC |
| Receipt where `sum(receivedWeight) > sum(orderedWeight) + tolerance` | → EXCESS_DELIVERED (requires approval) |
| All receipt items QC'd | → QC_COMPLETED |
| Last payment makes `balanceDue ≤ 0` | → CLOSED (auto) |

---

## 4. Validation Rules

### 4.1 Order Creation

| Field | Rule |
|---|---|
| `supplierId` | Must exist, `Account.type = SUPPLIER`, `isActive = true` |
| `branchId` | Must be within `req.branchScope` |
| `items[]` | At least 1 item required |
| `items[].metalTypeId` | Must exist and be active |
| `items[].orderedWeight` | Must be > 0 |
| `items[].quantity` | Must be ≥ 1 |
| `items[].metalRatePerGram` | Must be > 0 |
| `items[].estimatedAmount` | Auto-calculated: `(orderedWeight × metalRatePerGram) + makingChargeAmount + stoneCharge + otherCharges` |

### 4.2 Receipt

| Field | Rule |
|---|---|
| `supplierOrderId` | Must exist, status must allow receipts |
| `items[].orderItemId` | Must belong to the order |
| `items[].receivedGrossWeight` | Must be > 0 |
| `items[].receivedNetWeight` | Must be ≤ `receivedGrossWeight` |
| Cumulative received | `sum(receivedWeight)` for an item must not exceed `orderedWeight × (1 + excessTolerance)` without approval |

### 4.3 Payment

| Field | Rule |
|---|---|
| `amount` | Must be > 0 |
| `paymentMode` | Required |
| If `GOLD_EXCHANGE` | `goldWeight`, `goldPurity`, `goldRate` all required |
| Cumulative paid | Cannot exceed `invoicedTotal` (or `estimatedTotal` if no invoice) + 10% tolerance without approval |

### 4.4 Immutability Rules

| Status | What's Locked |
|---|---|
| CLOSED | Everything except `internalNotes`. No new receipts, payments, or status changes. |
| CANCELLED | Everything except `internalNotes`. |
| PURCHASE_POSTED onward | Cannot modify items, receipts, or QC results. Can only add payments. |

---

## 5. Approval Gates

### 5.1 Automatic Approval Triggers

| Condition | ApprovalType | Who Can Approve |
|---|---|---|
| Rate change > 2% after SUPPLIER_ACKNOWLEDGED | `RATE_CHANGE` | MANAGER, ADMIN |
| Received weight > ordered + 3% (configurable) | `EXCESS_RECEIPT` | MANAGER, ADMIN |
| Writing off shortage > ₹5,000 | `SHORTAGE_WRITEOFF` | MANAGER, ADMIN |
| Manual debit/credit to supplier ledger | `PAYABLE_ADJUSTMENT` | ADMIN only |
| Cancel order after advance paid | `CANCELLATION` | ADMIN only |

### 5.2 Approval Flow

1. System detects condition → creates `SupplierOrderApproval` row (status=PENDING)
2. Sets `SupplierOrder.approvalRequired = true`
3. **Blocks**: The triggering operation is NOT completed. The data is staged.
4. Manager/Admin reviews → POST `/api/supplier-orders/:id/approvals/:approvalId/resolve`
5. If APPROVED: operation completes, approval flag cleared
6. If REJECTED: staged data discarded, workflow continues at previous state

### 5.3 Configurable Thresholds

```typescript
const APPROVAL_THRESHOLDS = {
  RATE_CHANGE_PERCENT: 2,           // Rate change > 2% needs approval
  EXCESS_WEIGHT_PERCENT: 3,         // Excess > 3% of ordered weight needs approval
  SHORTAGE_WRITEOFF_AMOUNT: 5000,   // Shortage > ₹5,000 needs approval
  MAX_PAYMENT_OVER_INVOICE: 10,     // Payment cannot exceed invoice by > 10%
  WASTAGE_TOLERANCE_PERCENT: 2,     // Normal wastage up to 2% auto-approved
};
```

---

## 6. Ledger Rules

### 6.1 Supplier Metal Ledger

**Convention**: `+ve weight = shop issued metal to supplier` (supplier holds it). `-ve weight = supplier delivered to shop`.

| Event | Transaction Type | Weight Sign | Balance Effect |
|---|---|---|---|
| Shop issues gold for making | METAL_ISSUED | +ve | Increases (supplier holds more) |
| Supplier delivers goods | METAL_RECEIVED | -ve | Decreases |
| Wastage written off | WASTAGE_APPROVED | -ve | Decreases (written off from supplier's account) |
| Excess received accepted | EXCESS_RECEIVED | -ve | Decreases (extra received) |
| Shortage accepted | SHORTAGE | -ve | Decreases (written off) |
| Goods returned to supplier | RETURN | -ve | Decreases |
| Manual correction | ADJUSTMENT | ±ve | Depends |

**Fine weight**: All entries stored as fine weight: `weight × (purity / 100)`. Dashboard shows fine weight balance.

### 6.2 Supplier Money Ledger

**Convention**: `+ve balance = shop owes supplier`.

| Event | Transaction Type | Debit | Credit | Balance Effect |
|---|---|---|---|---|
| Invoice received / purchase posted | ORDER_PAYABLE | ✓ | — | Increases |
| Advance paid | ADVANCE_PAID | — | ✓ | Decreases |
| Payment on delivery | DELIVERY_PAYMENT | — | ✓ | Decreases |
| Invoice adjusted (was ₹1L, now ₹95K) | INVOICE_ADJUSTMENT | — | ✓ | Decreases |
| Final settlement | SETTLEMENT | — | ✓ | Decreases |
| Supplier refund | REFUND_RECEIVED | — | ✓ | Decreases |
| Debit note (shortage, return, defect) | DEBIT_NOTE | — | ✓ | Decreases |
| Credit note (rate revision up) | CREDIT_NOTE | ✓ | — | Increases |
| Manual correction | ADJUSTMENT | ±ve | ±ve | Depends |

### 6.3 Account.closingBalance Sync

Every money ledger entry must atomically update `Account.closingBalance` (on the supplier's Account row):
- `closingBalance += debit - credit`
- `balanceType = closingBalance > 0 ? 'CR' : closingBalance < 0 ? 'DR' : 'NONE'`

> Note: For suppliers, CR balance means shop owes supplier (consistent with existing convention).

### 6.4 Ledger Service Signature

```typescript
// server/services/supplierLedger.ts

interface PostSupplierMetalArgs {
  tx: Prisma.TransactionClient;
  supplierId: number;            // Account.id
  supplierOrderId?: number;
  supplierReceiptId?: number;
  metalTypeId: number;
  transactionType: SupplierMetalTxnType;
  weight: number;                // Signed
  purity: number;                // Percentage (e.g., 91.67 for 22KT)
  ratePerGram?: number;
  remarks?: string;
  userId: number;
}

interface PostSupplierMoneyArgs {
  tx: Prisma.TransactionClient;
  supplierId: number;            // Account.id
  supplierOrderId?: number;
  supplierPaymentId?: number;
  transactionType: SupplierMoneyTxnType;
  debit?: number;
  credit?: number;
  rateSnapshot?: number;
  remarks?: string;
  reference?: string;
  userId: number;
}
```

---

## 7. Inventory Posting Rules

### 7.1 When Inventory Increases

**ONLY** at the `PURCHASE_POSTED` transition. Not before.

```
Order placed      → NO inventory change
Goods received    → NO inventory change (items in "received but not verified" limbo)
QC completed      → NO inventory change (verified but not financially posted)
Purchase posted   → YES: Labels created, LabelStatus = IN_STOCK, Item stock updated
```

### 7.2 Purchase Posting Logic

```typescript
// Triggered by: POST /api/supplier-orders/:id/post-purchase
// Pre-condition: status = QC_COMPLETED or INVOICE_RECEIVED, no pending approvals

async function postPurchase(tx, orderId, userId) {
  // 1. IDEMPOTENT CHECK: if PurchaseVoucher already exists for this order, return it
  const existing = await tx.purchaseVoucher.findFirst({ where: { supplierOrderId: orderId } });
  if (existing) return existing;  // Already posted

  // 2. Allocate voucher number
  const num = await allocateVoucherNumber(tx, companyId, 'PUR', 'PURCHASE', fy);
  
  // 3. Create PurchaseVoucher (type = REGULAR, link supplierOrderId)
  const pv = await tx.purchaseVoucher.create({
    data: {
      voucherNo: `PUR/${num}`,
      voucherNumber: num,
      purchaseType: 'REGULAR',
      accountId: order.supplierId,
      supplierOrderId: orderId,
      // ... amounts from accepted receipt items
    }
  });
  
  // 4. Create PurchaseItems from accepted SupplierReceiptItems
  for (const receiptItem of acceptedItems) {
    await tx.purchaseItem.create({ ... });
  }
  
  // 5. Create Labels for each accepted piece
  for (const receiptItem of acceptedItems) {
    if (receiptItem.itemType === 'JEWELRY' || receiptItem.itemType === 'COIN') {
      const label = await createLabel(tx, receiptItem, branchId);
      await tx.supplierReceiptItem.update({ where: { id: receiptItem.id }, data: { labelId: label.id } });
    }
  }
  
  // 6. Post supplier metal ledger (METAL_RECEIVED)
  await postSupplierMetal(tx, { type: 'METAL_RECEIVED', weight: -totalAcceptedFineWeight, ... });
  
  // 7. Post supplier money ledger (ORDER_PAYABLE) — only if not already posted via invoice
  if (!order.invoicedTotal) {
    await postSupplierMoney(tx, { type: 'ORDER_PAYABLE', debit: totalAmount, ... });
  }
  
  // 8. Transition status
  await transition(tx, orderId, currentStatus, 'PURCHASE_POSTED', userId);
  
  return pv;
}
```

### 7.3 Label Creation Rules

| Item Type | Creates Label? | Label Prefix | Notes |
|---|---|---|---|
| JEWELRY | Yes (1 per piece) | From `ItemGroup.LabelPrefix` | grossWeight, netWeight, purity from QC |
| COIN | Yes (1 per piece) | Coin prefix | Fixed weight coins |
| BULLION | Optional (1 per bar) | Bullion prefix | May not have individual tracking |
| STONE | No | — | Tracked via stone inventory (future) |
| RAW_MATERIAL | No | — | Weight added to bulk stock |
| CUSTOM | Yes (1 per piece) | From `ItemGroup.LabelPrefix` | Custom design items |

### 7.4 Idempotency

The purchase posting endpoint is **safe to call multiple times**:
- If `PurchaseVoucher` with `supplierOrderId` already exists → return existing, do nothing
- Labels with same receipt item link → skip creation
- Ledger entries check for existing entry with same `supplierOrderId + transactionType` before posting

---

## 8. Reports

### 8.1 Report Endpoints

| Report | Endpoint | Parameters | Returns |
|---|---|---|---|
| Pending Orders | GET `/reports/pending` | branchId?, supplierId?, fromDate, toDate | Orders not yet fully received |
| Overdue Deliveries | GET `/reports/overdue` | — | Orders past expectedDeliveryDate |
| Pending QC | GET `/reports/pending-qc` | — | Receipts awaiting QC |
| Unpaid Orders | GET `/reports/unpaid` | supplierId?, minAmount? | Orders with balanceDue > 0 |
| Supplier Metal Balance | GET `/reports/metal-balance` | supplierId? | Per-supplier metal held (fine grams) |
| Supplier Money Balance | GET `/reports/money-balance` | supplierId? | Per-supplier amount owed |
| Wastage Report | GET `/reports/wastage` | fromDate, toDate, supplierId? | Weight discrepancies classified as wastage |
| Order Summary | GET `/reports/summary` | fromDate, toDate | Count by status, total value, avg delivery time |
| Supplier Performance | GET `/reports/supplier-performance` | supplierId | On-time %, quality %, avg delivery days, wastage % |

### 8.2 Dashboard Counters

```typescript
interface SupplierOrderDashboard {
  counters: {
    totalActive: number;           // Not CLOSED/CANCELLED
    pendingDelivery: number;       // SENT through IN_PRODUCTION/DISPATCHED
    overdueDelivery: number;       // Past expectedDeliveryDate
    pendingQC: number;             // RECEIVED_PENDING_QC
    pendingPayment: number;        // PAYMENT_PENDING
    pendingApprovals: number;      // Has unresolved approvals
  };
  financials: {
    totalOrderValue30d: number;    // Orders placed in last 30 days
    totalPaid30d: number;          // Payments in last 30 days
    totalOutstanding: number;      // Sum of balanceDue across all active orders
    totalMetalHeld: number;        // Fine grams with suppliers (metal ledger balance)
  };
  recentActivity: Array<{
    orderId: number;
    orderNo: string;
    supplierName: string;
    status: string;
    lastAction: string;
    lastActionAt: Date;
  }>;
  topSuppliers: Array<{
    supplierId: number;
    supplierName: string;
    activeOrders: number;
    metalBalance: number;          // Fine grams held
    moneyBalance: number;          // Amount owed
  }>;
}
```

---

## 9. Frontend Screens

### 9.1 SupplierOrderDashboard

**Route**: `/supplier-orders`

**Sections**:
1. **Counter cards**: Active, Pending Delivery, Overdue, Pending QC, Pending Payment, Pending Approvals
2. **Financials row**: Order value (30d), Paid (30d), Outstanding, Metal with suppliers
3. **Overdue alerts** (red): Orders past expected delivery
4. **Approval queue**: Pending approvals needing action
5. **Recent activity**: Last 10 status changes
6. **Top suppliers**: Metal + money balances

### 9.2 SupplierOrderList

**Route**: `/supplier-orders/list`

**Features**:
- Filters: status (multi-select), supplier, date range, search (orderNo/supplierName)
- Columns: Order No, Date, Supplier, Items (count), Est. Total, Status, Expected Delivery, Balance Due
- Sort: Date (desc default), Amount, Supplier
- Pagination: 50 per page, max 200
- Quick actions: View, Clone (for repeat orders)

### 9.3 SupplierOrderCreate

**Route**: `/supplier-orders/new`

**Sections**:
1. **Supplier selection** (searchable dropdown, only SUPPLIER accounts)
2. **Order details**: Date, reference, expected delivery, priority, terms, narration
3. **Items table** (dynamic rows):
   - Item type, description, metal type, purity, quantity, weight
   - Rate per gram, making charge (type + rate), stone charge, other charges
   - Auto-calculated line total
4. **Summary**: Total items, total weight, estimated total
5. **Attachments**: Upload design images, quotes
6. **Actions**: Save as Draft, Send to Supplier

### 9.4 SupplierOrderDetail

**Route**: `/supplier-orders/:id`

**Single-page console** (similar pattern to RepairDetail):

| Tab/Section | Content |
|---|---|
| **Header** | Order No, Status badge, Supplier, Priority, Approval alert |
| **Items** | Table: description, metal, purity, qty, ordered wt, received wt, accepted wt, status |
| **Receipts** | List of deliveries with date, challan, weights, QC status. Button: "Record Receipt" |
| **QC / Verification** | Per-receipt-item: gross, net, purity test, accept/reject. Weight discrepancy classification |
| **Payments** | Payment history table. Button: "Record Payment" |
| **Invoice** | Supplier invoice capture form (number, date, amount, attachment) |
| **Purchase Posting** | Button: "Post to Inventory" (enabled only after QC). Shows created labels |
| **Timeline** | State history (immutable log) |
| **Approvals** | Pending approvals with approve/reject buttons (for manager/admin) |
| **Ledger** | Metal ledger + Money ledger for this order (expandable) |
| **Attachments** | All uploaded files (order, invoice, challan, QC photos) |
| **Notes** | Internal notes (editable even after close) |

**Action Bar** (context-sensitive):
- Shows only valid next-state transitions
- Sensitive actions (cancel, return, short-close) require confirmation dialog + remarks

---

## 10. API Endpoints

### 10.1 Core CRUD

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/supplier-orders` | Create order (DRAFT) |
| GET | `/api/supplier-orders` | List with filters + pagination |
| GET | `/api/supplier-orders/:id` | Full detail with all relations |
| PUT | `/api/supplier-orders/:id` | Update order (DRAFT only: items, amounts, dates) |
| PATCH | `/api/supplier-orders/:id` | Partial update (notes, priority, expected date — always allowed pre-close) |

### 10.2 Lifecycle

| Method | Path | Purpose |
|---|---|---|
| PATCH | `/api/supplier-orders/:id/status` | State machine transition |
| POST | `/api/supplier-orders/:id/send` | Mark as sent (DRAFT → SENT_TO_SUPPLIER) |
| POST | `/api/supplier-orders/:id/acknowledge` | Record supplier acknowledgement + expected date |
| POST | `/api/supplier-orders/:id/cancel` | Cancel order (with approval check) |
| POST | `/api/supplier-orders/:id/short-close` | Accept partial delivery as final |
| POST | `/api/supplier-orders/:id/close` | Force-close (admin only) |

### 10.3 Receipts

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/supplier-orders/:id/receipts` | Create receipt (goods received) |
| GET | `/api/supplier-orders/:id/receipts` | List receipts for order |
| GET | `/api/supplier-orders/:id/receipts/:rid` | Receipt detail |
| POST | `/api/supplier-orders/:id/receipts/:rid/qc` | Submit QC results for receipt items |
| POST | `/api/supplier-orders/:id/receipts/:rid/discrepancy` | Classify weight discrepancy |

### 10.4 Payments

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/supplier-orders/:id/payments` | Record payment (advance, delivery, settlement) |
| GET | `/api/supplier-orders/:id/payments` | List payments for order |

### 10.5 Invoice & Purchase

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/supplier-orders/:id/invoice` | Record supplier invoice (number, amount, date, attachment) |
| POST | `/api/supplier-orders/:id/post-purchase` | Post to inventory (create PurchaseVoucher + Labels) |

### 10.6 Approvals

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/supplier-orders/approvals/pending` | List all pending approvals (cross-order) |
| POST | `/api/supplier-orders/:id/approvals/:aid/resolve` | Approve or reject |

### 10.7 Metal Issuance

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/supplier-orders/:id/issue-metal` | Record gold/material sent to supplier for making |

### 10.8 Returns

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/supplier-orders/:id/return` | Record items returned to supplier |

### 10.9 Dashboard & Reports

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/supplier-orders/dashboard` | Dashboard counters + financials |
| GET | `/api/supplier-orders/reports/:type` | Reports (pending, overdue, unpaid, metal-balance, money-balance, wastage, summary, supplier-performance) |

### 10.10 Attachments

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/supplier-orders/:id/attachments` | Register uploaded file |
| GET | `/api/supplier-orders/:id/attachments` | List attachments |

---

## 11. Voucher Numbering

| Entity | Prefix | Entity Type (VoucherSequence) | Format | Example |
|---|---|---|---|---|
| Supplier Order | `SO` | `SUPPLIER_ORDER` | `SO/{N}` | SO/1, SO/2, SO/45 |
| Supplier Receipt | `SR` | `SUPPLIER_RECEIPT` | `SR/{N}` | SR/1, SR/2 |
| Supplier Invoice (recorded) | `SPI` | `SUPPLIER_INVOICE` | `SPI/{N}` | SPI/1, SPI/2 |
| Supplier Payment | `SPP` | `SUPPLIER_PAYMENT` | `SPP/{N}` | SPP/1, SPP/2 |

All use the same `allocateVoucherNumber(tx, companyId, prefix, entityType, financialYear)` pattern as Repair module. FY scoped (Apr–Mar).

---

## 12. Test Cases

### 12.1 Unit Tests (`tests/unit/supplierOrderWorkflow.test.ts`)

```
describe('supplierOrderWorkflow')
  ✓ canTransition returns true for valid transitions
  ✓ canTransition returns false for invalid transitions
  ✓ DRAFT can go to SENT_TO_SUPPLIER and CANCELLED only
  ✓ CLOSED is terminal (no outgoing transitions)
  ✓ CANCELLED is terminal
  ✓ REJECTED can go back to DRAFT only
  ✓ transition() throws InvalidSupplierOrderTransitionError for invalid
  ✓ transition() creates state history row
  ✓ transition() updates order status
  ✓ nextStates() returns correct options per state
```

### 12.2 Unit Tests (`tests/unit/supplierLedger.test.ts`)

```
describe('supplierLedger')
  describe('postSupplierMetal')
    ✓ METAL_ISSUED increases supplier balance (positive weight)
    ✓ METAL_RECEIVED decreases supplier balance (negative weight)
    ✓ calculates fineWeight from weight × purity
    ✓ stores ratePerGram and amount correctly
    ✓ updates Account.closingBalance atomically (not directly — metal balance tracked separately)
    ✓ throws if supplier account not found
    
  describe('postSupplierMoney')
    ✓ ORDER_PAYABLE increases balance (debit)
    ✓ ADVANCE_PAID decreases balance (credit)
    ✓ SETTLEMENT decreases balance (credit)
    ✓ updates Account.closingBalance atomically
    ✓ sets balanceType correctly (CR when shop owes)
    ✓ throws if supplier account not found
```

### 12.3 Integration Tests (`tests/integration/supplierOrders.test.ts`)

```
describe('POST /api/supplier-orders')
  ✓ 201: creates order with items in DRAFT status
  ✓ 400: rejects empty items array
  ✓ 400: rejects zero orderedWeight
  ✓ 400: rejects invalid supplierId
  ✓ 400: rejects supplierId that is not type SUPPLIER
  ✓ 403: rejects if branchId not in user's branchScope
  ✓ allocates SO/N voucher number correctly

describe('GET /api/supplier-orders')
  ✓ returns paginated list
  ✓ filters by status
  ✓ filters by supplierId
  ✓ branch scoping: branch user sees only their branch
  ✓ master user sees all branches

describe('GET /api/supplier-orders/:id')
  ✓ returns full detail with items, receipts, payments, history
  ✓ 404: scoped user cannot access other branch's order

describe('PATCH /api/supplier-orders/:id/status')
  ✓ valid transition updates status and creates history
  ✓ 400: invalid transition rejected
  ✓ 400: cannot transition CLOSED order

describe('POST /api/supplier-orders/:id/send')
  ✓ transitions DRAFT → SENT_TO_SUPPLIER
  ✓ 400: rejects if not in DRAFT

describe('POST /api/supplier-orders/:id/acknowledge')
  ✓ transitions to SUPPLIER_ACKNOWLEDGED
  ✓ records acknowledgementDate and expectedDeliveryDate

describe('POST /api/supplier-orders/:id/receipts')
  ✓ creates receipt with items
  ✓ updates order totalReceivedWeight
  ✓ auto-transitions to PARTIALLY_RECEIVED if partial
  ✓ auto-transitions to RECEIVED_PENDING_QC if all received
  ✓ triggers EXCESS_DELIVERED + approval if over tolerance
  ✓ 400: cannot create receipt for CLOSED order
  ✓ 400: rejects receipt item not in order

describe('POST /api/supplier-orders/:id/receipts/:rid/qc')
  ✓ updates receipt items with QC status
  ✓ auto-transitions to QC_COMPLETED when all items QC'd
  ✓ creates weight discrepancy records for differences

describe('POST /api/supplier-orders/:id/receipts/:rid/discrepancy')
  ✓ classifies weight discrepancy
  ✓ auto-approves if within tolerance
  ✓ creates approval request if outside tolerance
  ✓ posts metal ledger for wastage

describe('POST /api/supplier-orders/:id/payments')
  ✓ records payment, updates totalPaid and balanceDue
  ✓ posts supplier money ledger
  ✓ updates Account.closingBalance
  ✓ ADVANCE type works before invoice
  ✓ auto-closes order if balanceDue ≤ 0 after payment
  ✓ 400: payment exceeds invoice + tolerance without approval

describe('POST /api/supplier-orders/:id/invoice')
  ✓ records invoice details
  ✓ transitions to INVOICE_RECEIVED
  ✓ posts ORDER_PAYABLE to money ledger
  ✓ adjusts balanceDue correctly (accounting for advance)

describe('POST /api/supplier-orders/:id/post-purchase')
  ✓ creates PurchaseVoucher linked to order
  ✓ creates Labels for accepted items
  ✓ posts metal ledger (METAL_RECEIVED)
  ✓ transitions to PURCHASE_POSTED
  ✓ IDEMPOTENT: second call returns same voucher without duplicating
  ✓ 400: rejects if pending approvals exist
  ✓ 400: rejects if QC not completed

describe('POST /api/supplier-orders/:id/approvals/:aid/resolve')
  ✓ APPROVED: clears approval, unblocks operation
  ✓ REJECTED: clears approval, operation not performed
  ✓ 403: STAFF cannot approve
  ✓ 403: ACCOUNTANT cannot approve

describe('POST /api/supplier-orders/:id/issue-metal')
  ✓ posts METAL_ISSUED to supplier metal ledger
  ✓ updates totalIssuedWeight on order
  ✓ 400: weight must be > 0

describe('POST /api/supplier-orders/:id/cancel')
  ✓ DRAFT: cancels immediately
  ✓ After ADVANCE_PAID: requires ADMIN approval
  ✓ creates CANCELLATION approval if advance exists
  ✓ 403: STAFF cannot cancel

describe('POST /api/supplier-orders/:id/return')
  ✓ posts RETURN to metal ledger
  ✓ posts DEBIT_NOTE to money ledger
  ✓ transitions to RETURNED_TO_SUPPLIER

describe('Voucher allocation')
  ✓ SO/1, SO/2, SO/3 sequential within FY
  ✓ SR/1, SR/2 for receipts
  ✓ SPP/1, SPP/2 for payments
  ✓ survives legacy gaps (max from table wins)

describe('Branch scoping')
  ✓ all queries include companyId
  ✓ branch user restricted to own branch
  ✓ master user sees all branches in company
  ✓ cannot write to other branch's order
```

---

## 13. User Journeys (Step-by-Step)

### Journey 1: Create & Place Order

```
1. Manager navigates to /supplier-orders/new
2. Selects supplier from dropdown (type=SUPPLIER accounts)
3. Fills order date, expected delivery, reference
4. Adds items:
   - Row 1: "22KT Gold Chain 20inch", Metal=GOLD, Purity=22KT, Qty=5, Weight=50g
     Rate=₹6,500/g, Making=₹800/pc, Est=₹3,29,000
   - Row 2: "18KT Diamond Ring", Metal=GOLD, Purity=18KT, Qty=2, Weight=12g
     Rate=₹6,500/g, Making=₹3,000/pc, Stone=₹15,000/pc, Est=₹1,14,000
5. Saves as DRAFT (SO/1 allocated)
6. Reviews → clicks "Send to Supplier"
7. Status → SENT_TO_SUPPLIER
8. State history: DRAFT → SENT_TO_SUPPLIER (by Manager at timestamp)
```

### Journey 2: Supplier Acknowledgement + Advance

```
1. Supplier confirms via phone/WhatsApp
2. Manager opens SO/1 → clicks "Record Acknowledgement"
3. Enters acknowledgement date + revised expected delivery (if any)
4. Status → SUPPLIER_ACKNOWLEDGED
5. Manager clicks "Record Payment" → selects ADVANCE, ₹1,00,000, mode=BANK_TRANSFER
6. Payment SPP/1 created
7. Money ledger: ADVANCE_PAID, credit=₹1,00,000
8. Account.closingBalance updated (reduced payable)
9. Status → ADVANCE_PAID
10. advancePaid = ₹1,00,000 on order
```

### Journey 3: Partial Delivery + QC

```
1. Supplier delivers 3 of 5 chains (30g out of 50g ordered)
2. Inventory staff opens SO/1 → "Record Receipt"
3. Creates receipt SR/1:
   - Item 1 (Chains): receivedQty=3, grossWeight=30.2g, netWeight=29.8g
4. System calculates: 30g received vs 50g ordered → PARTIALLY_RECEIVED
5. Status → PARTIALLY_RECEIVED
6. Staff performs QC on SR/1:
   - Chain 1: 10.1g gross, 9.95g net, purity tested=91.5% → PASSED
   - Chain 2: 10.0g gross, 9.9g net, purity=91.6% → PASSED
   - Chain 3: 10.1g gross, 9.95g net, purity=89.2% → FAILED (below spec)
7. Weight discrepancy on Chain 3: expected 22KT (91.67%), got 89.2% → PURITY_DIFFERENCE
8. Within 3% tolerance? 91.67-89.2=2.47% → YES → auto-approved
   (If NO: approval request created, blocks until resolved)
9. Receipt status → PARTIAL_PASS (2 passed, 1 failed)
```

### Journey 4: Final Delivery + Full QC

```
1. Supplier delivers remaining 2 chains + 2 rings (20g chains + 12g rings)
2. Receipt SR/2 created
3. sum(receivedWeight) for all items = 30 + 20 + 12 = 62g vs ordered 62g → RECEIVED_PENDING_QC
4. All items QC'd → QC_COMPLETED
5. Rejected Chain 3 from SR/1 noted: rejectedQty=1, rejectedWeight=10.1g
6. Final accepted: 4 chains (40g) + 2 rings (12g) = 52g
```

### Journey 5: Invoice + Purchase Posting

```
1. Supplier sends invoice (via email/physical)
2. Accountant records: invoice#=SUP-2026-445, amount=₹4,28,000, date=2026-05-25
3. Uploads invoice PDF as attachment
4. Status → INVOICE_RECEIVED
5. Money ledger: ORDER_PAYABLE, debit=₹4,28,000
6. balanceDue = ₹4,28,000 - ₹1,00,000 (advance) = ₹3,28,000

7. Manager clicks "Post to Inventory"
8. System creates:
   - PurchaseVoucher PUR/45 (type=REGULAR, supplierOrderId=SO/1)
   - PurchaseItems for accepted items
   - Labels: CH22/510, CH22/511, CH22/512, CH22/513 (4 chains)
   - Labels: RG18/201, RG18/202 (2 rings)
   - Metal ledger: METAL_RECEIVED, weight=-52g (supplier no longer holds)
9. Labels created with status=IN_STOCK → now saleable
10. Status → PURCHASE_POSTED
```

### Journey 6: Settlement + Close

```
1. Accountant records payment SPP/2: ₹2,00,000, BANK_TRANSFER
2. Money ledger: SETTLEMENT, credit=₹2,00,000
3. balanceDue = ₹1,28,000
4. Status → PAYMENT_PENDING

5. Later: payment SPP/3: ₹1,28,000
6. balanceDue = ₹0
7. Auto-transition → CLOSED
8. closedAt set
```

### Journey 7: Cancellation After Advance

```
1. Order SO/5 in ADVANCE_PAID, advance=₹50,000
2. Manager clicks "Cancel Order"
3. System detects advance > 0 → creates approval request (CANCELLATION)
4. Admin approves cancellation
5. Money ledger: REFUND_RECEIVED (debit=0, credit reversal or actual refund TBD)
6. Status → CANCELLED
7. Supplier refund tracked separately or as ADJUSTMENT
```

### Journey 8: Short Delivery Accepted

```
1. SO/8: ordered 100g gold bar
2. Receipt: received 98g (2g short)
3. Discrepancy: SHORT_RECEIVED, diff=-2g, amount=₹13,000
4. ₹13,000 > ₹5,000 → SHORTAGE_WRITEOFF approval required
5. Manager approves
6. Metal ledger: SHORTAGE, weight=-2g (supplier no longer owes this)
7. Money ledger: DEBIT_NOTE, credit=₹13,000 (reduce payable)
8. Manager clicks "Short Close" → status = SHORT_DELIVERED
9. Then proceeds to QC → purchase posting with 98g
```

---

## 14. Configuration Constants

```typescript
// server/config/supplierOrderConfig.ts

export const SUPPLIER_ORDER_CONFIG = {
  // Voucher prefixes
  ORDER_PREFIX: 'SO',
  RECEIPT_PREFIX: 'SR',
  INVOICE_PREFIX: 'SPI',
  PAYMENT_PREFIX: 'SPP',

  // Entity types for VoucherSequence
  ORDER_ENTITY: 'SUPPLIER_ORDER',
  RECEIPT_ENTITY: 'SUPPLIER_RECEIPT',
  INVOICE_ENTITY: 'SUPPLIER_INVOICE',
  PAYMENT_ENTITY: 'SUPPLIER_PAYMENT',

  // Tolerances
  EXCESS_WEIGHT_TOLERANCE_PERCENT: 3,     // > 3% excess → approval
  SHORTAGE_WRITEOFF_THRESHOLD: 5000,      // ₹5,000+ shortage → approval
  RATE_CHANGE_TOLERANCE_PERCENT: 2,       // > 2% rate change → approval
  WASTAGE_TOLERANCE_PERCENT: 2,           // ≤ 2% wastage auto-approved
  PAYMENT_OVER_INVOICE_TOLERANCE: 10,     // Cannot pay > 110% of invoice

  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,

  // GST (default for gold jewelry)
  DEFAULT_CGST_RATE: 1.5,
  DEFAULT_SGST_RATE: 1.5,
  DEFAULT_IGST_RATE: 3.0,
};
```

---

## 15. Error Codes

| Code | HTTP | Message |
|---|---|---|
| `SO_NOT_FOUND` | 404 | Supplier order not found |
| `SO_INVALID_TRANSITION` | 400 | Cannot transition from {from} to {to} |
| `SO_IMMUTABLE` | 400 | Cannot modify order in {status} status |
| `SO_INVALID_SUPPLIER` | 400 | Account is not an active supplier |
| `SO_EMPTY_ITEMS` | 400 | At least one item required |
| `SO_INVALID_WEIGHT` | 400 | Ordered weight must be greater than zero |
| `SO_BRANCH_DENIED` | 403 | Branch access denied |
| `SO_APPROVAL_PENDING` | 400 | Cannot proceed — pending approval exists |
| `SO_APPROVAL_DENIED` | 403 | Insufficient role to approve |
| `SO_RECEIPT_INVALID` | 400 | Receipt item does not belong to this order |
| `SO_EXCESS_NO_APPROVAL` | 400 | Excess delivery requires approval |
| `SO_QC_INCOMPLETE` | 400 | Cannot post purchase — QC not completed for all items |
| `SO_ALREADY_POSTED` | 200 | Purchase already posted (idempotent — returns existing) |
| `SO_PAYMENT_EXCEEDS` | 400 | Payment exceeds invoice total + tolerance |
| `SO_CANCEL_NEEDS_APPROVAL` | 400 | Cancellation requires admin approval (advance paid) |

---

## 16. Migration File Structure

```
prisma/migrations/20260519000000_supplier_orders/migration.sql
```

Must follow the project's idempotent migration discipline:
- All `CREATE TYPE` wrapped in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
- All `CREATE TABLE IF NOT EXISTS`
- All `CREATE INDEX IF NOT EXISTS`
- All constraints wrapped in exception handlers

---

## 17. File Manifest

### New Files to Create

| # | File | Purpose |
|---|---|---|
| 1 | `prisma/migrations/20260519000000_supplier_orders/migration.sql` | DDL |
| 2 | `server/services/supplierOrderWorkflow.ts` | State machine |
| 3 | `server/services/supplierLedger.ts` | Metal + money ledger |
| 4 | `server/routes/supplierOrders.ts` | All API endpoints |
| 5 | `src/pages/SupplierOrders/SupplierOrderDashboard.tsx` | Dashboard |
| 6 | `src/pages/SupplierOrders/SupplierOrderList.tsx` | List |
| 7 | `src/pages/SupplierOrders/SupplierOrderCreate.tsx` | Create form |
| 8 | `src/pages/SupplierOrders/SupplierOrderDetail.tsx` | Detail console |
| 9 | `tests/unit/supplierOrderWorkflow.test.ts` | Workflow unit tests |
| 10 | `tests/unit/supplierLedger.test.ts` | Ledger unit tests |
| 11 | `tests/integration/supplierOrders.test.ts` | Full integration tests |

### Existing Files to Modify

| # | File | Change |
|---|---|---|
| 1 | `prisma/schema.prisma` | Add 10 models + 8 enums + relations on existing models |
| 2 | `server/app.ts` | Register `/api/supplier-orders` route |
| 3 | `src/App.tsx` | Add frontend routes |
| 4 | `server/services/notification.ts` | Extend events (optional, Phase 2) |

---

## 18. Implementation Order

```
Phase 1: Schema + Migration
  1. Add models/enums to schema.prisma
  2. Write idempotent migration SQL
  3. Verify: prisma migrate diff --exit-code

Phase 2: Backend Services
  4. supplierOrderWorkflow.ts (state machine)
  5. supplierLedger.ts (metal + money)
  6. Unit tests for both

Phase 3: Backend Routes
  7. supplierOrders.ts (all endpoints)
  8. Register in app.ts
  9. Integration tests

Phase 4: Frontend
  10. SupplierOrderList.tsx
  11. SupplierOrderCreate.tsx
  12. SupplierOrderDetail.tsx
  13. SupplierOrderDashboard.tsx
  14. Route registration in App.tsx

Phase 5: Reports + Polish
  15. Report endpoints
  16. Dashboard data
  17. Notification events
```

---

*End of specification.*
