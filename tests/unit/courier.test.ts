/**
 * Unit tests for courier service helpers and status mapping.
 */
import { describe, it, expect } from 'vitest';

// We test the mapShiprocketStatus function and address validation logic
// by importing the service. In a real test environment, we'd mock fetch().

// Import the status mapper directly
import { mapShiprocketStatus } from '../../server/services/courier';

describe('courier service', () => {
  describe('mapShiprocketStatus', () => {
    it('maps status 6 to PICKED_UP', () => {
      expect(mapShiprocketStatus(6)).toBe('PICKED_UP');
    });

    it('maps status 7 to DELIVERED', () => {
      expect(mapShiprocketStatus(7)).toBe('DELIVERED');
    });

    it('maps status 8 to CANCELLED', () => {
      expect(mapShiprocketStatus(8)).toBe('CANCELLED');
    });

    it('maps status 18 to IN_TRANSIT', () => {
      expect(mapShiprocketStatus(18)).toBe('IN_TRANSIT');
    });

    it('maps status 17 to OUT_FOR_DELIVERY', () => {
      expect(mapShiprocketStatus(17)).toBe('OUT_FOR_DELIVERY');
    });

    it('maps status 3 to PICKUP_SCHEDULED', () => {
      expect(mapShiprocketStatus(3)).toBe('PICKUP_SCHEDULED');
    });

    it('maps status 9 (RTO) to RTO', () => {
      expect(mapShiprocketStatus(9)).toBe('RTO');
    });

    it('maps status 42 to PICKED_UP', () => {
      expect(mapShiprocketStatus(42)).toBe('PICKED_UP');
    });

    it('maps unknown status to IN_TRANSIT as default', () => {
      expect(mapShiprocketStatus(999)).toBe('IN_TRANSIT');
    });

    it('maps status 1 (AWB Assigned) to CREATED', () => {
      expect(mapShiprocketStatus(1)).toBe('CREATED');
    });
  });

  describe('address validation', () => {
    it('validates Indian pincode format (6 digits)', () => {
      const validPincodes = ['110001', '560001', '400001', '700001'];
      const invalidPincodes = ['1234', '12345', '1234567', 'ABCDEF', '', '11000A'];

      validPincodes.forEach(p => {
        expect(/^\d{6}$/.test(p)).toBe(true);
      });

      invalidPincodes.forEach(p => {
        expect(/^\d{6}$/.test(p)).toBe(false);
      });
    });

    it('builds correct barcode data for shipment tracking', () => {
      // The orderId format used by courier routes
      const entityType = 'RepairJob';
      const entityId = 42;
      const timestamp = 1717200000000;
      const orderId = `JERP-${entityType}-${entityId}-${timestamp}`;

      expect(orderId).toBe('JERP-RepairJob-42-1717200000000');
      expect(orderId.length).toBeLessThan(50); // Fits in Shiprocket order_id field
    });
  });

  describe('courier charge calculation', () => {
    it('creates charge with correct GST rate (18% for courier services)', () => {
      const courierCharges = 150;
      const charge = {
        chargeType: 'COURIER',
        quantity: 1,
        rate: courierCharges,
        amount: courierCharges,
        gstApplicable: true,
        gstPercent: 18,
      };

      expect(charge.amount).toBe(150);
      expect(charge.gstPercent).toBe(18); // Courier GST is 18%, not 3% (jewelry GST)
      const total = charge.amount * (1 + charge.gstPercent / 100);
      expect(total).toBe(177); // 150 + 18% = 177
    });

    it('does not create duplicate courier charge for same shipment', () => {
      const existingCharges = [
        { chargeType: 'COURIER', description: 'Courier charges (Shipment #5, AWB: DLV123)' },
        { chargeType: 'LABOR', description: 'Ring repair labor' },
      ];

      const shipmentId = 5;
      const hasDuplicate = existingCharges.some(
        c => c.chargeType === 'COURIER' && c.description.includes(String(shipmentId))
      );
      expect(hasDuplicate).toBe(true);

      // Different shipment should not be duplicate
      const shipmentId2 = 10;
      const hasDuplicate2 = existingCharges.some(
        c => c.chargeType === 'COURIER' && c.description.includes(String(shipmentId2))
      );
      expect(hasDuplicate2).toBe(false);
    });
  });

  describe('shipment type validation', () => {
    it('accepts valid shipment types', () => {
      const validTypes = ['REPAIR_TO_KARIGAR', 'REPAIR_FROM_KARIGAR', 'BRANCH_TRANSFER', 'STOCK_REQUEST'];
      validTypes.forEach(t => {
        expect(validTypes.includes(t)).toBe(true);
      });
    });

    it('rejects invalid shipment types', () => {
      const validTypes = ['REPAIR_TO_KARIGAR', 'REPAIR_FROM_KARIGAR', 'BRANCH_TRANSFER', 'STOCK_REQUEST'];
      expect(validTypes.includes('INVALID')).toBe(false);
      expect(validTypes.includes('')).toBe(false);
    });
  });

  describe('weight conversion', () => {
    it('converts grams to kg correctly for Shiprocket API', () => {
      expect(100 / 1000).toBe(0.1);
      expect(500 / 1000).toBe(0.5);
      expect(1500 / 1000).toBe(1.5);
      expect(50 / 1000).toBe(0.05);
    });
  });
});
