/**
 * CreateShipmentModal — modal to create a courier shipment.
 * Auto-fills pickup/delivery addresses, shows rate comparison.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { courierAPI } from '../lib/api';
import { Truck, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Address {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  shipmentType: string;
  entityType: string;
  entityId: number;
  pickup: Partial<Address>;
  delivery: Partial<Address>;
  weightGrams?: number;
  declaredValue?: number;
  productName?: string;
}

export default function CreateShipmentModal({
  open, onClose, shipmentType, entityType, entityId,
  pickup: initialPickup, delivery: initialDelivery,
  weightGrams: initialWeight, declaredValue: initialValue, productName,
}: Props) {
  const queryClient = useQueryClient();

  const [pickup, setPickup] = useState<Address>({
    name: initialPickup.name || '',
    phone: initialPickup.phone || '',
    address: initialPickup.address || '',
    city: initialPickup.city || '',
    state: initialPickup.state || '',
    pincode: initialPickup.pincode || '',
    landmark: initialPickup.landmark || '',
  });

  const [delivery, setDelivery] = useState<Address>({
    name: initialDelivery.name || '',
    phone: initialDelivery.phone || '',
    address: initialDelivery.address || '',
    city: initialDelivery.city || '',
    state: initialDelivery.state || '',
    pincode: initialDelivery.pincode || '',
    landmark: initialDelivery.landmark || '',
  });

  const [weightGrams, setWeightGrams] = useState(initialWeight || 100);
  const [declaredValue, setDeclaredValue] = useState(initialValue || 0);
  const [selectedCourier, setSelectedCourier] = useState<number | null>(null);

  // Fetch rates when both pincodes are valid
  const canFetchRates = /^\d{6}$/.test(pickup.pincode) && /^\d{6}$/.test(delivery.pincode) && weightGrams > 0;

  const { data: ratesData, isLoading: ratesLoading } = useQuery({
    queryKey: ['courier-rates', pickup.pincode, delivery.pincode, weightGrams],
    queryFn: () => courierAPI.rates({
      pickupPincode: pickup.pincode,
      deliveryPincode: delivery.pincode,
      weightGrams,
    }).then((r: any) => r.data?.rates || []),
    enabled: canFetchRates,
  });

  const rates = ratesData || [];

  const createMu = useMutation({
    mutationFn: () => courierAPI.createShipment({
      shipmentType, entityType, entityId,
      pickup, delivery,
      weightGrams, declaredValue, productName,
      courierId: selectedCourier,
    }),
    onSuccess: () => {
      toast.success('Shipment created successfully');
      queryClient.invalidateQueries({ queryKey: ['courier-shipments', entityType, entityId] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create shipment');
    },
  });

  if (!open) return null;

  const isValid = pickup.name && pickup.phone && pickup.pincode && delivery.name && delivery.phone && delivery.pincode;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Truck size={16} /> Create Courier Shipment
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {/* Addresses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pickup */}
            <fieldset className="border rounded p-2 space-y-1.5">
              <legend className="text-xs font-semibold text-gray-500 px-1">Pickup (From)</legend>
              <input className="border rounded px-2 py-1 w-full" placeholder="Name *"
                value={pickup.name} onChange={e => setPickup(p => ({ ...p, name: e.target.value }))} />
              <input className="border rounded px-2 py-1 w-full" placeholder="Phone *"
                value={pickup.phone} onChange={e => setPickup(p => ({ ...p, phone: e.target.value }))} />
              <input className="border rounded px-2 py-1 w-full" placeholder="Address"
                value={pickup.address} onChange={e => setPickup(p => ({ ...p, address: e.target.value }))} />
              <div className="grid grid-cols-3 gap-1">
                <input className="border rounded px-2 py-1" placeholder="City"
                  value={pickup.city} onChange={e => setPickup(p => ({ ...p, city: e.target.value }))} />
                <input className="border rounded px-2 py-1" placeholder="State"
                  value={pickup.state} onChange={e => setPickup(p => ({ ...p, state: e.target.value }))} />
                <input className="border rounded px-2 py-1" placeholder="Pincode *"
                  value={pickup.pincode} onChange={e => setPickup(p => ({ ...p, pincode: e.target.value }))} />
              </div>
            </fieldset>

            {/* Delivery */}
            <fieldset className="border rounded p-2 space-y-1.5">
              <legend className="text-xs font-semibold text-gray-500 px-1">Delivery (To)</legend>
              <input className="border rounded px-2 py-1 w-full" placeholder="Name *"
                value={delivery.name} onChange={e => setDelivery(p => ({ ...p, name: e.target.value }))} />
              <input className="border rounded px-2 py-1 w-full" placeholder="Phone *"
                value={delivery.phone} onChange={e => setDelivery(p => ({ ...p, phone: e.target.value }))} />
              <input className="border rounded px-2 py-1 w-full" placeholder="Address"
                value={delivery.address} onChange={e => setDelivery(p => ({ ...p, address: e.target.value }))} />
              <div className="grid grid-cols-3 gap-1">
                <input className="border rounded px-2 py-1" placeholder="City"
                  value={delivery.city} onChange={e => setDelivery(p => ({ ...p, city: e.target.value }))} />
                <input className="border rounded px-2 py-1" placeholder="State"
                  value={delivery.state} onChange={e => setDelivery(p => ({ ...p, state: e.target.value }))} />
                <input className="border rounded px-2 py-1" placeholder="Pincode *"
                  value={delivery.pincode} onChange={e => setDelivery(p => ({ ...p, pincode: e.target.value }))} />
              </div>
            </fieldset>
          </div>

          {/* Package details */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col">
              Weight (grams)
              <input type="number" className="border rounded px-2 py-1"
                value={weightGrams} onChange={e => setWeightGrams(Number(e.target.value))} />
            </label>
            <label className="flex flex-col">
              Declared Value (₹)
              <input type="number" className="border rounded px-2 py-1"
                value={declaredValue} onChange={e => setDeclaredValue(Number(e.target.value))} />
            </label>
          </div>

          {/* Rate comparison */}
          {canFetchRates && (
            <div>
              <h3 className="font-semibold text-xs mb-1">Available Couriers</h3>
              {ratesLoading && <p className="text-gray-400">Checking rates…</p>}
              {rates.length > 0 && (
                <div className="space-y-1 max-h-36 overflow-auto">
                  {rates.map((r: any) => (
                    <label key={r.courierId}
                      className={`flex items-center justify-between border rounded px-2 py-1.5 cursor-pointer hover:bg-blue-50 ${selectedCourier === r.courierId ? 'border-blue-400 bg-blue-50' : ''}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="courier" checked={selectedCourier === r.courierId}
                          onChange={() => setSelectedCourier(r.courierId)} />
                        <span className="font-medium">{r.courierName}</span>
                        <span className="text-gray-400">~{r.estimatedDays} days</span>
                      </div>
                      <span className="font-semibold">₹{r.rate}</span>
                    </label>
                  ))}
                </div>
              )}
              {!ratesLoading && rates.length === 0 && (
                <p className="text-gray-400">No couriers available for this route</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
          <button
            onClick={() => createMu.mutate()}
            disabled={!isValid || createMu.isPending}
            className="px-4 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded disabled:opacity-50"
          >
            {createMu.isPending ? 'Creating…' : 'Create Shipment'}
          </button>
        </div>
      </div>
    </div>
  );
}
