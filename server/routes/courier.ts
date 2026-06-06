/**
 * Courier Routes
 * ─────────────
 * Manages courier shipments: creation, tracking, rate checking, webhooks.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { config } from '../config';
import * as courierService from '../services/courier';
import { authenticate } from '../middleware/branchAccess';

const router = Router();

// Apply auth to all routes except webhook (which uses x-api-key)
router.use((req, res, next) => {
  if (req.path === '/webhook') return next();
  return authenticate(req, res, next);
});

// ─── Get shipping rates ──────────────────────────────────────

router.get('/rates', async (req: Request, res: Response) => {
  try {
    const { pickupPincode, deliveryPincode, weightGrams } = req.query;

    if (!pickupPincode || !deliveryPincode || !weightGrams) {
      return res.status(400).json({ error: 'pickupPincode, deliveryPincode, and weightGrams are required' });
    }

    const weightKg = Number(weightGrams) / 1000;
    const rates = await courierService.getShippingRates(
      String(pickupPincode),
      String(deliveryPincode),
      weightKg,
    );

    res.json({ rates });
  } catch (err: any) {
    logger.error('courier.getRates failed', { err: err.message });
    res.status(500).json({ error: err.message || 'Failed to fetch rates' });
  }
});

// ─── Create a shipment ───────────────────────────────────────

router.post('/shipments', async (req: Request, res: Response) => {
  try {
    const {
      shipmentType, entityType, entityId,
      pickup, delivery,
      weightGrams, declaredValue, productName,
      courierId,
    } = req.body;

    const companyId = (req as any).companyId;
    const branchId = (req as any).branchId;

    if (!shipmentType || !entityType || !entityId || !pickup || !delivery) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate pincode format (6-digit Indian)
    if (!/^\d{6}$/.test(pickup.pincode) || !/^\d{6}$/.test(delivery.pincode)) {
      return res.status(400).json({ error: 'Invalid pincode format (must be 6 digits)' });
    }

    const orderId = `JERP-${entityType}-${entityId}-${Date.now()}`;
    const weightKg = (Number(weightGrams) || 100) / 1000;

    // Create shipment in Shiprocket
    let srOrder: any = null;
    let awbNumber: string | null = null;
    let courierPartner: string | null = null;
    let shiprocketOrderId: string | null = null;
    let shiprocketShipmentId: string | null = null;

    if (config.shiprocketEnabled) {
      srOrder = await courierService.createShipment({
        orderId,
        pickup,
        delivery,
        weightKg,
        declaredValue: Number(declaredValue) || 0,
        productName: productName || 'Jewelry Item',
      });

      shiprocketOrderId = String(srOrder.order_id || '');
      shiprocketShipmentId = String(srOrder.shipment_id || '');

      // Auto-assign courier if courierId provided
      if (courierId && shiprocketShipmentId) {
        const assigned = await courierService.assignCourier(shiprocketShipmentId, courierId);
        awbNumber = assigned?.response?.data?.awb_code || null;
        courierPartner = assigned?.response?.data?.courier_name || null;
      }
    }

    // Save to database
    const shipment = await prisma.courierShipment.create({
      data: {
        shipmentType,
        status: 'CREATED',
        entityType,
        entityId: Number(entityId),
        companyId,
        branchId,
        courierPartner,
        awbNumber,
        shiprocketOrderId,
        shiprocketShipmentId,
        pickupAddress: pickup,
        deliveryAddress: delivery,
        weightGrams: Number(weightGrams) || null,
        declaredValue: Number(declaredValue) || null,
        courierCharges: null,
        createdById: (req as any).userId || null,
      },
    });

    logger.info('Courier shipment created', {
      shipmentId: shipment.id, shipmentType, entityType, entityId, awbNumber,
    });

    res.status(201).json({ shipment });
  } catch (err: any) {
    logger.error('courier.createShipment failed', { err: err.message, stack: err.stack });
    res.status(500).json({ error: err.message || 'Failed to create shipment' });
  }
});

// ─── List shipments for an entity ────────────────────────────

router.get('/shipments', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.query;

    const where: any = { companyId: (req as any).companyId };
    if (entityType) where.entityType = String(entityType);
    if (entityId) where.entityId = Number(entityId);

    const shipments = await prisma.courierShipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ shipments });
  } catch (err: any) {
    logger.error('courier.listShipments failed', { err: err.message });
    res.status(500).json({ error: 'Failed to list shipments' });
  }
});

// ─── Get shipment detail + tracking ──────────────────────────

router.get('/shipments/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const shipment = await prisma.courierShipment.findUnique({ where: { id } });

    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

    // Fetch live tracking if AWB exists and Shiprocket is enabled
    let tracking = null;
    if (shipment.awbNumber && config.shiprocketEnabled) {
      try {
        tracking = await courierService.getTracking(shipment.awbNumber);
      } catch {
        // Non-fatal — return shipment without live tracking
      }
    }

    res.json({ shipment, tracking });
  } catch (err: any) {
    logger.error('courier.getShipment failed', { err: err.message });
    res.status(500).json({ error: 'Failed to get shipment' });
  }
});

// ─── Cancel a shipment ───────────────────────────────────────

router.post('/shipments/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const shipment = await prisma.courierShipment.findUnique({ where: { id } });

    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    if (shipment.status === 'DELIVERED' || shipment.status === 'CANCELLED') {
      return res.status(400).json({ error: `Cannot cancel shipment in ${shipment.status} status` });
    }

    // Cancel in Shiprocket
    if (shipment.shiprocketOrderId && config.shiprocketEnabled) {
      await courierService.cancelShipment(shipment.shiprocketOrderId);
    }

    const updated = await prisma.courierShipment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    logger.info('Courier shipment cancelled', { shipmentId: id });
    res.json({ shipment: updated });
  } catch (err: any) {
    logger.error('courier.cancelShipment failed', { err: err.message });
    res.status(500).json({ error: err.message || 'Failed to cancel shipment' });
  }
});

// ─── Webhook (from Shiprocket) ───────────────────────────────

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    // Verify webhook token
    const token = req.headers['x-api-key'] || req.headers['authorization'];
    if (config.shiprocketWebhookToken && token !== config.shiprocketWebhookToken) {
      logger.warn('Courier webhook: invalid token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body;
    const awb = payload.awb;
    const statusId = payload.current_status_id;

    if (!awb) {
      return res.status(400).json({ error: 'Missing awb in webhook payload' });
    }

    const shipment = await prisma.courierShipment.findFirst({
      where: { awbNumber: String(awb) },
    });

    if (!shipment) {
      logger.warn('Courier webhook: no shipment found for AWB', { awb });
      return res.status(200).json({ ok: true }); // Don't retry
    }

    const newStatus = courierService.mapShiprocketStatus(statusId);

    const updateData: any = {
      status: newStatus,
      lastWebhookPayload: payload,
      lastWebhookAt: new Date(),
      courierPartner: payload.courier_name || shipment.courierPartner,
    };

    if (newStatus === 'PICKED_UP' && !shipment.pickedUpAt) {
      updateData.pickedUpAt = new Date();
    }
    if (newStatus === 'DELIVERED' && !shipment.deliveredAt) {
      updateData.deliveredAt = new Date();
    }
    if (payload.etd) {
      updateData.estimatedDelivery = new Date(payload.etd);
    }

    await prisma.courierShipment.update({
      where: { id: shipment.id },
      data: updateData,
    });

    // If delivered and it's a repair shipment, auto-create courier charge
    if (newStatus === 'DELIVERED' && shipment.entityType === 'RepairJob' && shipment.courierCharges) {
      const existingCharge = await prisma.repairCharge.findFirst({
        where: {
          repairJobId: shipment.entityId,
          chargeType: 'COURIER',
          description: { contains: String(shipment.id) },
        },
      });

      if (!existingCharge) {
        await prisma.repairCharge.create({
          data: {
            repairJobId: shipment.entityId,
            chargeType: 'COURIER',
            description: `Courier charges (Shipment #${shipment.id}, AWB: ${awb})`,
            quantity: 1,
            rate: shipment.courierCharges,
            amount: shipment.courierCharges,
            gstApplicable: true,
            gstPercent: 18, // Courier GST is 18%
          },
        });
        logger.info('Auto-created COURIER charge for repair', {
          repairJobId: shipment.entityId, amount: shipment.courierCharges,
        });
      }
    }

    logger.info('Courier webhook processed', {
      awb, shipmentId: shipment.id, oldStatus: shipment.status, newStatus,
    });

    res.status(200).json({ ok: true });
  } catch (err: any) {
    logger.error('courier.webhook failed', { err: err.message, stack: err.stack });
    res.status(200).json({ ok: true }); // Return 200 to prevent retries
  }
});

export default router;
