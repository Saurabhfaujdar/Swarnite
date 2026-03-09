import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding JewelERP database...');

  // 1. Create Company
  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: process.env.DEFAULT_COMPANY_NAME || 'JAIGURU JEWELS LLP',
      address: 'Shop No. 1, Main Market',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '9999999999',
      gstin: '27AXXXXXXX1Z5',
      pan: 'AXXXXXXX9A',
      financialYearStart: new Date('2024-04-01'),
      financialYearEnd: new Date('2025-03-31'),
    },
  });
  console.log('  ✅ Company created:', company.name);

  // 2. Create Branches
  const mainBranch = await prisma.branch.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: process.env.DEFAULT_BRANCH_NAME || 'Main Branch',
      code: 'HQ',
      address: 'Main Market',
      city: 'Mumbai',
      state: 'Maharashtra',
      phone: '9999999999',
      companyId: company.id,
      isActive: true,
    },
  });
  console.log('  ✅ Branch created:', mainBranch.name);

  // 3. Create Admin User
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      fullName: 'Administrator',
      role: 'ADMIN',
      branch: { connect: { id: mainBranch.id } },
      isActive: true,
    },
  });
  console.log('  ✅ Admin user created: admin / admin123');

  // Create a sales user
  const salesPassword = await bcrypt.hash('sales123', 10);
  await prisma.user.upsert({
    where: { username: 'sales1' },
    update: {},
    create: {
      username: 'sales1',
      password: salesPassword,
      fullName: 'Sales Counter 1',
      role: 'USER',
      branch: { connect: { id: mainBranch.id } },
      isActive: true,
    },
  });
  console.log('  ✅ Sales user created: sales1 / sales123');

  // 4. Create Metal Types
  const metalTypeData = [
    { name: 'Gold', code: 'GO' },
    { name: 'Silver', code: 'SI' },
    { name: 'Diamond', code: 'DI' },
    { name: 'Platinum', code: 'PL' },
  ];
  for (const mt of metalTypeData) {
    await prisma.metalType.upsert({
      where: { name: mt.name },
      update: {},
      create: { name: mt.name, code: mt.code, isActive: true },
    });
  }
  console.log('  ✅ Metal types created:', metalTypeData.map(m => m.name).join(', '));

  const goldMetal = await prisma.metalType.findUnique({ where: { name: 'Gold' } });
  const silverMetal = await prisma.metalType.findUnique({ where: { name: 'Silver' } });
  const platinumMetal = await prisma.metalType.findUnique({ where: { name: 'Platinum' } });

  // 5. Create Item Groups (each belongs to a metalType)
  const groupDefs = [
    { name: 'Necklace', code: 'NEC', metalTypeId: goldMetal!.id },
    { name: 'Chain', code: 'CHN', metalTypeId: goldMetal!.id },
    { name: 'Bangle', code: 'BNG', metalTypeId: goldMetal!.id },
    { name: 'Bracelet', code: 'BRC', metalTypeId: goldMetal!.id },
    { name: 'Ring', code: 'RNG', metalTypeId: goldMetal!.id },
    { name: 'Earring', code: 'EAR', metalTypeId: goldMetal!.id },
    { name: 'Pendant', code: 'PND', metalTypeId: goldMetal!.id },
    { name: 'Mangalsutra', code: 'MNG', metalTypeId: goldMetal!.id },
    { name: 'Nose Pin', code: 'NOS', metalTypeId: goldMetal!.id },
    { name: 'Coin', code: 'CON', metalTypeId: goldMetal!.id },
    { name: 'Silver Bangle', code: 'SBG', metalTypeId: silverMetal!.id },
    { name: 'Silver Coin', code: 'SCN', metalTypeId: silverMetal!.id },
  ];
  for (const g of groupDefs) {
    await prisma.itemGroup.upsert({
      where: { code: g.code },
      update: {},
      create: { name: g.name, code: g.code, metalTypeId: g.metalTypeId, isActive: true },
    });
  }
  console.log('  ✅ Item groups created:', groupDefs.length);

  // 6. Create Purities
  const purities = [
    { name: '24KT Gold', code: '999', percentage: 99.9 },
    { name: '22KT Gold', code: '916', percentage: 91.6 },
    { name: '21KT Gold', code: '875', percentage: 87.5 },
    { name: '18KT Gold', code: '750', percentage: 75.0 },
    { name: '14KT Gold', code: '585', percentage: 58.5 },
    { name: 'Pure Silver', code: 'S999', percentage: 99.9 },
    { name: 'Sterling Silver', code: 'S925', percentage: 92.5 },
    { name: 'Pure Platinum', code: 'PT950', percentage: 95.0 },
  ];
  for (const p of purities) {
    await prisma.purity.upsert({
      where: { code: p.code },
      update: {},
      create: { name: p.name, code: p.code, percentage: p.percentage, isActive: true },
    });
  }
  console.log('  ✅ Purities created:', purities.length);

  // 7. Create Items
  const gold916 = await prisma.purity.findUnique({ where: { code: '916' } });
  const silver999 = await prisma.purity.findUnique({ where: { code: 'S999' } });
  const necklaceGroup = await prisma.itemGroup.findUnique({ where: { code: 'NEC' } });
  const chainGroup = await prisma.itemGroup.findUnique({ where: { code: 'CHN' } });
  const bangleGroup = await prisma.itemGroup.findUnique({ where: { code: 'BNG' } });
  const ringGroup = await prisma.itemGroup.findUnique({ where: { code: 'RNG' } });
  const earringGroup = await prisma.itemGroup.findUnique({ where: { code: 'EAR' } });
  const pendantGroup = await prisma.itemGroup.findUnique({ where: { code: 'PND' } });
  const mangalsutraGroup = await prisma.itemGroup.findUnique({ where: { code: 'MNG' } });
  const coinGroup = await prisma.itemGroup.findUnique({ where: { code: 'CON' } });
  const sBangleGroup = await prisma.itemGroup.findUnique({ where: { code: 'SBG' } });
  const sCoinGroup = await prisma.itemGroup.findUnique({ where: { code: 'SCN' } });

  const itemDefs = [
    { name: 'Gold Necklace 22KT', code: 'GN22', metalTypeId: goldMetal!.id, purityId: gold916!.id, itemGroupId: necklaceGroup!.id },
    { name: 'Gold Chain 22KT', code: 'GC22', metalTypeId: goldMetal!.id, purityId: gold916!.id, itemGroupId: chainGroup!.id },
    { name: 'Gold Bangle 22KT', code: 'GB22', metalTypeId: goldMetal!.id, purityId: gold916!.id, itemGroupId: bangleGroup!.id },
    { name: 'Gold Ring 22KT', code: 'GR22', metalTypeId: goldMetal!.id, purityId: gold916!.id, itemGroupId: ringGroup!.id },
    { name: 'Gold Earring 22KT', code: 'GE22', metalTypeId: goldMetal!.id, purityId: gold916!.id, itemGroupId: earringGroup!.id },
    { name: 'Gold Pendant 22KT', code: 'GP22', metalTypeId: goldMetal!.id, purityId: gold916!.id, itemGroupId: pendantGroup!.id },
    { name: 'Gold Mangalsutra 22KT', code: 'GM22', metalTypeId: goldMetal!.id, purityId: gold916!.id, itemGroupId: mangalsutraGroup!.id },
    { name: 'Gold Coin 24KT', code: 'GCN24', metalTypeId: goldMetal!.id, purityId: gold916!.id, itemGroupId: coinGroup!.id },
    { name: 'Silver Bangle', code: 'SB01', metalTypeId: silverMetal!.id, purityId: silver999!.id, itemGroupId: sBangleGroup!.id },
    { name: 'Silver Coin', code: 'SC01', metalTypeId: silverMetal!.id, purityId: silver999!.id, itemGroupId: sCoinGroup!.id },
  ];
  for (const item of itemDefs) {
    await prisma.item.upsert({
      where: { code: item.code },
      update: {},
      create: {
        name: item.name,
        code: item.code,
        metalTypeId: item.metalTypeId,
        purityId: item.purityId,
        itemGroupId: item.itemGroupId,
        isActive: true,
      },
    });
  }
  console.log('  ✅ Items created:', itemDefs.length);

  // 8. Create Counters
  const counters = [
    { code: 'C1', name: 'Counter 1 - Gold' },
    { code: 'C2', name: 'Counter 2 - Gold' },
    { code: 'C3', name: 'Counter 3 - Diamond' },
    { code: 'C4', name: 'Counter 4 - Silver' },
    { code: 'C5', name: 'Counter 5 - Bridal' },
  ];
  for (const c of counters) {
    await prisma.counter.upsert({
      where: { code: c.code },
      update: {},
      create: { ...c, branchId: mainBranch.id, isActive: true },
    });
  }
  console.log('  ✅ Counters created:', counters.length);

  // 9. Create Salesmen
  const salesmenData = [
    { name: 'Rajesh Kumar', code: 'RK' },
    { name: 'Priya Sharma', code: 'PS' },
    { name: 'Amit Singh', code: 'AS' },
    { name: 'Neha Gupta', code: 'NG' },
  ];
  for (const s of salesmenData) {
    await prisma.salesman.upsert({
      where: { code: s.code },
      update: {},
      create: { name: s.name, code: s.code, isActive: true },
    });
  }
  console.log('  ✅ Salesmen created:', salesmenData.length);

  // 10. Create Metal Rates (today's rate)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rates = [
    { metalTypeId: goldMetal!.id, purityCode: '999', rate: 73500 },
    { metalTypeId: goldMetal!.id, purityCode: '916', rate: 67300 },
    { metalTypeId: goldMetal!.id, purityCode: '750', rate: 55125 },
    { metalTypeId: silverMetal!.id, purityCode: 'S999', rate: 95 },
    { metalTypeId: silverMetal!.id, purityCode: 'S925', rate: 88 },
  ];
  for (const rate of rates) {
    await prisma.metalRate.create({
      data: {
        metalTypeId: rate.metalTypeId,
        purityCode: rate.purityCode,
        rate: rate.rate,
        date: today,
        isActive: true,
      },
    });
  }
  console.log('  ✅ Metal rates created for today');

  // 11. Create Label Prefixes (tied to ItemGroup, not branch)
  const prefixDefs = [
    { prefix: 'GN', itemGroupCode: 'NEC' },
    { prefix: 'GC', itemGroupCode: 'CHN' },
    { prefix: 'GB', itemGroupCode: 'BNG' },
    { prefix: 'GT', itemGroupCode: 'BRC' },
    { prefix: 'GR', itemGroupCode: 'RNG' },
    { prefix: 'GE', itemGroupCode: 'EAR' },
    { prefix: 'GP', itemGroupCode: 'PND' },
    { prefix: 'GM', itemGroupCode: 'MNG' },
    { prefix: 'GN2', itemGroupCode: 'NOS' },
    { prefix: 'GK', itemGroupCode: 'CON' },
    { prefix: 'SB', itemGroupCode: 'SBG' },
    { prefix: 'SC', itemGroupCode: 'SCN' },
  ];
  for (const p of prefixDefs) {
    const group = await prisma.itemGroup.findUnique({ where: { code: p.itemGroupCode } });
    if (group) {
      await prisma.labelPrefix.upsert({
        where: { prefix: p.prefix },
        update: {},
        create: { prefix: p.prefix, itemGroupId: group.id },
      });
    }
  }
  console.log('  ✅ Label prefixes created:', prefixDefs.length);

  // 12. Create GST Config
  await prisma.gstConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      cgstRate: 1.5,
      sgstRate: 1.5,
      igstRate: 3.0,
      hsnCode: '7113',
      description: 'Jewellery - Gold, Silver, Precious Stones',
      isActive: true,
    },
  });
  console.log('  ✅ GST config created (CGST 1.5% + SGST 1.5%)');

  // 13. Create sample customer accounts
  const sampleCustomers = [
    { name: 'Walk-in Customer', type: 'CUSTOMER' as const, city: 'Mumbai' },
    { name: 'Smt. Kamala Devi', mobile: '9876543210', type: 'CUSTOMER' as const, city: 'Mumbai' },
    { name: 'Sh. Ramesh Agarwal', mobile: '9876543211', type: 'CUSTOMER' as const, city: 'Pune' },
    { name: 'Smt. Priya Jain', mobile: '9876543212', type: 'CUSTOMER' as const, city: 'Delhi' },
    { name: 'Gold Supplier Trading Co.', mobile: '9876543220', type: 'SUPPLIER' as const, city: 'Ahmedabad' },
    { name: 'Silver World Pvt Ltd', mobile: '9876543221', type: 'SUPPLIER' as const, city: 'Rajkot' },
  ];
  for (const cust of sampleCustomers) {
    await prisma.account.create({
      data: {
        name: cust.name,
        mobile: cust.mobile || null,
        type: cust.type,
        city: cust.city,
        state: 'Maharashtra',
        balanceType: cust.type === 'SUPPLIER' ? 'CR' : 'DR',
        closingBalance: 0,
      },
    });
  }
  console.log('  ✅ Sample accounts created:', sampleCustomers.length);

  // 14. Create Voucher Sequences
  const sequences = [
    { prefix: 'RS', entityType: 'SALES', financialYear: '2024-2025' },
    { prefix: 'PU', entityType: 'PURCHASE', financialYear: '2024-2025' },
    { prefix: 'CR', entityType: 'CASH_RECEIPT', financialYear: '2024-2025' },
    { prefix: 'CP', entityType: 'CASH_PAYMENT', financialYear: '2024-2025' },
    { prefix: 'BR', entityType: 'BRANCH_TRANSFER', financialYear: '2024-2025' },
    { prefix: 'LY', entityType: 'LAYAWAY', financialYear: '2024-2025' },
  ];
  for (const seq of sequences) {
    await prisma.voucherSequence.create({
      data: { prefix: seq.prefix, entityType: seq.entityType, lastNumber: 0, financialYear: seq.financialYear },
    });
  }
  console.log('  ✅ Voucher sequences created');

  console.log('\n🎉 Seeding complete! JewelERP is ready.\n');
  console.log('  Login: admin / admin123');
  console.log('  Sales: sales1 / sales123\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
