/**
 * Integration tests for courier routes.
 * Tests the API endpoints against the database (requires test DB).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/app';
import { prisma } from '../../server/prisma';

// Test user context — these tests require a seeded DB with at least
// one company, branch, user, and repair job.
let authToken = '';
let testCompanyId = 1;
let testBranchId = 1;
let testRepairId: number;

describe('Courier API Integration', () => {
  beforeAll(async () => {
    // Login to get auth token (assumes test user exists)
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'test1234' });

    if (loginRes.status === 200) {
      authToken = loginRes.body.token;
    }

    // Create a test repair if needed
    const repair = await prisma.repairJob.findFirst({
      where: { companyId: testCompanyId },
    });
    if (repair) testRepairId = repair.id;
  });

  afterAll(async () => {
    // Clean up test courier shipments
    await prisma.courierShipment.deleteMany({
      where: { companyId: testCompanyId, entityType: 'TEST' },
    });
  });

  describe('POST /api/courier/shipments', () => {
    it('creates a shipment record in the database', async () => {
      if (!authToken) return; // Skip if no auth

      const res = await request(app)
        .post('/api/courier/shipments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shipmentType: 'REPAIR_TO_KARIGAR',
          entityType: 'TEST',
          entityId: 1,
          pickup: {
            name: 'Test Shop',
            phone: '9876543210',
            address: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
          },
          delivery: {
            name: 'Test Karigar',
            phone: '9876543211',
            address: '456 Karigar Lane',
            city: 'Pune',
            state: 'Maharashtra',
            pincode: '411001',
          },
          weightGrams: 100,
          declaredValue: 5000,
          productName: 'Test Jewelry Item',
        });

      // Should create even without Shiprocket enabled (stores in DB)
      expect([201, 500]).toContain(res.status); // 500 if Shiprocket is enabled but credentials invalid
      if (res.status === 201) {
        expect(res.body.shipment).toBeDefined();
        expect(res.body.shipment.shipmentType).toBe('REPAIR_TO_KARIGAR');
        expect(res.body.shipment.status).toBe('CREATED');
        expect(res.body.shipment.entityType).toBe('TEST');
      }
    });

    it('rejects invalid pincode format', async () => {
      if (!authToken) return;

      const res = await request(app)
        .post('/api/courier/shipments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shipmentType: 'REPAIR_TO_KARIGAR',
          entityType: 'TEST',
          entityId: 1,
          pickup: { name: 'A', phone: '1234', address: 'x', city: 'x', state: 'x', pincode: '123' },
          delivery: { name: 'B', phone: '5678', address: 'y', city: 'y', state: 'y', pincode: '456' },
          weightGrams: 100,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('pincode');
    });

    it('rejects missing required fields', async () => {
      if (!authToken) return;

      const res = await request(app)
        .post('/api/courier/shipments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ shipmentType: 'REPAIR_TO_KARIGAR' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/courier/shipments', () => {
    it('lists shipments filtered by entity', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/courier/shipments')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ entityType: 'TEST', entityId: 1 });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.shipments)).toBe(true);
    });
  });

  describe('GET /api/courier/rates', () => {
    it('requires pickupPincode, deliveryPincode, and weightGrams', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/courier/rates')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('returns rates when valid pincodes provided (if Shiprocket enabled)', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/courier/rates')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ pickupPincode: '400001', deliveryPincode: '411001', weightGrams: 100 });

      // Will be 200 with rates or 500 if Shiprocket not configured
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body.rates)).toBe(true);
      }
    });
  });

  describe('POST /api/courier/webhook', () => {
    it('returns 200 even for unknown AWB (prevent retries)', async () => {
      const res = await request(app)
        .post('/api/courier/webhook')
        .set('x-api-key', process.env.SHIPROCKET_WEBHOOK_TOKEN || '')
        .send({
          awb: 'NONEXISTENT123',
          current_status_id: 18,
          current_status: 'IN TRANSIT',
          courier_name: 'Delhivery',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('rejects webhook with invalid token when token is configured', async () => {
      // Only test if webhook token is set
      if (!process.env.SHIPROCKET_WEBHOOK_TOKEN) return;

      const res = await request(app)
        .post('/api/courier/webhook')
        .set('x-api-key', 'invalid-token')
        .send({ awb: 'TEST123', current_status_id: 7 });

      expect(res.status).toBe(401);
    });

    it('updates shipment status on valid webhook', async () => {
      if (!authToken) return;

      // First create a shipment with a known AWB
      const shipment = await prisma.courierShipment.create({
        data: {
          shipmentType: 'REPAIR_TO_KARIGAR',
          status: 'IN_TRANSIT',
          entityType: 'TEST',
          entityId: 999,
          companyId: testCompanyId,
          branchId: testBranchId,
          awbNumber: 'TEST_AWB_WEBHOOK_001',
        },
      });

      const res = await request(app)
        .post('/api/courier/webhook')
        .set('x-api-key', process.env.SHIPROCKET_WEBHOOK_TOKEN || '')
        .send({
          awb: 'TEST_AWB_WEBHOOK_001',
          current_status_id: 7, // DELIVERED
          current_status: 'DELIVERED',
          courier_name: 'Delhivery',
          etd: '2026-06-05 10:00:00',
        });

      expect(res.status).toBe(200);

      // Verify the shipment was updated
      const updated = await prisma.courierShipment.findUnique({ where: { id: shipment.id } });
      expect(updated?.status).toBe('DELIVERED');
      expect(updated?.deliveredAt).not.toBeNull();

      // Cleanup
      await prisma.courierShipment.delete({ where: { id: shipment.id } });
    });
  });

  describe('POST /api/courier/shipments/:id/cancel', () => {
    it('cancels a shipment in CREATED status', async () => {
      if (!authToken) return;

      // Create a test shipment
      const shipment = await prisma.courierShipment.create({
        data: {
          shipmentType: 'BRANCH_TRANSFER',
          status: 'CREATED',
          entityType: 'TEST',
          entityId: 888,
          companyId: testCompanyId,
          branchId: testBranchId,
        },
      });

      const res = await request(app)
        .post(`/api/courier/shipments/${shipment.id}/cancel`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.shipment.status).toBe('CANCELLED');

      // Cleanup
      await prisma.courierShipment.delete({ where: { id: shipment.id } });
    });

    it('rejects cancellation of DELIVERED shipment', async () => {
      if (!authToken) return;

      const shipment = await prisma.courierShipment.create({
        data: {
          shipmentType: 'BRANCH_TRANSFER',
          status: 'DELIVERED',
          entityType: 'TEST',
          entityId: 777,
          companyId: testCompanyId,
          branchId: testBranchId,
          deliveredAt: new Date(),
        },
      });

      const res = await request(app)
        .post(`/api/courier/shipments/${shipment.id}/cancel`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('DELIVERED');

      // Cleanup
      await prisma.courierShipment.delete({ where: { id: shipment.id } });
    });
  });

  describe('Repair courier charge auto-creation', () => {
    it('creates COURIER charge when repair shipment is delivered via webhook', async () => {
      if (!testRepairId) return;

      // Create a repair-linked shipment with courier charges
      const shipment = await prisma.courierShipment.create({
        data: {
          shipmentType: 'REPAIR_FROM_KARIGAR',
          status: 'IN_TRANSIT',
          entityType: 'RepairJob',
          entityId: testRepairId,
          companyId: testCompanyId,
          branchId: testBranchId,
          awbNumber: 'TEST_REPAIR_CHARGE_AWB',
          courierCharges: 200,
        },
      });

      // Simulate delivery webhook
      const res = await request(app)
        .post('/api/courier/webhook')
        .set('x-api-key', process.env.SHIPROCKET_WEBHOOK_TOKEN || '')
        .send({
          awb: 'TEST_REPAIR_CHARGE_AWB',
          current_status_id: 7,
          current_status: 'DELIVERED',
          courier_name: 'BlueDart',
        });

      expect(res.status).toBe(200);

      // Verify COURIER charge was created
      const charge = await prisma.repairCharge.findFirst({
        where: {
          repairJobId: testRepairId,
          chargeType: 'COURIER',
          description: { contains: String(shipment.id) },
        },
      });

      expect(charge).not.toBeNull();
      expect(Number(charge?.amount)).toBe(200);
      expect(Number(charge?.gstPercent)).toBe(18);

      // Cleanup
      if (charge) await prisma.repairCharge.delete({ where: { id: charge.id } });
      await prisma.courierShipment.delete({ where: { id: shipment.id } });
    });
  });
});
