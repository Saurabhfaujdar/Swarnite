/**
 * Shiprocket Courier Service
 * ─────────────────────────
 * Wraps Shiprocket REST API for shipment creation, tracking, rate
 * comparison, pickup scheduling, and cancellation.
 *
 * Shiprocket API docs: https://apidocs.shiprocket.in/
 */

import { config } from '../config';
import { logger } from '../logger';

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

// ─── Token management ───────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0; // unix ms

async function getAuthToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  if (!config.shiprocketEmail || !config.shiprocketPassword) {
    throw new Error('Shiprocket credentials not configured');
  }

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: config.shiprocketEmail,
      password: config.shiprocketPassword,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error('Shiprocket auth failed', { status: res.status, body });
    throw new Error(`Shiprocket auth failed: ${res.status}`);
  }

  const data: any = await res.json();
  cachedToken = data.token;
  // Shiprocket tokens are valid for 10 days; refresh after 9
  tokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000;
  return cachedToken!;
}

async function apiRequest(method: string, path: string, body?: any): Promise<any> {
  const token = await getAuthToken();
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    logger.error('Shiprocket API error', { path, status: res.status, data });
    throw new Error(`Shiprocket ${path} failed: ${res.status} – ${JSON.stringify(data)}`);
  }
  return data;
}

// ─── Public API ─────────────────────────────────────────────

export interface ShipmentAddress {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
}

export interface CreateShipmentParams {
  /** Internal order reference (must be unique across Shiprocket) */
  orderId: string;
  pickup: ShipmentAddress;
  delivery: ShipmentAddress;
  /** Weight in kg */
  weightKg: number;
  /** Dimensions in cm */
  lengthCm?: number;
  breadthCm?: number;
  heightCm?: number;
  /** Declared value for insurance (INR) */
  declaredValue: number;
  /** Brief product description */
  productName: string;
  /** Payment mode — always PREPAID for B2B (karigar/branch) */
  paymentMode?: 'PREPAID' | 'COD';
}

export interface ShipmentRateOption {
  courierId: number;
  courierName: string;
  rate: number;
  estimatedDays: number;
  codAvailable: boolean;
}

/**
 * Create a Shiprocket order (shipment).
 * Returns { order_id, shipment_id, awb_code, courier_name }
 */
export async function createShipment(params: CreateShipmentParams) {
  const orderPayload = {
    order_id: params.orderId,
    order_date: new Date().toISOString().slice(0, 10),
    pickup_location: 'Primary', // Will be overridden by pickup address
    billing_customer_name: params.delivery.name,
    billing_last_name: '',
    billing_address: params.delivery.address,
    billing_city: params.delivery.city,
    billing_pincode: params.delivery.pincode,
    billing_state: params.delivery.state,
    billing_country: 'India',
    billing_phone: params.delivery.phone,
    shipping_is_billing: true,
    order_items: [
      {
        name: params.productName,
        sku: params.orderId,
        units: 1,
        selling_price: params.declaredValue,
      },
    ],
    payment_method: params.paymentMode || 'PREPAID',
    sub_total: params.declaredValue,
    weight: params.weightKg,
    length: params.lengthCm || 10,
    breadth: params.breadthCm || 10,
    height: params.heightCm || 5,
  };

  const order = await apiRequest('POST', '/orders/create/adhoc', orderPayload);
  logger.info('Shiprocket order created', { orderId: params.orderId, srOrderId: order.order_id });
  return order;
}

/**
 * Get available shipping rates for a pickup→delivery route.
 */
export async function getShippingRates(
  pickupPincode: string,
  deliveryPincode: string,
  weightKg: number,
  codAmount?: number,
): Promise<ShipmentRateOption[]> {
  const params = new URLSearchParams({
    pickup_postcode: pickupPincode,
    delivery_postcode: deliveryPincode,
    weight: String(weightKg),
    cod: codAmount ? '1' : '0',
  });

  const data = await apiRequest('GET', `/courier/serviceability/?${params}`);

  const couriers = data?.data?.available_courier_companies || [];
  return couriers.map((c: any) => ({
    courierId: c.courier_company_id,
    courierName: c.courier_name,
    rate: c.rate,
    estimatedDays: c.estimated_delivery_days,
    codAvailable: c.cod === 1,
  }));
}

/**
 * Assign a specific courier to an order (generates AWB).
 */
export async function assignCourier(shiprocketShipmentId: string, courierId: number) {
  return apiRequest('POST', '/courier/assign/awb', {
    shipment_id: shiprocketShipmentId,
    courier_id: courierId,
  });
}

/**
 * Schedule a pickup for a shipment.
 */
export async function schedulePickup(shiprocketShipmentId: string) {
  return apiRequest('POST', '/courier/generate/pickup', {
    shipment_id: [shiprocketShipmentId],
  });
}

/**
 * Get tracking data for an AWB.
 */
export async function getTracking(awbNumber: string) {
  return apiRequest('GET', `/courier/track/awb/${awbNumber}`);
}

/**
 * Cancel a shipment/order before pickup.
 */
export async function cancelShipment(shiprocketOrderId: string) {
  return apiRequest('POST', '/orders/cancel', {
    ids: [shiprocketOrderId],
  });
}

/**
 * Map Shiprocket status IDs to our internal enum values.
 */
export function mapShiprocketStatus(statusId: number): string {
  const map: Record<number, string> = {
    1: 'CREATED',        // AWB Assigned
    2: 'CREATED',        // Label Generated
    3: 'PICKUP_SCHEDULED', // Pickup Scheduled
    4: 'PICKUP_SCHEDULED', // Pickup Queued
    5: 'CREATED',        // Manifest Generated
    6: 'PICKED_UP',      // Shipped/Picked Up
    7: 'DELIVERED',      // Delivered
    8: 'CANCELLED',      // Cancelled
    9: 'RTO',            // RTO Initiated
    10: 'RTO',           // RTO Delivered
    12: 'RTO',           // Lost
    13: 'OUT_FOR_DELIVERY', // Pickup Error (retry)
    14: 'RTO',           // RTO Acknowledged
    17: 'OUT_FOR_DELIVERY', // Out for Delivery
    18: 'IN_TRANSIT',    // In Transit
    19: 'IN_TRANSIT',    // Out for Pickup
    20: 'IN_TRANSIT',    // In Transit (generic)
    38: 'PICKUP_SCHEDULED', // Reached at Destination Hub
    42: 'PICKED_UP',     // Picked Up
  };
  return map[statusId] || 'IN_TRANSIT';
}
