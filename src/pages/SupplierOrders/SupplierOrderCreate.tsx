/**
 * Supplier Order Create
 * ─────────────────────
 * Form to create a new supplier order (draft or send immediately).
 */
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supplierOrderAPI, accountsAPI, mastersAPI } from '../../lib/api';
import toast from 'react-hot-toast';
import { Plus, Trash2, Send, Save } from 'lucide-react';

interface ItemRow {
  key: number;
  category: string;
  ornamentType: string;
  metalTypeId: string;
  purity: string;
  orderedQty: string;
  orderedGrossWeight: string;
  orderedNetWeight: string;
  expectedWastagePercent: string;
  makingChargeType: string;
  makingChargeValue: string;
  designReference: string;
  stoneDetails: string;
  size: string;
  remarks: string;
}

let itemKeyCounter = 1;
function emptyRow(): ItemRow {
  return {
    key: itemKeyCounter++,
    category: '', ornamentType: '', metalTypeId: '', purity: '',
    orderedQty: '1', orderedGrossWeight: '', orderedNetWeight: '',
    expectedWastagePercent: '5', makingChargeType: 'PER_GRAM', makingChargeValue: '',
    designReference: '', stoneDetails: '', size: '', remarks: '',
  };
}

export default function SupplierOrderCreate() {
  const navigate = useNavigate();

  const { data: suppliersData } = useQuery({
    queryKey: ['accounts', 'suppliers'],
    queryFn: () => accountsAPI.list({ type: 'SUPPLIER', active: true }).then(r => r.data),
  });

  const { data: metalTypesData } = useQuery({
    queryKey: ['masters', 'metalTypes'],
    queryFn: () => mastersAPI.metalTypes().then(r => r.data),
  });

  const { data: puritiesData } = useQuery({
    queryKey: ['masters', 'purities'],
    queryFn: () => mastersAPI.purities().then(r => r.data),
  });

  const [supplierId, setSupplierId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);

  const suppliers = suppliersData?.rows || suppliersData?.accounts || [];
  const metalTypes = metalTypesData?.metalTypes || metalTypesData || [];
  const purities = Array.isArray(puritiesData) ? puritiesData : (puritiesData?.purities || []);

  const estimatedTotal = items.reduce((sum, it) => {
    const wt = Number(it.orderedNetWeight) || 0;
    const making = it.makingChargeType === 'PER_GRAM'
      ? wt * (Number(it.makingChargeValue) || 0)
      : Number(it.makingChargeValue) || 0;
    return sum + making;
  }, 0);

  const addRow = () => setItems(prev => [...prev, emptyRow()]);
  const removeRow = (key: number) => setItems(prev => prev.filter(r => r.key !== key));
  const updateItem = (key: number, field: keyof ItemRow, value: string) => {
    setItems(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  };

  const createMutation = useMutation({
    mutationFn: async (sendAfter: boolean) => {
      if (!supplierId) throw new Error('Select a supplier');
      const validItems = items.filter(i => i.category && i.metalTypeId);
      if (validItems.length === 0) throw new Error('Add at least one valid item');

      const res = await supplierOrderAPI.create({
        supplierId: Number(supplierId),
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        priority,
        notes: notes || undefined,
        estimatedAmount: estimatedTotal,
        items: validItems.map(i => ({
          category: i.category,
          ornamentType: i.ornamentType || undefined,
          metalTypeId: Number(i.metalTypeId),
          purity: i.purity || undefined,
          orderedQty: Number(i.orderedQty) || 1,
          orderedGrossWeight: Number(i.orderedGrossWeight) || 0,
          orderedNetWeight: Number(i.orderedNetWeight) || 0,
          expectedWastagePercent: Number(i.expectedWastagePercent) || 0,
          makingChargeType: i.makingChargeType || undefined,
          makingChargeValue: Number(i.makingChargeValue) || 0,
          designReference: i.designReference || undefined,
          stoneDetails: i.stoneDetails || undefined,
          size: i.size || undefined,
          remarks: i.remarks || undefined,
        })),
      });
      const order = res.data.order;

      if (sendAfter) {
        await supplierOrderAPI.send(order.id);
      }
      return order;
    },
    onSuccess: (order) => {
      toast.success(`Order ${order.orderNo} created`);
      navigate(`/supplier-orders/${order.id}`);
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || err?.message || 'Failed to create order'),
  });

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full max-w-5xl">
      <h1 className="text-lg font-semibold text-gray-800">New Supplier Order</h1>

      {/* Order Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="text-[11px] text-gray-500 block mb-0.5">Supplier *</label>
          <select className="w-full border rounded px-2 py-1.5 text-xs" required
            value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">— Select Supplier —</option>
            {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 block mb-0.5">Expected Delivery</label>
          <input type="date" className="w-full border rounded px-2 py-1.5 text-xs"
            value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 block mb-0.5">Priority</label>
          <select className="w-full border rounded px-2 py-1.5 text-xs"
            value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-[11px] text-gray-500 block mb-0.5">Notes</label>
        <textarea className="w-full border rounded px-2 py-1.5 text-xs" rows={2}
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Internal notes, special instructions..." />
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-gray-700">Order Items</h2>
          <button type="button" onClick={addRow}
            className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50">
            <Plus size={12} /> Add Item
          </button>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-600">
                <th className="text-left px-2 py-1.5">Category *</th>
                <th className="text-left px-2 py-1.5">Ornament Type</th>
                <th className="text-left px-2 py-1.5">Metal *</th>
                <th className="text-left px-2 py-1.5">Purity</th>
                <th className="text-right px-2 py-1.5">Qty</th>
                <th className="text-right px-2 py-1.5">Gross Wt</th>
                <th className="text-right px-2 py-1.5">Net Wt</th>
                <th className="text-right px-2 py-1.5">Wastage %</th>
                <th className="text-left px-2 py-1.5">Making</th>
                <th className="text-left px-2 py-1.5">Design Ref</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.key} className="border-b border-gray-100">
                  <td className="px-2 py-1">
                    <input className="w-24 border rounded px-1 py-0.5 text-xs"
                      value={item.category} onChange={e => updateItem(item.key, 'category', e.target.value)}
                      placeholder="Necklace" />
                  </td>
                  <td className="px-2 py-1">
                    <input className="w-24 border rounded px-1 py-0.5 text-xs"
                      value={item.ornamentType} onChange={e => updateItem(item.key, 'ornamentType', e.target.value)}
                      placeholder="Temple" />
                  </td>
                  <td className="px-2 py-1">
                    <select className="w-20 border rounded px-1 py-0.5 text-xs"
                      value={item.metalTypeId} onChange={e => updateItem(item.key, 'metalTypeId', e.target.value)}>
                      <option value="">—</option>
                      {(Array.isArray(metalTypes) ? metalTypes : []).map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select className="w-20 border rounded px-1 py-0.5 text-xs"
                      value={item.purity} onChange={e => updateItem(item.key, 'purity', e.target.value)}>
                      <option value="">—</option>
                      {purities.map((p: any) => (
                        <option key={p.id} value={p.code}>{p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min="1" className="w-12 border rounded px-1 py-0.5 text-xs text-right"
                      value={item.orderedQty} onChange={e => updateItem(item.key, 'orderedQty', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.01" className="w-16 border rounded px-1 py-0.5 text-xs text-right"
                      value={item.orderedGrossWeight} onChange={e => updateItem(item.key, 'orderedGrossWeight', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.01" className="w-16 border rounded px-1 py-0.5 text-xs text-right"
                      value={item.orderedNetWeight} onChange={e => updateItem(item.key, 'orderedNetWeight', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.1" className="w-12 border rounded px-1 py-0.5 text-xs text-right"
                      value={item.expectedWastagePercent} onChange={e => updateItem(item.key, 'expectedWastagePercent', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex gap-1">
                      <select className="w-16 border rounded px-0.5 py-0.5 text-[10px]"
                        value={item.makingChargeType} onChange={e => updateItem(item.key, 'makingChargeType', e.target.value)}>
                        <option value="PER_GRAM">/gram</option>
                        <option value="FIXED">Fixed</option>
                        <option value="PERCENTAGE">%</option>
                      </select>
                      <input type="number" step="0.01" className="w-14 border rounded px-1 py-0.5 text-xs text-right"
                        value={item.makingChargeValue} onChange={e => updateItem(item.key, 'makingChargeValue', e.target.value)}
                        placeholder="₹" />
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <input className="w-20 border rounded px-1 py-0.5 text-xs"
                      value={item.designReference} onChange={e => updateItem(item.key, 'designReference', e.target.value)}
                      placeholder="DES-001" />
                  </td>
                  <td className="px-2 py-1">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeRow(item.key)}
                        className="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
        <div className="text-xs text-gray-600">
          <span className="mr-4">{items.filter(i => i.category && i.metalTypeId).length} item(s)</span>
          <span>Estimated Making: <strong>₹{estimatedTotal.toLocaleString('en-IN')}</strong></span>
        </div>
        <div className="flex gap-2">
          <button type="button"
            onClick={() => createMutation.mutate(false)}
            disabled={createMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded hover:bg-gray-100 disabled:opacity-50">
            <Save size={12} /> {createMutation.isPending ? 'Saving...' : 'Save Draft'}
          </button>
          <button type="button"
            onClick={() => createMutation.mutate(true)}
            disabled={createMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            <Send size={12} /> {createMutation.isPending ? 'Sending...' : 'Save & Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
