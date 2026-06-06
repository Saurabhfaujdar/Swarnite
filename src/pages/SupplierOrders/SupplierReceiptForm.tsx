/**
 * SupplierReceiptForm
 * ───────────────────
 * Modal/inline form to record goods receipt against an order.
 */
import { useState } from 'react';
import { Package } from 'lucide-react';

interface OrderItem {
  id: number;
  category: string;
  ornamentType?: string | null;
  orderedQty: number;
  orderedGrossWeight: number;
  orderedNetWeight: number;
}

interface Props {
  orderItems: OrderItem[];
  onSubmit: (data: any) => void;
  isPending: boolean;
  onCancel: () => void;
}

interface ReceiptRow {
  supplierOrderItemId: number;
  receivedQty: number;
  receivedGrossWeight: string;
  receivedNetWeight: string;
  receivedPurity: string;
}

export default function SupplierReceiptForm({ orderItems, onSubmit, isPending, onCancel }: Props) {
  const [packageReference, setPackageReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rows, setRows] = useState<ReceiptRow[]>(
    orderItems.map(item => ({
      supplierOrderItemId: item.id,
      receivedQty: item.orderedQty,
      receivedGrossWeight: String(item.orderedGrossWeight),
      receivedNetWeight: String(item.orderedNetWeight),
      receivedPurity: '',
    }))
  );

  const updateRow = (idx: number, field: keyof ReceiptRow, value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const items = rows
      .filter(r => Number(r.receivedNetWeight) > 0)
      .map(r => ({
        supplierOrderItemId: r.supplierOrderItemId,
        receivedQty: Number(r.receivedQty),
        receivedGrossWeight: Number(r.receivedGrossWeight),
        receivedNetWeight: Number(r.receivedNetWeight),
        receivedPurity: r.receivedPurity ? Number(r.receivedPurity) : undefined,
      }));
    if (items.length === 0) return;
    onSubmit({ packageReference: packageReference || undefined, remarks: remarks || undefined, items });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Package size={16} /> Record Goods Receipt
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-gray-500">Package Reference</label>
          <input
            className="w-full border rounded px-2 py-1 text-xs"
            value={packageReference} onChange={e => setPackageReference(e.target.value)}
            placeholder="e.g. PKG-001"
          />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">Remarks</label>
          <input
            className="w-full border rounded px-2 py-1 text-xs"
            value={remarks} onChange={e => setRemarks(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-600">
              <th className="text-left px-2 py-1">Item</th>
              <th className="text-right px-2 py-1">Ordered</th>
              <th className="text-right px-2 py-1">Rcvd Qty</th>
              <th className="text-right px-2 py-1">Rcvd Gross (g)</th>
              <th className="text-right px-2 py-1">Rcvd Net (g)</th>
              <th className="text-right px-2 py-1">Purity %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const item = orderItems.find(oi => oi.id === row.supplierOrderItemId);
              return (
                <tr key={row.supplierOrderItemId} className="border-b border-gray-100">
                  <td className="px-2 py-1">
                    {item?.category} {item?.ornamentType ? `/ ${item.ornamentType}` : ''}
                  </td>
                  <td className="px-2 py-1 text-right text-gray-500">
                    {item?.orderedNetWeight}g × {item?.orderedQty}
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min="0" className="w-14 border rounded px-1 py-0.5 text-right text-xs"
                      value={row.receivedQty}
                      onChange={e => updateRow(idx, 'receivedQty', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.01" className="w-20 border rounded px-1 py-0.5 text-right text-xs"
                      value={row.receivedGrossWeight}
                      onChange={e => updateRow(idx, 'receivedGrossWeight', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.01" className="w-20 border rounded px-1 py-0.5 text-right text-xs"
                      value={row.receivedNetWeight}
                      onChange={e => updateRow(idx, 'receivedNetWeight', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.1" className="w-16 border rounded px-1 py-0.5 text-right text-xs"
                      value={row.receivedPurity}
                      onChange={e => updateRow(idx, 'receivedPurity', e.target.value)}
                      placeholder="91.6" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={isPending}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {isPending ? 'Saving...' : 'Record Receipt'}
        </button>
      </div>
    </form>
  );
}
