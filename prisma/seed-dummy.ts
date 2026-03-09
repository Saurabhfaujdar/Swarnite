import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Adds realistic transactional dummy data:
 *  - 50 Labels (inventory items on counters)
 *  - 15 Sales vouchers with line items
 *  - 10 Purchase (Old Gold) vouchers with line items
 *  - 10 Cash receipt / payment entries
 *  - 5 Layaway entries with payments
 */
async function main() {
  console.log('\n📦 Seeding dummy transactional data...\n');

  // ── Fetch reference data ────────────────────────────────────
  const branch = await prisma.branch.findFirst();
  const adminUser = await prisma.user.findUnique({ where: { username: 'admin' } });
  const salesUser = await prisma.user.findUnique({ where: { username: 'sales1' } });
  const items = await prisma.item.findMany({ include: { purity: true, itemGroup: true } });
  const counters = await prisma.counter.findMany();
  const accounts = await prisma.account.findMany();
  const salesmen = await prisma.salesman.findMany();
  const prefixes = await prisma.labelPrefix.findMany();

  if (!branch || !adminUser || items.length === 0) {
    console.error('❌ Run the base seed first: npm run db:seed');
    process.exit(1);
  }

  const customers = accounts.filter(a => a.type === 'CUSTOMER');
  const suppliers = accounts.filter(a => a.type === 'SUPPLIER');

  // Helpers
  const rand = (min: number, max: number) => Math.round((Math.random() * (max - min) + min) * 100) / 100;
  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d; };

  // ──────────────────────────────────────────────────────────────
  // 1. CREATE 50 LABELS  (inventory on counters)
  // ──────────────────────────────────────────────────────────────
  console.log('  Creating labels (inventory)...');
  const labelRecords: Array<{ id: number; labelNo: string; itemId: number; grossWeight: number; netWeight: number }> = [];

  for (let i = 1; i <= 50; i++) {
    const item = pick(items);
    const prefix = prefixes.find(p => p.itemGroupId === item.itemGroupId) || pick(prefixes);
    const counter = pick(counters);
    const grossWt = rand(2, 85);
    const netWt = +(grossWt * rand(0.92, 0.99)).toFixed(3);
    const labelNo = `${prefix.prefix}/${1000 + i}`;

    const label = await prisma.label.create({
      data: {
        labelNo,
        prefixId: prefix.id,
        itemId: item.id,
        grossWeight: grossWt,
        netWeight: netWt,
        pcsCount: 1,
        mrp: +(netWt * 6800).toFixed(2),
        branchId: branch.id,
        counterId: counter.id,
        status: 'IN_STOCK',
      },
    });
    labelRecords.push({ id: label.id, labelNo, itemId: item.id, grossWeight: grossWt, netWeight: netWt });

    // Bump label prefix counter
    await prisma.labelPrefix.update({ where: { id: prefix.id }, data: { lastNumber: { increment: 1 } } });
  }
  console.log(`  ✅ ${labelRecords.length} labels created`);

  // ──────────────────────────────────────────────────────────────
  // 2. CREATE 15 SALES VOUCHERS
  // ──────────────────────────────────────────────────────────────
  console.log('  Creating sales vouchers...');

  for (let i = 1; i <= 15; i++) {
    const customer = pick(customers);
    const salesman = pick(salesmen);
    const user = i % 2 === 0 ? salesUser! : adminUser;
    const numItems = randInt(1, 4);
    const voucherDate = daysAgo(randInt(0, 60));

    // Pick labels to "sell"
    const availableLabels = labelRecords.filter((_, idx) => idx < 50);
    const soldLabels = [];
    for (let j = 0; j < numItems && availableLabels.length > 0; j++) {
      const idx = randInt(0, availableLabels.length - 1);
      soldLabels.push(availableLabels.splice(idx, 1)[0]);
    }

    // Build sales items data
    let totalGrossWt = 0, totalNetWt = 0, totalMetalAmt = 0, totalLabourAmt = 0;
    const salesItemsData = soldLabels.map(sl => {
      const item = items.find(it => it.id === sl.itemId)!;
      const metalRate = item.metalTypeId === 1 ? 6730 : 9.5; // Gold ~67,300/10g, Silver ~95/g
      const grossWt = sl.grossWeight;
      const netWt = sl.netWeight;
      const metalAmt = +(netWt * metalRate / 10).toFixed(2);
      const labourRate = rand(200, 800);
      const labourAmt = +(netWt * labourRate / 10).toFixed(2);
      const totalAmt = +(metalAmt + labourAmt).toFixed(2);
      totalGrossWt += grossWt;
      totalNetWt += netWt;
      totalMetalAmt += metalAmt;
      totalLabourAmt += labourAmt;

      return {
        itemId: item.id,
        labelId: sl.id,
        labelNo: sl.labelNo,
        itemName: item.name,
        grossWeight: grossWt,
        netWeight: netWt,
        fineWeight: +(netWt * (Number(item.purity.percentage) / 100)).toFixed(3),
        pcs: 1,
        metalRate,
        metalAmount: metalAmt,
        labourRate,
        labourAmount: labourAmt,
        otherCharge: 0,
        discountStAmt: 0,
        totalAmount: totalAmt,
        taxableAmount: totalAmt,
      };
    });

    const subtotal = +(totalMetalAmt + totalLabourAmt).toFixed(2);
    const cgst = +(subtotal * 0.015).toFixed(2);
    const sgst = +(subtotal * 0.015).toFixed(2);
    const totalGst = +(cgst + sgst).toFixed(2);
    const voucherAmt = +(subtotal + totalGst).toFixed(2);
    const cashPaid = +(voucherAmt * rand(0.4, 1.0)).toFixed(2);
    const due = +(voucherAmt - cashPaid).toFixed(2);

    await prisma.salesVoucher.create({
      data: {
        voucherNo: `JGI/${1100 + i}`,
        voucherPrefix: 'JGI',
        voucherNumber: 1100 + i,
        voucherDate,
        accountId: customer.id,
        salesmanId: salesman.id,
        branchId: branch.id,
        userId: user.id,
        totalGrossWeight: totalGrossWt,
        totalNetWeight: totalNetWt,
        totalPcs: soldLabels.length,
        metalAmount: totalMetalAmt,
        labourAmount: totalLabourAmt,
        otherCharge: 0,
        discountStAmount: 0,
        totalAmount: subtotal,
        taxableAmount: subtotal,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: 0,
        totalGstAmount: totalGst,
        discountPercent: 0,
        discountAmount: 0,
        roundingDiscount: 0,
        voucherAmount: voucherAmt,
        cashAmount: cashPaid,
        bankAmount: 0,
        cardAmount: 0,
        oldGoldAmount: 0,
        paymentAmount: cashPaid,
        dueAmount: due,
        previousOs: 0,
        finalDue: due,
        narration: `Retail sale to ${customer.name}`,
        status: 'ACTIVE',
        items: { create: salesItemsData },
      },
    });

    // Mark sold labels
    for (const sl of soldLabels) {
      await prisma.label.update({ where: { id: sl.id }, data: { status: 'SOLD' } });
    }
  }

  // Update voucher sequence
  await prisma.voucherSequence.updateMany({
    where: { entityType: 'SALES' },
    data: { lastNumber: 15 },
  });
  console.log('  ✅ 15 sales vouchers created');

  // ──────────────────────────────────────────────────────────────
  // 3. CREATE 10 PURCHASE (OLD GOLD) VOUCHERS
  // ──────────────────────────────────────────────────────────────
  console.log('  Creating purchase vouchers...');

  for (let i = 1; i <= 10; i++) {
    const supplier = suppliers.length > 0 ? pick(suppliers) : pick(customers);
    const voucherDate = daysAgo(randInt(0, 45));
    const grossWt = rand(5, 120);
    const netWt = +(grossWt * rand(0.9, 0.98)).toFixed(3);
    const purity = rand(70, 92);
    const fineWt = +(netWt * purity / 100).toFixed(3);
    const metalRate = 6730; // per gram
    const metalAmt = +(fineWt * metalRate / 10).toFixed(2);
    const finalAmt = +(metalAmt).toFixed(2);

    await prisma.purchaseVoucher.create({
      data: {
        voucherNo: `PUR/${200 + i}`,
        voucherPrefix: 'PUR',
        voucherNumber: 200 + i,
        voucherDate,
        purchaseType: i <= 7 ? 'URD' : 'REGULAR',
        accountId: supplier.id,
        branchId: branch.id,
        userId: adminUser.id,
        description: i <= 7 ? 'OLD GOLD PURCHASE' : 'REGULAR GOLD PURCHASE',
        variety: 'Gold Ornament',
        group: i <= 7 ? 'OGN' : 'REG',
        totalGrossWeight: grossWt,
        totalNetWeight: netWt,
        totalFineWeight: fineWt,
        totalPcs: randInt(1, 5),
        purity,
        metalRate,
        metalAmount: metalAmt,
        otherCharge: 0,
        valAddAmount: 0,
        totalAmount: finalAmt,
        finalAmount: finalAmt,
        salesmanName: pick(salesmen).name,
        narration: `${i <= 7 ? 'Old gold' : 'Regular'} purchase from ${supplier.name}`,
        status: 'ACTIVE',
        items: {
          create: [
            {
              styleName: pick(['Necklace', 'Chain', 'Bangle', 'Ring', 'Earring', 'Mixed Lot']),
              weight: netWt,
              pcs: randInt(1, 3),
              amtCalcOn: 'Weight',
              rate: metalRate,
              amount: metalAmt,
            },
          ],
        },
      },
    });
  }

  await prisma.voucherSequence.updateMany({
    where: { entityType: 'PURCHASE' },
    data: { lastNumber: 10 },
  });
  console.log('  ✅ 10 purchase vouchers created');

  // ──────────────────────────────────────────────────────────────
  // 4. CREATE 10 CASH ENTRIES (5 Receipts + 5 Payments)
  // ──────────────────────────────────────────────────────────────
  console.log('  Creating cash entries...');

  for (let i = 1; i <= 10; i++) {
    const isReceipt = i <= 5;
    const voucherDate = daysAgo(randInt(0, 30));
    const account = pick(isReceipt ? customers : suppliers);
    const amount = rand(5000, 200000);

    await prisma.cashEntry.create({
      data: {
        voucherNo: `${isReceipt ? 'CR' : 'CP'}/${100 + i}`,
        voucherPrefix: isReceipt ? 'CR' : 'CP',
        voucherNumber: 100 + i,
        voucherDate,
        voucherType: isReceipt ? 'RECEIPT' : 'PAYMENT',
        bookName: 'Cash',
        branchId: branch.id,
        userId: adminUser.id,
        totalCredit: isReceipt ? amount : 0,
        totalDebit: isReceipt ? 0 : amount,
        balance: isReceipt ? amount : -amount,
        narration: isReceipt
          ? `Cash received from ${account.name}`
          : `Cash paid to ${account.name}`,
        status: 'ACTIVE',
        lines: {
          create: [
            {
              crDr: isReceipt ? 'CR' : 'DR',
              accountId: account.id,
              date: voucherDate,
              amount,
              tdsAmount: 0,
              tcsAmount: 0,
              netAmount: amount,
              gstApplicable: false,
              narration: isReceipt ? 'Against outstanding' : 'Payment for purchase',
            },
          ],
        },
      },
    });
  }

  await prisma.voucherSequence.updateMany({
    where: { entityType: 'CASH_RECEIPT' },
    data: { lastNumber: 5 },
  });
  await prisma.voucherSequence.updateMany({
    where: { entityType: 'CASH_PAYMENT' },
    data: { lastNumber: 5 },
  });
  console.log('  ✅ 10 cash entries created (5 receipts + 5 payments)');

  // ──────────────────────────────────────────────────────────────
  // 5. CREATE 5 LAYAWAY (ADVANCE / INSTALLMENT) ENTRIES
  // ──────────────────────────────────────────────────────────────
  console.log('  Creating layaway entries...');

  for (let i = 1; i <= 5; i++) {
    const customer = pick(customers);
    const totalAmt = rand(50000, 500000);
    const startDate = daysAgo(randInt(10, 90));
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + 6);

    // Create 1-3 payments towards the layaway
    const numPayments = randInt(1, 3);
    const payments = [];
    let paidSoFar = 0;
    for (let p = 0; p < numPayments; p++) {
      const payDate = new Date(startDate);
      payDate.setDate(payDate.getDate() + p * 30);
      const payAmt = +(totalAmt / (numPayments + 1)).toFixed(2);
      paidSoFar += payAmt;
      payments.push({
        paymentDate: payDate,
        amount: payAmt,
        paymentMode: pick(['Cash', 'Bank', 'Card']),
        narration: `Installment ${p + 1}`,
      });
    }

    await prisma.layawayEntry.create({
      data: {
        voucherNo: `LY/${250 + i}`,
        voucherPrefix: 'LY',
        voucherNumber: 250 + i,
        voucherDate: startDate,
        dueDate,
        accountId: customer.id,
        branchId: branch.id,
        salesmanName: pick(salesmen).name,
        totalAmount: totalAmt,
        paidAmount: paidSoFar,
        balanceAmount: +(totalAmt - paidSoFar).toFixed(2),
        bookName: 'Cash',
        status: paidSoFar >= totalAmt ? 'COMPLETED' : 'ACTIVE',
        payments: { create: payments },
      },
    });
  }

  await prisma.voucherSequence.updateMany({
    where: { entityType: 'LAYAWAY' },
    data: { lastNumber: 5 },
  });
  console.log('  ✅ 5 layaway entries created');

  // ──────────────────────────────────────────────────────────────
  // 6. UPDATE ACCOUNT BALANCES
  // ──────────────────────────────────────────────────────────────
  console.log('  Updating account balances...');

  for (const cust of customers) {
    const salesTotal = await prisma.salesVoucher.aggregate({
      where: { accountId: cust.id },
      _sum: { dueAmount: true },
    });
    const due = Number(salesTotal._sum.dueAmount || 0);
    await prisma.account.update({
      where: { id: cust.id },
      data: {
        closingBalance: due,
        balanceType: due > 0 ? 'DR' : 'NONE',
      },
    });
  }
  console.log('  ✅ Account balances updated');

  // ──────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────
  const labelCount = await prisma.label.count();
  const salesCount = await prisma.salesVoucher.count();
  const purchaseCount = await prisma.purchaseVoucher.count();
  const cashCount = await prisma.cashEntry.count();
  const layawayCount = await prisma.layawayEntry.count();

  console.log('\n🎉 Dummy data seeding complete!\n');
  console.log(`  📋 Labels (inventory):    ${labelCount}`);
  console.log(`  🛒 Sales vouchers:        ${salesCount}`);
  console.log(`  📥 Purchase vouchers:     ${purchaseCount}`);
  console.log(`  💵 Cash entries:          ${cashCount}`);
  console.log(`  📅 Layaway entries:       ${layawayCount}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
