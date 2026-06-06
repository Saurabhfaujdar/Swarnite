/**
 * SupplierQcForm
 * ──────────────
 * Form to record QC verification for a receipt's items.
 */
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ReceiptItem {
  id: number;
  supplierOrderItemId: number;
  receivedQty: number;
  receivedGrossWeight: number;
  receivedNetWeight: number;
  receivedPurity?: number | null;
  supplierOrderItem?: { category?: string; ornamentType?: string } | null;
}

interface Props {
  receiptItems: ReceiptItem[];
  onSubmit: (data: any) => void;
  isPending: boolean;
  onCancel: () => void;
}

interface QcRow {
  receiptItemId: number;
  qcStatus: string;
  acceptedQty: string;
  acceptedGrossWeight: string;
  acceptedNetWeight: string;
  actualPurity: string;
  remarks: string;
}

export default function SupplierQcForm({ receiptItems, onSubmit, isPending, onCancel }: Props) {
  const [rows, setRows] = useState<QcRow[]>(
    receiptItems.map(ri => ({
      receiptItemId: ri.id,
      qcStatus: 'PASSED',
      acceptedQty: String(ri.receivedQty),
      acceptedGrossWeight: String(ri.receivedGrossWeight),
      acceptedNetWeight: String(ri.receivedNetWeight),
      actualPurity: ri.receivedPurity ? String(ri.receivedPurity) : '',
      remarks: '',
    }))
  );

  const updateRow = (idx: number, field: keyof QcRow, value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const items = rows.map(r => ({
      receiptItemId: r.receiptItemId,
      qcStatus: r.qcStatus,
      acceptedQty: Number(r.acceptedQty),
      acceptedGrossWeight: Number(r.acceptedGrossWeight),
      acceptedNetWeight: Number(r.acceptedNetWeight),
      actualPurity: r.actualPurity ? Number(r.actualPurity) : undefined,
      remarks: r.remarks || undefined,
    }));
    onSubmit({ items });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <CheckCircle2 size={16} /> QC Verification
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-600">
              <th className="text-left px-2 py-1">Item</th>
              <th className="text-right px-2 py-1">Rcvd Wt</th>
              <th className="text-center px-2 py-1">Status</th>
              <th className="text-right px-2 py-1">Accepted Qty</th>
              <th className="text-right px-2 py-1">Accepted Gross</th>
              <th className="text-right px-2 py-1">Accepted Net</th>
              <th className="text-right px-2 py-1">Actual Purity</th>
              <th className="text-left px-2 py-1">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const ri = receiptItems.find(r => r.id === row.receiptItemId);
              const hasDiff = ri && Number(row.acceptedNetWeight) !== Number(ri.receivedNetWeight);
              return (
                <tr key={row.receiptItemId} className={`border-b border-gray-100 ${hasDiff ? 'bg-amber-50' : ''}`}>
                  <td className="px-2 py-1">
                    {ri?.supplierOrderItem?.category || '—'}
                    {ri?.supplierOrderItem?.ornamentType && ` / ${ri.supplierOrderItem.ornamentType}`}
                  </td>
                  <td className="px-2 py-1 text-right text-gray-500">
                    {Number(ri?.receivedNetWeight || 0).toFixed(2)}g
                  </td>
                  <td className="px-2 py-1">
                    <select className="border rounded px-1 py-0.5 text-xs w-24"
                      value={row.qcStatus} onChange={e => updateRow(idx, 'qcStatus', e.target.value)}>
                      <option value="PASSED">Passed</option>
                      <option value="FAILED">Failed</option>
                      <option value="CONDITIONAL">Conditional</option>
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min="0" className="w-14 border rounded px-1 py-0.5 text-right text-xs"
                      value={row.acceptedQty} onChange={e => updateRow(idx, 'acceptedQty', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.01" className="w-20 border rounded px-1 py-0.5 text-right text-xs"
                      value={row.acceptedGrossWeight} onChange={e => updateRow(idx, 'acceptedGrossWeight', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.01" className="w-20 border rounded px-1 py-0.5 text-right text-xs"
                      value={row.acceptedNetWeight} onChange={e => updateRow(idx, 'acceptedNetWeight', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.1" className="w-16 border rounded px-1 py-0.5 text-right text-xs"
                      value={row.actualPurity} onChange={e => updateRow(idx, 'actualPurity', e.target.value)}
                      placeholder="91.6" />
                  </td>
                  <td className="px-2 py-1">
                    <input className="w-28 border rounded px-1 py-0.5 text-xs"
                      value={row.remarks} onChange={e => updateRow(idx, 'remarks', e.target.value)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.some((r, idx) => {
        const ri = receiptItems.find(x => x.id === r.receiptItemId);
        return ri && Math.abs(Number(r.acceptedNetWeight) - Number(ri.receivedNetWeight)) > 0.01;
      }) && (
        <p className="text-[11px] text-amber-600 bg-amber-50 px-2 py-1 rounded">
          ⚠ Weight differences detected — adjustments will be recorded automatically.
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={isPending}
          className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">
          {isPending ? 'Saving...' : 'Submit QC'}
        </button>
      </div>
    </form>
  );
}
