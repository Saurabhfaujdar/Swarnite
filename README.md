# JewelERP — ORNATE NX-style Jewelry Retail Management System

A comprehensive jewelry retail ERP built with **Electron + React + Node.js + PostgreSQL**.  
Designed for Indian jewelry retailers with full GST compliance, label/barcode-based sales, multi-branch support, and HUID tracking.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Default Login](#default-login)
- [Workflow 1 — Making a Retail Sale](#workflow-1--making-a-retail-sale)
- [Workflow 2 — Creating Labels (Barcode / Tag Preparation)](#workflow-2--creating-labels-barcode--tag-preparation)
- [Workflow 3 — Adding a Completely New Item Type](#workflow-3--adding-a-completely-new-item-type)
- [Workflow 4 — Recording a Purchase (URD / Old Gold)](#workflow-4--recording-a-purchase-urd--old-gold)
- [Workflow 5 — Cash Receipt / Payment Entry](#workflow-5--cash-receipt--payment-entry)
- [Workflow 6 — LayAway Entry (Label-Based Item Reservation)](#workflow-6--layaway-entry-label-based-item-reservation)
- [Workflow 7 — Transferring Stock Between Branches](#workflow-7--transferring-stock-between-branches)
- [Workflow 8 — Managing Customers](#workflow-8--managing-customers)
- [Workflow 9 — Updating Today's Metal Rates](#workflow-9--updating-todays-metal-rates)
- [Workflow 10 — Account Master & GST Verification](#workflow-10--account-master--gst-verification)
- [Workflow 11 — Voucher Print & Bill Generation](#workflow-11--voucher-print--bill-generation)
- [Workflow 12 — Customer Advance & Due Payments](#workflow-12--customer-advance--due-payments)
- [Reports](#reports)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Seeded Demo Data](#seeded-demo-data)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up PostgreSQL (ensure PostgreSQL 16 is running on localhost:5432)
#    Create a database named "jewelerp" with user "postgres", password "postgres"

# 3. Push schema to database
npm run db:push

# 4. Seed master data + sample data
npm run db:seed

# 5. Start development (frontend on :5173, backend on :3001)
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Default Login

| Username | Password | Role  |
|----------|----------|-------|
| `admin`  | `admin123` | Admin |
| `sales1` | `sales123` | Sales Counter |

The login page shows a hint with the default credentials.

---

## Workflow 1 — Making a Retail Sale

Navigate to **Sales Entry** from the sidebar (or press **F1** on Dashboard).

### Step 1: Select a Customer

Press **F2** (or click the "Customer" button in the function key bar).  
A customer search modal opens. Type at least 2 characters to search by name, phone, or GSTIN.

**Example**: Type `Kamala` → click on "Smt. Kamala Devi" → modal closes, customer info strip appears below the header showing name, phone, city, state, GSTIN, and closing balance.

To create a new customer on the fly, click **"+ New A/c"** inside the modal. Fill in the form:

| Field | Constraint |
|-------|-----------|
| Customer Name | Required |
| Mobile | Digits only, 10 characters max |
| Email | Valid email format |
| Address | Free text |
| City, State, Pincode | Pincode: digits only, 6 chars max |
| GSTIN | Uppercase, 15 characters max |
| PAN | Uppercase alphanumeric, 10 chars max |
| Aadhar No. | Digits only, 12 chars max |
| ID Proof | Free text (e.g. Passport, Driving Licence) |

Click **"Save & Select"** — the customer is created and auto-selected.

### Step 2: Scan / Add Items

Click the **"Item Name / Bar Code"** field (it auto-focuses on page load). Type a label number and press **Enter**.

**Example**: Type `GN/51` → press Enter → the system looks up the label, verifies it is `IN_STOCK`, fetches the latest metal rate for its purity, and adds it to the items table.

Each scanned item auto-calculates:
- **Fine Weight** = Net Wt × (Purity% ÷ 100)  
- **Metal Amount** = Fine Wt × Metal Rate  
- **Labour Amount** = Net Wt × Labour Rate (default ₹2,014/gm)  

You can scan multiple labels one after another. Duplicate labels are rejected with a toast message.

### Step 3: Edit Item Details (Optional)

**Double-click** any item row to open the Item Detail Modal.

Editable fields in the modal:
| Field | Notes |
|-------|-------|
| Pcs | Minimum 1 |
| Gross Wt, Net Wt | Step 0.001 grams |
| Metal Rate | Rate per gram (highlighted in yellow) |
| Lab Rate | Labour rate per gram |
| Other Charges | Any additional charges |
| Disc. Amt (Di/St) | Discount amount for this item |
| Remarks | Free text notes |

The right panel shows a **live summary** that recalculates in real-time — Metal Amt, Labour Amt, GST (CGST 1.5% + SGST 1.5%), and Final Amount.

Click **"OK - Apply Changes"** to update the item, or press **Escape** to cancel.

### Step 4: Apply Discount (Optional)

Below the items table, use the discount section:
- Choose a **Discount Scheme** (DISCOUNT or NONE)
- Enter a **Discount %** — the discount amount auto-calculates
- Or enter a **Discount Amount** directly
- Adjust **Rounding** if needed

### Step 5: Enter Payment

In the **"Credit Details"** sidebar on the right:

| Field | Purpose |
|-------|---------|
| Cash Amt | Cash received |
| Bank Amt | Bank transfer / UPI |
| Card Amt | Card payment |
| OG Purchase | Old gold adjustment |

The system calculates:
- **Due Amount** = Voucher Amount − (Cash + Bank + Card + Old Gold)
- **Previous O/S** = Customer's existing closing balance
- **Final Due** = Due + Previous O/S

### Step 6: Save

Press **F12** or click the **💾 Save** button.

Validations before save:
- A customer must be selected
- At least one item must be added

On success, a toast shows the generated voucher number (e.g. `RS/2025/001`) and the form resets for the next sale.

### Step 7: Cancel / Void a Sale (if needed)

If a sale was entered by mistake or needs to be reversed, you can cancel it from the **Sales Voucher List**.

1. Navigate to **Sales Voucher List** from the sidebar
2. Locate the voucher you want to cancel — use the search, date, or status filters to find it
3. Click the **✕** (cancel) button in the **Actions** column of the voucher row
   - The cancel button only appears for vouchers with **ACTIVE** status
   - Already cancelled or voided vouchers cannot be cancelled again
4. A **confirmation dialog** appears:
   > *"Are you sure you want to cancel voucher JGI/1? This will restore all labels to stock and reverse the customer balance."*
5. Click **"Yes, Cancel"** to proceed, or **"No, Keep It"** to abort

**What happens on cancellation:**

| Action | Detail |
|--------|--------|
| Voucher status | Changed from `ACTIVE` → `CANCELLED` (shown as a red badge) |
| Labels | All labels in the voucher are restored to `IN_STOCK` (available for future sales) |
| Customer balance | The due amount is reversed — customer's closing balance is decremented by the voucher's due amount |

**Voucher Status Reference:**

| Status | Badge Color | Meaning |
|--------|-------------|--------|
| ACTIVE | 🟢 Green | Live sale, labels are sold, customer balance updated |
| CANCELLED | 🔴 Red | Sale reversed — labels restored to stock, customer balance corrected |
| VOID | 🟡 Yellow | Accounting void — used for adjustments without restoring stock |

> **Note:** Cancellation cannot be undone. If you need to re-sell the same items, create a new sale and scan the labels again (they will be back `IN_STOCK`).

**Complete example**:
1. Press F2 → search "Kamala" → select "Smt. Kamala Devi"
2. Type `GB/21` → Enter (Gold Bangle added, 12.5gm, ₹67,300/gm rate)
3. Type `GR/10` → Enter (Gold Ring added, 5.2gm)
4. Double-click Bangle row → change Lab Rate to 1800 → OK
5. Set Discount %: 2
6. Enter Cash: 300000, Bank: 200000
7. Press F12 → Voucher `RS/2025/001` saved ✓
8. To cancel: Go to Sales Voucher List → click ✕ on `RS/2025/001` → confirm → labels `GB/21` and `GR/10` are back IN_STOCK

---

## Workflow 2 — Creating Labels (Barcode / Tag Preparation)

Navigate to **Labels** in the sidebar → click **"+ New Label"** (or go directly to Label Preparation).

### Step 1: Set Header Options

| Field | Notes |
|-------|-------|
| Date | Defaults to today |
| Label Prefix | Select "Auto" (system picks based on item group) or choose a specific prefix |
| Counter | Optional — assign labels to a counter |

### Step 2: Add Items to the Batch

Fill in the item entry row:

| Field | Constraint |
|-------|-----------|
| Item | Required — select from dropdown (e.g. "Gold Necklace 22KT") |
| Gross Wt (gm) | Required — enter the total weight including stones |
| Diamond Wt | Optional — deducted from gross to calculate net weight |
| Stone Wt | Optional — deducted from gross to calculate net weight |
| Net Wt (gm) | Auto-calculated: Gross − Diamond − Stone (can be manually overridden) |
| Pcs | Default: 1 |
| HUID | Optional — exactly 6 alphanumeric characters, auto-uppercased, only A-Z and 0-9 allowed |
| Size | Optional — free text (e.g. ring size "16") |
| MRP | Optional — fixed maximum retail price |

Click **"+ Add"** to add the item to the batch list. The prefix and counter fields stay selected for the next item; other fields reset.

**Example — Adding 3 gold bangles**:
1. Select "Gold Bangle 22KT", Gross: `12.500`, HUID: `AB12CD` → click Add → label #1 queued
2. Change Gross to `11.200`, HUID: `EF34GH` → click Add → label #2 queued
3. Change Gross to `13.100`, HUID: `KL56MN` → click Add → label #3 queued

### Step 3: Save & Generate

Click **"Save & Generate Labels"**. The system:
1. Looks up (or auto-detects) the label prefix for each item's group
2. Increments the prefix's last number for each label
3. Creates labels with sequential numbers like `GB/21`, `GB/22`, `GB/23`

All labels are now `IN_STOCK` and ready to be scanned during Sales Entry.

---

## Workflow 3 — Adding a Completely New Item Type

Navigate to **Masters** from the sidebar.

**Example scenario**: You want to sell **Platinum Rings** — a completely new metal type and item that doesn't exist yet.

### Step 1: Create the Metal Type (if new)

Go to the **Metal Types** tab → click **"+ New Metal Type"**.

| Field | Example |
|-------|---------|
| Name | `Platinum` |
| Code | `PT` (uppercase, max 5 chars, must be unique) |

Click 💾 Save.

### Step 2: Create the Purity (if new)

Go to the **Purities** tab → click **"+ New Purity"**.

| Field | Example |
|-------|---------|
| Name | `PT 950` |
| Code | `PT950` (uppercase, max 6 chars, must be unique) |
| Percentage | `95.00` |

Click 💾 Save.

### Step 3: Create the Item Group

Go to the **Item Groups** tab → click **"+ New Group"**.

| Field | Example |
|-------|---------|
| Group Name | `Platinum Ring` |
| Code | `PTR` (uppercase, max 5 chars, must be unique) |
| Metal Type | Select `Platinum` from dropdown |
| HSN Code | `711319` (pre-filled default for jewelry) |

Click 💾 Save.

### Step 4: Create the Label Prefix

Go to the **Label Prefixes** tab → click **"+ New Prefix"**.

| Field | Example |
|-------|---------|
| Prefix Code | `PR` (uppercase, max 5 chars, must be unique) |
| Item Group | Select `Platinum Ring (PTR)` from dropdown |

Click 💾 Save. This determines the label number format: `PR/1`, `PR/2`, `PR/3`...

> **Important**: Every item group MUST have a label prefix mapped to it. If a prefix is missing, label creation will fail with "Could not resolve label prefix." This was the root cause of the Gold Pendant bug — 6 item groups (Pendant, Mangalsutra, Coin, Bracelet, Nose Pin, Silver Coin) had no prefix mapping.

### Step 5: Create the Item

Go to the **Items** tab → click **"+ New Item"**.

| Field | Example |
|-------|---------|
| Item Name | `Platinum Ring 950` |
| Item Code | `PRNG950` (uppercase, no spaces, must be unique) |
| Item Group | Select `Platinum Ring` |
| Metal Type | Select `Platinum` |
| Purity | Select `PT 950 (PT950)` |
| MRP | Leave empty for weight-based pricing, or enter a fixed price |
| Description | Optional notes |

Click 💾 Save.

### Step 6: Set the Metal Rate

Go to the **Metal Rates** tab → click **"+ Set Rate"**.

| Field | Example |
|-------|---------|
| Metal Type | Select `Platinum` |
| Purity Code | Select `PT950` |
| Rate (₹/gm) | `3200` |
| Date | Today (pre-filled) |

Click 💾 Save.

### Step 7: Create Labels & Sell

Now go to **Label Preparation**:
- Select Item: "Platinum Ring 950"
- Enter Gross Weight: `8.500`
- Click Add → Save & Generate → label `PR/1` is created (`IN_STOCK`)

Go to **Sales Entry**:
- Select a customer (F2)
- Type `PR/1` → press Enter → the platinum ring is added at ₹3,200/gm rate
- Enter payment → Press F12 to save

---

## Workflow 4 — Recording a Purchase (URD / Old Gold)

Navigate to **Purchase (URD)** from the sidebar.

### Step 1: Choose Purchase Type

Toggle between **URD Purchase** (unregistered dealer) and **Old Gold Purchase** at the top.

### Step 2: Select Supplier

Type at least 2 characters in the Supplier field to search. Select a supplier account from the results.

**Example**: Type `Gold Sup` → select "Gold Supplier Trading Co."

### Step 3: Add Items

| Field | Example |
|-------|---------|
| Item Name | `22KT Gold Bar` (free text) |
| Gross Wt | `100.000` |
| Less Wt | `0.500` (deduction for impurities) |
| Net Wt | Auto-calculated: `99.500` |
| Purity | Select `916` (91.6%) — options: 999, 916, 875, 750, and all from database |
| Fine Wt | Auto-calculated: `91.142` (Net Wt × Purity% ÷ 100) |
| Metal Rate | `67300` (₹/gm) |
| Pcs | `1` |

Click Add. The system calculates Metal Amount = Fine Wt × Rate, plus GST.

### Step 4: Enter Payment

| Field | Amount |
|-------|--------|
| Cash Paid | `30,00,000` |
| Bank Paid | `31,13,853` |
| Due Amt | Auto-calculated (shown in red if positive) |

### Step 5: Save

Validations: Supplier must be selected, at least one item required. On save, generates a voucher number (e.g. `PU/2025/001`).

---

## Workflow 5 — Cash Receipt / Payment Entry

Navigate to **Cash Entry** from the sidebar.

### Step 1: Select Voucher Type

Toggle **Receipt 💰** (money coming in) or **Payment 💸** (money going out).

### Step 2: Add Entry Lines

| Field | Constraint |
|-------|-----------|
| Account | Required — search by name (type 2+ chars) and select |
| Amount | Required — positive number |
| Narration | Optional — description of the transaction |

Click **"+ Add"** to add the line. You can add multiple lines to a single voucher.

**Example — Recording a customer payment**:
1. Toggle: Receipt
2. Account: search "Kamala Devi" → select her
3. Amount: `50000`
4. Narration: `Part payment against invoice RS/2025/001`
5. Click Add → Save

### Step 3: Save

Validation: At least one entry line is required.

---

## Workflow 6 — LayAway Entry (Label-Based Item Reservation)

Navigate to **LayAway** from the sidebar. This opens the LayAway Entry page with an ORNATE NX-style layout.

### Step 1: Select Customer (F2)

Press **F2** or click **Customer** in the function bar to open the customer selection modal.
Search by name, mobile, or GSTIN. Select an existing customer or click **"+ New Customer"** for inline creation.

### Step 2: Scan Labels

Type or scan the label barcode in the **"Item Name / Bar Code"** input and press **Enter**.

| What happens | Detail |
|---|---|
| Label found & IN_STOCK | Item is added to the items table with auto-calculated weights, rates, GST |
| Label not IN_STOCK | Error toast: *"Label XYZ is not in stock (SOLD/LAYAWAY)"* |
| Duplicate label | Error toast: *"Item already added"* |

The system fetches the latest metal rates and calculates:
- **Fine Weight** = Net Weight × Purity %
- **Metal Amount** = Fine Weight × Metal Rate
- **Labour Amount** = Net Weight × Labour Rate
- **Taxable Amount** = Metal Amount + Labour Amount
- **CGST / SGST** = 1.5% each of Taxable Amount
- **Final Amount** = Taxable Amount + CGST + SGST

### Step 3: Salesman & Narration

- Select a **Salesman** from the dropdown (or leave as "None")
- Enter **Narration** in the blue text area (e.g. "1 DAY", delivery notes)

### Step 4: Review Sidebar

The right sidebar auto-updates with:
- **Voucher Details**: Metal Amt, Labour Amt, Oth. Charge, Discount, CGST, SGST, Total, Rounding
- **Credit Details**: Enter Cash / Bank / Card / OG Purchase amounts
- **O/S Details**: Voucher Amt, Payment Amt, Due Amt, Previous O/S, Final Due

### Step 5: Save

Click **Save** or press **Ctrl+S**. The system:
1. Creates a layaway voucher with prefix **LY/** (e.g. LY/317)
2. **Removes labels from stock** → each label's status changes from `IN_STOCK` to `LAYAWAY`
3. Updates the customer's outstanding balance
4. Shows success toast with the voucher number

### Step 6: Managing LayAway List

Navigate to **LayAway → List** to see all layaway entries with filters:
- **Customer** filter (search by name)
- **Salesman** dropdown
- **Date From / To** range
- **Status** filter (All, Active, Completed, Cancelled)

### Step 7: Cancelling / Deleting a LayAway

Select an entry in the list and click **"Delete Layaway Item"**:
1. All labels in the entry are **restored to IN_STOCK** (back in stock)
2. Customer balance is reversed
3. Entry is marked as `CANCELLED`

> **Key Rule**: Creating a layaway removes items from stock; deleting/cancelling restores them.

---

## Workflow 7 — Transferring Stock Between Branches

### Issuing Stock

Navigate to **Branch** in the sidebar → click **"+ New Issue"**.

1. Select **To Branch** from the dropdown (required)
2. Type a label number in the scan field and press **Enter** to add it
3. Repeat for all labels being transferred — each shows in the table with label no, item name, gross wt, net wt, pcs
4. Add optional **Remarks**
5. Click **Save Issue**

Validation: A branch must be selected and at least 1 item is required.

**Example**: Transfer 5 gold bangles from Main Branch to a new showroom — scan `GB/21` through `GB/25`, select the destination branch, Save.

### Receiving Stock

Navigate to **Branch** → click **"+ New Receipt"**.

1. Enter the **Transfer / Issue Number** (e.g. `BR/2025/001`) and press **Enter**
2. The system loads the transfer with all items
3. All items are pre-checked as "received"
4. **Uncheck** any items that were not actually received (damaged, missing, etc.)
5. Click **Confirm Receipt**

Each item shows a status badge — green "Received" or yellow "Pending".

---

## Workflow 8 — Managing Customers

Navigate to **Customers** from the sidebar.

### Searching

Type in the search box to filter by name, mobile, or email. Use the **Type** dropdown to filter by Customer, Supplier, Employee, or Other.

### Creating a New Customer

Click **"+ New Account"** and fill in:

| Field | Constraint |
|-------|-----------|
| Name | Required |
| Mobile | Optional |
| Email | Optional |
| Type | Default: CUSTOMER (options: Customer, Supplier, Employee, Other) |
| Address, City | Optional |
| State | Default: "Maharashtra" |
| Pincode | Optional |
| GSTIN | Optional — format: `22AAAAA0000A1Z5` |
| PAN No, Aadhar No | Optional |
| Opening Balance | Optional — starting balance |

### Account Ledger

Click on any customer row to view their complete ledger — all sales, purchases, and cash entries with a running balance.

---

## Workflow 9 — Updating Today's Metal Rates

Navigate to **Masters** → **Metal Rates** tab → click **"+ Set Rate"**.

| Field | Example |
|-------|---------|
| Metal Type | Select `Gold` |
| Purity Code | Select `916` (22KT) |
| Rate (₹/gm) | `68500` |
| Date | Today (pre-filled) |

Click 💾 Save. The new rate is immediately used for all new sales entries when scanning labels.

**Daily rate-setting example** — Set all rates at start of day:

| Metal | Purity | Today's Rate |
|-------|--------|-------------|
| Gold | 999 (24KT) | ₹74,000 |
| Gold | 916 (22KT) | ₹68,500 |
| Gold | 750 (18KT) | ₹55,500 |
| Silver | S999 | ₹96 |
| Silver | S925 | ₹89 |

---

## Workflow 10 — Account Master & GST Verification

The **Account Master** modal provides an ORNATE NX-style interface for creating and editing accounts (customers, suppliers, banks, etc.) with integrated GST verification.

### Opening the Account Master

You can open the Account Master from two places:

1. **Customers page** → click **"+ New Account"** (or double-click / click Edit on an existing account)
2. **Sales Entry** → press F2 → click **"📋 Account Master"** inside the customer search modal

### Step 1: Fill Basic Details

| Field | Constraint |
|-------|------------|
| Account Name | **Required** |
| Account Category | CUSTOMER, SUPPLIER, BANK, CASH, EXPENSE, INCOME, BRANCH, SALESMAN |
| Group Head | Auto-changes based on category (e.g. Sundry Debtors for Customer, Sundry Creditors for Supplier) |
| Customer Category | Normal, Premium, VIP, Wholesale, Corporate |
| Opening Balance | Numeric + DR/CR toggle |
| Remark | Free text notes |

### Step 2: Fill Address Details (Address Detail Tab)

| Field | Constraint |
|-------|------------|
| Block No., Building, Street, Area | Free text — auto-combined into full address on save |
| City | Free text |
| Mobile | Digits only, max 10 characters |
| E-Mail | Valid email format |
| IT Pan No. | Uppercase alphanumeric, max 10 chars (e.g. `ABCDE1234F`) |
| State | Dropdown of all Indian states & UTs (36 options) |
| Reference | Free text — who referred this customer |
| Pincode | Digits only, max 6 characters |
| Aadhar No. | Digits only, max 12 characters |

### Step 3: GST Verification (Press F6)

Press **F6** (or click the "Click Here Or Press F6 To Search GSTIN No." link) to open the GST search popup.

1. Enter a **15-character GSTIN** (e.g. `09AAACH7409R1ZZ`) — input auto-uppercases and strips special characters
2. Press **Enter** or click **Search**
3. The system:
   - Validates the GSTIN format (2-digit state code + PAN + entity code + Z + checksum)
   - Extracts the PAN (characters 3–12) and state code (characters 1–2)
   - Calls external GST APIs to fetch firm details (trade name, legal name, status, address)
   - Checks the database for duplicate GSTINs
4. Results display: Legal Name, Trade Name, Status (Active/Inactive), Type (Regular/Composition), State, PAN, Address
5. If the GSTIN is already linked to another account, a **⚠️ duplicate warning** is shown
6. Click **"Apply to Form"** to auto-fill: name, PAN, block no, building, street, area, city, state, pincode

**Example — Verifying a supplier's GSTIN**:
1. Click "+ New Account" on Customers page
2. Change type to SUPPLIER
3. Press F6 → enter `27AABCG1234H1Z5` → Search
4. Result: Trade Name "GOLD WORLD PVT LTD", Status "Active", State "Maharashtra"
5. Click "Apply to Form" → name, address, PAN all filled automatically
6. Set Customer Category to "Wholesale"
7. Click Save

### Step 4: Composition Scheme

Check **"Registered Under Composition Scheme"** if the party is a composition dealer. This flag is stored for GST billing compliance.

### Step 5: Save

Click **Save** — the account is created/updated and the modal closes. A success toast confirms the action.

**GST Verified Badge**: After applying GST data, a green "GST VERIFIED" badge appears in the top-right corner of the modal showing the GSTIN, trade name, and status.

### Other Tabs (Planned)

| Tab | Status |
|-----|--------|
| Address Detail | ✅ Fully functional |
| TDS Entry | 🔜 Coming Soon |
| Metal Outstanding | 🔜 Coming Soon |
| Bill To Bill | 🔜 Coming Soon |
| Party Bank Detail | 🔜 Coming Soon |

---

## Workflow 11 — Voucher Print & Bill Generation

After saving a sales voucher, you can generate a **GST Tax Invoice** (A4 format) for the customer, matching the standard ORNATE NX bill layout. The voucher can be viewed, printed, or shared via WhatsApp.

### Opening the Voucher Print Dialog

There are **two ways** to open the Voucher Print dialog:

1. **After saving a sale** — In **Sales Entry**, after clicking 💾 Save, the Voucher Print dialog opens automatically with the newly created voucher loaded.
2. **From the Sales List** — On the **Sales Voucher List** page, each row has a 🖨️ button in the **Actions** column. Click it to open the print dialog for that voucher. The Actions column also contains a **✕** cancel button for ACTIVE vouchers (see [Workflow 1, Step 7](#step-7-cancel--void-a-sale-if-needed) for details).

The **📄 Voucher** and **🖨️ Print** buttons in the Sales Entry sidebar remain disabled (greyed out) until a voucher has been saved. Once saved, both buttons become active and open the same Voucher Print dialog.

### Voucher Print Dialog

The dialog shows the voucher summary (Voucher No, Customer, Amount) and provides the following options:

| Field | Description |
|-------|-------------|
| Voucher Format | Select bill format: "GST Sales Voucher (A4) Jai Guru NB", "Standard", "A5 Compact", or "Estimate" |
| No. Of Copies | Number of copies to print (1–5) |
| Template | Select template style: `bill_orn_5`, `bill_orn_4`, etc. |
| Whatsapp Text | Text message to send to customer via WhatsApp (default: "invoice") |

### Action Buttons

| Button | Action |
|--------|--------|
| ⚙️ Setup | Open print setup/configuration |
| 📤 Upload Doc | Upload the generated document |
| 💬 Whatsapp | Share invoice via WhatsApp — opens `wa.me` with customer's phone number and a pre-filled message containing voucher number, date, and amount |
| 👁️ View | Open an in-page preview of the Tax Invoice — displayed in a scrollable modal with a print button in the header |
| 🖨️ Print | Generate the full A4 Tax Invoice and send to browser print dialog (opens in a new window) |
| ✕ Close | Close the dialog |

### Generated Tax Invoice (Bill) Layout

The generated bill follows the standard Indian jewelry GST Tax Invoice format:

**Page Header:**
- Left side: Buyer details (Name, Address, Contact, State, State Code, GSTIN, PAN)
- Right side: Seller name (JAIGURU JEWELS LLP), "TAX INVOICE" heading, Date, Seller GSTIN, Invoice No.

**Items Table:**

| Column | Description |
|--------|-------------|
| S. No. | Serial number |
| Description of Goods | Item name (e.g. "SILVER NEEM KAROLI BABA COIN 5GM") |
| HSN Code | HSN/SAC code (default 711311 for jewelry) |
| Purity | Metal purity (Gold, Silver, etc.) |
| PCS | Number of pieces |
| Gross Wt. | Gross weight in grams (3 decimal places) |
| Net Wt. | Net weight in grams (3 decimal places) |
| Amount (Rs.) (P.) | Item amount in Indian number format |

**Tax & Payment Summary (below items):**

| Row | Value |
|-----|-------|
| Product total value | Sum of all item amounts |
| Discount | Discount amount (if any) |
| Value after discount | Taxable amount |
| Add CGST @ 1.5% | Central GST amount |
| Add SGST @ 1.5% | State GST amount |
| Add IGST @ 0.000% | Inter-state GST (if applicable) |
| **Tax amount after tax** | **Final invoice amount** |
| Total amount in words | e.g. "Eighteen Thousand Eight Hundred Forty Rupees Only" |

**Payment Details (left side):**
- Cash, Bank, Card amounts
- Old Purchase amount

**Bank Account Details:**
- Bank account name, number, IFSC, and branch

**Amount Paid / Balance:**
- Total amount paid
- Outstanding balance (if any)

**Terms & Conditions:**
- BIS hallmark verification notice
- Hallmarking charges
- Value inclusion details (gold value, stones, making charges, GST)
- Interest clause (24% for overdue)
- Jurisdiction clause
- E. & O. E.

**Signatures:**
- Authorised Signature (left)
- Customer Signature (right)

### Amount in Words

The system uses Indian numbering for amount-to-words conversion:
- Uses Crore, Lakh, Thousand denominations
- Handles paise (decimal portion)
- Example: ₹18,840.00 → "Eighteen Thousand Eight Hundred Forty Rupees Only"
- Example: ₹1,23,456.50 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees and Fifty Paise Only"

### Complete Example

1. Go to **Sales Entry** → select customer "TRAVELX MICE PRIVATE LIMITED" via F2
2. Scan label `SC/5` (Silver Neem Karoli Baba Coin 5GM) → added at ₹4,800
3. Scan label `SC/10` (Silver Neem Karoli Baba Coin 10GM) → added at ₹13,632
4. Product total: ₹18,432 | Discount: ₹140 | Value after discount: ₹18,292
5. CGST: ₹274 | SGST: ₹274 | Final amount: ₹18,840
6. Enter Cash: ₹18,840 → Due: ₹0
7. Press F12 → Voucher **ESI/122** saved → Voucher Print dialog opens automatically
8. Click **👁️ View** to preview the Tax Invoice on screen
9. Click **🖨️ Print** to send to printer
10. Or click **💬 WhatsApp** to share with customer

---

## Workflow 12 — Customer Advance & Due Payments

Track advance payments from customers, due payments against sales, and maintain a complete balance history per customer with multiple payment sources (Cash / Bank / Card).

### Concepts

| Term | Meaning |
| --- | --- |
| **Advance Payment** | Customer pays before a purchase. Makes their balance go negative (Credit). |
| **Due Payment** | Customer pays outstanding balance from a prior sale. Reduces their Debit balance. |
| **Balance (DR)** | Customer **owes** money — positive `closingBalance`. |
| **Balance (CR)** | Customer has **advance** credit — negative `closingBalance`. |
| **advanceAmount** | Amount from a customer's advance balance applied during a sale. |

### Database — `CustomerPayment` Model

| Field | Type | Purpose |
| --- | --- | --- |
| `receiptNo` | String | Auto-generated receipt number (CPR/1, CPR/2, ...) |
| `paymentDate` | DateTime | Date of the payment |
| `accountId` | Int | Link to customer account |
| `paymentType` | Enum | `ADVANCE` or `DUE_PAYMENT` |
| `cashAmount` | Decimal | Cash portion |
| `bankAmount` | Decimal | Bank transfer portion |
| `cardAmount` | Decimal | Card portion |
| `totalAmount` | Decimal | Sum of all payment sources |
| `balanceBefore` | Decimal | Customer balance before this payment |
| `balanceAfter` | Decimal | Customer balance after this payment |
| `salesVoucherId` | Int? | Optionally links to a specific sale (for due payments) |
| `bankName` | String? | Bank name (when bank payment used) |
| `chequeNo` | String? | Cheque/reference number |
| `narration` | String? | Remarks |
| `status` | Enum | ACTIVE / CANCELLED |

### API Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/customer-payments` | List payments with filters (accountId, type, date, search, status) |
| `GET` | `/api/customer-payments/:id` | Get single payment details |
| `POST` | `/api/customer-payments` | Create a new payment (advance or due) |
| `DELETE` | `/api/customer-payments/:id` | Cancel a payment (reverses balance) |
| `GET` | `/api/customer-payments/balance/:accountId` | Full balance history timeline for a customer |

### Step-by-Step: Recording an Advance Payment

1. Navigate to **Payments** in the sidebar
2. Set date and select **Advance Payment** type
3. Search and select the customer (F2 for account master)
4. Enter payment amounts across Cash / Bank / Card
5. If bank amount entered, provide Bank Name and Cheque/Ref No
6. Add narration/remarks if needed
7. Press **Save** (F9) → Receipt generated (e.g., CPR/1)
8. Customer's closing balance decreases (goes towards Credit)

### Step-by-Step: Recording a Due Payment

1. Navigate to **Payments** → select **Due Payment**
2. Select the customer — current outstanding (DR balance) shown
3. Enter amounts — see "After Payment" balance update in real-time
4. Save → Customer's DR balance decreases

### Step-by-Step: Using Advance During a Sale

1. In **Sales Entry**, select a customer who has a CR (advance) balance
2. The **Advance** field appears in the Credit Details section showing available advance
3. Enter the advance amount to apply (capped at available balance and voucher amount)
4. The advance is included in `paymentAmount`, reducing the due amount
5. On save, a `CustomerPayment` record is auto-created to track the advance usage

### Balance History

The **Balance History** table on the Payment Entry page shows a chronological timeline of all balance-affecting transactions:
- **SALE** entries (debit — increases what customer owes)
- **ADVANCE** entries (credit — customer pays in advance)
- **DUE_PAYMENT** entries (credit — customer pays outstanding)
- **ADVANCE_USED** entries (credit — advance applied to a sale)
- **CASH_RECEIPT/PAYMENT** entries (from cash entry module)
- Running balance column shows the cumulative effect

### Cancelling a Payment

1. Go to **Payment List** in the sidebar
2. Click the ✕ button on an active payment
3. Confirm in the dialog → balance reversal applied → payment marked CANCELLED

### Example

**Customer Raj Jewellers — Balance: ₹15,000 DR (owes)**
1. Records due payment: Cash ₹10,000 → Balance: ₹5,000 DR
2. Records advance: Bank ₹20,000 → Balance: ₹-15,000 CR (advance)
3. Makes purchase ₹50,000 → Uses ₹15,000 advance + Cash ₹30,000 → Due: ₹5,000 DR

---

## Reports

### Daily Sales Report

Navigate to **Reports** from the sidebar.

- Set **From Date** and **To Date** to filter
- Choose **Group By**: Date, Salesman, or Counter
- View summary cards: Total Vouchers, Total Weight, Total Sales, Cash, Bank, Due
- **Export**: Excel 📊, PDF 📄, or Print 🖨️

### Stock Report

Go to Reports → **Stock Report** tab.

- **Group By**: Item, Item Group, Metal Type, Counter, or Branch
- **Metal filter**: All, Gold, Silver, Diamond, Platinum
- **Status filter**: All, In Stock, Sold, On Approval
- Summary: Total Items, Total Pcs, Gross Weight, Net Weight, Fine Weight
- Each row shows a visual % of stock bar

### Counter-Wise Report

Go to Reports → **Counter Wise** tab.

- Choose **Report Type**: Sales Report or Stock Report
- For sales: set a date range
- Displays a bar chart of counter distribution + a detailed breakdown table

All reports support **Excel** and **Print** export.

---

## Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| **F2** | Sales Entry | Open customer selection modal |
| **F5** | Sales Entry | Focus cash payment field |
| **F12** | Sales Entry | Save/approve voucher |
| **Enter** | Sales Entry (label field) | Scan label and add item |
| **Double-click** | Sales Entry (item row) | Open item detail edit modal |
| **Escape** | Any modal | Close the modal |
| **Enter** | Branch Issue (label field) | Scan and add label |
| **Enter** | Branch Receipt (transfer field) | Fetch transfer details |
| **F6** | Account Master modal | Open GST search popup |
| **F1–F6** | Dashboard | Quick navigation buttons |

---

## Seeded Demo Data

After running `npm run db:seed`, the following data is ready to use:

### Company
JAIGURU JEWELS LLP — Mumbai, Maharashtra 400001

### Metal Types
Gold (GO), Silver (SI), Diamond (DI), Platinum (PL)

### Purities
| Code | Name | Percentage |
|------|------|-----------|
| 999 | 24 KT | 99.9% |
| 916 | 22 KT | 91.6% |
| 875 | 21 KT | 87.5% |
| 750 | 18 KT | 75.0% |
| 585 | 14 KT | 58.5% |
| S999 | Pure Silver | 99.9% |
| S925 | Sterling Silver | 92.5% |
| PT950 | Pure Platinum | 95.0% |

### Item Groups (12)
Necklace (NEC), Chain (CHN), Bangle (BNG), Bracelet (BRC), Ring (RNG), Earring (EAR), Pendant (PND), Mangalsutra (MNG), Nose Pin (NOS), Coin (CON), Silver Bangle (SBG), Silver Coin (SCN)

### Label Prefixes (12)
| Prefix | Item Group | Label Format |
|--------|-----------|-------------|
| GN | Necklace | GN/1, GN/2... |
| GC | Chain | GC/1, GC/2... |
| GB | Bangle | GB/1, GB/2... |
| GT | Bracelet | GT/1, GT/2... |
| GR | Ring | GR/1, GR/2... |
| GE | Earring | GE/1, GE/2... |
| GP | Pendant | GP/1, GP/2... |
| GM | Mangalsutra | GM/1, GM/2... |
| GN2 | Nose Pin | GN2/1, GN2/2... |
| GK | Coin | GK/1, GK/2... |
| SB | Silver Bangle | SB/1, SB/2... |
| SC | Silver Coin | SC/1, SC/2... |

### Items (10)
Gold Necklace 22KT, Gold Chain 22KT, Gold Bangle 22KT, Gold Ring 22KT, Gold Earring 22KT, Gold Pendant 22KT, Gold Mangalsutra 22KT, Gold Coin 24KT, Silver Bangle, Silver Coin

### Metal Rates (seeded for today)
| Metal | Purity | Rate (₹/gm) |
|-------|--------|-------------|
| Gold | 999 | 73,500 |
| Gold | 916 | 67,300 |
| Gold | 750 | 55,125 |
| Silver | S999 | 95 |
| Silver | S925 | 88 |

### Counters
Counter 1 Gold (C1), Counter 2 Silver (C2), Counter 3 Diamond (C3), Counter 4 Platinum (C4), Counter 5 Bridal (C5)

### Salesmen
Rajesh Kumar (RK), Priya Sharma (PS), Amit Singh (AS), Neha Gupta (NG)

### Sample Accounts
**Customers**: Walk-in Customer, Smt. Kamala Devi, Sh. Ramesh Agarwal, Smt. Priya Jain  
**Suppliers**: Gold Supplier Trading Co., Silver World Pvt Ltd

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 33 |
| Frontend | React 18 + TypeScript + Vite 6 |
| Styling | TailwindCSS |
| State / Data | TanStack Query v5, TanStack Table v8, Zustand |
| Forms | React Hook Form, react-select |
| Charts | Recharts |
| Export | jsPDF + jspdf-autotable (PDF), xlsx (Excel) |
| Icons | Lucide React |
| Backend | Express 4 + TypeScript |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 |
| Auth | JWT + bcryptjs |
| Testing | Vitest (unit), Jest + supertest (integration) |

---

## Project Structure

```
JewelERP/
├── electron/              # Electron main process
│   ├── main.ts
│   └── preload.ts
├── server/                # Express backend
│   ├── index.ts           # Server entry point
│   ├── app.ts             # Express app (testable)
│   ├── prisma.ts          # Prisma client instance
│   └── routes/
│       ├── auth.ts        # Login, register, JWT
│       ├── sales.ts       # Sales vouchers
│       ├── purchase.ts    # Purchase vouchers
│       ├── inventory.ts   # Labels, items, prefixes, stock
│       ├── accounts.ts    # Customers, suppliers, ledger, GSTIN search
│       ├── cashBank.ts    # Cash receipts & payments
│       ├── branch.ts      # Branch transfers
│       ├── masters.ts     # Metal types, purities, rates, groups, counters, salesmen
│       ├── layaway.ts     # Layaway schemes
│       └── reports.ts     # Daily sales, stock, counter reports
├── prisma/
│   ├── schema.prisma      # 30+ models, enums, relations
│   └── seed.ts            # Master + demo data
├── src/                   # React frontend
│   ├── App.tsx            # Routes
│   ├── components/
│   │   ├── Layout/        # Sidebar navigation
│   │   ├── AccountMasterModal.tsx  # Account create/edit with GST search
│   │   ├── VoucherPrintDialog.tsx  # Voucher print dialog (format, copies, WhatsApp, View, Print)
│   │   └── TaxInvoice.tsx          # Printable GST Tax Invoice bill template (A4)
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   ├── Sales/         # RetailSalesEntry, SalesEntryList
│   │   ├── Purchase/      # PurchaseURD, PurchaseEntryList
│   │   ├── Inventory/     # LabelPreparation, LabelEntryList
│   │   ├── CashBank/      # CashEntry
│   │   ├── Branch/        # BranchIssue, BranchReceipt, BranchReceiptList
│   │   ├── Layaway/       # LayawayEntry, LayawayList
│   │   ├── CRM/           # CustomerList
│   │   ├── Reports/       # DailySalesReport, StockReport, CounterWiseReport
│   │   └── Masters/       # MasterData (Items, Groups, Prefixes, Rates, etc.)
│   └── lib/
│       ├── api.ts         # API client (axios)
│       ├── utils.ts       # Formatting, GST calculation, numberToWords
│       └── export.ts      # Excel/PDF export utilities
├── tests/
│   ├── unit/              # Vitest unit tests (AccountMasterModal, utils, export)
│   └── integration/       # Jest + supertest API tests (accounts, GSTIN search, sales, etc.)
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start frontend (port 5173) + backend (port 3001) concurrently |
| `npm run dev:client` | Vite dev server only |
| `npm run dev:server` | Express server with auto-reload (tsx watch) |
| `npm run build` | Production build (TypeScript + Vite + Electron) |
| `npm run package` | Package as Windows desktop app (electron-builder) |
| `npm run db:push` | Sync Prisma schema to database |
| `npm run db:migrate` | Create and apply migration files |
| `npm run db:seed` | Seed master data and demo records |
| `npm run db:studio` | Open Prisma Studio (visual database browser) |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run test` | Run all tests (unit + integration) |
| `npm run test:unit` | Unit tests only (Vitest) |
| `npm run test:integration` | Integration tests only (Jest — 93 tests) |

---

## License

Private — All rights reserved.
