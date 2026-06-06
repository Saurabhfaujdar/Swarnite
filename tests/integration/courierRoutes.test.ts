/**
 * Courier routes — integration tests (mock-based)
 *
 * Tests the courier route handlers with mocked Prisma and mocked Shiprocket service.
 * Does NOT require a running database.
 */
import request from 'supertest';

import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../server/services/courier', () => ({
  getShippingRates: jest.fn(),
  createShipment: jest.fn(),
  assignCourier: jest.fn(),
  cancelShipment: jest.fn(),
  getTracking: jest.fn(),
  mapShiprocketStatus: jest.fn((id: number) => {
    const map: Record<number, string> = { 6: 'PICKED_UP', 7: 'DELIVERED', 8: 'CANCELLED', 18: 'IN_TRANSIT' };
    return map[id] || 'IN_TRANSIT';
  }),
}));

const authState = {
  id: 1, userId: 1, userRole: 'ADMIN', companyId: 1,
  branchId: 1, branchScope: [] as number[], isMasterBranch: true,
};
jest.mock('../../server/middleware/branchAccess', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    Object.assign(req, authState);
    (req as any).user = authState;
    next();
  },
  requireBranch: (_r: any, _s: any, n: any) => n(),
  requireMaster: (_r: any, _s: any, n: any) => n(),
  requireAdmin: (_r: any, _s: any, n: any) => n(),
  branchWhere: () => ({}),
  tenantScope: () => ({ companyId: 1 }),
  canAccessBranch: () => true,
  canOverrideBranch: async () => true,
}));

import app from '../../server/app';
import * as courierService from '../../server/services/courier';

const mockedService = courierService as jest.Mocked<typeof courierService>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/courier/shipments', () => {
  const validPayload = {
    shipmentType: 'REPAIR_TO_KARIGAR',
    entityType: 'RepairJob',
    entityId: 42,
    pickup: {
      name: 'Main Branch',
      phone: '9876543210',
      address: '123 Main St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    delivery: {
      name: 'Karigar Workshop',
      phone: '9876543211',
      address: '456 Workshop Lane',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    },
    weightGrams: 150,
    declaredValue: 10000,
    productName: 'Gold Necklace Repair',
  };

  it('creates shipment with valid payload', async () => {
    mockPrisma.courierShipment.create.mockResolvedValueOnce({
      id: 1, ...validPayload, status: 'CREATED', companyId: 1, branchId: 1,
    });

    const res = await request(app)
      .post('/api/courier/shipments')
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.shipment).toBeDefined();
    expect(mockPrisma.courierShipment.create).toHaveBeenCalledTimes(1);
    const createArg = mockPrisma.courierShipment.create.mock.calls[0][0].data;
    expect(createArg.shipmentType).toBe('REPAIR_TO_KARIGAR');
    expect(createArg.entityType).toBe('RepairJob');
    expect(createArg.entityId).toBe(42);
    expect(createArg.companyId).toBe(1);
  });

  it('rejects when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/courier/shipments')
      .send({ shipmentType: 'REPAIR_TO_KARIGAR' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  it('rejects invalid pickup pincode', async () => {
    const res = await request(app)
      .post('/api/courier/shipments')
      .send({ ...validPayload, pickup: { ...validPayload.pickup, pincode: '1234' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('pincode');
  });

  it('rejects invalid delivery pincode', async () => {
    const res = await request(app)
      .post('/api/courier/shipments')
      .send({ ...validPayload, delivery: { ...validPayload.delivery, pincode: 'ABCDEF' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('pincode');
  });

  it('stores pickup and delivery addresses as JSON', async () => {
    mockPrisma.courierShipment.create.mockResolvedValueOnce({
      id: 2, status: 'CREATED', companyId: 1,
    });

    await request(app)
      .post('/api/courier/shipments')
      .send(validPayload);

    const createArg = mockPrisma.courierShipment.create.mock.calls[0][0].data;
    expect(createArg.pickupAddress).toEqual(validPayload.pickup);
    expect(createArg.deliveryAddress).toEqual(validPayload.delivery);
  });

  it('converts weight from grams to proper storage', async () => {
    mockPrisma.courierShipment.create.mockResolvedValueOnce({ id: 3, status: 'CREATED' });

    await request(app)
      .post('/api/courier/shipments')
      .send(validPayload);

    const createArg = mockPrisma.courierShipment.create.mock.calls[0][0].data;
    expect(createArg.weightGrams).toBe(150);
  });
});

describe('GET /api/courier/shipments', () => {
  it('lists shipments for current company', async () => {
    mockPrisma.courierShipment.findMany.mockResolvedValueOnce([
      { id: 1, shipmentType: 'REPAIR_TO_KARIGAR', status: 'CREATED', companyId: 1 },
      { id: 2, shipmentType: 'BRANCH_TRANSFER', status: 'IN_TRANSIT', companyId: 1 },
    ]);

    const res = await request(app).get('/api/courier/shipments');

    expect(res.status).toBe(200);
    expect(res.body.shipments).toHaveLength(2);
    const where = mockPrisma.courierShipment.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(1);
  });

  it('filters by entityType and entityId', async () => {
    mockPrisma.courierShipment.findMany.mockResolvedValueOnce([]);

    await request(app).get('/api/courier/shipments?entityType=RepairJob&entityId=42');

    const where = mockPrisma.courierShipment.findMany.mock.calls[0][0].where;
    expect(where.entityType).toBe('RepairJob');
    expect(where.entityId).toBe(42);
  });

  it('orders by createdAt descending', async () => {
    mockPrisma.courierShipment.findMany.mockResolvedValueOnce([]);

    await request(app).get('/api/courier/shipments');

    const orderBy = mockPrisma.courierShipment.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ createdAt: 'desc' });
  });
});

describe('GET /api/courier/shipments/:id', () => {
  it('returns shipment detail', async () => {
    mockPrisma.courierShipment.findUnique.mockResolvedValueOnce({
      id: 5, shipmentType: 'REPAIR_TO_KARIGAR', status: 'IN_TRANSIT',
      awbNumber: 'DLV123456', companyId: 1,
    });

    const res = await request(app).get('/api/courier/shipments/5');

    expect(res.status).toBe(200);
    expect(res.body.shipment.id).toBe(5);
    expect(res.body.shipment.awbNumber).toBe('DLV123456');
  });

  it('returns 404 for non-existent shipment', async () => {
    mockPrisma.courierShipment.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/courier/shipments/999');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/courier/shipments/:id/cancel', () => {
  it('cancels a CREATED shipment', async () => {
    mockPrisma.courierShipment.findUnique.mockResolvedValueOnce({
      id: 10, status: 'CREATED', shiprocketOrderId: null, companyId: 1,
    });
    mockPrisma.courierShipment.update.mockResolvedValueOnce({
      id: 10, status: 'CANCELLED',
    });

    const res = await request(app).post('/api/courier/shipments/10/cancel');

    expect(res.status).toBe(200);
    expect(res.body.shipment.status).toBe('CANCELLED');
  });

  it('rejects cancellation of DELIVERED shipment', async () => {
    mockPrisma.courierShipment.findUnique.mockResolvedValueOnce({
      id: 11, status: 'DELIVERED', companyId: 1,
    });

    const res = await request(app).post('/api/courier/shipments/11/cancel');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('DELIVERED');
  });

  it('rejects cancellation of already CANCELLED shipment', async () => {
    mockPrisma.courierShipment.findUnique.mockResolvedValueOnce({
      id: 12, status: 'CANCELLED', companyId: 1,
    });

    const res = await request(app).post('/api/courier/shipments/12/cancel');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('CANCELLED');
  });

  it('returns 404 for non-existent shipment', async () => {
    mockPrisma.courierShipment.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).post('/api/courier/shipments/999/cancel');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/courier/rates', () => {
  it('returns 400 when query params are missing', async () => {
    const res = await request(app).get('/api/courier/rates');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('calls service with correct parameters', async () => {
    mockedService.getShippingRates.mockResolvedValueOnce([
      { courierId: 1, courierName: 'Delhivery', rate: 85, estimatedDays: 3, codAvailable: false },
      { courierId: 2, courierName: 'BlueDart', rate: 120, estimatedDays: 2, codAvailable: true },
    ]);

    const res = await request(app)
      .get('/api/courier/rates')
      .query({ pickupPincode: '400001', deliveryPincode: '411001', weightGrams: '200' });

    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(2);
    expect(mockedService.getShippingRates).toHaveBeenCalledWith('400001', '411001', 0.2);
  });
});

describe('POST /api/courier/webhook', () => {
  it('returns 200 for unknown AWB (prevents retries)', async () => {
    mockPrisma.courierShipment.findFirst.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/courier/webhook')
      .send({ awb: 'UNKNOWN123', current_status_id: 18, current_status: 'IN TRANSIT' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 when awb is missing', async () => {
    const res = await request(app)
      .post('/api/courier/webhook')
      .send({ current_status_id: 18 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('awb');
  });

  it('updates shipment status on valid webhook', async () => {
    mockPrisma.courierShipment.findFirst.mockResolvedValueOnce({
      id: 20, status: 'IN_TRANSIT', entityType: 'RepairJob', entityId: 5,
      awbNumber: 'AWB001', courierCharges: null, courierPartner: null,
    });
    mockPrisma.courierShipment.update.mockResolvedValueOnce({
      id: 20, status: 'PICKED_UP',
    });

    const res = await request(app)
      .post('/api/courier/webhook')
      .send({ awb: 'AWB001', current_status_id: 6, courier_name: 'Delhivery' });

    expect(res.status).toBe(200);
    const updateCall = mockPrisma.courierShipment.update.mock.calls[0][0];
    expect(updateCall.where.id).toBe(20);
    expect(updateCall.data.status).toBe('PICKED_UP');
    expect(updateCall.data.courierPartner).toBe('Delhivery');
  });

  it('sets pickedUpAt timestamp on PICKED_UP status', async () => {
    mockPrisma.courierShipment.findFirst.mockResolvedValueOnce({
      id: 21, status: 'PICKUP_SCHEDULED', entityType: 'RepairJob', entityId: 6,
      awbNumber: 'AWB002', courierCharges: null, pickedUpAt: null,
    });
    mockPrisma.courierShipment.update.mockResolvedValueOnce({ id: 21 });

    await request(app)
      .post('/api/courier/webhook')
      .send({ awb: 'AWB002', current_status_id: 6 });

    const updateData = mockPrisma.courierShipment.update.mock.calls[0][0].data;
    expect(updateData.pickedUpAt).toBeInstanceOf(Date);
  });

  it('sets deliveredAt and creates COURIER charge on DELIVERED', async () => {
    mockPrisma.courierShipment.findFirst.mockResolvedValueOnce({
      id: 22, status: 'OUT_FOR_DELIVERY', entityType: 'RepairJob', entityId: 7,
      awbNumber: 'AWB003', courierCharges: 200, deliveredAt: null,
    });
    mockPrisma.courierShipment.update.mockResolvedValueOnce({ id: 22 });
    mockPrisma.repairCharge.findFirst.mockResolvedValueOnce(null); // no existing charge
    mockPrisma.repairCharge.create.mockResolvedValueOnce({ id: 100 });

    await request(app)
      .post('/api/courier/webhook')
      .send({ awb: 'AWB003', current_status_id: 7, courier_name: 'BlueDart' });

    const updateData = mockPrisma.courierShipment.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('DELIVERED');
    expect(updateData.deliveredAt).toBeInstanceOf(Date);

    // Should create COURIER charge
    expect(mockPrisma.repairCharge.create).toHaveBeenCalledTimes(1);
    const chargeData = mockPrisma.repairCharge.create.mock.calls[0][0].data;
    expect(chargeData.chargeType).toBe('COURIER');
    expect(Number(chargeData.rate)).toBe(200);
    expect(Number(chargeData.gstPercent)).toBe(18);
    expect(chargeData.repairJobId).toBe(7);
  });

  it('does not create duplicate COURIER charge', async () => {
    mockPrisma.courierShipment.findFirst.mockResolvedValueOnce({
      id: 23, status: 'IN_TRANSIT', entityType: 'RepairJob', entityId: 8,
      awbNumber: 'AWB004', courierCharges: 150, deliveredAt: null,
    });
    mockPrisma.courierShipment.update.mockResolvedValueOnce({ id: 23 });
    // Existing charge found
    mockPrisma.repairCharge.findFirst.mockResolvedValueOnce({
      id: 50, chargeType: 'COURIER', description: 'Courier charges (Shipment #23, AWB: AWB004)',
    });

    await request(app)
      .post('/api/courier/webhook')
      .send({ awb: 'AWB004', current_status_id: 7 });

    expect(mockPrisma.repairCharge.create).not.toHaveBeenCalled();
  });

  it('stores estimatedDelivery from webhook etd field', async () => {
    mockPrisma.courierShipment.findFirst.mockResolvedValueOnce({
      id: 24, status: 'PICKED_UP', entityType: 'RepairJob', entityId: 9,
      awbNumber: 'AWB005', courierCharges: null,
    });
    mockPrisma.courierShipment.update.mockResolvedValueOnce({ id: 24 });

    await request(app)
      .post('/api/courier/webhook')
      .send({ awb: 'AWB005', current_status_id: 18, etd: '2026-06-05 14:00:00' });

    const updateData = mockPrisma.courierShipment.update.mock.calls[0][0].data;
    expect(updateData.estimatedDelivery).toBeInstanceOf(Date);
  });
});
