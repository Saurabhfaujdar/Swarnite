/**
 * CourierShipmentPanel — reusable panel showing shipment tracking status.
 * Used in repair detail, stock request detail, etc.
 */
import { useQuery } from '@tanstack/react-query';
import { courierAPI } from '../lib/api';
import { Truck, ExternalLink, XCircle } from 'lucide-react';

interface Props {
  entityType: string;
  entityId: number;
  onCancel?: (shipmentId: number) => void;
}

const STATUS_COLORS: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-700',
  PICKUP_SCHEDULED: 'bg-blue-100 text-blue-700',
  PICKED_UP: 'bg-indigo-100 text-indigo-700',
  IN_TRANSIT: 'bg-yellow-100 text-yellow-800',
  OUT_FOR_DELIVERY: 'bg-orange-100 text-orange-700',
  DELIVERED: 'bg-green-100 text-green-700',
  RTO: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-200 text-gray-500',
};

export default function CourierShipmentPanel({ entityType, entityId, onCancel }: Props) {
  const { data } = useQuery({
    queryKey: ['courier-shipments', entityType, entityId],
    queryFn: () => courierAPI.listShipments({ entityType, entityId }).then((r: any) => r.data?.shipments || []),
  });

  const shipments = data || [];

  if (shipments.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold flex items-center gap-1 text-gray-600">
        <Truck size={12} /> Courier Shipments
      </h3>
      {shipments.map((s: any) => (
        <div key={s.id} className="border rounded p-2 text-xs bg-gray-50">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[s.status] || ''}`}>
                {s.status.replace(/_/g, ' ')}
              </span>
              <span className="text-gray-500">{s.shipmentType.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex items-center gap-1">
              {s.trackingUrl && (
                <a href={s.trackingUrl} target="_blank" rel="noreferrer"
                  className="text-blue-600 hover:text-blue-800">
                  <ExternalLink size={11} />
                </a>
              )}
              {!['DELIVERED', 'CANCELLED', 'RTO'].includes(s.status) && onCancel && (
                <button onClick={() => onCancel(s.id)}
                  className="text-red-500 hover:text-red-700" title="Cancel shipment">
                  <XCircle size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-[11px] text-gray-600">
            {s.courierPartner && <span>Courier: <b>{s.courierPartner}</b></span>}
            {s.awbNumber && <span>AWB: <b>{s.awbNumber}</b></span>}
            {s.estimatedDelivery && <span>ETA: {new Date(s.estimatedDelivery).toLocaleDateString('en-IN')}</span>}
            {s.courierCharges && <span>Cost: ₹{Number(s.courierCharges).toFixed(0)}</span>}
          </div>
          {s.deliveredAt && (
            <div className="text-[10px] text-green-600 mt-1">
              Delivered on {new Date(s.deliveredAt).toLocaleDateString('en-IN')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
